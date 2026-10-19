const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { callLocalVisionAgent } = require('./localOllamaClient.cjs');
const {
    getKnownCaseFolders,
    getBestActiveCaseForMedia,
    normalizeClientCore
} = require('./contextMemory.cjs');

/**
 * Extrae hasta 2 fotogramas clave (keyframes) de un archivo de vídeo (.mp4, .mov, .avi, .mkv)
 * usando ffmpeg-static 100% en local y los devuelve en base64 para que el Agente de Visión vea el vídeo.
 */
async function extractVideoFramesBase64(videoPath) {
    if (!ffmpegPath || !fs.existsSync(videoPath)) return [];

    const framesBase64 = [];
    const timestamps = ['00:00:00.500', '00:00:02.500'];

    for (let i = 0; i < timestamps.length; i++) {
        const tempJpg = path.join(
            os.tmpdir(),
            `lexvault_frame_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}.jpg`
        );

        await new Promise((resolve) => {
            execFile(
                ffmpegPath,
                [
                    '-ss', timestamps[i],
                    '-i', videoPath,
                    '-frames:v', '1',
                    '-vf', 'scale=640:-1',
                    '-q:v', '4',
                    '-y',
                    tempJpg
                ],
                { timeout: 10000, windowsHide: true },
                () => resolve()
            );
        });

        if (fs.existsSync(tempJpg)) {
            try {
                const stat = fs.statSync(tempJpg);
                if (stat.size > 100) {
                    framesBase64.push(fs.readFileSync(tempJpg).toString('base64'));
                }
            } catch (_) {}
            try {
                fs.unlinkSync(tempJpg);
            } catch (_) {}
        }
    }

    return framesBase64;
}

/**
 * AGENTE 3: ANALISTA VISUAL DE PRUEBAS MULTIMEDIA (FOTOS, VÍDEOS Y AUDIOS EN LOCALHOST)
 * - Mira el interior de las fotos (.jpg, .png, .webp) con el modelo de Visión Local (moondream).
 * - Extrae fotogramas de los vídeos (.mp4, .mov, .avi, .mkv) con ffmpeg y los inspecciona con Visión Local.
 * - Asigna la prueba automáticamente a la carpeta de Caso correspondiente (<Caso - Fecha>/Pruebas).
 */
async function runMediaEvidenceAgent(filePath, originalFilename, destDir) {
    const ext = path.extname(originalFilename).toLowerCase();
    const isVideo = ['.mp4', '.avi', '.mov', '.mkv', '.wmv'].includes(ext);
    const isAudio = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(ext);
    const isImage = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);

    const knownFolders = getKnownCaseFolders(destDir);
    const lowerFilename = normalizeClientCore(originalFilename);

    // 1. Comprobar si el propio nombre de la foto/vídeo menciona algún caso existente
    let matchedFolder = null;
    let matchSource = '';

    for (const folder of knownFolders) {
        const core = normalizeClientCore(folder);
        if (core.length >= 3 && lowerFilename.includes(core)) {
            matchedFolder = folder;
            matchSource = 'Coincidencia directa con el expediente en el nombre del archivo';
            break;
        }
    }

    // 2. Inspección Visual Local con IA (para Fotos y Vídeos)
    let visualAnalysis = null;
    const contextHint = `Archivo: "${originalFilename}". Expedientes existentes en el despacho: ${JSON.stringify(knownFolders)}`;

    if (isImage) {
        try {
            console.log(`👁️  [Agente 3 - Visión Local] Inspeccionando fotografía "${originalFilename}" en localhost...`);
            const imgBase64 = fs.readFileSync(filePath).toString('base64');
            visualAnalysis = await callLocalVisionAgent([imgBase64], contextHint);
        } catch (err) {
            console.warn(`⚠️ [Agente 3] No se pudo leer la imagen con Visión Local: ${err.message}`);
        }
    } else if (isVideo) {
        try {
            console.log(`🎬 [Agente 3 - Visión de Vídeo Local] Extrayendo fotogramas y analizando vídeo "${originalFilename}"...`);
            const frames = await extractVideoFramesBase64(filePath);
            if (frames.length > 0) {
                visualAnalysis = await callLocalVisionAgent(frames, contextHint);
            }
        } catch (err) {
            console.warn(`⚠️ [Agente 3] No se pudieron extraer fotogramas del vídeo: ${err.message}`);
        }
    }

    // Si el modelo de visión detectó el nombre de un caso en la imagen/captura
    if (!matchedFolder && visualAnalysis && visualAnalysis.matchedCase) {
        for (const folder of knownFolders) {
            const core = normalizeClientCore(folder);
            const aiCore = normalizeClientCore(visualAnalysis.matchedCase);
            if (core && aiCore && (core.includes(aiCore) || aiCore.includes(core))) {
                matchedFolder = folder;
                matchSource = 'Detectado visualmente dentro de la imagen/vídeo por Agente 3';
                break;
            }
        }
    }

    // 3. Si la foto/vídeo no tiene el nombre del cliente escrito, asociarla al Caso Activo en Memoria o en Disco
    if (!matchedFolder) {
        const activeCase = getBestActiveCaseForMedia(destDir);
        if (activeCase && activeCase.caseFolder) {
            matchedFolder = activeCase.caseFolder;
            matchSource = activeCase.source === 'contexto-sesion-activa'
                ? `Asociado automáticamente al expediente activo en sesión (${matchedFolder})`
                : `Asociado al expediente activo del despacho (${matchedFolder})`;
        } else {
            const today = new Date().toISOString().split('T')[0];
            matchedFolder = `Por Clasificar - ${today}`;
            matchSource = 'Sin expediente previo activo; guardado en Por Clasificar';
        }
    }

    const docType = isVideo ? 'Prueba_Video' : (isAudio ? 'Prueba_Audio' : 'Prueba_Foto');
    const detail = (visualAnalysis && visualAnalysis.shortTag)
        ? visualAnalysis.shortTag
        : (isVideo ? 'Grabacion_Visual' : (isAudio ? 'Grabacion_Audio' : 'Evidencia_Fotografica'));

    const summary = visualAnalysis && visualAnalysis.visualSummaryEs
        ? `👁️ [Agente 3 Visión Local]: ${visualAnalysis.visualSummaryEs} (${matchSource}).`
        : `Prueba ${isVideo ? 'audiovisual (vídeo)' : (isAudio ? 'sonora (audio)' : 'fotográfica')} incorporada a la carpeta Pruebas de "${matchedFolder}".`;

    return {
        caseFolder: matchedFolder,
        subfolder: 'Pruebas',
        docType,
        detail,
        summary,
        visualDescription: visualAnalysis ? visualAnalysis.rawVisualDescription : '',
        confidence: matchSource.includes('directa') ? 'alta' : 'media',
        needsReview: !matchSource.includes('directa'),
        reviewReason: `${summary}`,
        agent: isVideo
            ? 'Agente 3 (Visión de Vídeo Local + Contexto)'
            : isImage
            ? 'Agente 3 (Visión Fotográfica Local + Contexto)'
            : 'Agente 3 (Correlación de Audio Local)'
    };
}

module.exports = {
    extractVideoFramesBase64,
    runMediaEvidenceAgent
};
