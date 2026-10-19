const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getLocalAIConfig } = require('../secretManager.cjs');

let ollamaStartAttempted = false;

/**
 * Comprueba si el servidor local de Ollama responde en localhost:11434.
 * Si está apagado, lo arranca automáticamente en segundo plano desde la ruta local de Windows.
 */
async function ensureLocalOllamaRunning() {
    const { baseUrl } = getLocalAIConfig();
    try {
        const res = await fetch(`${baseUrl}/api/tags`, {
            signal: AbortSignal.timeout(2000)
        });
        if (res.ok) {
            const data = await res.json();
            return {
                online: true,
                models: (data.models || []).map(m => m.name)
            };
        }
    } catch (_) {
        // Intentar auto-arrancar Ollama local si aún no se ha intentado
        if (!ollamaStartAttempted) {
            ollamaStartAttempted = true;
            const ollamaExe = path.join(
                process.env.LOCALAPPDATA || 'C:\\Users\\mpila\\AppData\\Local',
                'Programs',
                'Ollama',
                'ollama.exe'
            );
            if (fs.existsSync(ollamaExe)) {
                console.log('🚀 [IA Local] Iniciando servidor Ollama en localhost:11434...');
                try {
                    const child = spawn(ollamaExe, ['serve'], {
                        detached: true,
                        stdio: 'ignore',
                        windowsHide: true
                    });
                    child.unref();
                    await new Promise(r => setTimeout(r, 2500));
                    const retry = await fetch(`${baseUrl}/api/tags`, {
                        signal: AbortSignal.timeout(2500)
                    });
                    if (retry.ok) {
                        const data = await retry.json();
                        return {
                            online: true,
                            models: (data.models || []).map(m => m.name)
                        };
                    }
                } catch (_) {}
            }
        }
    }
    return { online: false, models: [] };
}

/**
 * Llama al Agente de Texto Local en Ollama (ej. qwen2.5:3b) 100% en localhost.
 */
async function callLocalTextAgent(prompt, options = {}) {
    const { baseUrl, textModel } = getLocalAIConfig();
    const status = await ensureLocalOllamaRunning();
    if (!status.online) {
        throw new Error('Servidor Ollama local no disponible en localhost:11434');
    }

    const body = {
        model: options.model || textModel,
        prompt,
        stream: false,
        keep_alive: '30m',
        options: {
            temperature: options.temperature ?? 0.1,
            num_predict: options.maxTokens ?? 350
        }
    };

    if (options.jsonMode !== false) {
        body.format = 'json';
    }

    const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs || 65000)
    });

    if (!res.ok) {
        throw new Error(`Error Ollama Texto (${res.status})`);
    }

    const data = await res.json();
    const rawText = (data.response || '').trim();

    if (options.jsonMode !== false) {
        try {
            return JSON.parse(rawText);
        } catch (_) {
            const match = rawText.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
            throw new Error('La respuesta del modelo local no es JSON válido');
        }
    }

    return rawText;
}

/**
 * Llama al Agente de Visión Local en Ollama (ej. moondream / llava) 100% en localhost
 * para inspeccionar fotos o fotogramas extraídos de vídeos y luego estructura el resultado en español con el Agente de Texto.
 * @param {string[]} base64Images - Array de imágenes en base64 (sin prefijo data:image/...)
 * @param {string} contextHint - Nombre original del archivo y lista de casos conocidos
 */
async function callLocalVisionAgent(base64Images, contextHint = '') {
    const { baseUrl, visionModel } = getLocalAIConfig();
    const status = await ensureLocalOllamaRunning();
    if (!status.online || !base64Images || base64Images.length === 0) {
        return null;
    }

    // 1. El modelo de visión local (moondream / llava) examina los fotogramas o la foto
    const descriptions = [];
    for (const imgBase64 of base64Images.slice(0, 1)) {
        try {
            const res = await fetch(`${baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: visionModel,
                    prompt: 'Describe concisely in one sentence what is shown in this image.',
                    images: [imgBase64],
                    stream: false,
                    keep_alive: '30m',
                    options: { temperature: 0.1, num_predict: 120 }
                }),
                signal: AbortSignal.timeout(65000)
            });

            if (res.ok) {
                const data = await res.json();
                if (data.response) {
                    descriptions.push(data.response.trim());
                }
            }
        } catch (err) {
            console.warn(`⚠️ [Agente Visión Local] Aviso al leer imagen: ${err.message}`);
        }
    }

    if (descriptions.length === 0) return null;

    const rawVisualDescription = descriptions.join(' | ');

    // 2. El Agente de Texto Local traduce y clasifica jurídicamente lo que ha visto el Agente de Visión
    try {
        const structured = await callLocalTextAgent(
            `Eres el Agente de Pruebas Visuales de un despacho de abogados en España.
Un modelo de visión por computador ha inspeccionado una prueba (foto o vídeo) y ha visto esto:
"${rawVisualDescription}"

Contexto adicional (nombre del archivo y casos existentes en el despacho):
${contextHint}

Devuelve EXCLUSIVAMENTE un objeto JSON con:
- "visualSummaryEs": Resumen profesional en español de 1 frase describiendo qué se ve en la foto o vídeo como prueba judicial.
- "shortTag": Etiqueta corta de 1 o 2 palabras sin tildes ni espacios para el nombre del archivo (ej: "Danos_Vivienda", "Accidente_Trafico", "Captura_WhatsApp", "Documento_Escaneado", "Inspeccion_Ocular", "Grabacion_Prueba").
- "matchedCase": Si el nombre del archivo o la descripción visual coincide claramente con alguno de los casos existentes, pon el nombre exacto de ese caso; si no hay coincidencia explícita, pon null.`,
            { jsonMode: true, timeoutMs: 65000 }
        );
        return {
            rawVisualDescription,
            visualSummaryEs: structured.visualSummaryEs || rawVisualDescription,
            shortTag: structured.shortTag || 'Evidencia_Visual',
            matchedCase: structured.matchedCase || null
        };
    } catch (_) {
        return {
            rawVisualDescription,
            visualSummaryEs: `Análisis visual local: ${rawVisualDescription}`,
            shortTag: 'Evidencia_Visual',
            matchedCase: null
        };
    }
}

module.exports = {
    ensureLocalOllamaRunning,
    callLocalTextAgent,
    callLocalVisionAgent
};
