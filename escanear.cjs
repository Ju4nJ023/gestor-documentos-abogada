const fs = require('fs');
const path = require('path');
const os = require('os');
const { extractDocumentData } = require('./extractor.cjs');
const { classifyDocumentHybrid } = require('./aiAgent.cjs');

const homeDir = os.homedir();
const WATCH_DIRS = [
    path.join(homeDir, 'Downloads'),
    path.join(homeDir, 'Desktop'),
    path.join(homeDir, 'Escritorio'),
    path.join(homeDir, 'OneDrive', 'Desktop'),
    path.join(homeDir, 'OneDrive', 'Escritorio'),
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'Documentos'),
    path.join(homeDir, 'OneDrive', 'Documents'),
    path.join(homeDir, 'OneDrive', 'Documentos')
].filter((dir, idx, arr) => arr.indexOf(dir) === idx && fs.existsSync(dir));

const DOC_EXTS = ['.pdf', '.doc', '.docx'];

function isTempFile(filename) {
    const lower = filename.toLowerCase();
    return (
        filename.startsWith('~$') ||
        filename.startsWith('.~') ||
        lower.includes('recuperado automáticamente') ||
        lower.endsWith('.tmp') ||
        lower.endsWith('.crdownload')
    );
}

async function runDryScan() {
    console.log('========================================================================');
    console.log('🔍 MODO SIMULACIÓN (SOLO LECTURA - NO SE MUEVE NI CREA NINGUNA CARPETA)');
    console.log('========================================================================\n');

    const accepted = [];
    const rejected = [];

    for (const dir of WATCH_DIRS) {
        let items = [];
        try {
            items = fs.readdirSync(dir);
        } catch (_) {
            continue;
        }

        for (const item of items) {
            if (isTempFile(item)) continue;
            const ext = path.extname(item).toLowerCase();
            if (!DOC_EXTS.includes(ext)) continue;

            const fullPath = path.join(dir, item);
            let stat;
            try {
                stat = fs.statSync(fullPath);
            } catch (_) {
                continue;
            }
            if (stat.isDirectory()) continue;

            const docData = await extractDocumentData(fullPath);
            const result = await classifyDocumentHybrid(docData, []);

            const folderLabel = path.relative(homeDir, dir) || 'Home';

            if (result.isLegalDocument) {
                accepted.push({
                    ubicacion: folderLabel,
                    archivo: item,
                    casoDetectado: result.caseName,
                    subcarpeta: result.subfolder,
                    confianza: `${result.confidence}%`,
                    motivo: result.reason,
                    extractoTexto: docData.textSample ? docData.textSample.replace(/\s+/g, ' ').slice(0, 90) + '...' : '(Sin texto interno)'
                });
            } else {
                rejected.push({
                    ubicacion: folderLabel,
                    archivo: item,
                    motivoDescarte: result.reason
                });
            }
        }
    }

    console.log(`✅ ARCHIVOS QUE SÍ PERTENECEN A CASOS (${accepted.length}):`);
    console.log('------------------------------------------------------------------------');
    if (accepted.length === 0) {
        console.log('   (Ninguno detectado)');
    } else {
        accepted.forEach((a, i) => {
            console.log(`${i + 1}. 📄 [${a.ubicacion}] ${a.archivo}`);
            console.log(`   👉 Iría a: "${a.casoDetectado}" -> "${a.subcarpeta}" (Confianza: ${a.confianza})`);
            console.log(`   🧠 Por qué: ${a.motivo}`);
            console.log(`   📖 Texto leído: ${a.extractoTexto}\n`);
        });
    }

    console.log(`\n🛡️ ARCHIVOS PERSONALES IGNORADOS CORRECTAMENTE (${rejected.length}):`);
    console.log('------------------------------------------------------------------------');
    rejected.forEach((r, i) => {
        console.log(`${i + 1}. ❌ [${r.ubicacion}] ${r.archivo}`);
        console.log(`   🛑 Motivo: ${r.motivoDescarte}`);
    });
}

runDryScan();
