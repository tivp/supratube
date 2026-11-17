// Pure helpers for on-device Whisper ASR filtering, language voting, and overlap cleanup.

const HALLUC_RE = [
    /^(?:thank you|thanks|thanks for watching|thank you for watching|gracias|obrigado|merci)[\s.!]*$/i,
    /^(?:bye|goodbye|adios|adiós|see you|the end|subtitles by|transcribed by|subtítulos|music|música|applause|laughter|cheering)[\s.!]*$/i,
    /^\[[^\]]*\]$/,
    /^\([^)]*\)$/,
    /^\*[^*]*\*$/,
    /^♪.*♪$/,
    /^♪+$/
];

const SINGLE_STOPWORD_RE = /^(?:the|an?|el|la|los|las|lo|le|les|un|una|uno|unas|unos|de|del|al|en|con|por|para|and|or|but|so|if|of|to|in|on|at|it|is|as|be|by|we|you|your|he|she|me|my|they|this|that|um+|uh+|ah+|eh+|oh+|hm+|mm+|mhm+|sh+|music|song)$/i;

function normBase(code) {
    const clean = String(code || '').trim().toLowerCase().replace(/_/g, '-');
    return clean ? clean.split('-')[0] : '';
}

function normWord(word) {
    return String(word || '').toLowerCase().replace(/[\p{P}\p{S}]/gu, '');
}

/** Filter Whisper non-speech hallucinations, instrumental stopword artifacts, and repeated n-gram loops. */
export function filterWhisperText(raw) {
    const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!t || !/[\p{L}\p{N}]/u.test(t)) return '';
    for (const re of HALLUC_RE) {
        if (re.test(t)) return '';
    }

    const core = t.replace(/[\p{P}\p{S}\s]/gu, '');
    if (core.length <= 1) return '';
    const strippedPunct = t.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');
    if (SINGLE_STOPWORD_RE.test(strippedPunct)) return '';

    const cjkNoSpace = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(t) && !/\s/.test(t);
    let units = cjkNoSpace ? Array.from(t) : t.split(' ');
    for (let n = 1; n <= 6; n++) {
        let i = 0;
        const out = [];
        while (i < units.length) {
            if (i + n <= units.length) {
                const gram = units.slice(i, i + n).map(normWord).join(' ').trim();
                if (gram) {
                    let reps = 1;
                    while (
                        i + (reps + 1) * n <= units.length &&
                        units.slice(i + reps * n, i + (reps + 1) * n).map(normWord).join(' ').trim() === gram
                    ) {
                        reps++;
                    }
                    if (reps >= 3) {
                        out.push(...units.slice(i, i + n));
                        i += reps * n;
                        continue;
                    }
                }
            }
            out.push(units[i++]);
        }
        units = out;
    }

    const collapsed = units.join(cjkNoSpace ? '' : ' ').trim();
    if (collapsed.length < t.length * 0.4) return '';
    return collapsed;
}

/** Remove overlapping seam words between consecutive sliding-window ASR chunks. */
export function stripCaptionOverlap(prevText, nextText) {
    const prev = String(prevText || '').trim();
    const next = String(nextText || '').trim();
    if (!prev || !next) return next;

    const prevWords = prev.split(/\s+/);
    const nextWords = next.split(/\s+/);
    const maxK = Math.min(10, prevWords.length, nextWords.length);

    for (let k = maxK; k >= 1; k--) {
        let match = true;
        for (let j = 0; j < k; j++) {
            const a = normWord(prevWords[prevWords.length - k + j]);
            const b = normWord(nextWords[j]);
            if (!a || a !== b) {
                match = false;
                break;
            }
        }
        if (match) {
            return nextWords.slice(k).join(' ').trim();
        }
    }
    return next;
}

/** Compute softmax over Whisper language token logits and honor locked language above threshold. */
export function computeLangSoftmax(data, langs, forced) {
    let maxV = -Infinity;
    let maxLang = 'en';
    const vals = [];
    for (let i = 0; i < langs.length; i++) {
        const [lang, id] = langs[i];
        const v = data[id];
        if (v > maxV) {
            maxV = v;
            maxLang = lang;
        }
        vals.push([lang, v]);
    }
    let sum = 0;
    const probs = {};
    for (let i = 0; i < vals.length; i++) {
        const [lang, v] = vals[i];
        const e = Math.exp(v - maxV);
        probs[lang] = e;
        sum += e;
    }
    if (sum > 0) {
        for (const k in probs) probs[k] /= sum;
    }
    let chosen = maxLang;
    if (forced && (probs[forced] ?? 0) >= 0.2) {
        chosen = forced;
    }
    return {
        chosen,
        detected: maxLang,
        conf: probs[maxLang] || 0,
        lockedConf: forced ? (probs[forced] ?? 0) : null
    };
}

/** Hysteresis voter that locks onto consistent spoken language before suppressing re-detection jitter. */
export class LanguageVoter {
    constructor() {
        this.reset();
    }

    reset() {
        this.locked = null;
        this.lastLang = null;
        this.streak = 0;
        this.lockedAt = 0;
        this.redetect = false;
    }

    forcedLanguage() {
        return (this.locked && !this.redetect) ? this.locked : null;
    }

    observe({ lang, conf = 0, lockedConf = null, ts = Date.now(), silenceMs = 0 }) {
        if (lang === this.lastLang) {
            this.streak++;
        } else {
            this.lastLang = lang;
            this.streak = 1;
        }

        if (this.locked) {
            if ((lockedConf ?? 0) < 0.4 || silenceMs >= 4000 || ts - this.lockedAt >= 30000) {
                this.redetect = true;
            }
            if (this.redetect && this.streak >= 2) {
                this.locked = lang;
                this.lockedAt = ts;
                this.redetect = false;
            }
        } else if (this.streak >= 2 && conf >= 0.5) {
            this.locked = lang;
            this.lockedAt = ts;
            this.redetect = false;
        }
    }

    shouldAbortForSameLanguage(targetLang, manualForce = false) {
        if (manualForce || !this.locked) return false;
        const lockedBase = normBase(this.locked);
        const targetBase = normBase(targetLang);
        return Boolean(lockedBase && targetBase && lockedBase === targetBase);
    }
}

const SHERPA_KROKO_REPOS = Object.freeze({
    en: {
        id: 'csukuangfj/sherpa-onnx-streaming-zipformer-en-kroko-2025-08-06',
        files: ['encoder.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt']
    },
    es: {
        id: 'csukuangfj/sherpa-onnx-streaming-zipformer-es-kroko-2025-08-06',
        files: ['encoder.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt']
    },
    fr: {
        id: 'csukuangfj/sherpa-onnx-streaming-zipformer-fr-kroko-2025-08-06',
        files: ['encoder.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt']
    },
    de: {
        id: 'csukuangfj/sherpa-onnx-streaming-zipformer-de-kroko-2025-08-06',
        files: ['encoder.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt']
    }
});

/** Normalize user-selected ASR engine name ('sherpa' streaming or 'whisper' fallback). */
export function normalizeAsrEngine(engine = 'sherpa') {
    const clean = String(engine || '').trim().toLowerCase();
    return clean === 'whisper' ? 'whisper' : 'sherpa';
}

/** Select the optimal real-time ASR spec (Sherpa-ONNX Streaming Zipformer or Whisper) for the chosen engine, language, and device. */
export function selectRealtimeAsrSpec(spokenLang = '', hasWebGpu = true, preferredEngine = 'sherpa') {
    const engine = normalizeAsrEngine(preferredEngine);
    const base = normBase(spokenLang);
    const gpuDtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' };

    const whisperCandidates = [];
    if (hasWebGpu) {
        whisperCandidates.push({
            engine: 'whisper',
            id: 'onnx-community/whisper-base',
            device: 'webgpu',
            dtype: gpuDtype,
            lang: base || null,
            session_options: {}
        });
    }
    whisperCandidates.push({
        engine: 'whisper',
        id: 'onnx-community/whisper-tiny',
        device: 'wasm',
        dtype: 'q8',
        lang: base || null,
        session_options: { graphOptimizationLevel: 'basic' }
    });

    const candidates = [];
    if (engine === 'sherpa') {
        const sherpaLang = base || 'en';
        const kroko = SHERPA_KROKO_REPOS[sherpaLang];
        if (kroko) {
            candidates.push({
                engine: 'sherpa',
                id: kroko.id,
                device: 'wasm',
                dtype: 'int8',
                lang: sherpaLang,
                files: kroko.files,
                modelingUnit: 'cjkchar'
            });
        }
    }
    candidates.push(...whisperCandidates);

    return {
        primaryEngine: candidates[0].engine,
        requestedEngine: engine,
        lang: candidates[0].engine === 'sherpa' ? candidates[0].lang : (base || 'auto'),
        candidates
    };
}

/** Keep streaming Zipformer partial text readable in 1-2 lines without losing sentence endings. */
export function formatStreamingTailText(rawText = '', maxChars = 135) {
    const clean = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!clean || clean.length <= maxChars) return clean;
    const tail = clean.slice(-maxChars);
    const firstSpace = tail.indexOf(' ');
    return (firstSpace > 0 && firstSpace < tail.length - 12 ? tail.slice(firstSpace + 1) : tail).trim();
}

/** Adaptive noise-floor speech detector that separates voice from background music/ambience. */
export function computeAdaptiveSpeechThreshold(noiseFloor = 0.0015, rms = 0, recentlyActive = false) {
    const clampedFloor = Math.min(0.015, Math.max(0.0012, Number(noiseFloor) || 0.0015));
    const startThreshold = Math.max(0.0032, clampedFloor * 2.2);
    const holdThreshold = Math.max(0.0020, clampedFloor * 1.45);
    const isSpeech = rms > startThreshold || (recentlyActive && rms > holdThreshold);
    let nextNoiseFloor = clampedFloor;
    if (!isSpeech) {
        nextNoiseFloor = clampedFloor * 0.94 + rms * 0.06;
    } else if (rms <= 0.015) {
        // Steady music/ambience slightly above floor still slowly adapts the bed without chasing loud speech.
        nextNoiseFloor = clampedFloor * 0.94 + rms * 0.06;
    }
    nextNoiseFloor = Math.min(0.015, Math.max(0.0012, nextNoiseFloor));
    return { isSpeech, nextNoiseFloor, startThreshold, holdThreshold };
}
