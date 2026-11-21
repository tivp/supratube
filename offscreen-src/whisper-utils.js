// Pure helpers for on-device Whisper ASR filtering, language voting, and overlap cleanup.

const HALLUC_RE = [
    /^(?:thank you|thanks|thanks for watching|thank you for watching|gracias|obrigado|merci)[\s.!]*$/i,
    /^(?:bye|goodbye|adios|adiós|see you|the end|subtitles by|transcribed by|subtítulos|music|música|applause|laughter|cheering)[\s.!]*$/i,
    /^(?:ah+|oh+|uh+|eh+|um+|hm+|mm+|mhm+|sh+|wow+|ooh+|aah+|ha{2,}|(?:ha){2,}|he{2,}|(?:he){2,}|ho+|(?:ho){2,}|(?:ja){2,}|(?:je){2,})[\s.,!?]*$/i,
    /^(?:rue de la cicada|9 o'?clock on|nine o'?clock on|margerizer|\d+(?:[.\-\s]\d+){4,}.*)[\s.,!?]*$/i,
    /^\[[^\]]*\]$/,
    /^\([^)]*\)$/,
    /^\*[^*]*\*$/,
    /^♪.*♪$/,
    /^♪+$/
];

const LATIN_LANGS = new Set(['en', 'es', 'fr', 'de']);
const LATIN_CHAR_RE = /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑàâçèêëîïôùûÿœäöß]/u;

const SINGLE_STOPWORD_RE = /^(?:the|an?|el|la|los|las|lo|le|les|un|una|uno|unas|unos|de|del|al|en|con|por|para|and|or|but|so|if|of|to|in|on|at|it|is|as|be|by|we|you|your|he|she|me|my|they|this|that|um+|uh+|ah+|eh+|oh+|hm+|mm+|mhm+|sh+|music|song)$/i;

function normBase(code) {
    const clean = String(code || '').trim().toLowerCase().replace(/_/g, '-');
    return clean ? clean.split('-')[0] : '';
}

function normWord(word) {
    return String(word || '').toLowerCase().replace(/[\p{P}\p{S}]/gu, '');
}

/** Filter Whisper non-speech hallucinations, instrumental stopword artifacts, and repeated n-gram loops. */
export function filterWhisperText(raw, expectedLang = '') {
    const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!t || !/[\p{L}\p{N}]/u.test(t)) return '';
    const baseExpected = normBase(expectedLang);
    if (LATIN_LANGS.has(baseExpected) && !LATIN_CHAR_RE.test(t)) return '';
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

    const collapsed = units.join(cjkNoSpace ? '' : ' ').replace(/^[.,;:!?…\-–—]+\s*/, '').trim();
    if (!collapsed || collapsed.length < t.length * 0.4) return '';
    return collapsed;
}

const INSEPARABLE_PAIR_RE = /^(?:(?:con|de|a|por|en)\s+lo|lo\s+que|con\s+que|de\s+que|a\s+que|para\s+que|por\s+que|sin\s+que|hasta\s+que|desde\s+que|antes\s+de|despu[eé]s\s+de|en\s+la|de\s+la|a\s+la|por\s+la|con\s+la|de\s+el|a\s+el|of\s+the|in\s+the|to\s+the|for\s+the|on\s+the|with\s+the|from\s+the|going\s+to|want\s+to|have\s+to)$/i;
const ORPHAN_PREP_RE = /^(?:el|la|los|las|lo|un|una|de|del|a|al|en|con|por|para|sin|sobre|entre|hasta|y|e|o|u|ni|que|the|an?|of|to|in|on|at|for|with|from|by|as|or|and)$/i;
const CONT_CONN_RE = /^(?:que|de|del|a|al|para|por|con|sin|como|cuando|porque|pero|sino|y|e|o|u|ni|donde|quien|cual|aunque|mientras|hasta|that|to|for|with|of|from|into|and|but|or|nor|because|when|where|while|who|which|as|if|than)$/i;
const SPLIT_CONJ_RE = /^(?:y|e|pero|porque|cuando|como|donde|para|que|aunque|mientras|o|and|but|because|when|where|while|so|that|which|who|or|if)$/i;

/** Separate Sherpa/ASR deferred leading punctuation (e.g. ". Lo mas...") from the spoken body. */
export function extractLeadingPunctuation(rawText = '') {
    const t = String(rawText ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return { leadPunct: '', rest: '' };
    const m = t.match(/^([.,;:!?…]+)\s*(.*)$/);
    if (!m) {
        return { leadPunct: '', rest: t.replace(/^[\-–—]+\s*/, '').trim() };
    }
    return {
        leadPunct: m[1],
        rest: m[2].replace(/^[.,;:!?…\-–—]+\s*/, '').trim()
    };
}

function capitalizeSentenceStart(txt = '') {
    const clean = String(txt || '').trim();
    if (!clean) return '';
    return clean.replace(/^([¿¡"'(\[«]*)([a-záéíóúüñ])/u, (_m, pfx, ch) => `${pfx}${ch.toUpperCase()}`);
}

function splitBalancedTwoLines(clean, maxLineChars) {
    if (!clean || clean.length <= maxLineChars) return clean ? [clean] : [];
    const words = clean.split(' ');
    if (words.length < 2) return [clean];

    const ideal = clean.length / 2;
    let bestIdx = -1;
    let bestScore = -Infinity;
    let leftLen = 0;

    for (let w = 0; w < words.length - 1; w++) {
        leftLen += (w > 0 ? 1 : 0) + words[w].length;
        const rightLen = clean.length - leftLen - 1;
        if (leftLen < 6 || rightLen < 4) continue;
        if (leftLen > maxLineChars + 2 || rightLen > maxLineChars + 2) continue;

        let score = -Math.abs(leftLen - ideal) * 1.1;
        if (leftLen <= maxLineChars && rightLen <= maxLineChars) score += 25;
        else score -= Math.max(0, Math.max(leftLen, rightLen) - maxLineChars) * 6;

        const wL = normWord(words[w]);
        const wR = normWord(words[w + 1]);
        const wPrev = w > 0 ? normWord(words[w - 1]) : '';
        const wNext = w + 2 < words.length ? normWord(words[w + 2]) : '';

        const minBalancedForPunct = Math.round(maxLineChars * 0.42);
        if (/[.!?…]$/.test(words[w])) score += leftLen >= minBalancedForPunct ? 32 : 6;
        else if (/[,;:]$/.test(words[w])) score += leftLen >= minBalancedForPunct ? 20 : 4;
        else if (SPLIT_CONJ_RE.test(wR)) score += 12;

        if (INSEPARABLE_PAIR_RE.test(`${wL} ${wR}`)) score -= 60;
        if (wL === 'lo' && wR === 'que' && /^(?:con|de|a|por|en)$/i.test(wPrev)) score -= 60;
        if (wR === 'lo' && wNext === 'que' && /^(?:con|de|a|por|en)$/i.test(wL)) score -= 60;
        if (!/[.,;:!?…]$/.test(words[w]) && ORPHAN_PREP_RE.test(wL)) score -= 18;

        if (score > bestScore) {
            bestScore = score;
            bestIdx = w;
        }
    }

    if (bestIdx === -1) {
        let cur = 0;
        for (let w = 0; w < words.length - 1; w++) {
            cur += (w > 0 ? 1 : 0) + words[w].length;
            const rLen = clean.length - cur - 1;
            if (cur <= maxLineChars + 2 && rLen <= maxLineChars + 2) {
                bestIdx = w;
                if (cur >= Math.ceil(clean.length * 0.48)) break;
            }
        }
    }

    if (bestIdx < 0 || bestIdx >= words.length - 1) return null;
    return [words.slice(0, bestIdx + 1).join(' '), words.slice(bestIdx + 1).join(' ')];
}

/** Wrap a single YouTube cue into at most 2 visually balanced lines, keeping compound connectors intact. */
export function formatTraditionalTwoLines(text = '', maxLineChars = 42) {
    const clean = String(text ?? '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[.,;:!?…\-–—]+\s*/, '')
        .trim();
    if (!clean || clean.length <= maxLineChars) return clean;

    const directPair = splitBalancedTwoLines(clean, maxLineChars);
    if (directPair) return directPair.join('\n');

    const words = clean.split(' ');
    const lines = [];
    let idx = 0;
    const minPref = Math.max(8, Math.floor(maxLineChars * 0.45));

    while (idx < words.length) {
        const rem = words.slice(idx).join(' ');
        const pair = splitBalancedTwoLines(rem, maxLineChars);
        if (pair) {
            lines.push(...pair);
            break;
        }

        const remWords = words.length - idx;
        let bestW = -1;
        let bestScore = -Infinity;
        let accLen = 0;

        for (let w = 0; w < remWords - 1; w++) {
            const word = words[idx + w];
            accLen += (w > 0 ? 1 : 0) + word.length;
            if (accLen > maxLineChars) break;
            if (accLen < minPref) continue;

            const wL = normWord(word);
            const wR = normWord(words[idx + w + 1]);
            const wPrev = w > 0 ? normWord(words[idx + w - 1]) : '';
            const wNext = w + 2 < remWords ? normWord(words[idx + w + 2]) : '';

            let bonus = 0;
            if (/[.!?…]$/.test(word)) bonus += 32;
            else if (/[,;:]$/.test(word)) bonus += 20;
            else if (SPLIT_CONJ_RE.test(wR)) bonus += 12;

            if (INSEPARABLE_PAIR_RE.test(`${wL} ${wR}`)) bonus -= 60;
            if (wL === 'lo' && wR === 'que' && /^(?:con|de|a|por|en)$/i.test(wPrev)) bonus -= 60;
            if (wR === 'lo' && wNext === 'que' && /^(?:con|de|a|por|en)$/i.test(wL)) bonus -= 60;
            if (!/[.,;:!?…]$/.test(word) && ORPHAN_PREP_RE.test(wL)) bonus -= 18;

            const score = accLen * 0.4 + bonus;
            if (score > bestScore) {
                bestScore = score;
                bestW = w;
            }
        }

        if (bestW === -1) {
            let cur = 0;
            for (let w = 0; w < remWords - 1; w++) {
                cur += (w > 0 ? 1 : 0) + words[idx + w].length;
                if (cur <= maxLineChars) bestW = w;
                else break;
            }
            if (bestW === -1) bestW = 0;
        }

        lines.push(words.slice(idx, idx + bestW + 1).join(' '));
        idx += bestW + 1;
    }

    const lastTwo = lines.length > 2 ? lines.slice(-2) : lines;
    return lastTwo.join('\n');
}

/** Normalize raw ASR segments into natural YouTube-style cues (no leading dots, no tiny orphaned shards, balanced clause splits). */
export function segmentTraditionalYouTubeCues(rawSegments = [], { maxCueChars = 72, maxLineChars = 42 } = {}) {
    if (!Array.isArray(rawSegments) || !rawSegments.length) return [];

    const cleaned = [];
    for (let i = 0; i < rawSegments.length; i++) {
        const seg = rawSegments[i];
        if (!seg) continue;
        const startSec = Number(seg.startSec ?? seg.start ?? 0);
        const endSec = Math.max(startSec + 0.05, Number(seg.endSec ?? seg.end ?? startSec + 1));
        const { leadPunct, rest } = extractLeadingPunctuation(seg.text || '');

        if (leadPunct && cleaned.length > 0) {
            const prev = cleaned[cleaned.length - 1];
            if (startSec - prev.endSec <= 3.5 && !/[.,;:!?…]$/.test(prev.text)) {
                prev.text += leadPunct[0];
            }
        }
        if (!rest) continue;

        let text = rest;
        if (cleaned.length > 0 && /[.!?…]$/.test(cleaned[cleaned.length - 1].text)) {
            text = capitalizeSentenceStart(text);
        } else if (cleaned.length === 0) {
            text = capitalizeSentenceStart(text);
        }
        cleaned.push({ ...seg, startSec, endSec, text });
    }

    for (let i = 0; i < cleaned.length - 1; i++) {
        const cur = cleaned[i];
        const nxt = cleaned[i + 1];
        const gap = nxt.startSec - cur.endSec;
        if (gap <= 1.2 && /\.{1,3}$/.test(cur.text)) {
            const firstWord = normWord(nxt.text.split(/\s+/)[0] || '');
            const startsLower = /^[a-záéíóúñü]/.test(nxt.text);
            if (startsLower || (CONT_CONN_RE.test(firstWord) && cur.text.length < 45)) {
                cur.text = cur.text.replace(/\.{1,3}$/, '');
                if (/^[A-ZÁÉÍÓÚÑÜ]/.test(nxt.text) && CONT_CONN_RE.test(firstWord)) {
                    nxt.text = nxt.text[0].toLowerCase() + nxt.text.slice(1);
                }
            }
        }
    }

    const merged = [];
    for (let i = 0; i < cleaned.length; i++) {
        const cur = { ...cleaned[i] };
        while (i + 1 < cleaned.length) {
            const nxt = cleaned[i + 1];
            const gap = nxt.startSec - cur.endSec;
            const wc = cur.text.split(/\s+/).length;
            const endsSent = /[.!?…]$/.test(cur.text);
            const combLen = cur.text.length + 1 + nxt.text.length;
            if (
                gap <= 2.2 &&
                combLen <= maxCueChars &&
                ((wc <= 3 && gap <= 2.2) || (!endsSent && cur.text.length < 36 && gap <= 1.2))
            ) {
                if (endsSent && nxt.text.length > 20) break;
                cur.text = `${cur.text} ${nxt.text}`;
                cur.endSec = nxt.endSec;
                i++;
            } else {
                break;
            }
        }
        merged.push(cur);
    }

    const out = [];
    const splitOne = seg => {
        const t = seg.text.trim();
        if (t.length <= maxCueChars) {
            out.push({ ...seg, text: t, displayText: formatTraditionalTwoLines(t, maxLineChars) });
            return;
        }
        const words = t.split(/\s+/);
        const numPieces = Math.max(2, Math.ceil(t.length / Math.round(maxCueChars * 0.75)));
        const idealLen = t.length / numPieces;
        let bestIdx = -1;
        let bestScore = -Infinity;
        let accLen = 0;

        for (let w = 0; w < words.length - 1; w++) {
            accLen += (w > 0 ? 1 : 0) + words[w].length;
            const remLen = t.length - accLen - 1;
            if (accLen < 16 || accLen > maxCueChars || remLen < 12) continue;
            const wL = normWord(words[w]);
            const wR = normWord(words[w + 1]);
            const distPenalty = Math.abs(accLen - Math.min(maxCueChars - 8, idealLen)) * 0.8;
            let bonus = 0;
            if (/[.!?…]$/.test(words[w])) bonus = 48;
            else if (/[,;:]$/.test(words[w])) bonus = 34;
            else if (SPLIT_CONJ_RE.test(wR)) bonus = 16;
            if (INSEPARABLE_PAIR_RE.test(`${wL} ${wR}`)) bonus -= 50;
            const score = bonus - distPenalty;
            if (score > bestScore) {
                bestScore = score;
                bestIdx = w;
            }
        }
        if (bestIdx === -1) {
            let cur = 0;
            for (let w = 0; w < words.length - 1; w++) {
                cur += (w > 0 ? 1 : 0) + words[w].length;
                if (cur <= maxCueChars) bestIdx = w;
            }
        }
        if (bestIdx < 0 || bestIdx >= words.length - 1) {
            out.push({ ...seg, text: t, displayText: formatTraditionalTwoLines(t, maxLineChars) });
            return;
        }
        const leftTxt = words.slice(0, bestIdx + 1).join(' ');
        const rightTxt = words.slice(bestIdx + 1).join(' ');
        const ratio = leftTxt.length / t.length;
        const midSec = +(seg.startSec + (seg.endSec - seg.startSec) * ratio).toFixed(2);
        out.push({ ...seg, endSec: midSec, text: leftTxt, displayText: formatTraditionalTwoLines(leftTxt, maxLineChars) });
        splitOne({ ...seg, startSec: midSec, text: rightTxt });
    };

    for (let i = 0; i < merged.length; i++) splitOne(merged[i]);
    return out;
}

/**
 * Stateful streaming cue segmenter that emulates traditional YouTube 2-line captions in real time:
 * stitches deferred leading dots onto the previous clause, heals mid-clause false periods,
 * coalesces short fragments, and maintains balanced 2-line rollover cues.
 */
export function createLiveTraditionalSegmenter({ maxCueChars = 76, maxLineChars = 42 } = {}) {
    let prevClause = '';
    let prevTs = 0;

    const reset = () => {
        prevClause = '';
        prevTs = 0;
    };

    const push = (rawText, { mode = 'final', nowMs = Date.now(), isShorts = false } = {}) => {
        const effMaxCue = isShorts ? Math.min(58, maxCueChars) : maxCueChars;
        const effMaxLine = isShorts ? Math.min(32, maxLineChars) : maxLineChars;
        const { leadPunct, rest } = extractLeadingPunctuation(rawText || '');

        if (leadPunct && prevClause && nowMs - prevTs <= 3500) {
            if (!/[.,;:!?…]$/.test(prevClause)) {
                prevClause += leadPunct[0];
            }
        }

        if (!rest) {
            return prevClause ? formatTraditionalTwoLines(prevClause, effMaxLine) : '';
        }

        let cleanRest = rest;
        const isPrefix = Boolean(prevClause) && cleanRest.toLowerCase().startsWith(prevClause.toLowerCase());
        if (isPrefix) prevClause = '';

        if (!leadPunct && prevClause && nowMs - prevTs <= 1800 && /\.{1,3}$/.test(prevClause)) {
            const firstWord = normWord(cleanRest.split(/\s+/)[0] || '');
            const startsLower = /^[a-záéíóúñü]/.test(cleanRest);
            if (startsLower || (CONT_CONN_RE.test(firstWord) && prevClause.length < 45)) {
                prevClause = prevClause.replace(/\.{1,3}$/, '');
                if (/^[A-ZÁÉÍÓÚÑÜ]/.test(cleanRest) && CONT_CONN_RE.test(firstWord)) {
                    cleanRest = cleanRest[0].toLowerCase() + cleanRest.slice(1);
                }
            }
        }

        if (!prevClause || /[.!?…]$/.test(prevClause)) {
            cleanRest = capitalizeSentenceStart(cleanRest);
        }

        const isFinal = mode === 'final' || mode === 'cut';
        if (isFinal) {
            const pieces = cleanRest.length > effMaxCue
                ? segmentTraditionalYouTubeCues([{ startSec: 0, endSec: 2, text: cleanRest }], { maxCueChars: effMaxCue, maxLineChars: effMaxLine }).map(c => c.text)
                : [cleanRest];
            const firstPiece = pieces[0] || cleanRest;
            const recent = Boolean(prevClause) && nowMs - prevTs <= 2600;
            const prevWc = prevClause ? prevClause.split(/\s+/).length : 0;

            let activeText = pieces.length >= 2
                ? `${pieces[pieces.length - 2]} ${pieces[pieces.length - 1]}`
                : pieces[pieces.length - 1];
            if (pieces.length === 1 && recent) {
                const wholeCombined = `${prevClause} ${firstPiece}`;
                if ((prevClause.length < 40 || prevWc <= 6) && wholeCombined.length <= effMaxCue) {
                    activeText = wholeCombined;
                } else {
                    const firstWc = firstPiece.split(/\s+/).length;
                    if (firstPiece.length < 42 || firstWc <= 6) {
                        const twoLines = formatTraditionalTwoLines(prevClause, effMaxLine).split('\n');
                        const prevTail = twoLines[twoLines.length - 1] || '';
                        const tailCombined = prevTail ? `${prevTail} ${firstPiece}` : firstPiece;
                        if (prevTail && tailCombined.length <= effMaxCue && tailCombined.length <= effMaxLine * 2 + 2) {
                            activeText = tailCombined;
                        }
                    }
                }
            }

            const formatted = formatTraditionalTwoLines(activeText, effMaxLine);
            prevClause = formatted.replace(/\n/g, ' ');
            prevTs = nowMs;
            return formatted;
        }

        const recentInterim = Boolean(prevClause) && nowMs - prevTs <= 2000;
        const previewText = (recentInterim && prevClause.length <= 36)
            ? `${prevClause} ${cleanRest}`
            : cleanRest;
        return formatTraditionalTwoLines(previewText, effMaxLine);
    };

    return { push, reset };
}

const SEAM_COMMON_SHORT_RE = /^(?:el|la|lo|le|un|de|en|es|se|si|no|ya|mi|tu|su|al|me|te|to|of|in|on|is|it|at|as|by|be|we|he|or|an|so|if|do|go|up|my)$/i;

/** Remove overlapping seam words and heal mid-word edge truncations across ASR window boundaries. */
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

    for (let k = maxK; k >= 2; k--) {
        const prevAnchor = normWord(prevWords[prevWords.length - k]);
        const nextFirst = normWord(nextWords[0]);
        if (nextFirst.length >= 2 && prevAnchor.length > nextFirst.length && prevAnchor.endsWith(nextFirst)) {
            let tailMatch = true;
            for (let j = 1; j < k; j++) {
                const a = normWord(prevWords[prevWords.length - k + j]);
                const b = normWord(nextWords[j]);
                if (!a || a !== b) {
                    tailMatch = false;
                    break;
                }
            }
            if (tailMatch) {
                return nextWords.slice(k).join(' ').trim();
            }
        }
    }

    const prevLastRaw = prevWords[prevWords.length - 1].replace(/[.,!?;:…]+$/u, '');
    const prevLast = normWord(prevLastRaw);
    const nextFirstRaw = nextWords[0];
    const nextFirst = normWord(nextFirstRaw);
    if (
        nextFirst.length >= 2 &&
        !SEAM_COMMON_SHORT_RE.test(nextFirst) &&
        prevLast.length >= nextFirst.length + 2 &&
        prevLast.endsWith(nextFirst)
    ) {
        const leadPunct = nextFirstRaw.match(/^[¿¡"'(\[«]+/u)?.[0] || '';
        const trailPunct = nextFirstRaw.match(/[.,!?;:…]+$/u)?.[0] || '';
        const healedWords = nextWords.slice();
        healedWords[0] = `${leadPunct}${prevLastRaw}${trailPunct}`;
        return healedWords.join(' ').trim();
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
        } else if ((this.streak >= 2 && conf >= 0.45) || (this.streak >= 1 && conf >= 0.85)) {
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

const SUPPORTED_AI_AUDIO_LANGS = new Set(['auto', 'es', 'en', 'fr', 'de']);

/** Normalize user-selected ASR engine name ('sherpa' streaming, 'turbo' WebGPU Pro, or 'whisper' base fallback). */
export function normalizeAsrEngine(engine = 'sherpa') {
    const clean = String(engine || '').trim().toLowerCase();
    if (clean === 'turbo') return 'turbo';
    return clean === 'whisper' ? 'whisper' : 'sherpa';
}

/** Normalize user-selected spoken audio language override ('auto' or ISO code supported for forced transcription). */
export function normalizeAiAudioLang(lang = 'auto') {
    const clean = String(lang || '').trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED_AI_AUDIO_LANGS.has(clean) ? clean : 'auto';
}

/** Whether a base language has a dedicated Sherpa Kroko streaming model. */
export function hasSherpaLanguageModel(lang = '') {
    return Boolean(SHERPA_KROKO_REPOS[normBase(lang)]);
}

/** Select the optimal real-time ASR spec (Sherpa Kroko, Whisper-Large-v3-Turbo WebGPU, or Whisper-Base fallback). */
export function selectRealtimeAsrSpec(spokenLang = '', hasWebGpu = true, preferredEngine = 'sherpa', hasShaderF16 = true) {
    const engine = normalizeAsrEngine(preferredEngine);
    const base = normBase(spokenLang);
    const gpuDtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' };

    const whisperTurboGpu = hasWebGpu
        ? {
            engine: 'whisper',
            id: 'onnx-community/whisper-large-v3-turbo',
            device: 'webgpu',
            dtype: hasShaderF16
                ? { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' }
                : { encoder_model: 'q4', decoder_model_merged: 'q4' },
            lang: base || null,
            session_options: {}
        }
        : null;
    const whisperBaseGpu = hasWebGpu
        ? {
            engine: 'whisper',
            id: 'onnx-community/whisper-base',
            device: 'webgpu',
            dtype: gpuDtype,
            lang: base || null,
            session_options: {}
        }
        : null;
    const whisperTinyWasm = {
        engine: 'whisper',
        id: 'onnx-community/whisper-tiny',
        device: 'wasm',
        dtype: 'q8',
        lang: base || null,
        session_options: { graphOptimizationLevel: 'basic' }
    };
    const whisperCandidates = whisperBaseGpu ? [whisperBaseGpu, whisperTinyWasm] : [whisperTinyWasm];

    const candidates = [];
    let lidAutoPromote = false;
    if (engine === 'turbo') {
        if (whisperTurboGpu) candidates.push(whisperTurboGpu);
        candidates.push(...whisperCandidates);
    } else if (engine === 'sherpa') {
        const kroko = base ? SHERPA_KROKO_REPOS[base] : null;
        if (kroko) {
            candidates.push({
                engine: 'sherpa',
                id: kroko.id,
                device: 'wasm',
                dtype: 'int8',
                lang: base,
                files: kroko.files,
                modelingUnit: 'cjkchar'
            });
            candidates.push(...whisperCandidates);
        } else if (!base) {
            // Unknown spoken language: start lightweight 39MB Whisper-Tiny Acoustic LID to detect Spanish/English/etc.
            // directly from audio waveform before promoting to Sherpa Kroko.
            lidAutoPromote = true;
            candidates.push(whisperTinyWasm);
            if (whisperBaseGpu) candidates.push(whisperBaseGpu);
        } else {
            candidates.push(...whisperCandidates);
        }
    } else {
        candidates.push(...whisperCandidates);
    }

    return {
        primaryEngine: candidates[0].engine,
        requestedEngine: engine,
        lidAutoPromote,
        lang: candidates[0].engine === 'sherpa' ? candidates[0].lang : (base || 'auto'),
        candidates
    };
}

/** Keep streaming Zipformer partial text readable in 1-2 lines without breaking words. */
export function formatStreamingTailText(rawText = '', maxChars = 135) {
    const clean = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!clean || clean.length <= maxChars) return clean;
    const offset = clean.length - maxChars;
    if (clean[offset - 1] === ' ') {
        return clean.slice(offset).trim();
    }
    const tail = clean.slice(offset);
    const firstSpace = tail.indexOf(' ');
    return (firstSpace >= 0 ? tail.slice(firstSpace + 1) : tail).trim();
}

/** Withhold an incomplete trailing word while the speaker is still mid-word on an interim streaming buffer. */
export function trimIncompleteStreamingText(rawText = '', isSpeakingNow = false) {
    const clean = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!clean || !isSpeakingNow) return clean;
    if (/[.?!…]["')\]»]*$/u.test(clean)) return clean;
    const words = clean.split(' ');
    if (words.length >= 3 || (words.length === 2 && words[0].length >= 4)) {
        return words.slice(0, -1).join(' ');
    }
    return clean;
}

/** Find the quietest inter-word silence valley in [searchFrom, searchTo] to avoid mid-word cuts. */
export function findBestSilenceCutSample(chunks, searchFrom, searchTo, fallbackSample = searchTo) {
    const from = Math.floor(Number(searchFrom) || 0);
    const to = Math.floor(Number(searchTo) || 0);
    if (!Array.isArray(chunks) || !chunks.length || to - from < 512) return fallbackSample;

    const len = to - from;
    const buf = new Float32Array(len);
    let copiedAny = false;
    for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        if (!c?.pcm || c.end <= from || c.start >= to) continue;
        const a = Math.max(from, c.start);
        const b = Math.min(to, c.end);
        if (b > a) {
            buf.set(c.pcm.subarray(a - c.start, b - c.start), a - from);
            copiedAny = true;
        }
    }
    if (!copiedAny) return fallbackSample;

    const frameSize = 512;
    const hop = 256;
    const frameRms = [];
    const frameCenter = [];
    for (let off = 0; off + frameSize <= len; off += hop) {
        let sum = 0;
        for (let k = 0; k < frameSize; k++) {
            const s = buf[off + k];
            sum += s * s;
        }
        frameRms.push(Math.sqrt(sum / frameSize));
        frameCenter.push(from + off + (frameSize >> 1));
    }
    if (!frameRms.length) return fallbackSample;

    let bestSample = fallbackSample;
    let bestEnergy = Infinity;
    for (let i = 0; i < frameRms.length; i++) {
        const smoothed = frameRms.length >= 3
            ? 0.25 * frameRms[Math.max(0, i - 1)] + 0.5 * frameRms[i] + 0.25 * frameRms[Math.min(frameRms.length - 1, i + 1)]
            : frameRms[i];
        if (smoothed < bestEnergy) {
            bestEnergy = smoothed;
            bestSample = frameCenter[i];
        }
    }
    return bestSample;
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

/** High-pass condition PCM gently without amplifying quiet background SFX/room tone (< 0.025 peak). */
export function gentleConditionPcm(rawPcm, state = null) {
    const len = rawPcm?.length || 0;
    const out = new Float32Array(len);
    if (!len) return out;

    let prevIn = state ? (Number(state.prevIn) || 0) : rawPcm[0];
    let prevOut = state ? (Number(state.prevOut) || 0) : 0;
    let maxAbs = 0;
    for (let i = 0; i < len; i++) {
        const x = rawPcm[i];
        const y = x - prevIn + 0.96 * prevOut;
        prevIn = x;
        prevOut = y;
        out[i] = y;
        const abs = Math.abs(y);
        if (abs > maxAbs) maxAbs = abs;
    }
    if (state) {
        state.prevIn = prevIn;
        state.prevOut = prevOut;
    }

    if (maxAbs >= 0.025 && maxAbs < 0.25) {
        const gain = Math.min(2.2, 0.45 / maxAbs);
        for (let i = 0; i < len; i++) {
            const scaled = out[i] * gain;
            out[i] = scaled < -1 ? -1 : (scaled > 1 ? 1 : scaled);
        }
    }
    return out;
}

/** Hysteresis state machine for frame-by-frame Silero VAD v5 streaming gating (512-sample frames at 16 kHz). */
export class SileroStreamingVadState {
    constructor({ onset = 0.45, offset = 0.30, minSpeechFrames = 8, minSilenceFrames = 13 } = {}) {
        this.onset = onset;
        this.offset = offset;
        this.minSpeechFrames = minSpeechFrames;
        this.minSilenceFrames = minSilenceFrames;
        this.reset();
    }

    reset() {
        this.inSpeech = false;
        this.activeFrames = 0;
        this.silenceFrames = 0;
        this.speechConfirmed = false;
    }

    pushProb(prob) {
        if (!this.inSpeech) {
            if (prob >= this.onset) {
                this.inSpeech = true;
                this.activeFrames = 1;
                this.silenceFrames = 0;
                this.speechConfirmed = this.minSpeechFrames <= 1;
                return {
                    isSpeech: true,
                    isActiveVoice: true,
                    justStarted: true,
                    justEnded: false,
                    speechConfirmed: this.speechConfirmed
                };
            }
            return {
                isSpeech: false,
                isActiveVoice: false,
                justStarted: false,
                justEnded: false,
                speechConfirmed: false
            };
        }

        const activeVoice = prob >= this.offset;
        if (activeVoice) {
            this.activeFrames++;
            this.silenceFrames = 0;
            if (this.activeFrames >= this.minSpeechFrames) {
                this.speechConfirmed = true;
            }
        } else {
            this.silenceFrames++;
        }

        if (this.silenceFrames >= this.minSilenceFrames) {
            const wasConfirmed = this.speechConfirmed;
            this.reset();
            return {
                isSpeech: false,
                isActiveVoice: false,
                justStarted: false,
                justEnded: wasConfirmed,
                speechConfirmed: false
            };
        }

        return {
            isSpeech: true,
            isActiveVoice: activeVoice,
            justStarted: false,
            justEnded: false,
            speechConfirmed: this.speechConfirmed
        };
    }
}

/** Decode base64-encoded little-endian PCM16 mono bytes into normalized [-1, 1] Float32 samples. */
export function decodePcm16Base64ToFloat32(b64 = '') {
    const clean = String(b64 || '').trim();
    if (!clean) return new Float32Array(0);
    let u8;
    if (typeof atob === 'function') {
        const bin = atob(clean);
        u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    } else {
        u8 = new Uint8Array(Buffer.from(clean, 'base64'));
    }
    const sampleCount = Math.floor(u8.byteLength / 2);
    const out = new Float32Array(sampleCount);
    const dv = new DataView(u8.buffer, u8.byteOffset, sampleCount * 2);
    for (let i = 0; i < sampleCount; i++) {
        out[i] = dv.getInt16(i * 2, true) / 32768;
    }
    return out;
}

/** Convert per-frame VAD probabilities into bounded, merged speech spans ready for ASR transcription. */
export function extractSpeechSpansFromProbs(
    probs = [],
    pcm = null,
    {
        sampleRate = 16000,
        frameSize = 512,
        onset = 0.34,
        offset = 0.20,
        minSpeechFrames = 5,
        minSilenceFrames = 14,
        preRollSec = 0.22,
        postRollSec = 0.24,
        mergeGapSec = 0.28,
        maxSpanSec = 6.5
    } = {}
) {
    const totalSamples = pcm?.length ?? (probs?.length || 0) * frameSize;
    if (!probs?.length || totalSamples <= 0) return [];

    const vad = new SileroStreamingVadState({ onset, offset, minSpeechFrames, minSilenceFrames });
    const raw = [];
    let inSpan = false;
    let spanStart = 0;
    let lastActiveEnd = 0;

    for (let i = 0; i < probs.length; i++) {
        const st = vad.pushProb(Number(probs[i]) || 0);
        if (!inSpan && st.isSpeech) {
            inSpan = true;
            spanStart = i * frameSize;
            lastActiveEnd = Math.min(totalSamples, (i + 1) * frameSize);
        } else if (inSpan && st.isSpeech) {
            if (st.isActiveVoice) {
                lastActiveEnd = Math.min(totalSamples, (i + 1) * frameSize);
            }
        } else if (inSpan && !st.isSpeech) {
            if (st.justEnded) {
                raw.push({
                    startSample: spanStart,
                    endSample: Math.max(spanStart + frameSize, Math.min(totalSamples, lastActiveEnd))
                });
            }
            inSpan = false;
        }
    }

    if (inSpan && (vad.speechConfirmed || lastActiveEnd - spanStart >= minSpeechFrames * frameSize)) {
        raw.push({
            startSample: spanStart,
            endSample: Math.min(totalSamples, Math.max(spanStart + frameSize, lastActiveEnd))
        });
    }
    if (!raw.length) return [];

    const preRoll = Math.round(preRollSec * sampleRate);
    const postRoll = Math.round(postRollSec * sampleRate);
    const padded = raw.map(sp => ({
        startSample: Math.max(0, sp.startSample - preRoll),
        endSample: Math.min(totalSamples, sp.endSample + postRoll)
    }));

    const mergeGap = Math.round(mergeGapSec * sampleRate);
    const maxSpan = Math.round(maxSpanSec * sampleRate);
    const merged = [padded[0]];
    for (let i = 1; i < padded.length; i++) {
        const prev = merged[merged.length - 1];
        const cur = padded[i];
        if (cur.startSample - prev.endSample < mergeGap && Math.max(prev.endSample, cur.endSample) - prev.startSample <= maxSpan) {
            prev.endSample = Math.max(prev.endSample, cur.endSample);
        } else {
            merged.push(cur);
        }
    }

    const out = [];
    const chunks = pcm ? [{ start: 0, end: pcm.length, pcm }] : [];
    const minCutAdvance = Math.round(sampleRate * 3.8);
    const targetCutOffset = Math.round(sampleRate * 5.2);

    for (let i = 0; i < merged.length; i++) {
        let cur = merged[i].startSample;
        const end = merged[i].endSample;
        while (end - cur > maxSpan) {
            const minCut = cur + minCutAdvance;
            const maxCut = Math.min(end, cur + maxSpan);
            const fallbackCut = Math.min(end, cur + targetCutOffset);
            let cut = chunks.length
                ? findBestSilenceCutSample(chunks, minCut, maxCut, fallbackCut)
                : fallbackCut;
            if (!Number.isFinite(cut) || cut <= cur + Math.round(sampleRate * 1.0)) {
                cut = fallbackCut;
            }
            out.push({ startSample: cur, endSample: cut });
            cur = cut;
        }
        if (end - cur >= Math.round(sampleRate * 0.15)) {
            out.push({ startSample: cur, endSample: end });
        }
    }
    return out;
}
