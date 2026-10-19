const fs = require('fs');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');

const PROJECT_ENV_PATH = path.join(__dirname, '.env');
const EXAMPLE_ENV_PATH = path.join(__dirname, '.env.example');
const HOME_ENV_PATH = path.join(os.homedir(), '.env');

// Si no existe el archivo .env en el proyecto, lo creamos automáticamente a partir de .env.example
if (!fs.existsSync(PROJECT_ENV_PATH) && fs.existsSync(EXAMPLE_ENV_PATH)) {
    fs.copyFileSync(EXAMPLE_ENV_PATH, PROJECT_ENV_PATH);
}

// Cargar primero el .env del proyecto y luego ~/.env como respaldo
dotenv.config({ path: PROJECT_ENV_PATH });
if (fs.existsSync(HOME_ENV_PATH)) {
    dotenv.config({ path: HOME_ENV_PATH, override: false });
}

const PLACEHOLDERS = new Set([
    '',
    'tu_api_key_de_gemini_aqui',
    'your_api_key_here',
    'https://tu-proyecto.supabase.co',
    'tu_supabase_key_aqui',
    'null',
    'undefined'
]);

/**
 * Obtiene un secreto de forma segura sin exponerlo en logs.
 * @param {string} keyName - Nombre de la variable de entorno
 * @param {string} [defaultValue=''] - Valor por defecto si no existe
 */
function getSecret(keyName, defaultValue = '') {
    const val = (process.env[keyName] || '').trim();
    if (PLACEHOLDERS.has(val)) {
        return defaultValue;
    }
    return val;
}

/**
 * Comprueba si existe una clave válida configurada para Gemini.
 */
function hasGeminiKey() {
    const key = getSecret('GEMINI_API_KEY');
    return key.length > 10;
}

/**
 * Comprueba si el modo de Privacidad Estricta Local (RGPD) está activo (por defecto: true).
 * Cuando está activo, ningún documento ni prueba sale de localhost.
 */
function isLocalPrivacyOnly() {
    const val = getSecret('PRIVACY_LOCAL_ONLY', 'true').toLowerCase();
    return val !== 'false' && val !== '0';
}

/**
 * Obtiene la configuración del servidor de IA Local (Ollama en localhost:11434)
 */
function getLocalAIConfig() {
    return {
        baseUrl: getSecret('LOCAL_AI_URL', 'http://127.0.0.1:11434'),
        textModel: getSecret('LOCAL_TEXT_MODEL', 'qwen2.5:3b'),
        visionModel: getSecret('LOCAL_VISION_MODEL', 'moondream'),
        privacyLocalOnly: isLocalPrivacyOnly()
    };
}

/**
 * Comprueba si existe configuración válida de Supabase Y si el usuario ha permitido sincronizar fuera de localhost.
 */
function hasSupabaseConfig() {
    if (isLocalPrivacyOnly()) return false;
    const url = getSecret('SUPABASE_URL') || getSecret('VITE_SUPABASE_URL');
    const key = getSecret('SUPABASE_KEY') || getSecret('VITE_SUPABASE_ANON_KEY');
    return url.startsWith('http') && key.length > 15;
}

/**
 * Enmascara una clave para poder mostrar estado en consola sin filtrar jamás el secreto.
 */
function getMaskedKeyStatus(keyName = 'LOCAL_AI_URL') {
    const { baseUrl, textModel, visionModel } = getLocalAIConfig();
    return `100% Localhost (${baseUrl} | Texto: ${textModel} | Visión: ${visionModel})`;
}

module.exports = {
    getSecret,
    hasGeminiKey,
    isLocalPrivacyOnly,
    getLocalAIConfig,
    hasSupabaseConfig,
    getMaskedKeyStatus,
    PROJECT_ENV_PATH
};


