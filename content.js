// Puente DOM entre el mundo MAIN y background.js (HTTP CORS, ajustes del popup e inicio de pestaña).

(() => {
    'use strict';

    if (typeof window !== 'undefined' && window.top !== window.self) {
        return;
    }

    if (window.__supratubeContentAlive) {
        return;
    }
    window.__supratubeContentAlive = true;

    const SETTINGS_KEY = 'supratube_settings';
    const DEFAULT_SETTINGS = {
        adSkip: true,
        sponsorBlock: true,
        greenBar: true,
        auto1080p: true,
        autoSubtitles: true,
        aiSummary: true,
        transcriptDownload: true
    };

    const syncSettingsToPage = (raw, dispatchEvent) => {
        const merged = {
            ...DEFAULT_SETTINGS,
            ...(raw && typeof raw === 'object' ? raw : {})
        };
        if (document.documentElement) {
            document.documentElement.dataset.supratubeBridge = '1';
            document.documentElement.dataset.supratubeWhisperBridge = '1';
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

    const captureByVideo = new WeakMap();
    let whisperSession = { active: false, videoId: '', video: null, connected: false };
    let whisperStartSeq = 0;

    function disconnectProc(entry) {
        if (!entry) return;
        try {
            entry.proc.onaudioprocess = null;
            if (entry.connected) {
                entry.src.disconnect(entry.proc);
                entry.proc.disconnect(entry.mute);
                entry.connected = false;
            }
        } catch {}
    }

    function stopWhisperCapture(videoId = '') {
        whisperStartSeq++;
        if (!whisperSession.active) return;
        if (videoId && whisperSession.videoId && videoId !== whisperSession.videoId) return;
        const vid = whisperSession.videoId;
        const vidEl = whisperSession.video;
        whisperSession = { active: false, videoId: '', video: null, connected: false };
        if (vidEl) {
            disconnectProc(captureByVideo.get(vidEl));
        }
        try {
            chrome.runtime.sendMessage({ action: 'SUPRATUBE_WHISPER_STOP', videoId: vid }).catch(() => {});
        } catch {}
    }

    function readStreamAudioTracks(vidEl) {
        try {
            const stream = vidEl.captureStream ? vidEl.captureStream() : vidEl.mozCaptureStream?.();
            return stream?.getAudioTracks?.() || [];
        } catch {
            return [];
        }
    }

    function waitForPlaybackBeforeCapture(vidEl, token) {
        if (!vidEl || (!vidEl.paused && !vidEl.ended)) return Promise.resolve(true);
        return new Promise(resolve => {
            let settled = false;
            const cleanup = ok => {
                if (settled) return;
                settled = true;
                clearInterval(poll);
                vidEl.removeEventListener('play', onReady);
                vidEl.removeEventListener('playing', onReady);
                resolve(ok);
            };
            const onReady = () => {
                if (token !== whisperStartSeq) return cleanup(false);
                if (!vidEl.paused && !vidEl.ended) cleanup(true);
            };
            vidEl.addEventListener('play', onReady, { passive: true });
            vidEl.addEventListener('playing', onReady, { passive: true });
            const poll = setInterval(() => {
                if (token !== whisperStartSeq || !vidEl.isConnected) return cleanup(false);
                if (!vidEl.paused && !vidEl.ended) cleanup(true);
            }, 400);
        });
    }

    async function waitAudioTracks(vidEl, token, videoId) {
        const immediate = readStreamAudioTracks(vidEl);
        if (immediate.length) return immediate;

        if (vidEl.paused && !vidEl.ended) {
            window.dispatchEvent(new CustomEvent('supratube-whisper-evt', {
                detail: { kind: 'waiting_play', videoId }
            }));
            const ready = await waitForPlaybackBeforeCapture(vidEl, token);
            if (!ready || token !== whisperStartSeq) return [];
        }

        for (let attempt = 0; attempt < 15; attempt++) {
            if (token !== whisperStartSeq) return [];
            const tracks = readStreamAudioTracks(vidEl);
            if (tracks.length) return tracks;
            await new Promise(r => setTimeout(r, 350));
        }
        return [];
    }

    async function startWhisperCapture({ videoId, targetLang = 'es', manualForce = false }) {
        if (!videoId) return;
        const vidEl =
            document.querySelector(`video[data-supratube-whisper-target="${videoId}"]`) ||
            document.querySelector('ytd-reel-video-renderer[is-active] video') ||
            document.querySelector('video.html5-main-video') ||
            document.querySelector('video');
        if (!vidEl) return;

        if (whisperSession.active && whisperSession.videoId !== videoId) {
            stopWhisperCapture(whisperSession.videoId);
        }
        const token = ++whisperStartSeq;

        let entry = captureByVideo.get(vidEl);
        if (!entry) {
            const aTracks = await waitAudioTracks(vidEl, token, videoId);
            if (token !== whisperStartSeq) return;
            if (!aTracks.length) {
                window.dispatchEvent(new CustomEvent('supratube-whisper-evt', {
                    detail: { kind: 'error', videoId, error: 'no audio track' }
                }));
                return;
            }

            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx({ sampleRate: 16000 });
            const src = ctx.createMediaStreamSource(new MediaStream(aTracks));
            const proc = ctx.createScriptProcessor(4096, 1, 1);
            const mute = ctx.createGain();
            mute.gain.value = 0;
            mute.connect(ctx.destination);
            entry = { ctx, src, proc, mute, connected: false, boundSeek: false, boundPlay: false };
            captureByVideo.set(vidEl, entry);
        }

        if (!entry.boundSeek) {
            entry.boundSeek = true;
            vidEl.addEventListener('seeked', () => {
                if (whisperSession.active && whisperSession.video === vidEl) {
                    chrome.runtime.sendMessage({ action: 'SUPRATUBE_WHISPER_RESET', videoId: whisperSession.videoId }).catch(() => {});
                }
            }, { passive: true });
        }

        if (!entry.boundPlay) {
            entry.boundPlay = true;
            vidEl.addEventListener('play', () => {
                if (whisperSession.active && whisperSession.video === vidEl && entry.ctx.state === 'suspended') {
                    entry.ctx.resume().catch(() => {});
                }
            }, { passive: true });
        }

        if (entry.ctx.state === 'suspended') {
            await entry.ctx.resume().catch(() => {});
        }
        if (token !== whisperStartSeq) return;

        const startRes = await new Promise(resolve => {
            chrome.runtime.sendMessage(
                { action: 'SUPRATUBE_WHISPER_START', videoId, targetLang, manualForce: Boolean(manualForce) },
                r => resolve(chrome.runtime.lastError ? { ok: false } : (r || { ok: false }))
            );
        });
        if (token !== whisperStartSeq) return;
        if (!startRes?.ok) {
            window.dispatchEvent(new CustomEvent('supratube-whisper-evt', {
                detail: { kind: 'error', videoId, error: startRes?.error || 'offscreen unavailable' }
            }));
            return;
        }

        whisperSession = { active: true, videoId, video: vidEl, connected: true };
        let batch = [];
        let len = 0;

        entry.proc.onaudioprocess = ev => {
            if (!whisperSession.active || whisperSession.videoId !== videoId || whisperSession.video !== vidEl) return;
            if (vidEl.paused || vidEl.ended) {
                batch = [];
                len = 0;
                return;
            }
            const ch = ev.inputBuffer.getChannelData(0);
            batch.push(new Float32Array(ch));
            len += ch.length;
            if (len >= 4000) {
                const out = new Float32Array(len);
                let o = 0;
                let sum = 0;
                for (let i = 0; i < batch.length; i++) {
                    const b = batch[i];
                    out.set(b, o);
                    o += b.length;
                    for (let j = 0; j < b.length; j++) sum += b[j] * b[j];
                }
                batch = [];
                len = 0;
                chrome.runtime.sendMessage({
                    action: 'SUPRATUBE_WHISPER_PCM',
                    videoId,
                    samples: Array.from(out),
                    videoTime: Number(vidEl.currentTime) || 0,
                    rms: Math.sqrt(sum / out.length)
                }).catch(() => {});
            }
        };

        if (!entry.connected) {
            entry.src.connect(entry.proc);
            entry.proc.connect(entry.mute);
            entry.connected = true;
        }
    }

    window.addEventListener('supratube-whisper-cmd', e => {
        const d = e?.detail;
        if (!d || typeof d !== 'object') return;
        if (d.action === 'start') {
            void startWhisperCapture(d);
        } else if (d.action === 'stop') {
            stopWhisperCapture(d.videoId || '');
        } else if (d.action === 'reset' && d.videoId && whisperSession.videoId === d.videoId) {
            chrome.runtime.sendMessage({ action: 'SUPRATUBE_WHISPER_RESET', videoId: d.videoId }).catch(() => {});
        }
    });

    try {
        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
            if (msg?.action === 'SUPRATUBE_PING') {
                sendResponse?.({ ok: true });
                return false;
            }
            if (msg?.action === 'SUPRATUBE_WHISPER_EVENT' && msg.payload) {
                if (msg.payload.kind === 'same_language' && !msg.payload.manualForce) {
                    stopWhisperCapture(msg.payload.videoId || '');
                }
                window.dispatchEvent(new CustomEvent('supratube-whisper-evt', { detail: msg.payload }));
            }
        });
    } catch {
        // Ignorar si la extensión acaba de recargarse.
    }

    try {
        chrome.runtime.sendMessage({ action: 'SUPRATUBE_INIT_TAB' }, () => {
            void chrome.runtime.lastError;
        });
    } catch {
        // Ignorar si el contexto de la extensión acaba de recargarse.
    }
})();
