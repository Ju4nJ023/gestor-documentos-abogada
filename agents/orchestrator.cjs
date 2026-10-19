const fs = require('fs');
const path = require('path');
const { extractDocumentData } = require('../extractor.cjs');
const { runFilterAgent } = require('./filterAgent.cjs');
const { runCaseDateAgent } = require('./caseDateAgent.cjs');
const { runMediaEvidenceAgent } = require('./mediaEvidenceAgent.cjs');
const { getKnownCaseFolders } = require('./contextMemory.cjs');

/**
 * Limpia cadenas para nombres de archivo válidos en Windows
 */
function sanitizeFilename(str) {
    return String(str || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * ORQUESTADOR MULTI-AGENTE 100% LOCAL (LOCALHOST / RGPD)
 * Coordina los Agentes Locales:
 * - Agente 1: Filtro de Privacidad y Relevancia Jurídica (descarta CVs/oposiciones)
 * - Agente 2: Analista de Expedientes, Nombre del Caso y Fecha (para PDFs y Words)
 * - Agente 3: Analista Visual de Pruebas Multimedia (ve Fotos y Vídeos en local con moondream + ffmpeg)
 */
async function analyzeWithMultiAgentLocal(filePath, originalFilename, destDir) {
    const ext = path.extname(originalFilename).toLowerCase();
    const stats = fs.statSync(filePath);
    const knownCases = getKnownCaseFolders(destDir);

    const isVideo = ['.mp4', '.avi', '.mov', '.mkv', '.wmv'].includes(ext);
    const isAudio = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(ext);
    const isImage = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);

    // RAMA A: PRUEBAS MULTIMEDIA (FOTOS, VÍDEOS Y AUDIOS) -> AGENTE 3 (VISIÓN LOCAL + CORRELACIÓN)
    if (isVideo || isAudio || isImage) {
        const mediaResult = await runMediaEvidenceAgent(filePath, originalFilename, destDir);
        const fileDateStr = stats.mtime.toISOString().split('T')[0];

        const cleanDocType = sanitizeFilename(mediaResult.docType);
        const cleanDetail = sanitizeFilename(mediaResult.detail);
        const cleanCase = sanitizeFilename(mediaResult.caseFolder.replace(/\s*[\-–]\s*\d{4}-\d{2}-\d{2}$/, ''));
        const newFilename = `${cleanDocType}_${cleanDetail}_${cleanCase}_${fileDateStr}${ext}`;

        return {
            casoName: mediaResult.caseFolder,
            subfolder: 'Pruebas',
            originalName: originalFilename,
            newName: newFilename,
            type: isVideo ? 'video' : (isAudio ? 'audio' : 'image'),
            status: mediaResult.needsReview ? 'needs_review' : 'reviewed',
            confidence: mediaResult.confidence,
            method: mediaResult.agent,
            isLegalDocument: true,
            reviewReason: mediaResult.reviewReason,
            summary: mediaResult.summary,
            contentText: `${mediaResult.summary} ${mediaResult.visualDescription || ''} ${originalFilename}`,
            date: fileDateStr
        };
    }

    // RAMA B: DOCUMENTOS ESCRITOS (.PDF, .DOCX, .TXT) -> AGENTE 1 (FILTRO) + AGENTE 2 (CASO Y FECHA)
    let docData = await extractDocumentData(filePath);

    // Paso 1: Agente 1 (Filtro de Privacidad y Relevancia Jurídica)
    const filterRes = await runFilterAgent(docData);
    if (!filterRes.isLegalDocument) {
        return {
            casoName: 'Ignorado',
            subfolder: 'Otros',
            originalName: originalFilename,
            newName: originalFilename,
            type: ext === '.pdf' ? 'pdf' : 'word',
            status: 'reviewed',
            confidence: 'alta',
            method: filterRes.agent,
            isLegalDocument: false,
            reviewReason: filterRes.reason,
            summary: filterRes.reason,
            contentText: '',
            date: stats.mtime.toISOString().split('T')[0]
        };
    }

    // Paso 2: Agente 2 (Extractor de Nombre del Caso + Fecha del Caso)
    const caseRes = await runCaseDateAgent(docData, knownCases, destDir, stats.mtime);
    const extractedText = docData.textSample || '';
    const textCombined = (originalFilename + ' ' + extractedText).toLowerCase();

    let subfolder = caseRes.subfolder || 'Demandas y Sentencias';
    let docType = 'Documento';
    let detail = docData.hints.numeroProcedimiento
        ? `Autos_${docData.hints.numeroProcedimiento.replace('/', '-')}`
        : 'Principal';

    if (textCombined.includes('pericial') || textCombined.includes('dictamen') || textCombined.includes('atestado')) {
        subfolder = 'Pruebas';
        docType = 'Prueba_Pericial';
        detail = 'Dictamen_Tecnico';
    } else if (textCombined.includes('testigo') || textCombined.includes('testifical') || textCombined.includes('interrogatorio')) {
        subfolder = 'Pruebas';
        docType = 'Prueba_Testifical';
        detail = 'Declaracion';
    } else if (subfolder === 'Facturas y Costas' || textCombined.includes('factura') || textCombined.includes('minuta') || textCombined.includes('costas')) {
        subfolder = 'Facturas y Costas';
        docType = 'Factura_Minuta';
        detail = 'Honorarios';
    } else if (subfolder === 'Notificaciones y Escritos' || textCombined.includes('lexnet') || textCombined.includes('notificacion') || textCombined.includes('notificación')) {
        subfolder = 'Notificaciones y Escritos';
        docType = 'Notificacion';
        detail = docData.hints.numeroProcedimiento ? `Autos_${docData.hints.numeroProcedimiento.replace('/', '-')}` : 'LexNET';
    } else if (textCombined.includes('demanda') || textCombined.includes('juicio verbal') || textCombined.includes('procedimiento ordinario')) {
        subfolder = 'Demandas y Sentencias';
        docType = 'Demanda';
    } else if (textCombined.includes('sentencia') || textCombined.includes('fallo')) {
        subfolder = 'Demandas y Sentencias';
        docType = 'Sentencia';
    } else if (subfolder === 'Contratos' || textCombined.includes('contrato') || textCombined.includes('arrendamiento') || textCombined.includes('compraventa')) {
        subfolder = 'Contratos';
        docType = 'Contrato';
        detail = 'Acuerdo';
    }

    const confidenceLevel = caseRes.confidence >= 85 ? 'alta' : (caseRes.confidence >= 65 ? 'media' : 'baja');
    const needsReview = confidenceLevel === 'baja' || caseRes.caseFolder.startsWith('Por Clasificar');

    const cleanDocType = sanitizeFilename(docType);
    const cleanDetail = sanitizeFilename(detail);
    const cleanCaseBase = sanitizeFilename(caseRes.caseFolder.replace(/\s*[\-–]\s*\d{4}-\d{2}-\d{2}$/, ''));
    const newFilename = `${cleanDocType}_${cleanDetail}_${cleanCaseBase}_${caseRes.caseDate}${ext}`;

    const summaryText = caseRes.summary
        ? `🤖 [${caseRes.agent}]: ${caseRes.summary}` + (extractedText ? ` — "${extractedText.replace(/\s+/g, ' ').slice(0, 160)}..."` : '')
        : (extractedText ? extractedText.replace(/\s+/g, ' ').slice(0, 240) + '...' : `Documento clasificado en ${caseRes.caseFolder}`);

    return {
        casoName: caseRes.caseFolder, // Incluye Nombre del Caso + Fecha: ej. "Caso Gómez Pérez - 2026-07-20"
        subfolder,
        originalName: originalFilename,
        newName: newFilename,
        type: ext === '.pdf' ? 'pdf' : 'word',
        status: needsReview ? 'needs_review' : 'reviewed',
        confidence: confidenceLevel,
        method: `${filterRes.agent} + ${caseRes.agent}`,
        isLegalDocument: true,
        reviewReason: needsReview
            ? 'Clasificado por Agentes Locales con confianza baja; verificar asignación de expediente.'
            : `Clasificado en localhost por ${caseRes.agent} (Expediente con fecha: ${caseRes.caseFolder}).`,
        summary: summaryText,
        contentText: extractedText.slice(0, 4000),
        date: caseRes.caseDate
    };
}

module.exports = {
    sanitizeFilename,
    analyzeWithMultiAgentLocal
};
