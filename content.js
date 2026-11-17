// Puente DOM entre el mundo MAIN y background.js (HTTP CORS, ajustes del popup e inicio de pestaña).

(() => {
    'use strict';

    if (typeof window !== 'undefined' && window.top !== window.self) {
        return;
    }

    if (typeof window.__supratubeContentTeardown === 'function') {
        try {
            window.__supratubeContentTeardown();
        } catch {}
    }

    const isRuntimeAlive = () => {
        try {
            return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
        } catch {
            return false;
        }
    };

    const SETTINGS_KEY = 'supratube_settings';
    const DEFAULT_SETTINGS = {
        adSkip: true,
        sponsorBlock: true,
        greenBar: true,
        auto1080p: true,
        autoSubtitles: true,
        asrEngine: 'sherpa',
        aiAudioLang: 'auto',
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

    const onStorageChanged = (cambios, area) => {
        if (area === 'local' && cambios?.[SETTINGS_KEY]) {
            syncSettingsToPage(cambios[SETTINGS_KEY].newValue, true);
        }
    };
    try {
        chrome.storage.onChanged.addListener(onStorageChanged);
    } catch {
        // Ignorar si la extensión acaba de recargarse.
    }

    const onBridgeHttp = e => {
        if (!isRuntimeAlive()) {
            teardown();
            return;
        }
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
    };
    window.addEventListener('supratube-bridge-http', onBridgeHttp);

    const onBridgeAbort = e => {
        if (!isRuntimeAlive()) {
            teardown();
            return;
        }
        const requestId = e.detail?.requestId;
        if (!requestId) return;
        try {
            chrome.runtime.sendMessage({ action: 'SUPRATUBE_ABORT', requestId });
        } catch {
            // La pestaña pudo cerrarse antes de abortar.
        }
    };
    window.addEventListener('supratube-bridge-abort', onBridgeAbort);

    const captureByVideo = new WeakMap();
    let whisperSession = { active: false, videoId: '', pendingVideoId: '', video: null, connected: false };
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
        const curVid = whisperSession.videoId || whisperSession.pendingVideoId;
        if (!whisperSession.active && !whisperSession.pendingVideoId) return;
        if (videoId && curVid && videoId !== curVid) return;
        const vid = curVid;
        const vidEl = whisperSession.video;
        whisperSession = { active: false, videoId: '', pendingVideoId: '', video: null, connected: false };
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
            const tracks = (stream?.getAudioTracks?.() || []).filter(t => t?.readyState !== 'ended');
            if (tracks.length) return tracks;
        } catch {}
        try {
            if (typeof MediaStream === 'function' && vidEl.srcObject instanceof MediaStream) {
                const tracks = (vidEl.srcObject.getAudioTracks?.() || []).filter(t => t?.readyState !== 'ended');
                if (tracks.length) return tracks;
            }
        } catch {}
        return [];
    }

    function refreshEntryAudioSource(vidEl, entry, force = false) {
        if (!vidEl || !entry || entry.usedMediaElement) return false;
        const freshTracks = readStreamAudioTracks(vidEl);
        if (!freshTracks.length) return false;
        const prevIds = (entry.tracks || []).map(t => t?.id || '').join(',');
        const nextIds = freshTracks.map(t => t?.id || '').join(',');
        if (!force && prevIds && prevIds === nextIds && freshTracks.every(t => t?.readyState !== 'ended')) {
            return false;
        }
        try {
            if (entry.connected) {
                try { entry.src.disconnect(entry.proc); } catch {}
            }
            entry.src = entry.ctx.createMediaStreamSource(new MediaStream(freshTracks));
            entry.tracks = freshTracks;
            if (entry.connected) {
                entry.src.connect(entry.proc);
            }
            return true;
        } catch {
            return false;
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

        for (let attempt = 0; attempt < 8; attempt++) {
            if (token !== whisperStartSeq) return [];
            const tracks = readStreamAudioTracks(vidEl);
            if (tracks.length) return tracks;
            await new Promise(r => setTimeout(r, 350));
        }
        return [];
    }

    function resampleTo16k(input, srcRate) {
        if (!srcRate || srcRate === 16000) return new Float32Array(input);
        const ratio = srcRate / 16000;
        const outLen = Math.max(1, Math.floor(input.length / ratio));
        const out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
            const idx = i * ratio;
            const i0 = Math.floor(idx);
            const i1 = Math.min(i0 + 1, input.length - 1);
            const frac = idx - i0;
            out[i] = input[i0] * (1 - frac) + input[i1] * frac;
        }
        return out;
    }

    async function startWhisperCapture({ videoId, targetLang = 'es', spokenLang = '', asrEngine = 'sherpa', aiAudioLang = 'auto', manualForce = false }) {
        if (!videoId) return;
        const vidEl =
            document.querySelector(`video[data-supratube-whisper-target="${videoId}"]`) ||
            document.querySelector('ytd-reel-video-renderer[is-active] video') ||
            document.querySelector('video.html5-main-video') ||
            document.querySelector('video');
        if (!vidEl) return;

        const prevVid = whisperSession.videoId || whisperSession.pendingVideoId;
        if ((whisperSession.active || whisperSession.pendingVideoId) && prevVid !== videoId) {
            stopWhisperCapture(prevVid);
        }
        const token = ++whisperStartSeq;
        whisperSession.pendingVideoId = videoId;

        const startRes = await new Promise(resolve => {
            try {
                chrome.runtime.sendMessage(
                    {
                        action: 'SUPRATUBE_WHISPER_START',
                        videoId,
                        targetLang,
                        spokenLang: String(spokenLang || ''),
                        asrEngine: String(asrEngine || 'sherpa'),
                        aiAudioLang: String(aiAudioLang || 'auto'),
                        manualForce: Boolean(manualForce)
                    },
                    r => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message || 'offscreen unavailable' } : (r || { ok: false }))
                );
            } catch (err) {
                resolve({ ok: false, error: err?.message || 'offscreen unavailable' });
            }
        });
        if (token !== whisperStartSeq) return;
        if (!startRes?.ok) {
            whisperSession.pendingVideoId = '';
            window.dispatchEvent(new CustomEvent('supratube-whisper-evt', {
                detail: { kind: 'error', videoId, error: startRes?.error || 'offscreen unavailable' }
            }));
            return;
        }
        window.dispatchEvent(new CustomEvent('supratube-whisper-evt', {
            detail: { kind: 'ack', videoId }
        }));

        let entry = captureByVideo.get(vidEl);
        if (entry && (entry.ctx?.state === 'closed' || (!entry.usedMediaElement && entry.tracks?.some(t => t?.readyState === 'ended')))) {
            disconnectProc(entry);
            try { if (!entry.usedMediaElement) entry.ctx?.close?.(); } catch {}
            captureByVideo.delete(vidEl);
            entry = null;
        }
        if (!entry) {
            const aTracks = await waitAudioTracks(vidEl, token, videoId);
            if (token !== whisperStartSeq) return;

            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            let ctx = vidEl.__supratubeAudioCtx || null;
            if (ctx?.state === 'closed') ctx = null;
            if (!ctx) {
                try {
                    ctx = new Ctx({ sampleRate: 16000 });
                } catch {
                    ctx = new Ctx();
                }
                vidEl.__supratubeAudioCtx = ctx;
            }

            let src = null;
            let usedMediaElement = false;
            if (aTracks.length) {
                src = ctx.createMediaStreamSource(new MediaStream(aTracks));
            } else if (typeof ctx.createMediaElementSource === 'function') {
                try {
                    src = vidEl.__supratubeMediaElemSrc || ctx.createMediaElementSource(vidEl);
                    vidEl.__supratubeMediaElemSrc = src;
                    src.connect(ctx.destination);
                    usedMediaElement = true;
                } catch {
                    src = null;
                }
            }
            if (!src) {
                whisperSession.pendingVideoId = '';
                window.dispatchEvent(new CustomEvent('supratube-whisper-evt', {
                    detail: { kind: 'error', videoId, error: 'no audio track' }
                }));
                return;
            }
            const proc = ctx.createScriptProcessor(4096, 1, 1);
            const mute = ctx.createGain();
            mute.gain.value = 0;
            mute.connect(ctx.destination);
            entry = { ctx, tracks: aTracks, src, proc, mute, connected: false, boundSeek: false, boundPlay: false, usedMediaElement, zeroBatches: 0 };
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
            const tryResume = () => {
                if (entry.ctx.state === 'suspended') {
                    entry.ctx.resume().catch(() => {});
                }
            };
            vidEl.addEventListener('play', () => {
                if (whisperSession.active && whisperSession.video === vidEl) tryResume();
            }, { passive: true });
            window.addEventListener('pointerdown', tryResume, { passive: true });
            window.addEventListener('keydown', tryResume, { passive: true });
        }

        if (entry.ctx.state === 'suspended') {
            entry.ctx.resume().catch(() => {});
        }
        if (token !== whisperStartSeq) return;

        whisperSession = { active: true, videoId, pendingVideoId: '', video: vidEl, connected: true };
        entry.zeroBatches = 0;
        let batch = [];
        let len = 0;

        entry.proc.onaudioprocess = ev => {
            if (!whisperSession.active || whisperSession.videoId !== videoId || whisperSession.video !== vidEl) return;
            if (vidEl.paused || vidEl.ended) {
                batch = [];
                len = 0;
                return;
            }
            const ch = resampleTo16k(ev.inputBuffer.getChannelData(0), entry.ctx.sampleRate || 16000);
            batch.push(ch);
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
                const rms = Math.sqrt(sum / out.length);
                if (rms < 0.00001 && !vidEl.muted && (vidEl.volume ?? 1) > 0) {
                    entry.zeroBatches++;
                    if (entry.zeroBatches >= 12) {
                        entry.zeroBatches = 0;
                        refreshEntryAudioSource(vidEl, entry, true);
                    }
                } else {
                    entry.zeroBatches = 0;
                }
                chrome.runtime.sendMessage({
                    action: 'SUPRATUBE_WHISPER_PCM',
                    videoId,
                    samples: Array.from(out),
                    videoTime: Number(vidEl.currentTime) || 0,
                    rms
                }).catch(() => {});
            }
        };

        if (!entry.connected) {
            entry.src.connect(entry.proc);
            entry.proc.connect(entry.mute);
            entry.connected = true;
        }
    }

    const onWhisperCmd = e => {
        if (!isRuntimeAlive()) {
            teardown();
            return;
        }
        const d = e?.detail;
        if (!d || typeof d !== 'object') return;
        if (d.action === 'start') {
            void startWhisperCapture(d);
        } else if (d.action === 'stop') {
            stopWhisperCapture(d.videoId || '');
        } else if (d.action === 'reset' && d.videoId && whisperSession.videoId === d.videoId) {
            try {
                chrome.runtime.sendMessage({ action: 'SUPRATUBE_WHISPER_RESET', videoId: d.videoId }).catch(() => {});
            } catch {}
        }
    };
    window.addEventListener('supratube-whisper-cmd', onWhisperCmd);

    const onRuntimeMessage = (msg, _sender, sendResponse) => {
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
    };

    try {
        chrome.runtime.onMessage.addListener(onRuntimeMessage);
    } catch {
        // Ignorar si la extensión acaba de recargarse.
    }

    function teardown() {
        stopWhisperCapture();
        window.removeEventListener?.('supratube-bridge-http', onBridgeHttp);
        window.removeEventListener?.('supratube-bridge-abort', onBridgeAbort);
        window.removeEventListener?.('supratube-whisper-cmd', onWhisperCmd);
        try { chrome.storage.onChanged.removeListener?.(onStorageChanged); } catch {}
        try { chrome.runtime.onMessage.removeListener?.(onRuntimeMessage); } catch {}
        if (window.__supratubeContentTeardown === teardown) {
            window.__supratubeContentTeardown = null;
        }
    }
    window.__supratubeContentTeardown = teardown;

    try {
        chrome.runtime.sendMessage({ action: 'SUPRATUBE_INIT_TAB' }, () => {
            void chrome.runtime.lastError;
        });
    } catch {
        // Ignorar si el contexto de la extensión acaba de recargarse.
    }
})();
