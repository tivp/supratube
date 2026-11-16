import { env, WhisperForConditionalGeneration, AutoProcessor, AutoTokenizer, LogitsProcessor, LogitsProcessorList } from '@huggingface/transformers';
import { filterWhisperText, stripCaptionOverlap, LanguageVoter, computeLangSoftmax } from './whisper-utils.js';

const VENDOR = new URL('./vendor/', self.location.href).href;
const ASYNCIFY = {
    mjs: `${VENDOR}ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${VENDOR}ort-wasm-simd-threaded.asyncify.wasm`
};

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.useWasmCache = false;
env.backends.onnx.wasm.wasmPaths = ASYNCIFY;

const SR = 16000;
const S = sec => Math.round(sec * SR);
const MIN_FIRST_WINDOW = S(1.4);
const MAX_WINDOW = S(9);
const OVERLAP = S(1.0);
const PAUSE_FINAL = S(0.45);
const PRE_ROLL = S(0.3);
const SPEECH_RMS = 0.008;
const SPEECH_RMS_HOLD = 0.004;

class LangDetectProcessor extends LogitsProcessor {
    constructor(genCfg, forced) {
        super();
        this.langs = Object.entries(genCfg.lang_to_id).map(([tok, id]) => [tok.slice(2, -2), id]);
        this.langToId = Object.fromEntries(this.langs);
        this.transcribeId = genCfg.task_to_id.transcribe;
        this.noTsId = genCfg.no_timestamps_token_id;
        this.forced = forced && this.langToId[forced] != null ? forced : null;
        this.result = null;
    }

    _call(inputIds, logits) {
        const step = inputIds[0].length;
        const data = logits.data;
        if (step === 1) {
            const info = computeLangSoftmax(data, this.langs, this.forced);
            this.result = { lang: info.chosen, detected: info.detected, conf: info.conf, lockedConf: info.lockedConf };
            data.fill(-Infinity);
            data[this.langToId[info.chosen]] = 0;
        } else if (step === 2) {
            data.fill(-Infinity);
            data[this.transcribeId] = 0;
        } else if (step === 3) {
            data.fill(-Infinity);
            data[this.noTsId] = 0;
        }
        return logits;
    }
}

let model = null;
let processor = null;
let tokenizer = null;
let loadedKey = '';
let loading = null;

let activeVideoId = '';
let targetLang = 'es';
let manualForce = false;
let stopped = false;

let chunks = [];
let total = 0;
let committed = 0;
let utteranceStart = null;
let lastSpeechEnd = -1;
let lastFinalEnd = 0;
let lastInferEnd = 0;
let prevUtteranceEnd = 0;
let prevCommittedRaw = '';
let busy = false;

const voter = new LanguageVoter();
const transCache = new Map();

function resetAudioState(clearOverlap = true) {
    chunks = [];
    total = 0;
    committed = 0;
    utteranceStart = null;
    lastSpeechEnd = -1;
    lastFinalEnd = 0;
    lastInferEnd = 0;
    prevUtteranceEnd = 0;
    if (clearOverlap) prevCommittedRaw = '';
}

function setBoundedTrans(key, val) {
    if (transCache.has(key)) transCache.delete(key);
    while (transCache.size >= 120) {
        transCache.delete(transCache.keys().next().value);
    }
    transCache.set(key, val);
}

async function initModel() {
    let gpu = false;
    try {
        gpu = Boolean(navigator.gpu && (await navigator.gpu.requestAdapter()));
    } catch {}

    const desiredKey = gpu ? 'webgpu:base' : 'wasm:tiny';
    if (model && loadedKey === desiredKey) {
        self.postMessage({ kind: 'ready', videoId: activeVideoId, model: loadedKey });
        return;
    }
    if (loading) return loading;

    loading = (async () => {
        const t0 = performance.now();
        const attempts = gpu
            ? [
                ['onnx-community/whisper-base', 'webgpu', { encoder_model: 'q4', decoder_model_merged: 'q4' }, {}],
                ['onnx-community/whisper-base', 'webgpu', { encoder_model: 'fp32', decoder_model_merged: 'q4' }, {}],
                ['onnx-community/whisper-tiny', 'wasm', 'q8', { graphOptimizationLevel: 'basic' }]
            ]
            : [
                ['onnx-community/whisper-tiny', 'wasm', 'q8', { graphOptimizationLevel: 'basic' }]
            ];

        let lastPct = -1;
        const files = new Map();
        const progress_callback = p => {
            if (!p?.file) return;
            if (p.status === 'progress') files.set(p.file, [p.loaded, p.total]);
            else if (p.status === 'done') {
                const f = files.get(p.file);
                if (f) files.set(p.file, [f[1], f[1]]);
            }
            let loaded = 0;
            let tot = 0;
            for (const [l, t] of files.values()) {
                if (t > 0) {
                    loaded += Math.min(l, t);
                    tot += t;
                }
            }
            const pct = tot ? Math.round((loaded / tot) * 100) : 0;
            if (pct >= lastPct + 10 || p.status === 'done') {
                lastPct = pct;
                self.postMessage({
                    kind: 'progress',
                    videoId: activeVideoId,
                    pct,
                    mbLoaded: +(loaded / 1048576).toFixed(1),
                    mbTotal: +(tot / 1048576).toFixed(1)
                });
            }
        };

        let lastErr = null;
        for (const [id, device, dtype, session_options] of attempts) {
            try {
                env.backends.onnx.wasm.wasmPaths = ASYNCIFY;
                env.backends.onnx.wasm.numThreads = 1;
                const m = await WhisperForConditionalGeneration.from_pretrained(id, {
                    device,
                    dtype,
                    session_options,
                    progress_callback
                });
                processor = await AutoProcessor.from_pretrained(id);
                tokenizer = await AutoTokenizer.from_pretrained(id);
                model = m;
                loadedKey = desiredKey;
                await inferSamples(new Float32Array(SR), null);
                self.postMessage({
                    kind: 'ready',
                    videoId: activeVideoId,
                    backend: device,
                    model: id,
                    loadMs: Math.round(performance.now() - t0)
                });
                return;
            } catch (err) {
                lastErr = err;
            }
        }
        self.postMessage({ kind: 'error', videoId: activeVideoId, error: String(lastErr?.message || lastErr) });
    })().finally(() => {
        loading = null;
    });

    return loading;
}

async function inferSamples(samples, forced) {
    const feats = await processor(samples);
    const lp = new LangDetectProcessor(model.generation_config, forced);
    const list = new LogitsProcessorList();
    list.push(lp);
    const out = await model.generate({
        inputs: feats.input_features,
        decoder_input_ids: [model.generation_config.decoder_start_token_id],
        logits_processor: list,
        max_new_tokens: 96
    });
    const text = (tokenizer.batch_decode(out, { skip_special_tokens: true })[0] || '').trim();
    return { text, ...(lp.result || { lang: 'en', detected: 'en', conf: 0 }) };
}

function extractWindow(from, to) {
    const out = new Float32Array(Math.max(0, to - from));
    for (const c of chunks) {
        if (c.end <= from || c.start >= to) continue;
        const a = Math.max(from, c.start);
        const b = Math.min(to, c.end);
        out.set(c.pcm.subarray(a - c.start, b - c.start), a - from);
    }
    return out;
}

async function translateCached(text, from, to) {
    const clean = String(text || '').trim();
    if (!clean) return '';
    const baseFrom = String(from || '').split('-')[0].toLowerCase();
    const baseTo = String(to || 'es').split('-')[0].toLowerCase();
    if (baseFrom && baseFrom === baseTo) return clean;

    const key = `${baseFrom || 'auto'}:${baseTo}:${clean}`;
    if (transCache.has(key)) return transCache.get(key);

    try {
        const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(baseFrom || 'auto')}&tl=${encodeURIComponent(baseTo)}&dt=t&q=${encodeURIComponent(clean)}`;
        const r = await fetch(gtxUrl);
        if (r.ok) {
            const j = await r.json();
            const joined = Array.isArray(j?.[0]) ? j[0].map(s => s?.[0] || '').join('').trim() : '';
            if (joined) {
                setBoundedTrans(key, joined);
                return joined;
            }
        }
    } catch {}

    try {
        const c5Url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(baseFrom || 'auto')}&tl=${encodeURIComponent(baseTo)}&q=${encodeURIComponent(clean)}`;
        const r2 = await fetch(c5Url);
        if (r2.ok) {
            const j2 = await r2.json();
            const out = Array.isArray(j2) ? String(j2[0] || '').trim() : String(j2 || '').trim();
            if (out) {
                setBoundedTrans(key, out);
                return out;
            }
        }
    } catch {}

    return clean;
}

async function maybeInfer(videoTime, runVid) {
    if (busy || stopped || !model || utteranceStart === null || runVid !== activeVideoId) return;
    const now = total;
    if (lastSpeechEnd <= utteranceStart) return;
    const sinceSpeech = now - lastSpeechEnd;
    const winLen = now - utteranceStart;

    let mode = null;
    let end = now;
    if (sinceSpeech >= PAUSE_FINAL && lastSpeechEnd > lastFinalEnd) {
        mode = 'final';
        end = Math.min(now, lastSpeechEnd + S(0.3));
    } else if (winLen >= MAX_WINDOW) {
        mode = 'cut';
    } else if (sinceSpeech < PAUSE_FINAL && winLen >= MIN_FIRST_WINDOW && now - lastInferEnd >= S(1.2)) {
        mode = 'interim';
    }
    if (!mode) return;

    busy = true;
    try {
        const t0 = performance.now();
        const res = await inferSamples(extractWindow(utteranceStart, end), voter.forcedLanguage());
        if (stopped || runVid !== activeVideoId) return;

        const inferMs = Math.round(performance.now() - t0);
        lastInferEnd = end;
        const silMs = ((utteranceStart - prevUtteranceEnd) / SR) * 1000;
        voter.observe({ lang: res.detected, conf: res.conf, lockedConf: res.lockedConf, ts: Date.now(), silenceMs: silMs });

        if (voter.shouldAbortForSameLanguage(targetLang, manualForce)) {
            stopped = true;
            resetAudioState(true);
            self.postMessage({ kind: 'same_language', videoId: runVid, lang: voter.locked });
            return;
        }

        const filtered = filterWhisperText(res.text);
        const clean = prevCommittedRaw ? (stripCaptionOverlap(prevCommittedRaw, filtered) || filtered) : filtered;
        const translated = clean ? await translateCached(clean, res.lang, targetLang) : '';
        if (stopped || runVid !== activeVideoId) return;

        if (translated) {
            self.postMessage({
                kind: 'caption',
                videoId: runVid,
                mode,
                raw: clean,
                lang: res.lang,
                locked: voter.locked,
                translated,
                inferMs,
                videoTime
            });
        }

        if (mode === 'final') {
            lastFinalEnd = lastSpeechEnd;
            prevUtteranceEnd = lastSpeechEnd;
            committed = end;
            utteranceStart = null;
            prevCommittedRaw = clean;
        } else if (mode === 'cut') {
            prevCommittedRaw = clean;
            committed = Math.max(committed, now - OVERLAP);
            utteranceStart = committed;
        }
    } finally {
        busy = false;
    }
}

self.onmessage = async e => {
    const m = e.data;
    if (!m || !m.kind) return;

    if (m.kind === 'INIT') {
        activeVideoId = String(m.videoId || '');
        targetLang = String(m.targetLang || 'es');
        manualForce = Boolean(m.manualForce);
        stopped = false;
        voter.reset();
        resetAudioState(true);
        await initModel();
        return;
    }

    if (m.kind === 'RESET') {
        if (!m.videoId || m.videoId === activeVideoId) {
            resetAudioState(true);
        }
        return;
    }

    if (m.kind === 'STOP') {
        if (!m.videoId || m.videoId === activeVideoId) {
            stopped = true;
            activeVideoId = '';
            voter.reset();
            resetAudioState(true);
        }
        return;
    }

    if (m.kind === 'PCM') {
        if (stopped || !model || !m.videoId || m.videoId !== activeVideoId) return;
        const pcm = m.pcm instanceof Float32Array ? m.pcm : new Float32Array(m.pcm || []);
        if (!pcm.length) return;

        const start = total;
        const end = total + pcm.length;
        chunks.push({ start, end, pcm });
        total = end;

        const recently = lastSpeechEnd > 0 && end - lastSpeechEnd <= S(0.3);
        if (m.rms > SPEECH_RMS || (recently && m.rms > SPEECH_RMS_HOLD)) {
            if (utteranceStart === null) utteranceStart = Math.max(committed, start - PRE_ROLL);
            lastSpeechEnd = end;
        }

        const keepFrom = Math.min(committed, utteranceStart ?? committed) - S(2);
        while (chunks.length && chunks[0].end < keepFrom) {
            chunks.shift();
        }
        maybeInfer(m.videoTime, m.videoId).catch(err => {
            if (!stopped && m.videoId === activeVideoId) {
                self.postMessage({ kind: 'error', videoId: m.videoId, error: String(err?.message || err) });
            }
        });
    }
};
