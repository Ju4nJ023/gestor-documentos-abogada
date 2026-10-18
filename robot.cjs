const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { getSecret, hasGeminiKey, hasSupabaseConfig, getMaskedKeyStatus } = require('./secretManager.cjs');
const { extractDocumentData } = require('./extractor.cjs');
const { classifyDocumentHybrid } = require('./aiAgent.cjs');
const {
    syncCaseToCloud,
    syncFileToCloud,
    deleteFileFromCloud,
    syncAllLocalToCloud,
    getCloudStatus,
    updateEnvCredentials
} = require('./cloudSync.cjs');


// Directorios de trabajo: Vigilar Descargas, Escritorio y Documentos (tanto local como OneDrive si existen)
const homeDir = os.homedir();
const candidateWatchDirs = [
    path.join(homeDir, 'Downloads'),
    path.join(homeDir, 'Desktop'),
    path.join(homeDir, 'Escritorio'),
    path.join(homeDir, 'OneDrive', 'Desktop'),
    path.join(homeDir, 'OneDrive', 'Escritorio'),
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'Documentos'),
    path.join(homeDir, 'OneDrive', 'Documents'),
    path.join(homeDir, 'OneDrive', 'Documentos')
];
const WATCH_DIRS = [...new Set(candidateWatchDirs)].filter(dir => fs.existsSync(dir));
const WATCH_DIR = WATCH_DIRS[0] || path.join(homeDir, 'Downloads');
const DEST_DIR = getSecret('DEST_DIR') || path.join(homeDir, 'Gestor_Casos');
const METADATA_FILE = path.join(DEST_DIR, '.lexvault_metadata.json');

// Asegurar directorios
if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

// Configuración de multer para subida manual temporal
const upload = multer({ dest: path.join(os.tmpdir(), 'lexvault_uploads') });

// Helper de retraso
const delay = ms => new Promise(res => setTimeout(res, ms));

// --- GESTIÓN DE METADATOS PERSISTENTES ---
function loadMetadata() {
    try {
        if (fs.existsSync(METADATA_FILE)) {
            const raw = fs.readFileSync(METADATA_FILE, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.error('⚠️ Error al leer .lexvault_metadata.json:', err.message);
    }
    return {};
}

function saveMetadata(meta) {
    try {
        fs.writeFileSync(METADATA_FILE, JSON.stringify(meta, null, 2), 'utf-8');
    } catch (err) {
        console.error('⚠️ Error al guardar .lexvault_metadata.json:', err.message);
    }
}

// Limpiar cadenas para nombres de archivo válidos en Windows
function sanitizeFilename(str) {
    return str
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar tildes
        .replace(/[^a-zA-Z0-9_\-]/g, '_') // Sustituir caracteres raros y espacios por _
        .replace(/_+/g, '_') // Quitar dobles guiones bajos
        .replace(/^_+|_+$/g, ''); // Quitar guiones al inicio y fin
}

// Formatear fecha a YYYY-MM-DD
function getFormattedDate(dateObj = new Date()) {
    return dateObj.toISOString().split('T')[0];
}

// Extraer fecha del texto si existe
function findDateInText(text) {
    // Busca patrones DD/MM/YYYY o DD-MM-YYYY
    const match = text.match(/\b([0-3]?[0-9])[\/\-]([0-1]?[0-9])[\/\-](20[2-3][0-9])\b/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
    }
    // Busca años recientes 2023-2026
    const yearMatch = text.match(/\b(202[0-9])\b/);
    if (yearMatch) return yearMatch[1];
    return getFormattedDate();
}

// --- MOTOR HÍBRIDO (SCRIPT + AGENTE IA) DE ANÁLISIS, CLASIFICACIÓN Y RENOMBRADO ---
async function analyzeDocument(filePath, originalFilename) {
    const ext = path.extname(originalFilename).toLowerCase();
    const stats = fs.statSync(filePath);

    // 1. Detección de casos conocidos en disco
    let knownCases = [];
    try {
        knownCases = fs.readdirSync(DEST_DIR).filter(item => {
            const itemPath = path.join(DEST_DIR, item);
            return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
        });
    } catch (_) {}

    const isVideo = ['.mp4', '.avi', '.mov', '.mkv', '.wmv'].includes(ext);
    const isAudio = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(ext);
    const isImage = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);

    // 2. Extracción del interior del documento (PDF / Word .docx / Texto) mediante extractor.cjs
    let docData = {
        fileName: originalFilename,
        extension: ext,
        totalPages: 1,
        charCount: 0,
        hasReadableText: false,
        textSample: '',
        hints: {
            numeroProcedimiento: null,
            juzgado: null,
            dnis: [],
            matchedKeywords: [],
            looksLegalByScript: false,
            suggestedCategory: null
        }
    };

    if (['.pdf', '.docx', '.txt'].includes(ext)) {
        docData = await extractDocumentData(filePath);
    }

    const extractedText = docData.textSample || '';
    const textCombined = (originalFilename + ' ' + extractedText).toLowerCase();

    // 3. Ejecutar el Clasificador Híbrido (Script + Agente IA Gemini)
    const hybrid = await classifyDocumentHybrid(docData, knownCases);

    let matchedCase = hybrid.caseName && hybrid.caseName !== 'Por Revisar' ? hybrid.caseName : null;
    let confidence = hybrid.confidence >= 85 ? 'alta' : (hybrid.confidence >= 65 ? 'media' : 'baja');

    // Respaldo adicional si aún no se encuentra caso
    if (!matchedCase) {
        matchedCase = 'Por Clasificar';
        confidence = 'baja';
    }

    // 4. Detección de Categoría y Detalle para el nuevo nombre
    let subfolder = hybrid.subfolder || 'Otros';
    let docType = 'Documento';
    let detail = docData.hints.numeroProcedimiento
        ? `Autos_${docData.hints.numeroProcedimiento.replace('/', '-')}`
        : 'General';
    let needsReview = false;
    let reviewReason = '';

    if (isVideo) {
        subfolder = 'Pruebas';
        docType = 'Prueba_Video';
        detail = 'Grabacion';
        needsReview = true;
        reviewReason = 'Material probatorio audiovisual. Revisar contenido y validar asignación de caso.';
    } else if (isAudio) {
        subfolder = 'Pruebas';
        docType = 'Prueba_Audio';
        detail = 'Conversacion';
        needsReview = true;
        reviewReason = 'Prueba sonora detectada. Requiere revisión para confirmación de partes.';
    } else if (isImage) {
        subfolder = 'Pruebas';
        docType = 'Prueba_Fotografica';
        detail = 'Inspeccion';
        needsReview = true;
        reviewReason = 'Prueba fotográfica recibida. Validar etiquetado y pertinencia.';
    } else {
        // Documentos PDF / Word
        if (textCombined.includes('pericial') || textCombined.includes('dictamen') || textCombined.includes('atestado') || textCombined.includes('informe perito')) {
            subfolder = 'Pruebas';
            docType = 'Prueba_Pericial';
            detail = 'Dictamen_Tecnico';
            needsReview = true;
            reviewReason = 'Informe pericial detectado en el texto. Se sugiere verificar el perito y el caso.';
        } else if (textCombined.includes('testigo') || textCombined.includes('testifical') || textCombined.includes('declaracion') || textCombined.includes('interrogatorio')) {
            subfolder = 'Pruebas';
            docType = 'Prueba_Testifical';
            detail = 'Declaracion';
            needsReview = true;
            reviewReason = 'Prueba testifical identificada. Validar nombre del testigo y caso.';
        } else if (subfolder === 'Facturas y Costas' || textCombined.includes('factura') || textCombined.includes('minuta') || textCombined.includes('costas')) {
            subfolder = 'Facturas y Costas';
            docType = 'Factura_Minuta';
            detail = 'Honorarios';
            needsReview = confidence === 'baja';
            reviewReason = 'Documento económico / factura registrado.';
        } else if (subfolder === 'Notificaciones y Escritos' || textCombined.includes('lexnet') || textCombined.includes('notificacion') || textCombined.includes('notificación')) {
            subfolder = 'Notificaciones y Escritos';
            docType = 'Notificacion';
            detail = docData.hints.numeroProcedimiento ? `Autos_${docData.hints.numeroProcedimiento.replace('/', '-')}` : 'LexNET';
            needsReview = confidence === 'baja';
            reviewReason = 'Notificación o escrito procesal clasificado.';
        } else if (textCombined.includes('prueba') || textCombined.includes('documental') || textCombined.includes('recibo') || textCombined.includes('certificado')) {
            subfolder = 'Pruebas';
            docType = 'Prueba_Documental';
            detail = 'Justificante';
            needsReview = true;
            reviewReason = 'Documento de prueba aportado. Pendiente de verificación por la letrada.';
        } else if (textCombined.includes('demanda') || textCombined.includes('juicio verbal') || textCombined.includes('procedimiento ordinario')) {
            subfolder = 'Demandas y Sentencias';
            docType = 'Demanda';
            detail = docData.hints.numeroProcedimiento ? `Autos_${docData.hints.numeroProcedimiento.replace('/', '-')}` : 'Principal';
            needsReview = confidence === 'baja';
            reviewReason = confidence === 'baja' ? 'Demanda recibida pero no se ha determinado el cliente con certeza.' : 'Demanda clasificada automáticamente.';
        } else if (textCombined.includes('sentencia') || textCombined.includes('fallo') || textCombined.includes('pronunciamos')) {
            subfolder = 'Demandas y Sentencias';
            docType = 'Sentencia';
            detail = docData.hints.numeroProcedimiento ? `Autos_${docData.hints.numeroProcedimiento.replace('/', '-')}` : 'Resolucion';
            needsReview = confidence === 'baja';
            reviewReason = confidence === 'baja' ? 'Sentencia recibida sin caso claro.' : 'Sentencia registrada.';
        } else if (textCombined.includes('auto ') || textCombined.includes('decreto') || textCombined.includes('diligencia') || textCombined.includes('providencia')) {
            subfolder = 'Demandas y Sentencias';
            docType = 'Resolucion_Judicial';
            detail = 'Auto';
            needsReview = confidence === 'baja';
            reviewReason = 'Resolución judicial detectada.';
        } else if (subfolder === 'Contratos' || textCombined.includes('contrato') || textCombined.includes('arrendamiento') || textCombined.includes('compraventa') || textCombined.includes('estipulaciones')) {
            subfolder = 'Contratos';
            docType = 'Contrato';
            detail = 'Acuerdo';
            needsReview = confidence === 'baja';
            reviewReason = 'Contrato detectado en el contenido.';
        } else {
            docType = subfolder !== 'Otros' ? sanitizeFilename(subfolder) : 'Doc';
            detail = matchedCase !== 'Por Clasificar' ? 'Expediente' : 'Pendiente';
            needsReview = confidence === 'baja';
            reviewReason = confidence === 'baja'
                ? 'Documento sin clasificación directa evidente. Requiere revisión manual.'
                : `Clasificado por motor híbrido (${hybrid.method}).`;
        }
    }

    if (confidence === 'baja') {
        needsReview = true;
    }

    // 5. Generación del nuevo nombre estandarizado
    const dateStr = findDateInText(extractedText);
    const cleanCase = sanitizeFilename(matchedCase);
    const cleanDocType = sanitizeFilename(docType);
    const cleanDetail = sanitizeFilename(detail);

    // Formato: Tipo_Detalle_Caso_Fecha.ext
    const newFilename = `${cleanDocType}_${cleanDetail}_${cleanCase}_${dateStr}${ext}`;

    // Resumen breve extraído (combinando resumen IA + extracto de texto o texto OCR)
    const fullTextForSearch = extractedText || hybrid.ocrText || '';
    let summary = '';
    if (hybrid.summary && hybrid.method === 'hibrido-ia') {
        summary = `🤖 ${hybrid.summary}` + (fullTextForSearch ? ` — "${fullTextForSearch.replace(/\s+/g, ' ').slice(0, 180)}..."` : '');
    } else if (fullTextForSearch.length > 0) {
        summary = fullTextForSearch.replace(/\s+/g, ' ').slice(0, 250) + '...';
    } else {
        summary = `Archivo clasificado como ${docType} (${subfolder}) a partir de metadatos y nombre original: "${originalFilename}".`;
    }

    return {
        casoName: matchedCase,
        subfolder,
        originalName: originalFilename,
        newName: newFilename,
        type: isVideo ? 'video' : (isAudio ? 'audio' : (isImage ? 'image' : (ext === '.pdf' ? 'pdf' : 'word'))),
        status: needsReview ? 'needs_review' : 'reviewed',
        confidence,
        method: hybrid.method,
        isLegalDocument: hybrid.isLegalDocument,
        reviewReason,
        summary,
        contentText: fullTextForSearch.slice(0, 4000),
        date: getFormattedDate(stats.mtime)
    };
}

// Mover archivo a destino con reintentos, soporte para archivos abiertos en Word y nombre único
async function processAndMoveFile(sourcePath, originalFilename, options = {}) {
    console.log(`\n📄 [ARCHIVO DETECTADO]: ${originalFilename}`);
    console.log(`🧠 Iniciando análisis híbrido (Script + Agente IA)...`);

    const analysis = await analyzeDocument(sourcePath, originalFilename);

    // Si viene del escaneo automático de carpetas y NO es un documento jurídico/de caso, no tocarlo
    if (options.onlyIfLegal && !analysis.isLegalDocument) {
        console.log(`⏭️  [Ignorado] "${originalFilename}" no parece un documento jurídico de un caso.`);
        return false;
    }

    // Comprobar si este archivo ya fue importado previamente con el mismo nombre original
    const existingMeta = loadMetadata();
    const alreadyImported = Object.values(existingMeta).some(
        m => m.originalName === originalFilename && m.caseName === analysis.casoName
    );
    if (options.skipIfAlreadyImported && alreadyImported) {
        return false;
    }

    console.log(`✅ Análisis completado (${analysis.method}):`);
    console.log(`   📂 Caso asignado: "${analysis.casoName}" (Confianza: ${analysis.confidence})`);
    console.log(`   📁 Subcarpeta: "${analysis.subfolder}"`);
    console.log(`   🏷️  Nuevo nombre propuesto: "${analysis.newName}"`);
    console.log(`   ⚠️  Estado: ${analysis.status === 'needs_review' ? 'REQUIERE REVISIÓN' : 'CONFIRMADO'}`);

    const caseFolderPath = path.join(DEST_DIR, analysis.casoName);
    const subfolderPath = path.join(caseFolderPath, analysis.subfolder);

    if (!fs.existsSync(caseFolderPath)) {
        fs.mkdirSync(caseFolderPath, { recursive: true });
    }
    if (!fs.existsSync(subfolderPath)) {
        fs.mkdirSync(subfolderPath, { recursive: true });
    }

    // Asegurar que el nombre de destino no colisione
    let finalFilename = analysis.newName;
    let destPath = path.join(subfolderPath, finalFilename);
    let counter = 1;
    const ext = path.extname(finalFilename);
    const baseWithoutExt = path.basename(finalFilename, ext);

    while (fs.existsSync(destPath)) {
        finalFilename = `${baseWithoutExt}_(${counter})${ext}`;
        destPath = path.join(subfolderPath, finalFilename);
        counter++;
    }

    // Mover archivo con reintentos; si está abierto en Word (EBUSY), copiarlo para que aparezca ya en la web
    const tryMoveOrCopy = async (src, dest, retries = 2) => {
        try {
            fs.renameSync(src, dest);
            console.log(`🚀 [ÉXITO] Archivo movido y organizado en:\n   ${dest}\n`);
            return true;
        } catch (err) {
            if ((err.code === 'EBUSY' || err.code === 'EPERM') && retries > 0) {
                console.log(`⚠️ Archivo en uso (posiblemente abierto en Word o descargándose). Reintentando en 1s...`);
                await delay(1000);
                return await tryMoveOrCopy(src, dest, retries - 1);
            } else if (err.code === 'EBUSY' || err.code === 'EPERM') {
                try {
                    fs.copyFileSync(src, dest);
                    console.log(`📋 [COPIADO EN VIVO] El archivo sigue abierto en Word, se ha copiado a:\n   ${dest}\n`);
                    return true;
                } catch (copyErr) {
                    console.error(`❌ Error al copiar archivo bloqueado: ${copyErr.message}`);
                    return false;
                }
            } else {
                console.error(`❌ Error al mover archivo: ${err.message}`);
                return false;
            }
        }
    };

    const moved = await tryMoveOrCopy(sourcePath, destPath);
    if (moved) {
        // Guardar metadatos
        const metadata = loadMetadata();
        const relPath = path.relative(DEST_DIR, destPath);
        const fileId = Buffer.from(destPath).toString('base64');
        const stats = fs.statSync(destPath);
        const metaEntry = {
            id: fileId,
            originalName: originalFilename,
            newName: finalFilename,
            caseName: analysis.casoName,
            subfolder: analysis.subfolder,
            type: analysis.type,
            status: analysis.status,
            confidence: analysis.confidence,
            reviewReason: analysis.reviewReason,
            summary: analysis.summary,
            contentText: analysis.contentText || '',
            date: analysis.date
        };
        metadata[relPath] = metaEntry;
        saveMetadata(metadata);

        // Sincronizar automáticamente con la nube (Supabase) si está configurada
        syncFileToCloud({
            ...metaEntry,
            name: finalFilename,
            fullPath: destPath,
            size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB'
        }).catch(() => {});
    }
    return moved;
}

// --- SERVIDOR EXPRESS Y API REST ---
const app = express();
app.use(cors());
app.use(express.json());

// Leer todos los archivos de Gestor_Casos
function getAllFiles(dirPath, arrayOfFiles = []) {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;

    const metadata = loadMetadata();
    const items = fs.readdirSync(dirPath);

    items.forEach(item => {
        if (item.startsWith('.')) return; // Ignorar ocultos, .Papelera y .lexvault_metadata.json

        const fullPath = path.join(dirPath, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            const relativePath = path.relative(DEST_DIR, fullPath);
            const parts = relativePath.split(path.sep);
            const casoName = parts[0] || 'Desconocido';
            const subfolder = parts.length > 2 ? parts[1] : 'Otros';
            const ext = path.extname(item).toLowerCase();

            let type = 'file';
            if (['.pdf'].includes(ext)) type = 'pdf';
            else if (['.doc', '.docx'].includes(ext)) type = 'word';
            else if (['.mp4', '.avi', '.mov', '.mkv', '.wmv'].includes(ext)) type = 'video';
            else if (['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(ext)) type = 'audio';
            else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) type = 'image';

            const meta = metadata[relativePath] || {};

            arrayOfFiles.push({
                id: Buffer.from(fullPath).toString('base64'),
                fullPath: fullPath,
                name: item,
                originalName: meta.originalName || item,
                type: type,
                caseName: meta.caseName || casoName,
                subfolder: meta.subfolder || subfolder,
                size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
                date: meta.date || stats.mtime.toISOString().split('T')[0],
                status: meta.status || (type === 'video' || type === 'audio' ? 'needs_review' : 'reviewed'),
                confidence: meta.confidence || 'media',
                reviewReason: meta.reviewReason || (meta.status === 'needs_review' ? 'Pendiente de revisión' : 'Clasificado'),
                summary: meta.summary || '',
                contentText: meta.contentText || meta.summary || ''
            });
        }
    });

    return arrayOfFiles;
}

// 1. Obtener lista de archivos
app.get('/api/files', (req, res) => {
    try {
        const filesList = getAllFiles(DEST_DIR);
        res.json(filesList);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Obtener lista de casos existentes (incluyendo carpetas vacías recién creadas)
app.get('/api/cases', (req, res) => {
    try {
        const cases = fs.readdirSync(DEST_DIR).filter(item => {
            const itemPath = path.join(DEST_DIR, item);
            return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
        });
        res.json(cases);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2b. Crear una nueva carpeta de Caso manualmente desde la web
app.post('/api/cases', (req, res) => {
    try {
        const rawName = (req.body.caseName || '').replace(/[<>:"/\\|?*]/g, '').trim();
        if (!rawName) {
            return res.status(400).json({ error: 'Nombre de caso vacío' });
        }
        const finalCaseName = /^caso\s+/i.test(rawName) ? rawName : `Caso ${rawName}`;
        const caseDir = path.join(DEST_DIR, finalCaseName);
        if (!fs.existsSync(caseDir)) {
            fs.mkdirSync(caseDir, { recursive: true });
        }
        syncCaseToCloud(finalCaseName).catch(() => {});
        res.json({ success: true, caseName: finalCaseName });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper para decodificar ID de archivo
function resolveFilePath(fileId) {
    try {
        const decoded = Buffer.from(fileId, 'base64').toString('utf-8');
        if (fs.existsSync(decoded)) return decoded;
    } catch (_) {}
    return null;
}

// 3. Servir archivo inline para el Visor Real (PDF, vídeo, audio, imagen)
app.get('/api/files/:id/view', (req, res) => {
    const filePath = resolveFilePath(req.params.id);
    if (!filePath) {
        return res.status(404).send('Archivo no encontrado');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.pdf': 'application/pdf',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(filePath))}"`);
    fs.createReadStream(filePath).pipe(res);
});

// 4. Descargar archivo (mantenido por compatibilidad)
app.get('/api/files/:id/download', (req, res) => {
    const filePath = resolveFilePath(req.params.id);
    if (!filePath) {
        return res.status(404).send('Archivo no encontrado');
    }
    res.download(filePath);
});

// 4b. Abrir el archivo directamente en el programa de Windows (Word, Acrobat, etc.) SIN descargarlo a Descargas
app.post('/api/files/:id/open', (req, res) => {
    const filePath = resolveFilePath(req.params.id);
    if (!filePath) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    execFile('cmd.exe', ['/c', 'start', '', filePath], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Archivo abierto en Windows' });
    });
});

// 4c. Mostrar el archivo directamente en su carpeta del Explorador de Windows
app.post('/api/files/:id/reveal', (req, res) => {
    const filePath = resolveFilePath(req.params.id);
    if (!filePath) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    execFile('explorer.exe', [`/select,${filePath}`], () => {
        res.json({ success: true, message: 'Carpeta abierta en Windows' });
    });
});

// 5. Revisar / Validar / Editar archivo (cambiar nombre, mover de caso o carpeta, aprobar)
app.put('/api/files/:id/review', (req, res) => {
    const filePath = resolveFilePath(req.params.id);
    if (!filePath) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    try {
        const { newName, caseName, subfolder, status } = req.body;
        const currentFilename = path.basename(filePath);
        const targetFilename = newName && newName.trim() ? sanitizeFilename(path.basename(newName, path.extname(newName))) + path.extname(currentFilename) : currentFilename;
        const targetCase = caseName && caseName.trim() ? caseName.trim() : 'Caso General';
        const targetSubfolder = subfolder && subfolder.trim() ? subfolder.trim() : 'Otros';

        const newCaseDir = path.join(DEST_DIR, targetCase);
        const newSubfolderDir = path.join(newCaseDir, targetSubfolder);

        if (!fs.existsSync(newSubfolderDir)) {
            fs.mkdirSync(newSubfolderDir, { recursive: true });
        }

        const newFullPath = path.join(newSubfolderDir, targetFilename);

        // Mover o renombrar si cambió la ruta o el nombre
        if (filePath !== newFullPath) {
            fs.renameSync(filePath, newFullPath);
        }

        // Actualizar metadatos
        const metadata = loadMetadata();
        const oldRel = path.relative(DEST_DIR, filePath);
        const newRel = path.relative(DEST_DIR, newFullPath);

        const prevMeta = metadata[oldRel] || {};
        delete metadata[oldRel];

        const newId = Buffer.from(newFullPath).toString('base64');
        const updatedEntry = {
            ...prevMeta,
            id: newId,
            newName: targetFilename,
            caseName: targetCase,
            subfolder: targetSubfolder,
            status: status || 'reviewed',
            reviewReason: status === 'reviewed' ? 'Revisado y validado por la letrada' : (prevMeta.reviewReason || 'Pendiente de revisión'),
            date: prevMeta.date || getFormattedDate()
        };
        metadata[newRel] = updatedEntry;
        saveMetadata(metadata);

        // Sincronizar cambio con Supabase si está configurado
        if (filePath !== newFullPath) {
            deleteFileFromCloud({
                id: req.params.id,
                name: currentFilename,
                caseName: prevMeta.caseName || oldRel.split(path.sep)[0],
                subfolder: prevMeta.subfolder || 'Otros'
            }).catch(() => {});
        }
        const stats = fs.statSync(newFullPath);
        syncFileToCloud({
            ...updatedEntry,
            name: targetFilename,
            fullPath: newFullPath,
            size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB'
        }).catch(() => {});

        res.json({
            success: true,
            message: 'Archivo actualizado con éxito',
            file: {
                id: newId,
                name: targetFilename,
                caseName: targetCase,
                subfolder: targetSubfolder,
                status: status || 'reviewed'
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Mover archivo a la Papelera de Seguridad (.Papelera) en vez de destruirlo permanentemente
app.delete('/api/files/:id', (req, res) => {
    const filePath = resolveFilePath(req.params.id);
    if (!filePath) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    try {
        const trashDir = path.join(DEST_DIR, '.Papelera');
        if (!fs.existsSync(trashDir)) {
            fs.mkdirSync(trashDir, { recursive: true });
        }
        const safeTrashName = `${Date.now()}_${path.basename(filePath)}`;
        const trashPath = path.join(trashDir, safeTrashName);

        const metadata = loadMetadata();
        const rel = path.relative(DEST_DIR, filePath);
        const prevMeta = metadata[rel] || {};
        const oldParts = rel.split(path.sep);

        fs.renameSync(filePath, trashPath);
        delete metadata[rel];
        saveMetadata(metadata);

        // Eliminar también de la nube si estaba sincronizado
        deleteFileFromCloud({
            id: req.params.id,
            name: path.basename(filePath),
            caseName: prevMeta.caseName || oldParts[0] || 'General',
            subfolder: prevMeta.subfolder || oldParts[1] || 'Otros'
        }).catch(() => {});

        console.log(`🗑️  [Papelera de Seguridad] Archivo movido a: ${trashPath}`);
        res.json({ success: true, message: 'Archivo enviado a la Papelera de Seguridad (.Papelera)' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Subida manual directa de archivos (drag and drop en la web)
app.post('/api/upload', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se enviaron archivos' });
        }

        const results = [];
        for (const file of req.files) {
            await processAndMoveFile(file.path, file.originalname);
            results.push({ originalName: file.originalname });
        }

        res.json({ success: true, processed: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Estado del motor híbrido, Secret Manager y Nube
app.get('/api/status', (req, res) => {
    res.json({
        online: true,
        aiEnabled: hasGeminiKey(),
        engineMode: hasGeminiKey() ? 'Híbrido (Script + Gemini IA)' : 'Híbrido (Script Local)',
        watchDir: WATCH_DIR,
        watchDirs: WATCH_DIRS,
        destDir: DEST_DIR,
        cloud: getCloudStatus()
    });
});

// 9. Obtener estado detallado de Nube + Script SQL para configurar Supabase
app.get('/api/cloud/status', (req, res) => {
    let sqlScript = '';
    const sqlPath = path.join(__dirname, 'supabase_setup.sql');
    if (fs.existsSync(sqlPath)) {
        sqlScript = fs.readFileSync(sqlPath, 'utf-8');
    }
    res.json({
        ...getCloudStatus(),
        sqlScript
    });
});

// 10. Guardar configuración de Supabase y Contraseña desde la Web en .env y sincronizar
app.post('/api/cloud/config', async (req, res) => {
    try {
        const { supabaseUrl, supabaseKey, appPassword } = req.body || {};
        updateEnvCredentials({ supabaseUrl, supabaseKey, appPassword });

        let syncResult = { synced: false };
        if (hasSupabaseConfig()) {
            const filesList = getAllFiles(DEST_DIR);
            const casesList = fs.readdirSync(DEST_DIR).filter(item => {
                const itemPath = path.join(DEST_DIR, item);
                return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
            });
            syncResult = await syncAllLocalToCloud(filesList, casesList);
        }

        res.json({
            success: true,
            cloud: getCloudStatus(),
            syncResult
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 11. Forzar sincronización completa de todos los archivos locales hacia Supabase
app.post('/api/cloud/sync', async (req, res) => {
    try {
        const filesList = getAllFiles(DEST_DIR);
        const casesList = fs.readdirSync(DEST_DIR).filter(item => {
            const itemPath = path.join(DEST_DIR, item);
            return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
        });
        const syncResult = await syncAllLocalToCloud(filesList, casesList);
        res.json({
            success: true,
            cloud: getCloudStatus(),
            syncResult
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 12. Verificar contraseña de acceso a la aplicación
app.post('/api/auth/verify', (req, res) => {
    const expected = getSecret('VITE_APP_PASSWORD');
    if (!expected) {
        return res.json({ valid: true, passwordRequired: false });
    }
    const provided = String(req.body?.password || '').trim();
    if (provided === expected) {
        return res.json({ valid: true, passwordRequired: true });
    }
    return res.status(401).json({ valid: false, error: 'Contraseña incorrecta' });
});

const PORT = Number(getSecret('PORT', '3001')) || 3001;
app.listen(PORT, () => {
    console.log(`📡 Backend escuchando en http://localhost:${PORT}`);
    console.log('==============================================');
    console.log('🤖 ROBOT HÍBRIDO (SCRIPT + AGENTE IA) INICIADO');
    console.log(`🔑 Clave Gemini (.env): ${getMaskedKeyStatus('GEMINI_API_KEY')}`);
    console.log(`☁️  Nube Supabase: ${hasSupabaseConfig() ? 'Conectada y Sincronizando' : 'Modo Local (Configurable desde el botón Nube en la web)'}`);
    console.log(`👁️  Vigilando (${WATCH_DIRS.length} carpetas):`);
    WATCH_DIRS.forEach(dir => console.log(`    - ${dir}`));
    console.log(`📁 Guardando casos en: ${DEST_DIR}`);
    console.log('==============================================\n');

    // Si Supabase está configurado, sincronizar expedientes locales al arrancar
    if (hasSupabaseConfig()) {
        try {
            const filesList = getAllFiles(DEST_DIR);
            const casesList = fs.readdirSync(DEST_DIR).filter(item => {
                const itemPath = path.join(DEST_DIR, item);
                return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
            });
            syncAllLocalToCloud(filesList, casesList).then(r => {
                if (r.synced) {
                    console.log(`☁️  [Sincronización Inicial Nube] ${r.count} documentos sincronizados con Supabase.`);
                }
            }).catch(() => {});
        } catch (_) {}
    }
});

// --- ROBOT VIGILANTE MULTI-CARPETA (DESCARGAS, ESCRITORIO Y DOCUMENTOS) ---
const DOC_EXTS = ['.pdf', '.doc', '.docx'];
const MEDIA_EXTS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.mp3', '.wav', '.m4a', '.png', '.jpg', '.jpeg'];
const VALID_EXTS = [...DOC_EXTS, ...MEDIA_EXTS];
const processedRecently = new Set();

function isTemporaryOrUntitledFile(filename) {
    const lower = filename.toLowerCase();
    // Ignorar archivos temporales de Word/Office (~$...) o descargas a medias
    if (filename.startsWith('~$') || filename.startsWith('.~') || lower.endsWith('.tmp') || lower.endsWith('.crdownload')) {
        return true;
    }
    // Ignorar archivos de recuperación automática de Word o el nombre por defecto al hacer "Clic derecho -> Nuevo documento"
    if (
        lower.includes('recuperado automáticamente') ||
        lower.startsWith('nuevo documento') ||
        lower.startsWith('new microsoft') ||
        lower.startsWith('documento nuevo')
    ) {
        return true;
    }
    return false;
}

// Escaneo inicial al arrancar: busca documentos PDF/Word recientes (últimas 24h) en las carpetas vigiladas
async function scanRecentFilesInWatchedFolders() {
    const now = Date.now();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 horas

    for (const watchDir of WATCH_DIRS) {
        try {
            const items = fs.readdirSync(watchDir);
            for (const item of items) {
                if (isTemporaryOrUntitledFile(item)) continue;
                const ext = path.extname(item).toLowerCase();
                if (!DOC_EXTS.includes(ext)) continue;

                const fullPath = path.join(watchDir, item);
                let stat;
                try {
                    stat = fs.statSync(fullPath);
                } catch (_) {
                    continue;
                }
                if (stat.isDirectory() || stat.size === 0) continue;

                // Solo analizar archivos creados/modificados recientemente
                if (now - stat.mtimeMs <= maxAgeMs) {
                    await processAndMoveFile(fullPath, item, {
                        onlyIfLegal: true,
                        skipIfAlreadyImported: true
                    });
                }
            }
        } catch (err) {
            console.warn(`⚠️ Error en escaneo inicial de ${watchDir}: ${err.message}`);
        }
    }
}

// Ejecutar escaneo inicial al encender el robot
scanRecentFilesInWatchedFolders();

WATCH_DIRS.forEach(watchDir => {
    try {
        fs.watch(watchDir, async (eventType, filename) => {
            if (!filename) return;
            if (isTemporaryOrUntitledFile(filename)) return;

            const ext = path.extname(filename).toLowerCase();
            if (!VALID_EXTS.includes(ext)) return;

            const sourcePath = path.join(watchDir, filename);
            if (!fs.existsSync(sourcePath)) return;

            try {
                const stat = fs.statSync(sourcePath);
                if (stat.isDirectory() || stat.size === 0) return;
            } catch (_) {
                return;
            }

            // Evitar procesar el mismo archivo múltiples veces por eventos duplicados de fs.watch
            if (processedRecently.has(sourcePath)) return;
            processedRecently.add(sourcePath);
            setTimeout(() => processedRecently.delete(sourcePath), 5000);

            await delay(1200); // Espera para que termine de guardarse en disco
            if (fs.existsSync(sourcePath)) {
                const isDoc = DOC_EXTS.includes(ext);
                await processAndMoveFile(sourcePath, filename, {
                    onlyIfLegal: isDoc // Para PDFs/Words en carpetas generales, exigir que tenga contenido jurídico/caso
                });
            }
        });
    } catch (err) {
        console.warn(`⚠️ No se pudo vigilar la carpeta ${watchDir}: ${err.message}`);
    }
});
