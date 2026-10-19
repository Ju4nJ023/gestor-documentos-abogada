const fs = require('fs');
const path = require('path');

const delay = ms => new Promise(res => setTimeout(res, ms));

const STANDARD_CASE_SUBFOLDERS = [
    'Demandas y Sentencias',
    'Pruebas',
    'Notificaciones y Escritos',
    'Contratos',
    'Facturas y Costas'
];

/**
 * AGENTE 4: EJECUTOR DE CARPETAS Y ARCHIVOS EN DISCO LOCAL
 * Crea la estructura del expediente "<Nombre del Caso> - <Fecha>" con todas sus subcarpetas
 * (incluyendo 'Demandas y Sentencias' y 'Pruebas') y mueve el PDF, foto o vídeo a su ubicación exacta.
 */
function ensureCaseFolderStructure(destDir, caseFolderName, targetSubfolder = 'Otros') {
    const caseFolderPath = path.join(destDir, caseFolderName);
    if (!fs.existsSync(caseFolderPath)) {
        fs.mkdirSync(caseFolderPath, { recursive: true });
        console.log(`📁 [Agente 4 - Ejecutor Disco] Creada carpeta de expediente: "${caseFolderName}"`);
    }

    // Crear siempre las subcarpetas principales (especialmente Demandas y Sentencias y Pruebas)
    for (const sub of STANDARD_CASE_SUBFOLDERS) {
        const subPath = path.join(caseFolderPath, sub);
        if (!fs.existsSync(subPath)) {
            fs.mkdirSync(subPath, { recursive: true });
        }
    }

    const targetSubfolderPath = path.join(caseFolderPath, targetSubfolder);
    if (!fs.existsSync(targetSubfolderPath)) {
        fs.mkdirSync(targetSubfolderPath, { recursive: true });
    }

    return {
        caseFolderPath,
        targetSubfolderPath
    };
}

/**
 * Mueve el archivo al expediente correspondiente evitando colisiones de nombre y soportando archivos abiertos en Word
 */
async function executeMoveToCaseFolder(sourcePath, destDir, caseFolderName, subfolder, proposedFilename) {
    const { targetSubfolderPath } = ensureCaseFolderStructure(destDir, caseFolderName, subfolder);

    let finalFilename = proposedFilename;
    let destPath = path.join(targetSubfolderPath, finalFilename);
    let counter = 1;
    const ext = path.extname(finalFilename);
    const baseWithoutExt = path.basename(finalFilename, ext);

    while (fs.existsSync(destPath)) {
        finalFilename = `${baseWithoutExt}_(${counter})${ext}`;
        destPath = path.join(targetSubfolderPath, finalFilename);
        counter++;
    }

    const tryMoveOrCopy = async (src, dest, retries = 2) => {
        try {
            fs.renameSync(src, dest);
            console.log(`🚀 [Agente 4 - ÉXITO] Archivo movido y clasificado en:\n   ${dest}\n`);
            return true;
        } catch (err) {
            if ((err.code === 'EBUSY' || err.code === 'EPERM') && retries > 0) {
                console.log(`⚠️ [Agente 4] Archivo en uso (abierto en Word o descargándose). Reintentando en 1s...`);
                await delay(1000);
                return await tryMoveOrCopy(src, dest, retries - 1);
            } else if (err.code === 'EBUSY' || err.code === 'EPERM') {
                try {
                    fs.copyFileSync(src, dest);
                    console.log(`📋 [Agente 4 - COPIADO EN VIVO] Archivo copiado a:\n   ${dest}\n`);
                    return true;
                } catch (copyErr) {
                    console.error(`❌ [Agente 4] Error al copiar archivo bloqueado: ${copyErr.message}`);
                    return false;
                }
            } else {
                console.error(`❌ [Agente 4] Error al mover archivo: ${err.message}`);
                return false;
            }
        }
    };

    const moved = await tryMoveOrCopy(sourcePath, destPath);
    return {
        moved,
        finalFilename,
        destPath
    };
}

module.exports = {
    STANDARD_CASE_SUBFOLDERS,
    ensureCaseFolderStructure,
    executeMoveToCaseFolder
};
