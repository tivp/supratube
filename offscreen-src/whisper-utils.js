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
