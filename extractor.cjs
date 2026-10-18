const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extrae el texto de las primeras páginas de un archivo PDF o Word (.docx)
 * junto con pistas rápidas detectadas por expresiones regulares (Híbrido Script + IA).
 *
 * @param {string} filePath - Ruta absoluta al archivo
 * @param {object} options - Opciones de extracción
 * @param {number} [options.maxPages=3] - Máximo de páginas a leer en un PDF
 * @param {number} [options.maxChars=6000] - Máximo de caracteres a devolver para no saturar a la IA
 */
async function extractDocumentData(filePath, options = {}) {
    const maxPages = options.maxPages || 3;
    const maxChars = options.maxChars || 6000;

    if (!fs.existsSync(filePath)) {
        throw new Error(`El archivo no existe: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    let rawText = '';
    let totalPages = 1;

    try {
        if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const parser = new PDFParse({ data: dataBuffer });
            try {
                const result = await parser.getText({ first: maxPages });
                rawText = result.text || '';
                totalPages = result.total || (result.pages ? result.pages.length : 1);
            } finally {
                await parser.destroy();
            }
        } else if (ext === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            rawText = result.value || '';
        } else if (ext === '.txt') {
            rawText = fs.readFileSync(filePath, 'utf-8');
        } else {
            rawText = '';
        }
    } catch (err) {
        console.warn(`⚠️ [Extractor] No se pudo leer el interior de "${path.basename(filePath)}": ${err.message}`);
        rawText = '';
    }

    // Limpiar espacios múltiples, marcadores de página "-- 1 of 2 --" y saltos de línea excesivos
    const cleanText = rawText
        .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const truncatedText = cleanText.slice(0, maxChars);

    // --- FASE HÍBRIDA (Script puro): Extraer pistas rápidas con Regex ---
    const hints = extractLegalHints(cleanText, path.basename(filePath));

    return {
        filePath,
        fileName: path.basename(filePath),
        extension: ext,
        totalPages,
        charCount: cleanText.length,
        hasReadableText: cleanText.length > 20,
        textSample: truncatedText,
        hints
    };
}

/**
 * Analiza mediante reglas estrictas (sin gastar IA) si el texto pertenece realmente
 * a un caso jurídico de abogacía o si es un documento personal/administrativo (CV, oposición, título, etc.).
 */
function extractLegalHints(text, fileName) {
    const fileNameNoExt = fileName.replace(/\.[^/.]+$/, '');
    const combined = `${fileNameNoExt}\n${text}`;
    const lower = combined.toLowerCase();
    const fileLower = fileNameNoExt.toLowerCase();

    // 0. DETECTAR DOCUMENTOS PERSONALES / NO JURÍDICOS (Para no meterlos nunca por error)
    const nonLegalReasons = [];
    if (/\b(cv|curriculum|curr[ií]culum|carta de presentaci[oó]n|experiencia laboral|perfil profesional)\b/i.test(lower)) {
        nonLegalReasons.push('Currículum / Carta de presentación');
    }
    if (/\b(rhsel|promoci[oó]n interna|turno libre|bases espec[ií]ficas|proceso selectivo|oposici[oó]n|aspirantes)\b/i.test(lower)) {
        nonLegalReasons.push('Oposiciones / Proceso selectivo RRHH');
    }
    if (/\b(t[ií]tulos?\s+no\s+universitarios?|ciclo\s+formativo|formaci[oó]n\s+profesional|certificado\s+dam|certificado\s+daw|titulo\s+smr|ies\s+tetu[aá]n)\b/i.test(lower)) {
        nonLegalReasons.push('Título o certificado académico');
    }
    if (/^(dni|nie)\b/i.test(fileLower) && !/\b(caso|demanda|juzgado|cliente)\b/i.test(lower)) {
        nonLegalReasons.push('Documento de identidad personal suelto');
    }
    if (/\b(alta demanda de empleo|demanda de empleo|sepe)\b/i.test(lower)) {
        nonLegalReasons.push('Documento de empleo (SEPE)');
    }

    // 1. Detectar números de procedimiento / autos (ej. "Autos 123/2026", "Procedimiento Ordinario 45/2025")
    const procMatch = combined.match(/(?:autos|procedimiento(?:\s+ordinario)?|juicio(?:\s+verbal|\s+ordinario)?|diligencias\s+previas|rollo)[^\d\n]{0,25}(\d{1,5}\/\d{2,4})/i);
    const numeroProcedimiento = procMatch ? procMatch[1] : null;

    // 2. Detectar Juzgado (ej. "Juzgado de Primera Instancia nº 4 de Madrid")
    const juzgadoMatch = combined.match(/juzgado\s+de\s+[^\n.,;]{5,60}/i);
    const juzgado = juzgadoMatch ? juzgadoMatch[0].trim() : null;

    // 3. Detectar DNIs / NIEs mencionados
    const dnis = [...new Set(combined.match(/\b(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z])\b/gi) || [])];

    // 4. Palabras clave ESTRICTAMENTE jurídicas de despacho de abogada
    // (Quitamos palabras ambiguas como "prueba", "auto", "certificado" o "diligencia" sueltas)
    const strongLegalKeywords = [
        'juzgado', 'sentencia', 'providencia', 'lexnet',
        'procurador', 'procuradora', 'letrado', 'letrada', 'abogado', 'abogada',
        'demandante', 'demandado', 'demandada', 'suplico', 'al juzgado',
        'fundamentos de derecho', 'recurso de apelación', 'recurso de reposición',
        'ejecución de títulos', 'condena en costas', 'minuta de honorarios',
        'convenio regulador', 'divorcio', 'herencia', 'querella', 'denuncia',
        'juicio ordinario', 'juicio verbal', 'arrendamiento', 'compraventa'
    ];
    const matchedKeywords = strongLegalKeywords.filter(kw => lower.includes(kw));

    // Si tiene la palabra "demanda", comprobar que NO sea "demanda de empleo"
    if (/\bdemanda\b/i.test(lower) && !/\bdemanda\s+de\s+empleo\b/i.test(lower)) {
        matchedKeywords.push('demanda');
    }
    // Si tiene la palabra "contrato", comprobar que sea un contrato real o que esté en el nombre del archivo
    if (/\bcontrato\s+de\s+(arrendamiento|compraventa|trabajo|prestaci[oó]n|arras|alquiler|obras?|servicios?)\b/i.test(lower) || /\bcontrato\b/i.test(fileLower)) {
        matchedKeywords.push('contrato');
    }

    // 5. Detectar si el nombre del archivo indica explícitamente un caso de prueba o expediente
    // Ej: "caso paquito.docx", "Demanda_Garcia.pdf", "Contrato_Martinez.docx"
    const explicitFileCaseMatch = fileNameNoExt.match(/\bcaso[\s_\-]+([a-záéíóúñü0-9\s_\-]+)/i);
    const hasExplicitFileTrigger = Boolean(explicitFileCaseMatch) ||
        /\b(demanda|sentencia|querella|recurso|juzgado|lexnet|contrato)\b/i.test(fileLower);

    // 6. Categoría sugerida
    let suggestedCategory = null;
    if (/\b(demanda|contestaci[oó]n|sentencia|fallo|recurso|apelaci[oó]n|querella|denuncia)\b/i.test(lower) && !/\bdemanda de empleo\b/i.test(lower)) {
        suggestedCategory = 'Demandas y Sentencias';
    } else if (/\b(contrato|convenio regulador|arrendamiento|compraventa|cl[aá]usula|escritura)\b/i.test(lower)) {
        suggestedCategory = 'Contratos';
    } else if (/\b(notificaci[oó]n|lexnet|c[eé]dula|citaci[oó]n|requerimiento|providencia|escrito)\b/i.test(lower)) {
        suggestedCategory = 'Notificaciones y Escritos';
    } else if (/\b(minuta|honorarios|provisi[oó]n de fondos|costas)\b/i.test(lower)) {
        suggestedCategory = 'Facturas y Costas';
    } else if (/\b(informe pericial|dictamen pericial|prueba testifical|prueba documental)\b/i.test(lower)) {
        suggestedCategory = 'Pruebas';
    }

    const isExcluded = nonLegalReasons.length > 0 && !hasExplicitFileTrigger && !juzgado && !numeroProcedimiento;
    const looksLegalByScript = !isExcluded && (
        hasExplicitFileTrigger ||
        Boolean(numeroProcedimiento) ||
        Boolean(juzgado) ||
        matchedKeywords.length >= 1
    );

    return {
        numeroProcedimiento,
        juzgado,
        dnis,
        matchedKeywords: [...new Set(matchedKeywords)],
        hasExplicitFileTrigger,
        nonLegalReasons,
        looksLegalByScript,
        suggestedCategory
    };
}

module.exports = {
    extractDocumentData,
    extractLegalHints
};
