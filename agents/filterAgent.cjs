const { callLocalTextAgent } = require('./localOllamaClient.cjs');

/**
 * AGENTE 1: FILTRO DE PRIVACIDAD Y RELEVANCIA JURÍDICA (100% LOCALHOST)
 * Decide si un documento PDF/Word es un documento jurídico real de un expediente
 * o si es un archivo personal (CV, temario de oposiciones, certificado escolar, etc.).
 */
async function runFilterAgent(docData) {
    const { fileName, textSample, hasReadableText, hints } = docData;

    // 1. Descarte instantáneo si contiene patrones claros de documento personal (CV, oposiciones, becas)
    if (hints.nonLegalReasons && hints.nonLegalReasons.length > 0 && !hints.numeroProcedimiento && !hints.juzgado) {
        return {
            isLegalDocument: false,
            confidence: 98,
            agent: 'Agente 1 (Filtro Reglas Local)',
            reason: `Descartado por ser archivo personal (${hints.nonLegalReasons.join(', ')}).`
        };
    }

    // 2. Aprobación directa si contiene número de autos/procedimiento, juzgado o palabras jurídicas claras
    if (hints.looksLegalByScript || hints.numeroProcedimiento || hints.juzgado || (hints.matchedKeywords && hints.matchedKeywords.length >= 2)) {
        return {
            isLegalDocument: true,
            confidence: 92,
            agent: 'Agente 1 (Filtro Jurídico Local)',
            reason: 'Detectados indicadores procesales/judiciales claros.'
        };
    }

    // 3. Si no tiene texto legible y tampoco indicadores en el nombre
    if (!hasReadableText || !textSample || textSample.trim().length < 20) {
        const lowerName = (fileName || '').toLowerCase();
        const legalNameMatch = /(demanda|sentencia|juzgado|autos|lexnet|notificacion|recurso|escrito|contrato|querella|denuncia|pericial)/i.test(lowerName);
        return {
            isLegalDocument: legalNameMatch,
            confidence: legalNameMatch ? 75 : 85,
            agent: 'Agente 1 (Filtro Metadatos Local)',
            reason: legalNameMatch ? 'Nombre de archivo jurídico.' : 'Sin texto jurídico ni indicadores legales.'
        };
    }

    // 4. Consulta al LLM Local (qwen2.5:3b en localhost:11434) para casos dudosos
    try {
        const prompt = `Eres el Agente 1 (Filtro Jurídico) de un despacho de abogados en España.
Analiza este documento y responde en JSON si pertenece a un expediente jurídico/judicial de un cliente (demanda, sentencia, escrito, contrato, notificación, factura de abogado, informe pericial) o si es un archivo personal ajeno al despacho (currículum CV, bases de oposiciones, apuntes, etc.).

Nombre del archivo: "${fileName}"
Fragmento de texto:
"""
${textSample.slice(0, 1800)}
"""

Devuelve SOLO este JSON:
{
  "isLegalDocument": boolean,
  "reason": "breve motivo en español"
}`;

        const res = await callLocalTextAgent(prompt, { jsonMode: true, timeoutMs: 65000 });
        return {
            isLegalDocument: Boolean(res.isLegalDocument),
            confidence: 85,
            agent: 'Agente 1 (IA Local Ollama)',
            reason: res.reason || 'Evaluado por IA Local en localhost.'
        };
    } catch (_) {
        // Si Ollama está ocupado, usar el criterio conservador del script
        return {
            isLegalDocument: Boolean(hints.looksLegalByScript),
            confidence: 70,
            agent: 'Agente 1 (Respaldo Local)',
            reason: 'Evaluado por reglas locales.'
        };
    }
}

module.exports = {
    runFilterAgent
};
