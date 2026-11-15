// Provee GM_xmlhttpRequest, GM_addStyle, GM_getValue y GM_setValue en el mundo MAIN.

(() => {
    'use strict';

    if (typeof window !== 'undefined' && window.top !== window.self) {
        return;
    }

    if (window.__supratubeGmPolyfillReady) {
        return;
    }
    window.__supratubeGmPolyfillReady = true;

    let reqSeq = 0;
    const memStore = new Map();

    if (typeof window.GM_xmlhttpRequest !== 'function') {
        window.GM_xmlhttpRequest = function (detalles) {
            const opts = detalles || {};
            const requestId = `st_${++reqSeq}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const eventName = `supratube-bridge-res-${requestId}`;
            let terminado = false;
            let timer = null;

            const limpiar = () => {
                clearTimeout(timer);
                window.removeEventListener(eventName, onResp);
            };

            const onResp = ev => {
                if (terminado) return;
                terminado = true;
                limpiar();

                const payload = ev.detail || {};
                if (payload.error) {
                    if (/tiempo agotado/i.test(payload.error) && typeof opts.ontimeout === 'function') {
                        opts.ontimeout();
                    } else if (typeof opts.onerror === 'function') {
                        opts.onerror(payload);
                    }
                    return;
                }

                if (typeof opts.onload === 'function') {
                    opts.onload({
                        status: payload.status ?? 0,
                        responseText: payload.text ?? '',
                        finalUrl: payload.finalUrl || opts.url
                    });
                }
            };

            window.addEventListener(eventName, onResp);

            const timeoutMs = Number(opts.timeout) || 12000;
            timer = setTimeout(() => {
                if (terminado) return;
                terminado = true;
                limpiar();
                window.dispatchEvent(new CustomEvent('supratube-bridge-abort', { detail: { requestId } }));
                if (typeof opts.ontimeout === 'function') {
                    opts.ontimeout();
                }
            }, timeoutMs + 500);

            window.dispatchEvent(
                new CustomEvent('supratube-bridge-http', {
                    detail: {
                        requestId,
                        url: opts.url,
                        method: opts.method || 'GET',
                        headers: opts.headers ? { ...opts.headers } : {},
                        body: opts.data,
                        anonymous: Boolean(opts.anonymous),
                        timeout: timeoutMs
                    }
                })
            );

            return {
                abort() {
                    if (terminado) return;
                    terminado = true;
                    limpiar();
                    window.dispatchEvent(new CustomEvent('supratube-bridge-abort', { detail: { requestId } }));
                    if (typeof opts.onabort === 'function') {
                        opts.onabort();
                    }
                }
            };
        };
    }

    if (typeof window.GM_addStyle !== 'function') {
        window.GM_addStyle = function (cssText) {
            const style = document.createElement('style');
            style.textContent = String(cssText ?? '');
            const parent = document.head || document.documentElement;
            if (parent) parent.appendChild(style);
            return style;
        };
    }

    if (typeof window.GM_getValue !== 'function') {
        window.GM_getValue = function (clave, defecto) {
            try {
                const raw = localStorage.getItem(`supratube_gm_${clave}`);
                if (raw !== null) return JSON.parse(raw);
            } catch {
                // Respaldo en memoria si localStorage no está disponible.
            }
            return memStore.has(clave) ? memStore.get(clave) : defecto;
        };
    }

    if (typeof window.GM_setValue !== 'function') {
        window.GM_setValue = function (clave, valor) {
            memStore.set(clave, valor);
            try {
                localStorage.setItem(`supratube_gm_${clave}`, JSON.stringify(valor));
            } catch {
                // Ignorar error de cuota o almacenamiento privado.
            }
        };
    }
})();
