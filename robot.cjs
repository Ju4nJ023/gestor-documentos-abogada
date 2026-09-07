const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const cors = require('cors');

const WATCH_DIR = path.join(os.homedir(), 'Downloads');
// Guardar fuera de OneDrive, directamente en la carpeta del usuario
const DEST_DIR = path.join(os.homedir(), 'Gestor_Casos');

// Helper to wait a bit so the file finishes downloading/copying
const delay = ms => new Promise(res => setTimeout(res, ms));

// --- SERVER EXPRESS ---
const app = express();
app.use(cors()); // Permitir que la web React se conecte

// Función recursiva para leer los archivos de la carpeta Gestor_Casos
function getAllFiles(dirPath, arrayOfFiles = []) {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;

    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            // Calcular info extraida de la ruta
            const relativePath = path.relative(DEST_DIR, fullPath);
            const parts = relativePath.split(path.sep);
            const casoName = parts[0] || 'Desconocido';
            const subfolder = parts.length > 2 ? parts[1] : 'Otros';
            
            const stats = fs.statSync(fullPath);
            const ext = path.extname(file).toLowerCase();
            
            let type = 'file';
            if (['.pdf'].includes(ext)) type = 'pdf';
            if (['.doc', '.docx'].includes(ext)) type = 'word';
            if (['.mp4', '.avi', '.mov'].includes(ext)) type = 'video';
            if (['.png', '.jpg', '.jpeg'].includes(ext)) type = 'image';

            arrayOfFiles.push({
                id: Buffer.from(fullPath).toString('base64'),
                name: file,
                type: type,
                caseName: casoName,
                subfolder: subfolder,
                size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
                date: stats.mtime.toISOString().split('T')[0]
            });
        }
    });

    return arrayOfFiles;
}

app.get('/api/files', (req, res) => {
    try {
        const filesList = getAllFiles(DEST_DIR);
        res.json(filesList);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`📡 Backend escuchando en http://localhost:${PORT}`);
    console.log('==============================================');
    console.log('🤖 ROBOT MONITOR + SERVIDOR INICIADO');
    console.log(`👁️  Vigilando la carpeta: ${WATCH_DIR}`);
    console.log(`📁 Guardando casos en: ${DEST_DIR}`);
    console.log('==============================================\n');
});

// --- ROBOT MONITOR ---

function simularLecturaIA(filename) {
    let casoName = "Caso General";
    let subfolder = "Otros";

    const nameLower = filename.toLowerCase();

    if (nameLower.includes('garcia')) casoName = 'Caso García';
    if (nameLower.includes('lopez')) casoName = 'Caso López';
    if (nameLower.includes('martinez')) casoName = 'Caso Martínez';
    if (nameLower.includes('paquito')) casoName = 'Caso Paquito';

    if (nameLower.includes('demanda') || nameLower.includes('sentencia')) subfolder = 'Demandas y Sentencias';
    else if (nameLower.includes('contrato')) subfolder = 'Contratos';
    else if (nameLower.includes('prueba') || nameLower.includes('video') || nameLower.includes('audio')) subfolder = 'Pruebas';

    return { casoName, subfolder };
}

// Asegurar que DEST_DIR existe
if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

fs.watch(WATCH_DIR, async (eventType, filename) => {
    if (!filename) return;
    
    const sourcePath = path.join(WATCH_DIR, filename);
    
    if (!fs.existsSync(sourcePath)) return;

    const ext = path.extname(filename).toLowerCase();
    if (!['.pdf', '.doc', '.docx'].includes(ext)) {
        return; 
    }

    await delay(500);

    console.log(`\n📄 [NUEVO ARCHIVO DETECTADO]: ${filename}`);
    console.log(`🧠 Iniciando escaneo IA...`);

    const { casoName, subfolder } = simularLecturaIA(filename);
    console.log(`✅ Documento clasificado: Perteneciente a "${casoName}", Categoría: "${subfolder}"`);

    const caseFolderPath = path.join(DEST_DIR, casoName);
    const subfolderPath = path.join(caseFolderPath, subfolder);

    if (!fs.existsSync(caseFolderPath)) {
        fs.mkdirSync(caseFolderPath);
        console.log(`📁 Carpeta creada: ${casoName}`);
    }
    if (!fs.existsSync(subfolderPath)) {
        fs.mkdirSync(subfolderPath);
        console.log(`📂 Subcarpeta creada: ${subfolder}`);
    }

    const destPath = path.join(subfolderPath, filename);
    
    try {
        fs.renameSync(sourcePath, destPath);
        console.log(`🚀 [ÉXITO] Archivo movido automáticamente a: ${destPath}`);
    } catch (err) {
        console.error(`❌ Error al mover el archivo: ${err.message}`);
    }
});
