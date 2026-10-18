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
 * Comprueba si existe configuración válida de Supabase para sincronización en la nube.
 */
function hasSupabaseConfig() {
    const url = getSecret('SUPABASE_URL') || getSecret('VITE_SUPABASE_URL');
    const key = getSecret('SUPABASE_KEY') || getSecret('VITE_SUPABASE_ANON_KEY');
    return url.startsWith('http') && key.length > 15;
}

/**
 * Enmascara una clave para poder mostrar estado en consola sin filtrar jamás el secreto.
 * Ejemplo: "AIza....9f2a"
 */
function getMaskedKeyStatus(keyName = 'GEMINI_API_KEY') {
    const key = getSecret(keyName);
    if (!key) return 'No configurada (Usando motor de Reglas/Script local)';
    if (key.length <= 8) return 'Configurada (****)';
    return `Configurada (${key.slice(0, 4)}...${key.slice(-4)})`;
}

module.exports = {
    getSecret,
    hasGeminiKey,
    hasSupabaseConfig,
    getMaskedKeyStatus,
    PROJECT_ENV_PATH
};

