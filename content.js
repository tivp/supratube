// Puente DOM entre el mundo MAIN y background.js (HTTP CORS, ajustes del popup e inicio de pestaña).

(() => {
    'use strict';

    if (typeof window !== 'undefined' && window.top !== window.self) {
        return;
    }

    const SETTINGS_KEY = 'supratube_settings';
    const DEFAULT_SETTINGS = {
        adSkip: true,
        sponsorBlock: true,
        greenBar: true,
        auto1080p: true,
        autoSubtitles: true,
        aiSummary: true
    };

    const syncSettingsToPage = (raw, dispatchEvent) => {
        const merged = {
            ...DEFAULT_SETTINGS,
            ...(raw && typeof raw === 'object' ? raw : {})
        };
        if (document.documentElement) {
            document.documentElement.dataset.supratubeBridge = '1';
            document.documentElement.dataset.supratubeSettings = JSON.stringify(merged);
        }
        if (dispatchEvent) {
            window.dispatchEvent(new CustomEvent('supratube-settings-updated', { detail: merged }));
        }
    };

    syncSettingsToPage(DEFAULT_SETTINGS, false);

    try {
        chrome.storage.local.get(SETTINGS_KEY, datos => {
            if (chrome.runtime.lastError) return;
            syncSettingsToPage(datos?.[SETTINGS_KEY], true);
        });
    } catch {
        // Usar valores por defecto si storage aún no está listo.
    }

    try {
        chrome.storage.onChanged.addListener((cambios, area) => {
            if (area === 'local' && cambios?.[SETTINGS_KEY]) {
                syncSettingsToPage(cambios[SETTINGS_KEY].newValue, true);
            }
        });
    } catch {
        // Ignorar si la extensión acaba de recargarse.
    }

    window.addEventListener('supratube-bridge-http', e => {
        const detalle = e.detail;
        if (!detalle?.requestId || !detalle?.url) return;

        const eventoRespuesta = `supratube-bridge-res-${detalle.requestId}`;

        try {
            chrome.runtime.sendMessage(
                {
                    action: 'SUPRATUBE_HTTP_REQUEST',
                    requestId: detalle.requestId,
                    url: detalle.url,
                    method: detalle.method,
                    headers: detalle.headers,
                    body: detalle.body,
                    anonymous: detalle.anonymous,
                    timeout: detalle.timeout
                },
                respuesta => {
                    const payload = chrome.runtime.lastError
                        ? { error: chrome.runtime.lastError.message }
                        : (respuesta || { error: 'Sin respuesta del background' });
                    window.dispatchEvent(new CustomEvent(eventoRespuesta, { detail: payload }));
                }
            );
        } catch (err) {
            window.dispatchEvent(
                new CustomEvent(eventoRespuesta, {
                    detail: { error: err?.message || 'Error al enviar petición' }
                })
            );
        }
    });

    window.addEventListener('supratube-bridge-abort', e => {
        const requestId = e.detail?.requestId;
        if (!requestId) return;
        try {
            chrome.runtime.sendMessage({ action: 'SUPRATUBE_ABORT', requestId });
        } catch {
            // La pestaña pudo cerrarse antes de abortar.
        }
    });

    try {
        chrome.runtime.sendMessage({ action: 'SUPRATUBE_INIT_TAB' }, () => {
            void chrome.runtime.lastError;
        });
    } catch {
        // Ignorar si el contexto de la extensión acaba de recargarse.
    }
})();
