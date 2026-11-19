import * as ort from 'onnxruntime-web';
import { env, WhisperForConditionalGeneration, AutoProcessor, AutoTokenizer, LogitsProcessor, LogitsProcessorList } from '@huggingface/transformers';
import { initASRModule, createOnlineRecognizer, OnlineRecognizerTypes } from '@sherpaw/asr';
import {
    filterWhisperText,
    stripCaptionOverlap,
    LanguageVoter,
    computeLangSoftmax,
    selectRealtimeAsrSpec,
    normalizeAsrEngine,
    normalizeAiAudioLang,
    hasSherpaLanguageModel,
    formatStreamingTailText,
    computeAdaptiveSpeechThreshold,
    gentleConditionPcm,
    SileroStreamingVadState
} from './whisper-utils.js';

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
ort.env.wasm.wasmPaths = ASYNCIFY;
ort.env.wasm.numThreads = 1;

const SR = 16000;
const S = sec => Math.round(sec * SR);
const MIN_FIRST_WINDOW = S(0.85);
const MAX_WINDOW = S(3.8);
const OVERLAP = S(0.55);
const PAUSE_FINAL = S(0.38);
const PRE_ROLL = S(0.28);
const INTERIM_STEP = S(0.85);
const SHERPA_DB_NAME = 'supratube-sherpa-models-v1';
const SHERPA_STORE = 'files';
const MYMEMORY_CONTACT = 'supratube.ext.translator@gmail.com';

class LangDetectProcessor extends LogitsProcessor {
    constructor(genCfg, forced) {
        super();
        this.langs = Object.entries(genCfg.lang_to_id).map(([tok, id]) => [tok.slice(2, -2), id]);
        this.langToId = Object.fromEntries(this.langs);
        this.transcribeId = genCfg.task_to_id.transcribe;
        this.noTsId = genCfg.no_timestamps_token_id;
        this.forced = forced && this.langToId[forced] != null ? forced : null;
        this.result = null;
        this.tokenProbs = [];
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
        } else if (step >= 4) {
            let maxLogit = -Infinity;
            for (let i = 0; i < data.length; i++) {
                if (data[i] > maxLogit) maxLogit = data[i];
            }
            let sumExp = 0;
            for (let i = 0; i < data.length; i++) {
                if (data[i] > maxLogit - 25) sumExp += Math.exp(data[i] - maxLogit);
            }
            const topProb = sumExp > 0 ? 1 / sumExp : 0;
            this.tokenProbs.push(topProb);
        }
        return logits;
    }

    get avgTokenProb() {
        if (!this.tokenProbs.length) return 1;
        let sum = 0;
        for (let i = 0; i < this.tokenProbs.length; i++) sum += this.tokenProbs[i];
        return +(sum / this.tokenProbs.length).toFixed(3);
    }
}

let activeEngine = '';
let activeModelLang = 'en';
let preferredEngine = 'sherpa';

let model = null;
let processor = null;
let tokenizer = null;

let sherpaMod = null;
let sherpaModPromise = null;
let sherpaOnlineRec = null;
let sherpaStream = null;
let sherpaLastPartial = '';
let sherpaEmitSeq = 0;
let sherpaTranslating = false;
let sherpaPendingEmit = null;
let googleRateLimitedUntil = 0;
const hpState = { prevIn: 0, prevOut: 0 };

let sileroSession = null;
let sileroInitPromise = null;
let sileroState = new Float32Array(2 * 1 * 128);
let sileroContext = new Float32Array(64);
let sileroSr = null;
const sileroVad = new SileroStreamingVadState({ onset: 0.45, offset: 0.30, minSpeechFrames: 8, minSilenceFrames: 13 });
let vadResidual = new Float32Array(0);
let vadPreRoll = [];
let utteranceConfirmedByVad = false;
let pcmChain = Promise.resolve();

let loadedKey = '';
let loading = null;
let loadingKey = '';

let activeVideoId = '';
let targetLang = 'es';
let requestedSpokenLang = '';
let requestedAiAudioLang = 'auto';
let lidAutoPromotePending = false;
let promoting = false;
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
let lastVideoTime = 0;
let noiseFloor = 0.0015;
let busy = false;

const voter = new LanguageVoter();
const transCache = new Map();

function openSherpaDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise(resolve => {
        try {
            const req = indexedDB.open(SHERPA_DB_NAME, 1);
            req.onupgradeneeded = ev => {
                const db = ev.target.result;
                if (!db.objectStoreNames.contains(SHERPA_STORE)) {
                    db.createObjectStore(SHERPA_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

const IDB_CHUNK_BYTES = 16 * 1024 * 1024;

function idbReq(request) {
    return new Promise(resolve => {
        try {
            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function idbGetBytes(key) {
    const db = await openSherpaDb();
    if (!db) return null;
    try {
        const tx = db.transaction([SHERPA_STORE], 'readonly');
        const store = tx.objectStore(SHERPA_STORE);
        const meta = await idbReq(store.get(key));
        if (!meta) return null;
        if (meta instanceof ArrayBuffer || ArrayBuffer.isView(meta)) {
            return meta.byteLength <= IDB_CHUNK_BYTES ? new Uint8Array(meta) : null;
        }
        const chunkCount = Number(meta.chunkCount) || 0;
        const totalBytes = Number(meta.totalBytes) || 0;
        if (chunkCount <= 0 || totalBytes <= 0) return null;
        const out = new Uint8Array(totalBytes);
        let offset = 0;
        for (let i = 0; i < chunkCount; i++) {
            const part = await idbReq(store.get(`${key}#${i}`));
            if (!part) return null;
            const u8 = new Uint8Array(part);
            if (offset + u8.byteLength > totalBytes) return null;
            out.set(u8, offset);
            offset += u8.byteLength;
        }
        return offset === totalBytes ? out : null;
    } catch {
        return null;
    }
}

async function idbPutBytes(key, u8) {
    const db = await openSherpaDb();
    if (!db) return;
    const totalBytes = u8.byteLength;
    const chunkCount = Math.max(1, Math.ceil(totalBytes / IDB_CHUNK_BYTES));
    try {
        for (let i = 0; i < chunkCount; i++) {
            const start = i * IDB_CHUNK_BYTES;
            const end = Math.min(totalBytes, start + IDB_CHUNK_BYTES);
            const sliceBuf = u8.buffer.slice(u8.byteOffset + start, u8.byteOffset + end);
            await new Promise(resolve => {
                try {
                    const tx = db.transaction([SHERPA_STORE], 'readwrite');
                    tx.objectStore(SHERPA_STORE).put(sliceBuf, `${key}#${i}`);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                } catch {
                    resolve();
                }
            });
        }
        await new Promise(resolve => {
            try {
                const tx = db.transaction([SHERPA_STORE], 'readwrite');
                tx.objectStore(SHERPA_STORE).put({ chunkCount, totalBytes }, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch {
                resolve();
            }
        });
    } catch {}
}

async function fetchHfFileCached(repoId, file, progressCallback) {
    const cacheKey = `hf:${repoId}:${file}`;
    const cached = await idbGetBytes(cacheKey);
    if (cached?.byteLength) {
        progressCallback({ file, status: 'progress', loaded: cached.byteLength, total: cached.byteLength });
        progressCallback({ file, status: 'done', loaded: cached.byteLength, total: cached.byteLength });
        return cached;
    }
    const url = `https://huggingface.co/${repoId}/resolve/main/${file}`;
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} descargando ${repoId}/${file}`);
    }
    const lenHdr = Number(resp.headers.get('content-length')) || 0;
    const reader = resp.body?.getReader?.();
    if (!reader) {
        const u8 = new Uint8Array(await resp.arrayBuffer());
        await idbPutBytes(cacheKey, u8);
        return u8;
    }
    const parts = [];
    let loaded = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        loaded += value.byteLength;
        if (lenHdr > 0) {
            progressCallback({ file, status: 'progress', loaded, total: lenHdr });
        }
    }
    const out = new Uint8Array(loaded);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.byteLength;
    }
    parts.length = 0;
    progressCallback({ file, status: 'done', loaded, total: loaded || lenHdr });
    await idbPutBytes(cacheKey, out);
    return out;
}

async function ensureSileroSession() {
    if (sileroSession) return sileroSession;
    if (!sileroInitPromise) {
        sileroInitPromise = (async () => {
            try {
                const resp = await fetch(`${VENDOR}silero_vad.onnx`);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const bytes = new Uint8Array(await resp.arrayBuffer());
                sileroSr = new ort.Tensor('int64', BigInt64Array.from([16000n]), []);
                sileroSession = await ort.InferenceSession.create(bytes, {
                    executionProviders: ['wasm'],
                    graphOptimizationLevel: 'all'
                });
                return sileroSession;
            } catch {
                sileroInitPromise = null;
                return null;
            }
        })();
    }
    return sileroInitPromise;
}

async function evalSileroFrame(frame512) {
    if (!sileroSession) return 0;
    const win = new Float32Array(64 + 512);
    win.set(sileroContext, 0);
    win.set(frame512, 64);
    sileroContext.set(frame512.subarray(512 - 64));
    const out = await sileroSession.run({
        input: new ort.Tensor('float32', win, [1, 576]),
        state: new ort.Tensor('float32', sileroState, [2, 1, 128]),
        sr: sileroSr
    });
    sileroState = new Float32Array(out.stateN.data);
    return out.output.data[0];
}

function getSherpaModule() {
    if (sherpaMod) return Promise.resolve(sherpaMod);
    if (!sherpaModPromise) {
        sherpaModPromise = initASRModule().then(mod => {
            sherpaMod = mod;
            return mod;
        }).catch(err => {
            sherpaModPromise = null;
            throw err;
        });
    }
    return sherpaModPromise;
}

function recreateSherpaStream() {
    if (sherpaStream) {
        try { sherpaStream.free(); } catch {}
        sherpaStream = null;
    }
    sherpaEmitSeq++;
    sherpaLastPartial = '';
    sherpaPendingEmit = null;
    hpState.prevIn = 0;
    hpState.prevOut = 0;
    vadPreRoll = [];
    if (sherpaOnlineRec) {
        sherpaStream = sherpaOnlineRec.createStream();
    }
}

function disposeSherpaResources() {
    if (sherpaStream) {
        try { sherpaStream.free(); } catch {}
        sherpaStream = null;
    }
    if (sherpaOnlineRec) {
        try { sherpaOnlineRec.free(); } catch {}
        sherpaOnlineRec = null;
    }
    sherpaEmitSeq++;
    sherpaLastPartial = '';
    sherpaPendingEmit = null;
}

function resetAudioState(clearOverlap = true) {
    chunks = [];
    total = 0;
    committed = 0;
    utteranceStart = null;
    lastSpeechEnd = -1;
    lastFinalEnd = 0;
    lastInferEnd = 0;
    prevUtteranceEnd = 0;
    lastVideoTime = 0;
    noiseFloor = 0.0015;
    hpState.prevIn = 0;
    hpState.prevOut = 0;
    sileroState.fill(0);
    sileroContext.fill(0);
    sileroVad.reset();
    vadResidual = new Float32Array(0);
    vadPreRoll = [];
    utteranceConfirmedByVad = false;
    if (clearOverlap) prevCommittedRaw = '';
    if (activeEngine === 'sherpa') {
        recreateSherpaStream();
    }
}

function setBoundedTrans(key, val) {
    if (transCache.has(key)) transCache.delete(key);
    while (transCache.size >= 120) {
        transCache.delete(transCache.keys().next().value);
    }
    transCache.set(key, val);
}

async function initModel(spokenHint = '', enginePref = preferredEngine) {
    let gpu = false;
    let hasShaderF16 = false;
    try {
        const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
        gpu = Boolean(adapter);
        hasShaderF16 = Boolean(adapter?.features?.has?.('shader-f16'));
    } catch {}
    await ensureSileroSession();

    const effectiveHint = requestedAiAudioLang !== 'auto' ? requestedAiAudioLang : spokenHint;
    const spec = selectRealtimeAsrSpec(effectiveHint, gpu, enginePref, hasShaderF16);
    const primaryId = spec.candidates[0]?.id || spec.primaryEngine;
    const desiredKey = `${primaryId}:${spec.primaryEngine}:${gpu ? 'webgpu' : 'wasm'}:${spec.lang}:${spec.lidAutoPromote ? 'lid' : 'direct'}`;
    if ((sherpaOnlineRec || model) && loadedKey === desiredKey) {
        lidAutoPromotePending = Boolean(spec.lidAutoPromote);
        if (activeEngine === 'sherpa' && !sherpaStream) {
            recreateSherpaStream();
        }
        self.postMessage({
            kind: 'ready',
            videoId: activeVideoId,
            engine: activeEngine,
            lang: activeModelLang || (effectiveHint || 'auto'),
            lid: lidAutoPromotePending,
            model: loadedKey
        });
        return;
    }
    if (loading) {
        if (loadingKey === desiredKey) return loading;
        try { await loading; } catch {}
    }

    loadingKey = desiredKey;
    loading = (async () => {
        const t0 = performance.now();
        lidAutoPromotePending = Boolean(spec.lidAutoPromote);
        disposeSherpaResources();
        if (model) {
            try { await model.dispose?.(); } catch {}
            model = null;
            processor = null;
            tokenizer = null;
        }

        let lastErr = null;
        for (const cand of spec.candidates) {
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
                if (tot < 1048576) return;
                const pct = Math.min(99, Math.max(1, Math.round((loaded / tot) * 100)));
                if (pct >= lastPct + 5) {
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

            try {
                if (cand.engine === 'sherpa') {
                    const mod = await getSherpaModule();
                    const prefix = `sherpa_${cand.lang || 'en'}`;
                    const vPaths = [];
                    try {
                        for (const fname of cand.files) {
                            const bytes = await fetchHfFileCached(cand.id, fname, progress_callback);
                            const vPath = `/${prefix}_${fname}`;
                            try { mod.FS_unlink(vPath); } catch {}
                            mod.FS_createDataFile('/', `${prefix}_${fname}`, bytes, true, true, true);
                            vPaths.push(vPath);
                        }
                        const cfg = {
                            type: OnlineRecognizerTypes.Transducer,
                            featConfig: { sampleRate: SR, featureDim: 80 },
                            modelConfig: {
                                transducer: {
                                    encoder: `/${prefix}_encoder.onnx`,
                                    decoder: `/${prefix}_decoder.onnx`,
                                    joiner: `/${prefix}_joiner.onnx`
                                },
                                tokens: `/${prefix}_tokens.txt`,
                                numThreads: 1,
                                provider: 'cpu',
                                debug: 0,
                                modelType: '',
                                modelingUnit: cand.modelingUnit || 'cjkchar',
                                bpeVocab: ''
                            },
                            decodingMethod: 'greedy_search',
                            maxActivePaths: 4,
                            enableEndpoint: 1,
                            rule1MinTrailingSilence: 1.4,
                            rule2MinTrailingSilence: 0.7,
                            rule3MinUtteranceLength: 9
                        };
                        sherpaOnlineRec = createOnlineRecognizer(mod, cfg);
                    } finally {
                        for (const vp of vPaths) {
                            try { mod.FS_unlink(vp); } catch {}
                        }
                    }
                    recreateSherpaStream();
                    activeEngine = 'sherpa';
                    activeModelLang = cand.lang || 'en';
                    loadedKey = desiredKey;
                } else {
                    env.backends.onnx.wasm.wasmPaths = ASYNCIFY;
                    env.backends.onnx.wasm.numThreads = 1;
                    const m = await WhisperForConditionalGeneration.from_pretrained(cand.id, {
                        device: cand.device,
                        dtype: cand.dtype,
                        session_options: cand.session_options,
                        progress_callback
                    });
                    processor = await AutoProcessor.from_pretrained(cand.id);
                    tokenizer = await AutoTokenizer.from_pretrained(cand.id);
                    model = m;
                    activeEngine = 'whisper';
                    activeModelLang = cand.lang || '';
                    loadedKey = desiredKey;
                    await inferSamples(new Float32Array(SR), null);
                }

                self.postMessage({
                    kind: 'ready',
                    videoId: activeVideoId,
                    engine: activeEngine,
                    lang: activeModelLang || 'auto',
                    lid: lidAutoPromotePending,
                    backend: cand.device,
                    model: cand.id,
                    loadMs: Math.round(performance.now() - t0)
                });
                return;
            } catch (err) {
                disposeSherpaResources();
                lastErr = err;
            }
        }
        self.postMessage({ kind: 'error', videoId: activeVideoId, error: String(lastErr?.message || lastErr) });
    })().finally(() => {
        loading = null;
        loadingKey = '';
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
        max_new_tokens: 112,
        no_repeat_ngram_size: 3,
        repetition_penalty: 1.15
    });
    const text = (tokenizer.batch_decode(out, { skip_special_tokens: true })[0] || '').trim();
    return { text, avgTokenProb: lp.avgTokenProb, ...(lp.result || { lang: 'en', detected: 'en', conf: 0 }) };
}

function extractWindow(from, to) {
    const out = new Float32Array(Math.max(0, to - from));
    for (const c of chunks) {
        if (c.end <= from || c.start >= to) continue;
        const a = Math.max(from, c.start);
        const b = Math.min(to, c.end);
        out.set(c.pcm.subarray(a - c.start, b - c.start), a - from);
    }
    return gentleConditionPcm(out);
}

function conditionSherpaChunk(rawPcm) {
    return gentleConditionPcm(rawPcm, hpState);
}

async function translateCached(text, from, to) {
    const clean = String(text || '').trim();
    if (!clean) return '';
    const baseFrom = String(from || '').replace(/^[-_]+/, '').split('-')[0].toLowerCase();
    const baseTo = String(to || 'es').replace(/^[-_]+/, '').split('-')[0].toLowerCase();
    if (!baseTo || baseTo === 'und' || baseTo === 'auto' || (baseFrom && baseFrom === baseTo)) {
        return clean;
    }

    const key = `auto:${baseTo}:${clean}`;
    if (transCache.has(key)) return transCache.get(key);

    if (Date.now() >= googleRateLimitedUntil) {
        let saw429 = false;
        for (const client of ['it', 'at', 'gtx']) {
            try {
                const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=auto&tl=${encodeURIComponent(baseTo)}&dt=t&q=${encodeURIComponent(clean)}`;
                const r = await fetch(gtxUrl);
                if (r.ok) {
                    const j = await r.json();
                    const joined = Array.isArray(j?.[0]) ? j[0].map(s => s?.[0] || '').join('').trim() : '';
                    if (joined) {
                        setBoundedTrans(key, joined);
                        return joined;
                    }
                } else if (r.status === 429) {
                    saw429 = true;
                }
            } catch {}
        }

        try {
            const c5Url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(baseTo)}&q=${encodeURIComponent(clean)}`;
            const r2 = await fetch(c5Url);
            if (r2.ok) {
                const j2 = await r2.json();
                const out = Array.isArray(j2) ? String(j2[0] || '').trim() : String(j2 || '').trim();
                if (out) {
                    setBoundedTrans(key, out);
                    return out;
                }
            } else if (r2.status === 429) {
                saw429 = true;
            }
        } catch {}

        if (saw429) {
            googleRateLimitedUntil = Date.now() + 60_000;
        }
    }

    try {
        const mmPair = `${baseFrom && baseFrom !== 'auto' ? baseFrom : 'autodetect'}|${baseTo}`;
        const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${encodeURIComponent(mmPair)}&de=${encodeURIComponent(MYMEMORY_CONTACT)}`;
        const r3 = await fetch(mmUrl);
        if (r3.ok) {
            const j3 = await r3.json();
            const out3 = String(j3?.responseData?.translatedText || '').trim();
            if (out3 && !/MYMEMORY WARNING/i.test(out3)) {
                setBoundedTrans(key, out3);
                return out3;
            }
        }
    } catch {}

    return clean;
}

async function flushSherpaCaptionQueue() {
    if (sherpaTranslating) return;
    sherpaTranslating = true;
    try {
        while (sherpaPendingEmit) {
            const item = sherpaPendingEmit;
            sherpaPendingEmit = null;
            if (stopped || item.runVid !== activeVideoId || item.seq !== sherpaEmitSeq) continue;
            const translated = await translateCached(item.text, item.lang, targetLang);
            if (stopped || item.runVid !== activeVideoId || item.seq !== sherpaEmitSeq) continue;
            self.postMessage({
                kind: 'caption',
                videoId: item.runVid,
                mode: item.mode,
                engine: 'sherpa',
                raw: item.text,
                lang: item.lang,
                locked: item.lang,
                translated: translated || item.text,
                inferMs: item.inferMs,
                videoTime: item.videoTime
            });
        }
    } finally {
        sherpaTranslating = false;
        if (sherpaPendingEmit) {
            void flushSherpaCaptionQueue();
        }
    }
}

async function processSherpaChunk(pcm, videoTime, runVid) {
    if (stopped || activeEngine !== 'sherpa' || !sherpaOnlineRec || !sherpaStream || runVid !== activeVideoId) return;
    const t0 = performance.now();
    const conditioned = conditionSherpaChunk(pcm);
    sherpaStream.acceptWaveform(SR, conditioned);
    while (sherpaOnlineRec.isReady(sherpaStream)) {
        sherpaOnlineRec.decode(sherpaStream);
    }
    const rawResult = filterWhisperText(sherpaOnlineRec.getResult(sherpaStream)?.text || '', activeModelLang || 'en');
    const isEndpoint = sherpaOnlineRec.isEndpoint(sherpaStream);
    const displaySrc = formatStreamingTailText(rawResult, 140);
    const inferMs = Math.round(performance.now() - t0);

    if (displaySrc && (displaySrc !== sherpaLastPartial || isEndpoint)) {
        sherpaLastPartial = displaySrc;
        sherpaPendingEmit = {
            seq: sherpaEmitSeq,
            runVid,
            mode: isEndpoint ? 'final' : 'interim',
            text: displaySrc,
            lang: activeModelLang || 'en',
            inferMs,
            videoTime
        };
        void flushSherpaCaptionQueue();
    }

    if (isEndpoint && sherpaOnlineRec.getResult(sherpaStream)?.text) {
        sherpaOnlineRec.reset(sherpaStream);
        sherpaLastPartial = '';
    }
}

async function promoteToDetectedSherpa(runVid, detectedBase) {
    if (promoting || stopped || runVid !== activeVideoId || preferredEngine !== 'sherpa') return;
    if (!hasSherpaLanguageModel(detectedBase)) return;
    promoting = true;
    try {
        requestedSpokenLang = detectedBase;
        resetAudioState(false);
        self.postMessage({ kind: 'lang_detected', videoId: runVid, lang: detectedBase, engine: 'sherpa' });
        await initModel(detectedBase, 'sherpa');
    } catch (err) {
        if (!stopped && runVid === activeVideoId) {
            self.postMessage({ kind: 'error', videoId: runVid, error: String(err?.message || err) });
        }
    } finally {
        promoting = false;
    }
}

async function maybeInfer(videoTime, runVid) {
    if (busy || promoting || stopped || !model || utteranceStart === null || runVid !== activeVideoId) return;
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
    } else if (sinceSpeech < PAUSE_FINAL && winLen >= MIN_FIRST_WINDOW && now - lastInferEnd >= INTERIM_STEP) {
        mode = 'interim';
    }
    if (!mode) return;

    let pendingPromoteLang = '';
    busy = true;
    try {
        const t0 = performance.now();
        const forced = requestedAiAudioLang !== 'auto'
            ? requestedAiAudioLang
            : voter.forcedLanguage();
        const res = await inferSamples(extractWindow(utteranceStart, end), forced);
        if (stopped || runVid !== activeVideoId) return;

        const inferMs = Math.round(performance.now() - t0);
        lastInferEnd = end;
        const confident = (res.avgTokenProb ?? 1) >= 0.45;
        if (confident) {
            const silMs = ((utteranceStart - prevUtteranceEnd) / SR) * 1000;
            voter.observe({ lang: res.detected, conf: res.conf, lockedConf: res.lockedConf, ts: Date.now(), silenceMs: silMs });
        }

        if (voter.shouldAbortForSameLanguage(targetLang, manualForce)) {
            stopped = true;
            resetAudioState(true);
            self.postMessage({ kind: 'same_language', videoId: runVid, lang: voter.locked, manualForce });
            return;
        }

        if (lidAutoPromotePending && voter.locked && preferredEngine === 'sherpa') {
            const lockedBase = String(voter.locked || '').split(/[-_]/)[0].toLowerCase();
            lidAutoPromotePending = false;
            if (hasSherpaLanguageModel(lockedBase)) {
                pendingPromoteLang = lockedBase;
            }
        }

        const expectedLang = res.lang || forced || requestedSpokenLang || '';
        const filtered = confident ? filterWhisperText(res.text, expectedLang) : '';
        const clean = prevCommittedRaw ? (stripCaptionOverlap(prevCommittedRaw, filtered) || filtered) : filtered;
        const translated = clean ? await translateCached(clean, res.lang, targetLang) : '';
        if (stopped || runVid !== activeVideoId) return;

        if (translated) {
            self.postMessage({
                kind: 'caption',
                videoId: runVid,
                mode,
                engine: 'whisper',
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
            utteranceConfirmedByVad = false;
            prevCommittedRaw = clean;
        } else if (mode === 'cut') {
            prevCommittedRaw = clean;
            committed = Math.max(committed, now - OVERLAP);
            utteranceStart = committed;
        }
    } finally {
        busy = false;
        if (pendingPromoteLang && !stopped && runVid === activeVideoId) {
            void promoteToDetectedSherpa(runVid, pendingPromoteLang);
        }
    }
}

self.onmessage = async e => {
    const m = e.data;
    if (!m || !m.kind) return;

    if (m.kind === 'INIT') {
        const nextVid = String(m.videoId || '');
        const nextEngine = normalizeAsrEngine(m.asrEngine || preferredEngine);
        const nextAiAudioLang = normalizeAiAudioLang(m.aiAudioLang || 'auto');
        const nextSpokenLang = String(m.spokenLang || '').trim().toLowerCase();
        const engineChanged = nextEngine !== preferredEngine;
        const langChanged = nextAiAudioLang !== requestedAiAudioLang || nextSpokenLang !== requestedSpokenLang;
        preferredEngine = nextEngine;
        requestedAiAudioLang = nextAiAudioLang;
        const sameActiveVid =
            !stopped &&
            !engineChanged &&
            !langChanged &&
            Boolean(nextVid) &&
            activeVideoId === nextVid &&
            (chunks.length > 0 || (activeEngine === 'sherpa' && Boolean(sherpaStream)));
        activeVideoId = nextVid;
        targetLang = String(m.targetLang || 'es');
        requestedSpokenLang = nextSpokenLang;
        manualForce = Boolean(m.manualForce);
        stopped = false;
        if (!sameActiveVid) {
            voter.reset();
            resetAudioState(true);
        }
        await initModel(requestedSpokenLang, preferredEngine);
        if (sameActiveVid && activeEngine === 'whisper' && model) {
            maybeInfer(lastVideoTime, activeVideoId).catch(err => {
                if (!stopped && activeVideoId === nextVid) {
                    self.postMessage({ kind: 'error', videoId: nextVid, error: String(err?.message || err) });
                }
            });
        }
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
        if (stopped || (!sherpaOnlineRec && !model) || !m.videoId || m.videoId !== activeVideoId) return;
        const pcm = m.pcm instanceof Float32Array ? m.pcm : new Float32Array(m.pcm || []);
        if (!pcm.length) return;
        const videoTime = Number(m.videoTime) || 0;
        const rms = Number(m.rms) || 0;
        const runVid = m.videoId;

        pcmChain = pcmChain.then(async () => {
            if (stopped || (!sherpaOnlineRec && !model) || runVid !== activeVideoId) return;
            lastVideoTime = videoTime;

            if (sileroSession) {
                const combined = new Float32Array(vadResidual.length + pcm.length);
                combined.set(vadResidual, 0);
                combined.set(pcm, vadResidual.length);
                let off = 0;
                while (off + 512 <= combined.length) {
                    if (stopped || runVid !== activeVideoId) return;
                    const frame512 = combined.subarray(off, off + 512);
                    off += 512;
                    const prob = await evalSileroFrame(frame512);
                    if (stopped || runVid !== activeVideoId) return;
                    const st = sileroVad.pushProb(prob);

                    if (activeEngine === 'sherpa' && sherpaOnlineRec && sherpaStream) {
                        if (st.justStarted) {
                            for (const pre of vadPreRoll) {
                                await processSherpaChunk(pre, videoTime, runVid);
                            }
                            vadPreRoll = [];
                            await processSherpaChunk(frame512, videoTime, runVid);
                        } else if (st.isSpeech) {
                            await processSherpaChunk(frame512, videoTime, runVid);
                        } else if (st.justEnded) {
                            await processSherpaChunk(new Float32Array(8000), videoTime, runVid);
                            if (sherpaOnlineRec && sherpaStream) {
                                const remRaw = filterWhisperText(sherpaOnlineRec.getResult(sherpaStream)?.text || '', activeModelLang || 'en');
                                const remDisplay = formatStreamingTailText(remRaw, 140);
                                if (remDisplay && remDisplay !== sherpaLastPartial) {
                                    sherpaLastPartial = remDisplay;
                                    sherpaPendingEmit = {
                                        seq: sherpaEmitSeq,
                                        runVid,
                                        mode: 'final',
                                        text: remDisplay,
                                        lang: activeModelLang || 'en',
                                        inferMs: 0,
                                        videoTime
                                    };
                                    void flushSherpaCaptionQueue();
                                }
                                sherpaOnlineRec.reset(sherpaStream);
                                sherpaLastPartial = '';
                            }
                        } else {
                            vadPreRoll.push(new Float32Array(frame512));
                            if (vadPreRoll.length > 12) vadPreRoll.shift();
                        }
                    } else if (activeEngine === 'whisper') {
                        const start = total;
                        const end = total + 512;
                        chunks.push({ start, end, pcm: new Float32Array(frame512) });
                        total = end;

                        if (st.isSpeech) {
                            if (utteranceStart === null) utteranceStart = Math.max(committed, start - PRE_ROLL);
                            lastSpeechEnd = end;
                            if (st.speechConfirmed) utteranceConfirmedByVad = true;
                        } else if (st.justEnded && utteranceStart !== null && !utteranceConfirmedByVad) {
                            utteranceStart = null;
                            lastSpeechEnd = lastFinalEnd;
                        }
                    }
                }
                vadResidual = combined.slice(off);

                if (activeEngine === 'whisper' && model) {
                    const keepFrom = Math.min(committed, utteranceStart ?? committed) - S(2);
                    while (chunks.length && chunks[0].end < keepFrom) {
                        chunks.shift();
                    }
                    if (utteranceConfirmedByVad) {
                        await maybeInfer(videoTime, runVid);
                    }
                }
                return;
            }

            if (activeEngine === 'sherpa' && sherpaOnlineRec && sherpaStream) {
                await processSherpaChunk(pcm, videoTime, runVid);
                return;
            }

            const start = total;
            const end = total + pcm.length;
            chunks.push({ start, end, pcm });
            total = end;

            const recently = lastSpeechEnd > 0 && end - lastSpeechEnd <= S(0.3);
            const vad = computeAdaptiveSpeechThreshold(noiseFloor, rms, recently);
            noiseFloor = vad.nextNoiseFloor;
            if (vad.isSpeech) {
                if (utteranceStart === null) utteranceStart = Math.max(committed, start - PRE_ROLL);
                lastSpeechEnd = end;
                utteranceConfirmedByVad = true;
            }

            const keepFrom = Math.min(committed, utteranceStart ?? committed) - S(2);
            while (chunks.length && chunks[0].end < keepFrom) {
                chunks.shift();
            }
            await maybeInfer(videoTime, runVid);
        }).catch(err => {
            if (!stopped && runVid === activeVideoId) {
                self.postMessage({ kind: 'error', videoId: runVid, error: String(err?.message || err) });
            }
        });
    }
};
