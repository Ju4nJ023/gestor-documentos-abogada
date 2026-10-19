const { callLocalTextAgent } = require('./localOllamaClient.cjs');
const { resolveCaseFolderWithDate, setActiveCaseContext, normalizeClientCore } = require('./contextMemory.cjs');

const VALID_SUBFOLDERS = [
    'Demandas y Sentencias',
    'Notificaciones y Escritos',
    'Contratos',
    'Pruebas',
    'Facturas y Costas',
    'Otros'
];

const SPANISH_CASO_STOPWORDS = new Set([
    'de', 'del', 'que', 'en', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'se', 'no', 'si', 'sí', 'por', 'para', 'con', 'sin', 'sobre', 'entre', 'hacia',
    'hasta', 'desde', 'como', 'cuando', 'donde', 'quien', 'cual', 'cuyo', 'este',
    'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella',
    'contrario', 'omiso', 'necesario', 'urgente', 'fortuito', 'practico', 'práctico',
    'hipotetico', 'hipotético', 'extremo', 'particular', 'general', 'especial',
    'duda', 'error', 'empate', 'incumplimiento', 'fallecimiento', 'divorcio',
    'accidente', 'robo', 'impago', 'despido', 'urgencia', 'fuerza', 'mayor',
    'personal', 'laboral', 'civil', 'penal', 'mercantil', 'administrativo',
    'judicial', 'legal', 'procesal', 'fiscal', 'contable', 'presentarse',
    'producirse', 'existir', 'haber', 'ser', 'estar', 'tener', 'poder', 'deber'
]);

/**
 * Extrae la fecha del caso desde el texto del documento (DD/MM/YYYY, "20 de julio de 2026", o YYYY-MM-DD)
 */
function extractCaseDateFromText(text, fallbackMtime) {
    const raw = String(text || '');

    // 1. Formato DD/MM/YYYY o DD-MM-YYYY
    const numMatch = raw.match(/\b([0-3]?[0-9])[\/\-]([0-1]?[0-9])[\/\-](20[1-3][0-9])\b/);
    if (numMatch) {
        const day = numMatch[1].padStart(2, '0');
        const month = numMatch[2].padStart(2, '0');
        const year = numMatch[3];
        return `${year}-${month}-${day}`;
    }

    // 2. Formato en español: "a 20 de julio de 2026" o "15 de marzo de 2026"
    const months = {
        enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
        julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
    };
    const spanishDateRegex = /\b([0-3]?[0-9])\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(20[1-3][0-9])\b/i;
    const spMatch = raw.match(spanishDateRegex);
    if (spMatch) {
        const day = spMatch[1].padStart(2, '0');
        const month = months[spMatch[2].toLowerCase()] || '01';
        const year = spMatch[3];
        return `${year}-${month}-${day}`;
    }

    // 3. Fecha de respaldo (fecha del archivo o fecha actual)
    if (fallbackMtime instanceof Date && !isNaN(fallbackMtime)) {
        return fallbackMtime.toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
}

/**
 * Busca apellidos/clientes por heurística local en el texto o nombre de archivo
 */
function extractClientByRegex(fileName, textSample, knownCases = []) {
    const combined = `${fileName} ${textSample || ''}`;
    const lowerCombined = normalizeClientCore(combined);

    // 1. ¿Aparece alguno de los casos ya existentes en Gestor_Casos?
    for (const existing of knownCases) {
        const core = normalizeClientCore(existing);
        if (core.length >= 3 && lowerCombined.includes(core)) {
            return existing;
        }
    }

    // 2. Patrón "Caso Apellido1 Apellido2" en título o texto (filtrando stopwords gramaticales)
    const casoRegex = /\bcaso[_\s\-]+([a-záéíóúñ]+)(?:[_\s\-]+([a-záéíóúñ]+))?/gi;
    let match;
    while ((match = casoRegex.exec(combined)) !== null) {
        const w1 = (match[1] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const w2 = (match[2] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (w1.length < 3 || SPANISH_CASO_STOPWORDS.has(w1)) continue;
        const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        if (w2 && w2.length >= 3 && !SPANISH_CASO_STOPWORDS.has(w2)) {
            return `Caso ${cap(match[1])} ${cap(match[2])}`;
        }
        return `Caso ${cap(match[1])}`;
    }

    // 3. Patrón procesal: "en nombre y representación de D./Dña. Nombre Apellido1 Apellido2"
    const repRegex = /(?:representaci[oó]n\s+de\s+(?:d\.|dña\.|doña|don)?\s*)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})/;
    const repMatch = (textSample || '').match(repRegex);
    if (repMatch && repMatch[1]) {
        const parts = repMatch[1].trim().split(/\s+/);
        const surnames = parts.length >= 3 ? parts.slice(1).join(' ') : parts.join(' ');
        return `Caso ${surnames}`;
    }

    return null;
}

/**
 * AGENTE 2: ANALISTA DE EXPEDIENTES, NOMBRE DEL CASO Y FECHA (100% LOCALHOST)
 * Extrae el cliente/caso, la fecha del documento, la subcarpeta y registra el Caso Activo en memoria.
 */
async function runCaseDateAgent(docData, knownCases = [], destDir = '', fileMtime = new Date()) {
    const { fileName, textSample, hints } = docData;

    const extractedDate = extractCaseDateFromText(textSample, fileMtime);
    const regexClient = extractClientByRegex(fileName, textSample, knownCases);

    let rawCaseName = regexClient;
    let subfolder = hints.suggestedCategory || 'Demandas y Sentencias';
    let summary = '';
    let caseDate = extractedDate;
    let confidence = regexClient ? 88 : 65;
    let agentMethod = 'Agente 2 (Heurística Jurídica Local)';

    // Consultar al Modelo Local en Ollama (qwen2.5:3b en localhost:11434) para extraer Nombre del Caso, Fecha y Resumen
    try {
        const prompt = `Eres el Agente 2 (Analista de Expedientes Judiciales) en España.
Lee este documento jurídico y extrae los datos del expediente para crear su carpeta con Nombre del Caso y Fecha.

Carpetas de casos ya existentes en el despacho: ${knownCases.length ? JSON.stringify(knownCases) : 'Ninguna aún'}
Nombre del archivo: "${fileName}"
Pistas detectadas: Procedimiento=${hints.numeroProcedimiento || 'N/A'}, Juzgado=${hints.juzgado || 'N/A'}

Texto del documento:
"""
${(textSample || '').slice(0, 2500)}
"""

Instrucciones estrictas:
1. "clientCaseName": Nombre del caso o apellidos del cliente principal con formato "Caso <Apellidos o Empresa>" (ejemplo: "Caso Gómez Pérez"). Si coincide con una carpeta existente, usa ese mismo cliente. NUNCA uses expresiones como "Caso de que" o "Caso contrario".
2. "caseDate": Fecha principal del documento o demanda en formato "YYYY-MM-DD" (si no aparece, usa "${extractedDate}").
3. "subfolder": Elige UNA de: ${JSON.stringify(VALID_SUBFOLDERS)}.
4. "summary": Resumen profesional en español de 1 frase indicando qué documento es, juzgado/autos y partes.

Devuelve SOLO este JSON:
{
  "clientCaseName": "Caso ...",
  "caseDate": "YYYY-MM-DD",
  "subfolder": "Demandas y Sentencias",
  "summary": "..."
}`;

        const aiRes = await callLocalTextAgent(prompt, { jsonMode: true, timeoutMs: 65000 });

        if (aiRes && aiRes.clientCaseName) {
            const candidate = String(aiRes.clientCaseName).trim();
            const firstWord = candidate.replace(/^caso\s+/i, '').split(/\s+/)[0]?.toLowerCase() || '';
            if (firstWord && !SPANISH_CASO_STOPWORDS.has(firstWord) && !candidate.toLowerCase().includes('por revisar')) {
                rawCaseName = regexClient || candidate;
                confidence = 92;
            }
        }
        if (aiRes && aiRes.caseDate && /^\d{4}-\d{2}-\d{2}$/.test(aiRes.caseDate)) {
            caseDate = aiRes.caseDate;
        }
        if (aiRes && VALID_SUBFOLDERS.includes(aiRes.subfolder)) {
            subfolder = aiRes.subfolder;
        }
        if (aiRes && aiRes.summary) {
            summary = aiRes.summary.trim();
        }
        agentMethod = 'Agente 2 (IA Local Ollama)';
    } catch (err) {
        console.warn(`⚠️ [Agente 2 Local] Usando extracción directa por reglas (${err.message})`);
    }

    // Si tras IA y Reglas no hay nombre de cliente pero sí nº de autos, usar el nº de autos
    if (!rawCaseName && hints.numeroProcedimiento) {
        rawCaseName = `Caso Autos ${hints.numeroProcedimiento.replace('/', '-')}`;
        confidence = 80;
    }

    // Resolver nombre definitivo de la carpeta con formato: "Caso <Nombre> - <Fecha>"
    const finalCaseFolder = resolveCaseFolderWithDate(rawCaseName, caseDate, destDir) || `Por Clasificar - ${caseDate}`;

    // Guardar en la Memoria de Contexto Activo para que el Agente 3 (Fotos y Vídeos) sepa qué caso está activo
    setActiveCaseContext({
        caseFolder: finalCaseFolder,
        clientBaseName: rawCaseName,
        procedureNumber: hints.numeroProcedimiento
    });

    return {
        caseFolder: finalCaseFolder,
        caseDate,
        subfolder,
        confidence,
        summary,
        agent: agentMethod
    };
}

module.exports = {
    extractCaseDateFromText,
    runCaseDateAgent
};
