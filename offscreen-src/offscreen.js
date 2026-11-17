let worker = null;

function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(chrome.runtime.getURL('worker.bundle.js'), { type: 'module' });
    worker.onmessage = e => {
        chrome.runtime.sendMessage({ type: 'SUPRATUBE_WHISPER_EVENT', payload: e.data }).catch(() => {});
    };
    worker.onerror = e => {
        chrome.runtime.sendMessage({
            type: 'SUPRATUBE_WHISPER_EVENT',
            payload: { kind: 'error', error: e.message || 'Worker error' }
        }).catch(() => {});
    };
    return worker;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.target !== 'offscreen') return false;
    const w = ensureWorker();
    if (msg.type === 'INIT') {
        w.postMessage({
            kind: 'INIT',
            videoId: msg.videoId || '',
            targetLang: msg.targetLang || 'es',
            spokenLang: msg.spokenLang || '',
            asrEngine: msg.asrEngine || 'sherpa',
            aiAudioLang: msg.aiAudioLang || 'auto',
            manualForce: Boolean(msg.manualForce)
        });
        sendResponse({ ok: true });
        return true;
    }
    if (msg.type === 'RESET') {
        w.postMessage({ kind: 'RESET', videoId: msg.videoId || '' });
        sendResponse({ ok: true });
        return true;
    }
    if (msg.type === 'STOP') {
        w.postMessage({ kind: 'STOP', videoId: msg.videoId || '' });
        sendResponse({ ok: true });
        return true;
    }
    if (msg.type === 'PCM') {
        const f32 = new Float32Array(msg.samples || []);
        w.postMessage(
            { kind: 'PCM', videoId: msg.videoId || '', pcm: f32, videoTime: msg.videoTime || 0, rms: msg.rms || 0 },
            [f32.buffer]
        );
        return false;
    }
    return false;
});
