const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getSecret, hasGeminiKey } = require('./secretManager.cjs');

const VALID_SUBFOLDERS = [
    'Demandas y Sentencias',
    'Contratos',
    'Notificaciones y Escritos',
    'Pruebas',
    'Facturas y Costas',
    'Otros'
];

// Palabras del español que pueden ir detrás de "caso" en frases normales ("en caso de...", "caso del personal...")
// y que NUNCA son el nombre de un cliente.
const SPANISH_CASO_STOPWORDS = new Set([
    'de', 'del', 'que', 'en', 'el', 'la', 'los', 'las', 'un', 'una', 'por', 'para',
    'sin', 'con', 'al', 'se', 'no', 'si', 'sí', 'o', 'u', 'y', 'e', 'ni',
    'contrario', 'practico', 'práctico', 'fortuito', 'omiso', 'necesario', 'urgente',
    'general', 'particular', 'especial', 'empate', 'vacante', 'incumplimiento',
    'fallecimiento', 'renuncia', 'duda', 'ser', 'haber', 'alguno', 'ninguno', 'este', 'ese', 'aquel'
]);

/**
 * Clasificador Híbrido (Script + Agente IA).
 */
async function classifyDocumentHybrid(docData, existingCases = []) {
    const scriptResult = classifyWithScriptRules(docData, existingCases);

    // 1. Si el script ya detectó que es un archivo personal excluido (CV, oposición, título, etc.),
    // lo descartamos en 1ms sin gastar llamadas a la API.
    const explicitlyExcludedByScript = docData.hints &&
        Array.isArray(docData.hints.nonLegalReasons) &&
        docData.hints.nonLegalReasons.length > 0 &&
        !docData.hints.hasExplicitFileTrigger;

    if (explicitlyExcludedByScript) {
        return {
            ...scriptResult,
            method: 'script-filtro'
        };
    }

    // 2. Si tenemos la API Key de Gemini activa, usamos el Agente de IA para leer y confirmar
    // (salvo cuando sea un caso de prueba obvio por nombre de archivo con confianza >= 95)
    if (hasGeminiKey()) {
        if (scriptResult.confidence >= 95 && docData.hints && docData.hints.hasExplicitFileTrigger) {
            return {
                ...scriptResult,
                method: 'script-directo'
            };
        }
        try {
            const aiResult = await classifyWithGeminiAgent(docData, existingCases, scriptResult);
            return {
                ...aiResult,
                method: 'hibrido-ia'
            };
        } catch (err) {
            console.warn(`⚠️ [Agente IA] Aviso al consultar Gemini (${err.message}). Usando motor de Script local.`);
        }
    }

    return {
        ...scriptResult,
        method: 'script-local'
    };
}

/**
 * Extrae un nombre de caso válido tras la palabra "Caso ..." evitando frases comunes como "en caso del personal".
 */
function extractExplicitCasoName(sourceText, isFileName = false) {
    // En el nombre de archivo permitimos minúsculas ("caso paquito 2"); en el cuerpo exigimos "Caso X" o no estar precedido de "en / para / de"
    const regex = isFileName
        ? /\bcaso[\s_\-]+([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+)?)/i
        : /(?<!\b(?:en|para|de|el|un|todo|cualquier)\s)\bCaso\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+)?)/;

    const match = sourceText.match(regex);
    if (!match || !match[1]) return null;

    const words = match[1]
        .replace(/\b(demanda|sentencia|contrato|prueba|otros|doc|copia|\d+)\b/gi, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) return null;

    // Si la primera palabra es una preposición o palabra común ("de", "del", "que", "contrario"...), NO es un cliente
    if (SPANISH_CASO_STOPWORDS.has(removeAccents(words[0].toLowerCase()))) {
        return null;
    }

    const cleanWords = words.filter(w => !SPANISH_CASO_STOPWORDS.has(removeAccents(w.toLowerCase())));
    if (cleanWords.length === 0 || cleanWords[0].length < 2) return null;

    return `Caso ${capitalizeWords(cleanWords.slice(0, 2).join(' '))}`;
}

/**
 * Motor de reglas en JavaScript que lee tanto el nombre del archivo como el TEXTO INTERNO del PDF/Word.
 */
function classifyWithScriptRules(docData, existingCases = []) {
    const { fileName, textSample, hints } = docData;
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    const combinedText = `${nameWithoutExt}\n${textSample || ''}`;
    const combinedLower = combinedText.toLowerCase();

    // 0. Si el extractor ya detectó que NO es un documento jurídico (CV, oposición, título, DNI personal suelto)
    if (!hints.looksLegalByScript) {
        const reason = hints.nonLegalReasons && hints.nonLegalReasons.length > 0
            ? hints.nonLegalReasons.join(', ')
            : 'Sin contenido ni palabras clave jurídicas de un caso';
        return {
            isLegalDocument: false,
            caseName: null,
            subfolder: null,
            confidence: 95,
            reason,
            summary: `Ignorado (${reason})`
        };
    }

    let matchedCase = null;
    let matchReason = '';

    // A) ¿El nombre del archivo menciona explícitamente "caso X" (ej. "caso paquito 2.docx")?
    matchedCase = extractExplicitCasoName(nameWithoutExt, true);
    if (matchedCase) {
        matchReason = `Nombre de archivo indica "${matchedCase}"`;
    }

    // B) ¿Coincide con alguna carpeta de Caso que ya exista en Gestor_Casos?
    if (!matchedCase) {
        for (const existing of existingCases) {
            if (['Por Revisar', 'Por Clasificar', 'Caso General', 'Caso Del Personal'].includes(existing)) continue;
            const cleanExisting = existing.replace(/^caso\s+/i, '').trim();
            if (cleanExisting.length >= 3) {
                const normalizedExisting = removeAccents(cleanExisting.toLowerCase());
                const normalizedCombined = removeAccents(combinedLower);
                if (normalizedCombined.includes(normalizedExisting)) {
                    matchedCase = existing;
                    matchReason = `Coincide con caso existente "${existing}"`;
                    break;
                }
            }
        }
    }

    // C) Buscar en el TEXTO INTERNO del documento: "en nombre y representación de Don X", "Demandante: X", "Cliente: X"
    if (!matchedCase && textSample) {
        const partyPatterns = [
            /(?:cliente|demandante|actora?|representaci[oó]n\s+de|favor\s+de)\s*[:\-]?\s*(?:d\.?\/?dña\.?\s+|don\s+|doña\s+|sr\.?\s+|sra\.?\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})/i,
            /\b(?:don|doña|d\.|dña\.)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})/
        ];
        for (const regex of partyPatterns) {
            const match = textSample.match(regex);
            if (match && match[1]) {
                const personName = match[1].trim();
                const parts = personName.split(/\s+/);
                const label = parts.length >= 2 ? parts.slice(-2).join(' ') : parts[0];
                matchedCase = `Caso ${capitalizeWords(label)}`;
                matchReason = `Extraído del interior del texto ("${personName}")`;
                break;
            }
        }
    }

    // D) Buscar mención explícita "Caso Apellido" con mayúscula en el texto interno
    if (!matchedCase && textSample) {
        const bodyCase = extractExplicitCasoName(textSample, false);
        if (bodyCase) {
            matchedCase = bodyCase;
            matchReason = `Mención en el texto a "${bodyCase}"`;
        }
    }

    // E) Si el nombre del archivo es tipo "Demanda_Garcia.pdf" o "Contrato_Martinez.docx"
    if (!matchedCase && hints.hasExplicitFileTrigger) {
        const fileNameClean = nameWithoutExt
            .replace(/\b(caso|demanda|sentencia|contrato|notificacion|escrito|prueba|factura|anexo|doc|documento|escaneado|copia|final|firmado|\d+)\b/gi, ' ')
            .replace(/[_\-.]+/g, ' ')
            .trim();
        const words = fileNameClean
            .split(/\s+/)
            .filter(w => w.length >= 3 && !SPANISH_CASO_STOPWORDS.has(removeAccents(w.toLowerCase())));
        if (words.length >= 1 && words.length <= 3) {
            matchedCase = `Caso ${capitalizeWords(words.join(' '))}`;
            matchReason = `Extraído del título del archivo ("${fileName}")`;
        }
    }

    // F) Si tiene número de procedimiento judicial real ("Autos 452/2026") pero no nombre de cliente
    if (!matchedCase && hints.numeroProcedimiento) {
        matchedCase = `Autos ${hints.numeroProcedimiento.replace('/', '-')}`;
        matchReason = `Agrupado por nº de procedimiento (${hints.numeroProcedimiento})`;
    }

    // Si después de todo esto no hay ni cliente ni procedimiento ni disparador explícito en el archivo,
    // es muy probable que sea un documento general con alguna palabra suelta: no crear carpeta falsa.
    if (!matchedCase && !hints.juzgado && !hints.numeroProcedimiento && hints.matchedKeywords.length < 2) {
        return {
            isLegalDocument: false,
            caseName: null,
            subfolder: null,
            confidence: 85,
            reason: 'Faltan datos de cliente, juzgado o procedimiento para considerarlo un caso',
            summary: 'Ignorado (No se detecta cliente ni juzgado)'
        };
    }

    const subfolder = hints.suggestedCategory || 'Otros';
    let confidence = 65;
    if (matchedCase && (hints.numeroProcedimiento || hints.juzgado || hints.matchedKeywords.length >= 1 || hints.hasExplicitFileTrigger)) {
        confidence = 92;
    } else if (matchedCase) {
        confidence = 80;
    }

    return {
        isLegalDocument: true,
        caseName: matchedCase || 'Por Clasificar',
        subfolder: VALID_SUBFOLDERS.includes(subfolder) ? subfolder : 'Otros',
        confidence,
        reason: matchReason || `Palabras clave detectadas: ${hints.matchedKeywords.join(', ')}`,
        summary: hints.numeroProcedimiento
            ? `Procedimiento ${hints.numeroProcedimiento} — ${matchReason}`
            : `${matchReason || 'Documento jurídico'} (${subfolder})`
    };
}

/**
 * Consulta a Google Gemini pasándole el texto extraído y las pistas del script.
 */
async function classifyWithGeminiAgent(docData, existingCases, scriptResult) {
    const apiKey = getSecret('GEMINI_API_KEY');
    const modelName = getSecret('GEMINI_MODEL', 'gemini-2.5-flash');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
        }
    });

    const prompt = `
Eres un asistente jurídico experto que organiza el despacho de una abogada en España.
Analiza los datos de este documento (y el archivo adjunto si es un PDF escaneado) y devuelve ÚNICAMENTE un objeto JSON válido.

DATOS DEL ARCHIVO:
- Nombre del archivo: "${docData.fileName}"
- Pistas detectadas por el script: ${JSON.stringify(docData.hints)}
- Sugerencia preliminar del script: ${JSON.stringify(scriptResult)}
- Carpetas de casos que YA existen en el despacho: ${JSON.stringify(existingCases)}

TEXTO EXTRAÍDO DE LAS PRIMERAS PÁGINAS DEL DOCUMENTO:
"""
${docData.textSample || '(PDF escaneado sin texto seleccionable: lee directamente la imagen del documento adjunto con OCR)'}
"""

INSTRUCCIONES DE CLASIFICACIÓN:
1. "isLegalDocument" (boolean): true SOLO si es un documento de un caso de la abogada (demanda, contrato, escrito judicial, notificación LexNET, prueba de un caso, o un archivo de prueba como "caso paquito"). Pon false si es un CV, temario/bases de oposiciones, título escolar, DNI personal suelto o archivo personal.
2. "caseName" (string | null):
   - Si no es documento de un caso, pon null.
   - Si corresponde a un caso existente, usa ese nombre exacto.
   - Si es un caso nuevo, pon "Caso [Apellido/Nombre del Cliente]" (NUNCA pongas frases como "Caso Del Personal" o "Caso De").
3. "subfolder" (string): Una de: ${JSON.stringify(VALID_SUBFOLDERS)}
4. "confidence" (number): 0 a 100.
5. "summary" (string): Explicación breve de qué trata el documento, juzgado, nº de procedimiento y cliente.
6. "ocrText" (string): Si el documento era un PDF escaneado sin texto, transcribe aquí las primeras líneas clave (juzgado, partes, asunto); si ya tenía texto, deja "".
`;

    // Si es un PDF escaneado como imagen (< 20 letras de texto seleccionable) y pesa menos de 15 MB, enviarlo a la visión de Gemini (OCR)
    const contentParts = [prompt];
    if (docData.extension === '.pdf' && !docData.hasReadableText && docData.filePath && fs.existsSync(docData.filePath)) {
        try {
            const stats = fs.statSync(docData.filePath);
            if (stats.size > 0 && stats.size < 15 * 1024 * 1024) {
                const pdfBase64 = fs.readFileSync(docData.filePath).toString('base64');
                contentParts.push({
                    inlineData: {
                        data: pdfBase64,
                        mimeType: 'application/pdf'
                    }
                });
                console.log(`👁️  [OCR Visión Gemini] Leyendo PDF escaneado como imagen: "${docData.fileName}"`);
            }
        } catch (_) {}
    }

    const result = await model.generateContent(contentParts);
    const parsed = JSON.parse(result.response.text());

    return {
        isLegalDocument: Boolean(parsed.isLegalDocument),
        caseName: parsed.caseName ? parsed.caseName.replace(/[<>:"/\\|?*]/g, '').trim() : null,
        subfolder: VALID_SUBFOLDERS.includes(parsed.subfolder) ? parsed.subfolder : 'Otros',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 80,
        reason: parsed.summary || 'Analizado por Gemini IA',
        summary: parsed.summary || 'Clasificado por IA',
        ocrText: parsed.ocrText || ''
    };
}

function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function capitalizeWords(str) {
    return str
        .split(/\s+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

module.exports = {
    classifyDocumentHybrid,
    VALID_SUBFOLDERS
};
