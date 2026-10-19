const fs = require('fs');
const path = require('path');

let activeCaseMemory = {
    lastCaseFolder: null,
    lastClientBaseName: null,
    lastProcedureNumber: null,
    lastUpdatedMs: 0
};

/**
 * Normaliza un nombre quitando tildes, fechas y prefijos "Caso" para comparar si dos carpetas son del mismo cliente.
 */
function normalizeClientCore(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(202[0-9][\-/][0-1][0-9][\-/][0-3][0-9])\b/g, '')
        .replace(/\b(202[0-9])\b/g, '')
        .replace(/^caso\s+/i, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Obtiene la lista de carpetas de casos existentes en el disco
 */
function getKnownCaseFolders(destDir) {
    if (!fs.existsSync(destDir)) return [];
    try {
        return fs.readdirSync(destDir).filter(item => {
            if (item.startsWith('.')) return false;
            const full = path.join(destDir, item);
            return fs.statSync(full).isDirectory();
        });
    } catch (_) {
        return [];
    }
}

/**
 * Dado un nombre de cliente/caso (ej: "Caso Gómez Pérez") y una fecha del documento (ej: "2026-07-20"),
 * comprueba si ya existe una carpeta para ese cliente en disco.
 * - Si ya existe (ej: "Caso Gómez Pérez - 2026-07-20" o "Caso Gómez Pérez"), devuelve esa carpeta exacta
 *   (o la renombra para incluir la fecha si no la tenía).
 * - Si es un caso nuevo, genera el formato estándar con Nombre del Caso y Fecha: "Caso <Cliente> - <Fecha>".
 */
function resolveCaseFolderWithDate(rawCaseName, caseDateStr, destDir) {
    const cleanDate = caseDateStr && /^\d{4}-\d{2}-\d{2}$/.test(caseDateStr)
        ? caseDateStr
        : new Date().toISOString().split('T')[0];

    if (!rawCaseName || rawCaseName === 'Por Clasificar' || rawCaseName === 'Por Revisar') {
        return null;
    }

    // Limpiar si el nombre ya venía con fecha pegada
    const baseWithoutDate = rawCaseName
        .replace(/\s*[\-–—]\s*\d{4}-\d{2}-\d{2}\s*$/, '')
        .replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '')
        .trim();

    const formattedBase = /^caso\s+/i.test(baseWithoutDate)
        ? baseWithoutDate
        : `Caso ${baseWithoutDate}`;

    const targetCore = normalizeClientCore(formattedBase);
    const knownFolders = getKnownCaseFolders(destDir);

    if (targetCore.length >= 3) {
        for (const folder of knownFolders) {
            const folderCore = normalizeClientCore(folder);
            if (folderCore && (folderCore === targetCore || folderCore.includes(targetCore) || targetCore.includes(folderCore))) {
                // Si la carpeta existente aún no tenía la fecha en su nombre, podemos usar la existente o actualizarla con fecha
                const hasDateInFolder = /\d{4}-\d{2}-\d{2}/.test(folder);
                if (!hasDateInFolder && destDir) {
                    const upgradedName = `${formattedBase} - ${cleanDate}`;
                    const oldPath = path.join(destDir, folder);
                    const newPath = path.join(destDir, upgradedName);
                    try {
                        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
                            fs.renameSync(oldPath, newPath);
                            return upgradedName;
                        }
                    } catch (_) {}
                }
                return folder;
            }
        }
    }

    return `${formattedBase} - ${cleanDate}`;
}

/**
 * Registra en la Memoria de Contexto el último expediente procesado por el Agente 2
 */
function setActiveCaseContext({ caseFolder, clientBaseName, procedureNumber }) {
    if (!caseFolder || caseFolder.startsWith('Por Clasificar')) return;
    activeCaseMemory = {
        lastCaseFolder: caseFolder,
        lastClientBaseName: clientBaseName || caseFolder,
        lastProcedureNumber: procedureNumber || null,
        lastUpdatedMs: Date.now()
    };
}

/**
 * Obtiene el Caso Activo para correlacionar fotos, vídeos y audios de prueba.
 * Si no hay uno en memoria reciente, busca la carpeta de caso más recientemente modificada en Gestor_Casos.
 */
function getBestActiveCaseForMedia(destDir) {
    // 1. Si se acaba de procesar un documento jurídico en la sesión actual, usar ese caso
    if (activeCaseMemory.lastCaseFolder) {
        const candidatePath = path.join(destDir, activeCaseMemory.lastCaseFolder);
        if (fs.existsSync(candidatePath)) {
            return {
                caseFolder: activeCaseMemory.lastCaseFolder,
                source: 'contexto-sesion-activa'
            };
        }
    }

    // 2. Si no, buscar la carpeta de caso real más reciente en Gestor_Casos
    const known = getKnownCaseFolders(destDir).filter(
        f => !f.toLowerCase().includes('por clasificar')
    );

    if (known.length === 0) return null;

    let newestFolder = known[0];
    let newestMtime = 0;

    for (const folder of known) {
        try {
            const folderPath = path.join(destDir, folder);
            const stat = fs.statSync(folderPath);
            if (stat.mtimeMs > newestMtime) {
                newestMtime = stat.mtimeMs;
                newestFolder = folder;
            }
        } catch (_) {}
    }

    return {
        caseFolder: newestFolder,
        source: 'expediente-activo-disco'
    };
}

module.exports = {
    normalizeClientCore,
    getKnownCaseFolders,
    resolveCaseFolderWithDate,
    setActiveCaseContext,
    getBestActiveCaseForMedia
};
