const { runFilterAgent } = require('./agents/filterAgent.cjs');
const { runCaseDateAgent } = require('./agents/caseDateAgent.cjs');

/**
 * CLASIFICADOR HÍBRIDO 100% LOCAL (LOCALHOST / OLLAMA)
 * Mantiene compatibilidad con escanear.cjs y módulos existentes pero sin enviar
 * ningún dato a servidores externos (cumplimiento estricto RGPD y Secreto Profesional).
 */
async function classifyDocumentHybrid(docData, knownCases = []) {
    const filterRes = await runFilterAgent(docData);
    if (!filterRes.isLegalDocument) {
        return {
            caseName: 'Ignorado',
            subfolder: 'Otros',
            confidence: filterRes.confidence,
            summary: filterRes.reason,
            ocrText: '',
            isLegalDocument: false,
            method: filterRes.agent
        };
    }

    const caseRes = await runCaseDateAgent(docData, knownCases, '');
    return {
        caseName: caseRes.caseFolder,
        subfolder: caseRes.subfolder,
        confidence: caseRes.confidence,
        summary: caseRes.summary,
        ocrText: '',
        isLegalDocument: true,
        method: `${filterRes.agent} + ${caseRes.agent}`
    };
}

module.exports = {
    classifyDocumentHybrid
};
