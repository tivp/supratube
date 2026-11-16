// Service Worker: proxy HTTP sin CORS (SponsorBlock e IP geo) y compilador/actualizador desde GitHub.

const REPO_API_COMMIT = 'https://api.github.com/repos/tivp/supratube/commits/main';
const REPO_RAW_BASE = 'https://raw.githubusercontent.com/tivp/supratube/main';
const CACHE_KEY = 'supratube_github_cache';
const SETTINGS_KEY = 'supratube_settings';
const SYNC_CHECK_KEY = 'supratube_last_sync_check';
const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const USER_SCRIPT_ID = 'supratube-github-bundle';
const MATCHES_YOUTUBE = ['https://www.youtube.com/*', 'https://m.youtube.com/*'];
const EXT_VERSION = chrome.runtime?.getManifest?.()?.version || '1.0.10';

const ORDEN_MODULOS = [
    'config.js',
    'utils.js',
    'adblock.js',
    'sponsorblock.js',
    'quality.js',
    'geo-lang.js',
    'subtitles.js',
    'ai-summary.js',
    'transcript-download.js',
    'main.js'
];

const DEFAULT_SETTINGS_SYNC = {
    adSkip: true,
    sponsorBlock: true,
    greenBar: true,
    auto1080p: true,
    autoSubtitles: true,
    aiSummary: true,
    transcriptDownload: true
};

const controladoresActivos = new Map();
let autoSyncEnCurso = null;

function tieneSoporteUserScripts() {
    return typeof chrome.userScripts !== 'undefined' && typeof chrome.userScripts.register === 'function';
}

function parseVersionDesdeConfig(codigoConfig) {
    const match = String(codigoConfig || '').match(/version\s*:\s*['"](\d+\.\d+\.\d+)['"]/);
    return match ? match[1] : '';
}

function compararSemver(a, b) {
    const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
}

function parseOrdenModulosDesdeConfig(codigoConfig) {
    const match = String(codigoConfig || '').match(/ORDEN_MODULOS\s*=\s*(?:Object\.freeze\s*\(\s*)?\[([\s\S]*?)\]/);
    if (!match) return ORDEN_MODULOS.slice();
    const encontrados = [];
    const itemRe = /['"]([a-zA-Z0-9_.-]+\.js)['"]/g;
    let m;
    while ((m = itemRe.exec(match[1])) !== null) {
        if (!encontrados.includes(m[1])) encontrados.push(m[1]);
    }
    if (encontrados.includes('config.js') && encontrados.includes('main.js') && encontrados.length >= 2) {
        return encontrados;
    }
    return ORDEN_MODULOS.slice();
}

function esCacheValido(cache) {
    if (!cache || typeof cache.codigoCompilado !== 'string' || !cache.codigoCompilado) {
        return false;
    }
    if (cache.extVersion !== EXT_VERSION) {
        return false;
    }
    const cacheModVersion = parseVersionDesdeConfig(cache.modulos?.['config.js']);
    if (cacheModVersion && compararSemver(cacheModVersion, EXT_VERSION) < 0) {
        return false;
    }
    if (!cache.modulos || typeof cache.modulos !== 'object') {
        return false;
    }
    return ORDEN_MODULOS.every(nombre => typeof cache.modulos[nombre] === 'string' && cache.modulos[nombre].length > 0);
}

// Empaqueta los módulos ESM en una sola IIFE para ejecutarla en el mundo MAIN.
function compilarBundleDesdeModulos(mapaModulos, listaOrden = ORDEN_MODULOS) {
    const bloques = listaOrden.map(nombre => {
        let codigo = String(mapaModulos[nombre] || '');
        codigo = codigo.replace(/^import\s+[\s\S]*?\bfrom\s+['"][^'"]+['"];?[ \t]*(?:\r?\n|$)/gm, '');
        codigo = codigo.replace(/^import\s+['"][^'"]+['"];?[ \t]*(?:\r?\n|$)/gm, '');
        codigo = codigo.replace(/^export\s+(async\s+function|function|const|let)/gm, '$1');
        return `// --- ${nombre} ---\n${codigo.trim()}`;
    });

    return `(() => {\n'use strict';\nif (window.__supratubeEjecutado && !window.__supratubeForceReinit) return;\nif (typeof window.__supratubeTeardown === 'function') {\n    try { window.__supratubeTeardown(); } catch {}\n}\nwindow.__supratubeForceReinit = false;\nwindow.__supratubeEjecutado = true;\n\n${bloques.join('\n\n')}\n})();\n`;
}

async function sincronizarUserScriptRegistrado(codigoCompilado) {
    if (!tieneSoporteUserScripts() || !codigoCompilado) {
        return false;
    }

    try {
        try {
            await chrome.userScripts.unregister({ ids: [USER_SCRIPT_ID] });
        } catch {
            // No había versión previa registrada.
        }

        try {
            await chrome.userScripts.register([
                {
                    id: USER_SCRIPT_ID,
                    matches: MATCHES_YOUTUBE,
                    allFrames: false,
                    js: [{ code: codigoCompilado }],
                    runAt: 'document_start',
                    world: 'MAIN'
                }
            ]);
            return true;
        } catch {
            if (typeof chrome.userScripts.configureWorld === 'function') {
                try {
                    await chrome.userScripts.configureWorld({ messaging: true });
                } catch {
                    // El puente DOM de content.js sigue disponible como respaldo.
                }
            }
            await chrome.userScripts.register([
                {
                    id: USER_SCRIPT_ID,
                    matches: MATCHES_YOUTUBE,
                    allFrames: false,
                    js: [{ code: codigoCompilado }],
                    runAt: 'document_start',
                    world: 'USER_SCRIPT'
                }
            ]);
            return true;
        }
    } catch {
        return false;
    }
}

async function asegurarUserScriptDesdeCache() {
    if (!tieneSoporteUserScripts()) return { activo: false, registradoAhora: false, cache: null };

    const datos = await chrome.storage.local.get(CACHE_KEY);
    const cache = datos[CACHE_KEY] || null;
    if (!esCacheValido(cache)) {
        try {
            await chrome.userScripts.unregister({ ids: [USER_SCRIPT_ID] });
        } catch {
            // No había versión previa registrada.
        }
        if (cache) {
            try {
                await chrome.storage.local.remove?.(CACHE_KEY);
            } catch {
                // Ignorar error de limpieza.
            }
        }
        return { activo: false, registradoAhora: false, cache: null };
    }

    try {
        const existentes = await chrome.userScripts.getScripts({ ids: [USER_SCRIPT_ID] });
        if (existentes && existentes.length > 0) {
            return { activo: true, registradoAhora: false, cache };
        }
    } catch {
        // Reintentar registro abajo.
    }

    const ok = await sincronizarUserScriptRegistrado(cache.codigoCompilado);
    return { activo: ok, registradoAhora: ok, cache };
}

async function inyectarScriptLocalEnMain(tabId, frameId, { forceReinit = false } = {}) {
    if (!tabId) return false;
    const frameIds = typeof frameId === 'number' ? [frameId] : undefined;
    const target = frameIds ? { tabId, frameIds } : { tabId };

    try {
        const [chk] = await chrome.scripting.executeScript({
            target,
            world: 'MAIN',
            func: force => {
                const prev = Boolean(window.__supratubeEjecutado);
                if (force) window.__supratubeForceReinit = true;
                return prev;
            },
            args: [Boolean(forceReinit)]
        });
        if (chk?.result && !forceReinit) {
            return true;
        }
        await chrome.scripting.executeScript({
            target,
            world: 'MAIN',
            files: ['script.js'],
            injectImmediately: true
        });
        return true;
    } catch {
        return false;
    }
}

async function asegurarPuenteEnPestana(tabId) {
    if (!tabId) return false;
    let bridgeAlive = false;
    try {
        if (typeof chrome.tabs?.sendMessage === 'function') {
            const pong = await chrome.tabs.sendMessage(tabId, { action: 'SUPRATUBE_PING' });
            bridgeAlive = Boolean(pong?.ok);
        }
    } catch {
        bridgeAlive = false;
    }
    if (bridgeAlive) return true;
    if (typeof chrome.scripting?.executeScript !== 'function') return false;
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            files: ['page-hook.js'],
            injectImmediately: true
        });
    } catch {
        // Ignorar si la pestaña no admite inyección MAIN o ya tiene el hook.
    }
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js'],
            injectImmediately: true
        });
        return true;
    } catch {
        return false;
    }
}

async function probeEstadoBundleEnPestana(tabId) {
    if (!tabId || typeof chrome.scripting?.executeScript !== 'function') {
        return { executed: false, hasTeardown: false };
    }
    try {
        const [res] = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => ({
                executed: Boolean(window.__supratubeEjecutado),
                hasTeardown: typeof window.__supratubeTeardown === 'function'
            })
        });
        return res?.result || { executed: false, hasTeardown: false };
    } catch {
        return { executed: false, hasTeardown: false };
    }
}

async function ejecutarCodigoEnPestana(tabId, codigoCompilado, { forceReinit = false } = {}) {
    if (!tabId || !codigoCompilado) return false;
    const payload = forceReinit
        ? `window.__supratubeForceReinit = true;\n${codigoCompilado}`
        : codigoCompilado;

    if (tieneSoporteUserScripts() && typeof chrome.userScripts.execute === 'function') {
        for (const world of ['MAIN', 'USER_SCRIPT']) {
            try {
                await chrome.userScripts.execute({
                    target: { tabId },
                    js: [{ code: payload }],
                    world
                });
                return true;
            } catch {
                // Probar siguiente mundo o respaldo local.
            }
        }
    }

    return inyectarScriptLocalEnMain(tabId, undefined, { forceReinit });
}

async function limpiarCacheYUserScriptRemoto() {
    try {
        if (tieneSoporteUserScripts()) {
            await chrome.userScripts.unregister({ ids: [USER_SCRIPT_ID] });
        }
    } catch {
        // No había versión previa registrada.
    }
    try {
        await chrome.storage.local.remove?.(CACHE_KEY);
    } catch {
        // Ignorar si no había caché previa.
    }
}

async function desplegarActualizacionEnPestanas({ codigoCompilado = '', usarLocal = false, recargarLegado = false } = {}) {
    let pestanasActualizadas = 0;
    try {
        const pestanas = await chrome.tabs.query({ url: MATCHES_YOUTUBE });
        for (const tab of pestanas) {
            if (!tab.id) continue;
            const estado = await probeEstadoBundleEnPestana(tab.id);
            if (recargarLegado && estado.executed && !estado.hasTeardown && typeof chrome.tabs?.reload === 'function') {
                try {
                    await chrome.tabs.reload(tab.id);
                    pestanasActualizadas++;
                    continue;
                } catch {
                    // Respaldo: continuar con reinyección directa.
                }
            }
            await asegurarPuenteEnPestana(tab.id);
            const ejecutado = usarLocal
                ? await inyectarScriptLocalEnMain(tab.id, undefined, { forceReinit: true })
                : await ejecutarCodigoEnPestana(tab.id, codigoCompilado, { forceReinit: true });
            if (ejecutado) pestanasActualizadas++;
        }
    } catch {
        // Ignorar si no hay pestañas de YouTube abiertas.
    }
    return pestanasActualizadas;
}

async function actualizarScriptsDesdeGithub({ recargarLegado = false } = {}) {
    const resCommit = await fetch(`${REPO_API_COMMIT}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
    });

    if (!resCommit.ok) {
        throw new Error(`No se pudo consultar GitHub (HTTP ${resCommit.status})`);
    }

    const commitData = await resCommit.json();
    const sha = String(commitData.sha || '');
    const shaCorto = sha ? sha.slice(0, 7) : 'main';
    const mensajeCommit = String(commitData.commit?.message || 'Actualización').split('\n')[0].trim();
    const fechaCommit = commitData.commit?.author?.date || '';

    const rawBase = sha ? `${REPO_RAW_BASE.replace(/\/main$/, '')}/${encodeURIComponent(sha)}` : REPO_RAW_BASE;
    const nonce = Date.now();
    const resConfig = await fetch(`${rawBase}/modules/config.js?t=${nonce}`, { cache: 'no-store' });
    if (!resConfig.ok) {
        throw new Error(`Error al bajar modules/config.js (HTTP ${resConfig.status})`);
    }
    const configTexto = await resConfig.text();
    const remoteVersion = parseVersionDesdeConfig(configTexto);
    const listaModulos = parseOrdenModulosDesdeConfig(configTexto);

    if (remoteVersion && compararSemver(remoteVersion, EXT_VERSION) < 0) {
        await limpiarCacheYUserScriptRemoto();
        await chrome.storage.local.set({ [SYNC_CHECK_KEY]: Date.now() });
        const pestanasActualizadas = await desplegarActualizacionEnPestanas({
            usarLocal: true,
            recargarLegado
        });
        return {
            ok: true,
            swVersion: EXT_VERSION,
            localVigente: true,
            cache: {
                sha,
                shaCorto,
                mensajeCommit: `Versión local v${EXT_VERSION} vigente (GitHub aún en v${remoteVersion})`,
                fechaCommit,
                actualizadoEn: new Date().toLocaleString('es-CL'),
                totalModulos: ORDEN_MODULOS.length
            },
            userScriptsActivo: tieneSoporteUserScripts(),
            pestanasActualizadas
        };
    }

    const restantes = await Promise.all(
        listaModulos
            .filter(nombre => nombre !== 'config.js')
            .map(async nombre => {
                const url = `${rawBase}/modules/${nombre}?t=${nonce}`;
                const resp = await fetch(url, { cache: 'no-store' });
                if (!resp.ok) {
                    throw new Error(`Error al bajar modules/${nombre} (HTTP ${resp.status})`);
                }
                const texto = await resp.text();
                return [nombre, texto];
            })
    );

    const modulos = { 'config.js': configTexto, ...Object.fromEntries(restantes) };
    const codigoCompilado = compilarBundleDesdeModulos(modulos, listaModulos);

    const cache = {
        extVersion: EXT_VERSION,
        sha,
        shaCorto,
        mensajeCommit,
        fechaCommit,
        actualizadoEn: new Date().toLocaleString('es-CL'),
        modulos,
        codigoCompilado
    };

    await chrome.storage.local.set({ [CACHE_KEY]: cache, [SYNC_CHECK_KEY]: Date.now() });

    const userScriptsActivo = await sincronizarUserScriptRegistrado(codigoCompilado);
    const pestanasActualizadas = await desplegarActualizacionEnPestanas({
        codigoCompilado,
        usarLocal: !userScriptsActivo,
        recargarLegado
    });

    return {
        ok: true,
        swVersion: EXT_VERSION,
        cache: {
            sha: cache.sha,
            shaCorto: cache.shaCorto,
            mensajeCommit: cache.mensajeCommit,
            fechaCommit: cache.fechaCommit,
            actualizadoEn: cache.actualizadoEn,
            totalModulos: listaModulos.length
        },
        userScriptsActivo,
        pestanasActualizadas
    };
}

async function verificarActualizacionAutomaticaEnFondo({ forzar = false } = {}) {
    if (!tieneSoporteUserScripts()) return false;
    if (autoSyncEnCurso) return autoSyncEnCurso;

    autoSyncEnCurso = (async () => {
        try {
            const datos = await chrome.storage.local.get([SYNC_CHECK_KEY, CACHE_KEY]);
            const ultimoChequeo = Number(datos?.[SYNC_CHECK_KEY] || 0);
            if (!forzar && ultimoChequeo && Date.now() - ultimoChequeo < AUTO_SYNC_INTERVAL_MS) {
                return false;
            }
            await chrome.storage.local.set({ [SYNC_CHECK_KEY]: Date.now() });

            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4000);
            let resCommit;
            try {
                resCommit = await fetch(`${REPO_API_COMMIT}?t=${Date.now()}`, {
                    cache: 'no-store',
                    headers: { Accept: 'application/vnd.github+json' },
                    signal: ctrl.signal
                });
            } finally {
                clearTimeout(timer);
            }
            if (!resCommit?.ok) return false;
            const commitData = await resCommit.json();
            const remoteSha = String(commitData?.sha || '');
            const cache = datos?.[CACHE_KEY];
            if (!remoteSha || (esCacheValido(cache) && cache.sha === remoteSha)) {
                return false;
            }
            await actualizarScriptsDesdeGithub();
            return true;
        } catch {
            return false;
        } finally {
            autoSyncEnCurso = null;
        }
    })();

    return autoSyncEnCurso;
}

asegurarUserScriptDesdeCache().catch(() => {});

chrome.runtime.onStartup?.addListener(() => {
    asegurarUserScriptDesdeCache().catch(() => {});
    verificarActualizacionAutomaticaEnFondo({ forzar: true }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(async details => {
    try {
        const prev = await chrome.storage.local.get(SETTINGS_KEY);
        const mergedSettings = {
            ...DEFAULT_SETTINGS_SYNC,
            ...(prev?.[SETTINGS_KEY] && typeof prev[SETTINGS_KEY] === 'object' ? prev[SETTINGS_KEY] : {})
        };
        await chrome.storage.local.set({ [SETTINGS_KEY]: mergedSettings });
    } catch {
        // Ignorar si storage aún no está listo.
    }

    if (details?.reason === 'update' || details?.reason === 'install') {
        try {
            if (tieneSoporteUserScripts()) {
                await chrome.userScripts.unregister({ ids: [USER_SCRIPT_ID] });
            }
        } catch {
            // No había versión previa registrada.
        }
        try {
            await chrome.storage.local.remove?.(CACHE_KEY);
        } catch {
            // Ignorar si no había caché previa.
        }
        actualizarScriptsDesdeGithub().catch(() => {});
        return;
    }

    asegurarUserScriptDesdeCache().catch(() => {});
});

let whisperOffscreenPromise = null;
let activeWhisperTabId = null;
let activeWhisperVideoId = '';

async function ensureWhisperOffscreen() {
    if (!chrome.offscreen?.createDocument) {
        throw new Error('offscreen API no disponible');
    }
    if (typeof chrome.runtime.getContexts === 'function') {
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (contexts.length > 0) return;
    }
    if (!whisperOffscreenPromise) {
        whisperOffscreenPromise = chrome.offscreen
            .createDocument({
                url: 'offscreen.html',
                reasons: ['WORKERS', 'AUDIO_PLAYBACK'],
                justification: 'Ejecutar Whisper WebGPU/WASM local cuando YouTube no tiene subtítulos'
            })
            .finally(() => {
                whisperOffscreenPromise = null;
            });
    }
    await whisperOffscreenPromise;
}

// Reintenta hasta 25 veces mientras offscreen.html termina de cargar su módulo (patrón Chan2TXT).
async function sendMessageToOffscreenWithRetry(payload) {
    await ensureWhisperOffscreen();
    let lastErr = null;
    for (let i = 0; i < 25; i++) {
        try {
            return await chrome.runtime.sendMessage({
                target: 'offscreen',
                ...payload
            });
        } catch (err) {
            lastErr = err;
            const msg = String(err?.message || err || '');
            if (!/Receiving end does not exist|message port closed/i.test(msg)) {
                throw err;
            }
            await new Promise(r => setTimeout(r, 120));
        }
    }
    throw lastErr || new Error('Offscreen no respondió tras inicializar');
}

if (chrome.tabs?.onRemoved?.addListener) {
    chrome.tabs.onRemoved.addListener(tabId => {
        if (tabId === activeWhisperTabId) {
            const vid = activeWhisperVideoId;
            activeWhisperTabId = null;
            activeWhisperVideoId = '';
            chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP', videoId: vid }).catch(() => {});
        }
    });
}

chrome.runtime.onMessage.addListener((mensaje, sender, enviarRespuesta) => {
    if (!mensaje || typeof mensaje !== 'object') return false;
    if (mensaje.target === 'offscreen') return false;

    if (mensaje.action === 'SUPRATUBE_WHISPER_START') {
        if (!sender.tab?.id || !mensaje.videoId) {
            enviarRespuesta({ ok: false, error: 'Falta tabId o videoId' });
            return false;
        }
        const prevTabId = activeWhisperTabId;
        const prevVid = activeWhisperVideoId;
        activeWhisperTabId = sender.tab.id;
        activeWhisperVideoId = String(mensaje.videoId);
        if (prevTabId !== null && prevTabId !== activeWhisperTabId && chrome.tabs?.sendMessage) {
            chrome.tabs
                .sendMessage(prevTabId, { action: 'SUPRATUBE_WHISPER_EVENT', payload: { kind: 'preempted', videoId: prevVid } })
                .catch(() => {});
        }
        sendMessageToOffscreenWithRetry({
            type: 'INIT',
            videoId: activeWhisperVideoId,
            targetLang: mensaje.targetLang || 'es',
            manualForce: Boolean(mensaje.manualForce)
        })
            .then(() => enviarRespuesta({ ok: true }))
            .catch(err => enviarRespuesta({ ok: false, error: err?.message || 'Error iniciando Whisper' }));
        return true;
    }

    if (mensaje.action === 'SUPRATUBE_WHISPER_PCM') {
        if (sender.tab?.id === activeWhisperTabId && mensaje.videoId === activeWhisperVideoId) {
            chrome.runtime
                .sendMessage({
                    target: 'offscreen',
                    type: 'PCM',
                    videoId: activeWhisperVideoId,
                    samples: mensaje.samples,
                    videoTime: mensaje.videoTime,
                    rms: mensaje.rms
                })
                .catch(() => {});
        }
        return false;
    }

    if (mensaje.action === 'SUPRATUBE_WHISPER_RESET') {
        if (sender.tab?.id === activeWhisperTabId && mensaje.videoId === activeWhisperVideoId) {
            chrome.runtime.sendMessage({ target: 'offscreen', type: 'RESET', videoId: activeWhisperVideoId }).catch(() => {});
        }
        return false;
    }

    if (mensaje.action === 'SUPRATUBE_WHISPER_STOP') {
        if (!activeWhisperTabId || sender.tab?.id === activeWhisperTabId) {
            const vid = mensaje.videoId || activeWhisperVideoId;
            if (!mensaje.videoId || mensaje.videoId === activeWhisperVideoId) {
                activeWhisperTabId = null;
                activeWhisperVideoId = '';
            }
            chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP', videoId: vid }).catch(() => {});
        }
        return false;
    }

    if (mensaje.type === 'SUPRATUBE_WHISPER_EVENT') {
        if (activeWhisperTabId !== null && chrome.tabs?.sendMessage) {
            chrome.tabs
                .sendMessage(activeWhisperTabId, { action: 'SUPRATUBE_WHISPER_EVENT', payload: mensaje.payload })
                .catch(() => {});
        }
        return false;
    }

    if (mensaje.action === 'SUPRATUBE_ABORT') {
        const ctrl = controladoresActivos.get(mensaje.requestId);
        if (ctrl) {
            controladoresActivos.delete(mensaje.requestId);
            try {
                ctrl.abort();
            } catch {
                // La petición ya estaba cerrada.
            }
        }
        enviarRespuesta({ ok: true });
        return false;
    }

    if (mensaje.action === 'SUPRATUBE_HTTP_REQUEST') {
        const {
            requestId,
            url,
            method = 'GET',
            headers = {},
            body,
            anonymous = false,
            timeout = 12000
        } = mensaje;
        const ctrl = new AbortController();
        if (requestId) controladoresActivos.set(requestId, ctrl);

        const reloj = setTimeout(() => ctrl.abort(), timeout);
        const finalBody = method === 'GET' || method === 'HEAD' ? undefined : body;

        fetch(url, {
            method,
            headers,
            body: finalBody,
            credentials: anonymous ? 'omit' : 'include',
            cache: 'no-store',
            redirect: 'follow',
            signal: ctrl.signal
        })
            .then(async r => {
                const text = await r.text();
                enviarRespuesta({
                    status: r.status,
                    text,
                    finalUrl: r.url || url
                });
            })
            .catch(err => {
                enviarRespuesta({
                    error: err?.name === 'AbortError' ? 'Tiempo agotado o cancelado' : (err?.message || 'Error de red')
                });
            })
            .finally(() => {
                clearTimeout(reloj);
                if (requestId) controladoresActivos.delete(requestId);
            });

        return true;
    }

    if (mensaje.action === 'SUPRATUBE_GET_STATUS') {
        chrome.storage.local
            .get(CACHE_KEY)
            .then(datos => {
                const c = datos[CACHE_KEY];
                enviarRespuesta({
                    ok: true,
                    swVersion: EXT_VERSION,
                    cache: c
                        ? {
                              sha: c.sha,
                              shaCorto: c.shaCorto,
                              mensajeCommit: c.mensajeCommit,
                              fechaCommit: c.fechaCommit,
                              actualizadoEn: c.actualizadoEn,
                              totalModulos: Object.keys(c.modulos || {}).length
                          }
                        : null,
                    userScriptsActivo: tieneSoporteUserScripts(),
                    extensionId: chrome.runtime.id
                });
            })
            .catch(err => {
                enviarRespuesta({ ok: false, error: err?.message || 'Error al leer estado' });
            });
        return true;
    }

    if (mensaje.action === 'SUPRATUBE_UPDATE_SCRIPTS') {
        actualizarScriptsDesdeGithub({ recargarLegado: true })
            .then(res => enviarRespuesta(res))
            .catch(err =>
                enviarRespuesta({ ok: false, error: err?.message || 'Error al actualizar desde GitHub' })
            );
        return true;
    }

    if (mensaje.action === 'SUPRATUBE_INIT_TAB') {
        asegurarUserScriptDesdeCache()
            .then(async info => {
                if (info.activo) {
                    if (info.registradoAhora && sender.tab?.id && info.cache?.codigoCompilado) {
                        await ejecutarCodigoEnPestana(sender.tab.id, info.cache.codigoCompilado);
                    }
                    enviarRespuesta({ inyectadoRemoto: true });
                    verificarActualizacionAutomaticaEnFondo().catch(() => {});
                    return;
                }

                let inyectadoLocalMain = false;
                if (sender.tab?.id) {
                    inyectadoLocalMain = await inyectarScriptLocalEnMain(sender.tab.id, sender.frameId);
                }
                enviarRespuesta({ inyectadoRemoto: false, inyectadoLocalMain });
                verificarActualizacionAutomaticaEnFondo().catch(() => {});
            })
            .catch(() => {
                enviarRespuesta({ inyectadoRemoto: false, inyectadoLocalMain: false });
            });
        return true;
    }

    return false;
});
