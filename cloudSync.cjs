const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getSecret, hasSupabaseConfig, PROJECT_ENV_PATH } = require('./secretManager.cjs');

const BUCKET_NAME = 'lexvault-files';

let supabaseClient = null;
let lastSyncTime = null;
let lastSyncError = null;
let isSyncing = false;

/**
 * Normaliza una ruta para que sea segura como clave en Supabase Storage (sin tildes ni caracteres especiales)
 */
function toSafeStorageKey(caseName, subfolder, fileName) {
    const cleanPart = (str) =>
        String(str || 'General')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._\-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');

    return `${cleanPart(caseName)}/${cleanPart(subfolder)}/${cleanPart(fileName)}`;
}

/**
 * Obtiene o inicializa el cliente de Supabase si las credenciales están configuradas
 */
function getSupabase() {
    if (!hasSupabaseConfig()) {
        supabaseClient = null;
        return null;
    }
    if (!supabaseClient) {
        const url = getSecret('SUPABASE_URL') || getSecret('VITE_SUPABASE_URL');
        const key = getSecret('SUPABASE_KEY') || getSecret('VITE_SUPABASE_ANON_KEY');
        supabaseClient = createClient(url, key, {
            auth: { persistSession: false }
        });
    }
    return supabaseClient;
}

/**
 * Reinicia el cliente de Supabase tras actualizar variables en .env
 */
function reloadSupabaseClient() {
    supabaseClient = null;
    lastSyncError = null;
    return getSupabase();
}

/**
 * Guarda las credenciales de Supabase y contraseña en el archivo .env local de forma segura
 */
function updateEnvCredentials({ supabaseUrl, supabaseKey, appPassword }) {
    let envContent = '';
    if (fs.existsSync(PROJECT_ENV_PATH)) {
        envContent = fs.readFileSync(PROJECT_ENV_PATH, 'utf-8');
    }

    const setOrUpdateVar = (content, key, value) => {
        if (value === undefined || value === null) return content;
        const cleanVal = String(value).trim();
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
            return content.replace(regex, `${key}=${cleanVal}`);
        }
        return content.trimEnd() + `\n${key}=${cleanVal}\n`;
    };

    if (supabaseUrl !== undefined) {
        envContent = setOrUpdateVar(envContent, 'SUPABASE_URL', supabaseUrl);
        envContent = setOrUpdateVar(envContent, 'VITE_SUPABASE_URL', supabaseUrl);
        process.env.SUPABASE_URL = supabaseUrl.trim();
        process.env.VITE_SUPABASE_URL = supabaseUrl.trim();
    }
    if (supabaseKey !== undefined) {
        envContent = setOrUpdateVar(envContent, 'SUPABASE_KEY', supabaseKey);
        envContent = setOrUpdateVar(envContent, 'VITE_SUPABASE_ANON_KEY', supabaseKey);
        process.env.SUPABASE_KEY = supabaseKey.trim();
        process.env.VITE_SUPABASE_ANON_KEY = supabaseKey.trim();
    }
    if (appPassword !== undefined) {
        envContent = setOrUpdateVar(envContent, 'VITE_APP_PASSWORD', appPassword);
        process.env.VITE_APP_PASSWORD = appPassword.trim();
    }

    fs.writeFileSync(PROJECT_ENV_PATH, envContent, 'utf-8');
    reloadSupabaseClient();
}

/**
 * Obtiene el MIME type según extensión
 */
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Sincroniza una carpeta de Caso con la tabla `cases` en Supabase
 */
async function syncCaseToCloud(caseName) {
    const supabase = getSupabase();
    if (!supabase || !caseName) return false;

    try {
        const { error } = await supabase
            .from('cases')
            .upsert({ name: caseName }, { onConflict: 'name' });
        if (error) throw error;
        return true;
    } catch (err) {
        lastSyncError = err.message;
        console.warn(`☁️ [Aviso Nube] No se pudo sincronizar el caso "${caseName}": ${err.message}`);
        return false;
    }
}

/**
 * Sube un archivo físico a Supabase Storage y registra sus metadatos en la tabla `documents`
 */
async function syncFileToCloud(fileRecord) {
    const supabase = getSupabase();
    if (!supabase || !fileRecord) return false;

    try {
        await syncCaseToCloud(fileRecord.caseName);

        let publicUrl = fileRecord.publicUrl || '';
        const storagePath = toSafeStorageKey(fileRecord.caseName, fileRecord.subfolder, fileRecord.name);

        // Subir binario a Supabase Storage si existe en disco y pesa menos de 48 MB (límite plan gratuito Supabase = 50MB)
        if (fileRecord.fullPath && fs.existsSync(fileRecord.fullPath)) {
            const stats = fs.statSync(fileRecord.fullPath);
            if (stats.size <= 48 * 1024 * 1024) {
                const fileBuffer = fs.readFileSync(fileRecord.fullPath);
                const contentType = getMimeType(fileRecord.fullPath);

                const { error: uploadError } = await supabase.storage
                    .from(BUCKET_NAME)
                    .upload(storagePath, fileBuffer, {
                        contentType,
                        upsert: true
                    });

                if (uploadError && !uploadError.message.includes('already exists')) {
                    console.warn(`☁️ [Storage Aviso] (${fileRecord.name}): ${uploadError.message}`);
                } else {
                    const { data: urlData } = supabase.storage
                        .from(BUCKET_NAME)
                        .getPublicUrl(storagePath);
                    if (urlData && urlData.publicUrl) {
                        publicUrl = urlData.publicUrl;
                    }
                }
            }
        }

        // Guardar fila en la tabla `documents`
        const row = {
            id: fileRecord.id,
            name: fileRecord.name,
            original_name: fileRecord.originalName || fileRecord.name,
            type: fileRecord.type || 'pdf',
            case_name: fileRecord.caseName || 'Por Clasificar',
            subfolder: fileRecord.subfolder || 'Otros',
            size: fileRecord.size || '0.00 MB',
            date: fileRecord.date || new Date().toISOString().split('T')[0],
            status: fileRecord.status || 'reviewed',
            confidence: fileRecord.confidence || 'media',
            review_reason: fileRecord.reviewReason || '',
            summary: fileRecord.summary || '',
            content_text: fileRecord.contentText || '',
            storage_path: storagePath,
            public_url: publicUrl,
            updated_at: new Date().toISOString()
        };

        const { error: dbError } = await supabase
            .from('documents')
            .upsert(row, { onConflict: 'id' });

        if (dbError) throw dbError;

        lastSyncTime = new Date().toISOString();
        lastSyncError = null;
        return true;
    } catch (err) {
        lastSyncError = err.message;
        console.warn(`☁️ [Aviso Nube] Error al sincronizar "${fileRecord.name}": ${err.message}`);
        return false;
    }
}

/**
 * Elimina un documento de la nube cuando se envía a la Papelera local
 */
async function deleteFileFromCloud(fileRecord) {
    const supabase = getSupabase();
    if (!supabase || !fileRecord) return false;

    try {
        const storagePath = toSafeStorageKey(fileRecord.caseName, fileRecord.subfolder, fileRecord.name);
        await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
        await supabase.from('documents').delete().eq('id', fileRecord.id);
        lastSyncTime = new Date().toISOString();
        return true;
    } catch (err) {
        lastSyncError = err.message;
        return false;
    }
}

/**
 * Sincroniza todos los expedientes y documentos locales hacia Supabase
 */
async function syncAllLocalToCloud(filesList = [], casesList = []) {
    const supabase = getSupabase();
    if (!supabase || isSyncing) return { synced: false, reason: 'No configurado o ya sincronizando' };

    isSyncing = true;
    let syncedCount = 0;
    try {
        for (const caseName of casesList) {
            await syncCaseToCloud(caseName);
        }
        for (const file of filesList) {
            const ok = await syncFileToCloud(file);
            if (ok) syncedCount++;
        }
        lastSyncTime = new Date().toISOString();
        return { synced: true, count: syncedCount, lastSyncTime };
    } catch (err) {
        lastSyncError = err.message;
        return { synced: false, error: err.message };
    } finally {
        isSyncing = false;
    }
}

/**
 * Estado actual de la conexión con Supabase
 */
function getCloudStatus() {
    const url = getSecret('SUPABASE_URL') || getSecret('VITE_SUPABASE_URL');
    const password = getSecret('VITE_APP_PASSWORD');
    return {
        configured: hasSupabaseConfig(),
        supabaseUrl: url || '',
        hasPassword: Boolean(password && password.length > 0),
        isSyncing,
        lastSyncTime,
        lastSyncError
    };
}

module.exports = {
    getSupabase,
    reloadSupabaseClient,
    updateEnvCredentials,
    syncCaseToCloud,
    syncFileToCloud,
    deleteFileFromCloud,
    syncAllLocalToCloud,
    getCloudStatus
};
