import { CC_AUTO_STORAGE_KEY } from './config.js';
import {
    normalizeBaseLang,
    extractLangFromAudioTrackId,
    isDubbedAutoAudioTrackId,
    isUndeterminedLang,
    gmRequest,
    isShortsUrl,
    getVideoId,
    selectActivePlayer
} from './utils.js';

function readTrackText(field) {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (field.simpleText) return field.simpleText;
    if (Array.isArray(field.runs)) return field.runs.map(r => r.text || '').join('');
    return '';
}

const TRACK_NAME_LANG_PATTERNS = Object.freeze([
    [/^(?:espa[ñn]ol|spanish)(?:\s*\(|\s|$)/i, 'es'],
    [/^(?:ingl[eé]s|english)(?:\s*\(|\s|$)/i, 'en'],
    [/^(?:portugu[eê]s|portuguese)(?:\s*\(|\s|$)/i, 'pt'],
    [/^(?:franc[eé]s|french)(?:\s*\(|\s|$)/i, 'fr'],
    [/^(?:alem[aá]n|german)(?:\s*\(|\s|$)/i, 'de'],
    [/^(?:italiano|italian)(?:\s*\(|\s|$)/i, 'it'],
    [/^(?:japon[eé]s|japanese)(?:\s*\(|\s|$)/i, 'ja'],
    [/^(?:coreano|korean)(?:\s*\(|\s|$)/i, 'ko']
]);

function detectLangFromTrackDisplayName(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    for (let i = 0; i < TRACK_NAME_LANG_PATTERNS.length; i++) {
        if (TRACK_NAME_LANG_PATTERNS[i][0].test(raw)) {
            return TRACK_NAME_LANG_PATTERNS[i][1];
        }
    }
    return '';
}

function getTrackLanguageInfoSafe(track) {
    if (!track || typeof track !== 'object') return null;
    if (typeof track.getLanguageInfo === 'function') {
        try {
            return track.getLanguageInfo() || null;
        } catch {
            return track.Vb || null;
        }
    }
    return track.Vb || null;
}

function readTrackNameString(track, langInfo) {
    return (
        (typeof langInfo?.getName === 'function' ? langInfo.getName() : '') ||
        langInfo?.name ||
        (typeof track.getName === 'function' ? track.getName() : '') ||
        readTrackText(track.name || track.displayName)
    );
}

function isDefaultAudioTrack(track) {
    if (!track || typeof track !== 'object') return false;
    if (track.isDefault === true) return true;
    if (typeof track.getIsDefault === 'function' && track.getIsDefault() === true) return true;
    const langInfo = getTrackLanguageInfoSafe(track);
    if (langInfo?.isDefault === true) return true;
    if (typeof langInfo?.getIsDefault === 'function' && langInfo.getIsDefault() === true) return true;
    return track.Vb?.isDefault === true;
}

function extractSingleAudioTrackLang(track) {
    if (!track) return '';
    const langInfo = getTrackLanguageInfoSafe(track);
    const langInfoId = (typeof langInfo?.getId === 'function' ? langInfo.getId() : '') || langInfo?.id || '';
    const vbId = (typeof track.Vb?.getId === 'function' ? track.Vb.getId() : '') || track.Vb?.id || '';
    const directId = (typeof track.getId === 'function' ? track.getId() : '') || track.id || track.audioTrackId || '';
    const directCode = normalizeBaseLang(track.languageCode);
    return (
        extractLangFromAudioTrackId(langInfoId) ||
        extractLangFromAudioTrackId(vbId) ||
        extractLangFromAudioTrackId(directId) ||
        (!isUndeterminedLang(directCode) ? directCode : '') ||
        extractLangFromAudioTrackId(track.captions?.id) ||
        detectLangFromTrackDisplayName(readTrackNameString(track, langInfo))
    );
}

function isAutoDubbedTrack(track) {
    if (!track) return false;
    if (track.isAutoDubbed === true) return true;
    if (typeof track.isAutoDubbed === 'function' && track.isAutoDubbed() === true) return true;
    if (typeof track.getIsAutoDubbed === 'function' && track.getIsAutoDubbed() === true) return true;
    const langInfo = getTrackLanguageInfoSafe(track);
    if (langInfo?.isAutoDubbed === true) return true;
    if (typeof langInfo?.getIsAutoDubbed === 'function' && langInfo.getIsAutoDubbed() === true) return true;
    return isDubbedAutoAudioTrackId(track.id || track.audioTrackId);
}

export function detectVideoAudioLang({ activeAudioTrack, availableAudioTracks, adaptiveFormats, captionTracks, playerResponse }) {
    // Active audio track represents what the viewer actually hears (including AI auto-dubbed tracks like Español US).
    const activeLang = extractSingleAudioTrackLang(activeAudioTrack);
    if (activeLang) {
        return activeLang;
    }

    if (Array.isArray(availableAudioTracks)) {
        const defaultTrack = availableAudioTracks.find(t => isDefaultAudioTrack(t) && extractSingleAudioTrackLang(t));
        if (defaultTrack) return extractSingleAudioTrackLang(defaultTrack);

        const originalTrack = availableAudioTracks.find(t => !isAutoDubbedTrack(t) && extractSingleAudioTrackLang(t));
        if (originalTrack) return extractSingleAudioTrackLang(originalTrack);

        const anyTrack = availableAudioTracks.find(t => extractSingleAudioTrackLang(t));
        if (anyTrack) return extractSingleAudioTrackLang(anyTrack);
    }

    if (Array.isArray(adaptiveFormats)) {
        const defFmt = adaptiveFormats.find(
            f => f?.audioTrack?.audioIsDefault && extractLangFromAudioTrackId(f?.audioTrack?.id)
        );
        const defLang = extractLangFromAudioTrackId(defFmt?.audioTrack?.id);
        if (defLang) return defLang;

        const origFmt = adaptiveFormats.find(
            f => f?.audioTrack?.id && !isDubbedAutoAudioTrackId(f.audioTrack.id) && extractLangFromAudioTrackId(f.audioTrack.id)
        );
        const origLang = extractLangFromAudioTrackId(origFmt?.audioTrack?.id);
        if (origLang) return origLang;
    }

    if (Array.isArray(captionTracks)) {
        const asrTrack = captionTracks.find(
            t => t && (t.kind === 'asr' || String(t.vssId || t.vss_id || '').startsWith('a.')) && !isUndeterminedLang(t.languageCode)
        );
        if (asrTrack?.languageCode) {
            return normalizeBaseLang(asrTrack.languageCode);
        }
    }

    const microLang =
        playerResponse?.videoDetails?.defaultAudioLanguage ||
        playerResponse?.microformat?.playerMicroformatRenderer?.defaultAudioLanguage;
    if (microLang && !isUndeterminedLang(microLang)) return normalizeBaseLang(microLang);

    if (Array.isArray(captionTracks) && captionTracks.length === 1 && !isUndeterminedLang(captionTracks[0]?.languageCode)) {
        return normalizeBaseLang(captionTracks[0].languageCode);
    }

    return activeLang || '';
}

export function findBestNativeCaptionTrack(tracks, userLang) {
    const base = normalizeBaseLang(userLang);
    if (!base || !Array.isArray(tracks) || !tracks.length) return null;
    const matching = tracks.filter(t => t && normalizeBaseLang(t.languageCode) === base);
    if (!matching.length) return null;

    const scored = matching.map(t => {
        const isAsr = t.kind === 'asr' || String(t.vssId || t.vss_id || '').startsWith('a.');
        const code = String(t.languageCode || '').toLowerCase();
        let score = isAsr ? 10 : 50;
        if (code === base) score += 15;
        if (code === `${base}-419` || code === `${base}-mx` || code === `${base}-es`) score += 10;
        return { track: t, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].track;
}

export function findTranslationSourceTrack(tracks) {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    const translatable = tracks.filter(t => t && t.isTranslatable !== false && t.is_translateable !== false);
    const pool = translatable.length ? translatable : tracks.filter(Boolean);
    if (!pool.length) return null;

    const manualEn = pool.find(t => normalizeBaseLang(t.languageCode) === 'en' && t.kind !== 'asr');
    if (manualEn) return manualEn;
    const asrEn = pool.find(t => normalizeBaseLang(t.languageCode) === 'en');
    if (asrEn) return asrEn;
    const anyAsr = pool.find(t => t.kind === 'asr' || String(t.vssId || t.vss_id || '').startsWith('a.'));
    return anyAsr || pool[0];
}

export function findTranslationTarget(translationLanguages, userLang) {
    const base = normalizeBaseLang(userLang);
    if (!base || !Array.isArray(translationLanguages)) return null;
    const exact = translationLanguages.find(l => normalizeBaseLang(l.languageCode) === base);
    if (!exact) return null;
    return {
        languageCode: exact.languageCode,
        languageName: readTrackText(exact.languageName) || exact.languageCode
    };
}

/** Match a track entry from player.getOption('captions', 'tracklist') to preserve full YouTube metadata. */
export function findMatchingTracklistItem(tracklist, targetTrack) {
    if (!Array.isArray(tracklist) || !targetTrack) return null;
    const wantVss = targetTrack.vss_id || targetTrack.vssId || '';
    const wantBase = normalizeBaseLang(targetTrack.languageCode);
    const wantKind = targetTrack.kind || '';
    return (
        tracklist.find(t => wantVss && (t.vss_id || t.vssId) === wantVss) ||
        tracklist.find(t => normalizeBaseLang(t.languageCode) === wantBase && (t.kind || '') === wantKind) ||
        tracklist.find(t => normalizeBaseLang(t.languageCode) === wantBase) ||
        null
    );
}

/** Build the track object passed to player.setOption('captions', 'track', ...), keeping native fields. */
export function buildPlayerTrackArg(track, translationTarget = null, nativeTrack = null) {
    const base = (nativeTrack && typeof nativeTrack === 'object') ? { ...nativeTrack } : {};
    const obj = {
        ...base,
        languageCode: track.languageCode || base.languageCode,
        languageName: readTrackText(track.name || track.languageName || base.languageName) || track.languageCode,
        kind: track.kind ?? base.kind ?? '',
        displayName: readTrackText(track.displayName || track.name || base.displayName) || track.languageCode,
        is_translateable: base.is_translateable ?? track.is_translateable ?? track.isTranslatable ?? true,
        vss_id: base.vss_id || track.vss_id || track.vssId || ''
    };
    if (translationTarget) {
        obj.translationLanguage = {
            languageCode: translationTarget.languageCode,
            languageName: translationTarget.languageName
        };
    } else {
        delete obj.translationLanguage;
    }
    return obj;
}

export function chooseSubtitleAction({
    videoLang,
    userLang,
    captionTracks,
    translationLanguages,
    captionsCurrentlyOn,
    autoActivatedByScript
}) {
    const baseVideo = normalizeBaseLang(videoLang);
    const baseUser = normalizeBaseLang(userLang);
    if (!baseUser) return { action: 'noop' };

    if (baseVideo && baseVideo === baseUser) {
        if (autoActivatedByScript && captionsCurrentlyOn) {
            return { action: 'disable' };
        }
        return { action: 'noop' };
    }

    if (!baseVideo && !Array.isArray(captionTracks)) {
        return { action: 'noop' };
    }

    const nativeTrack = findBestNativeCaptionTrack(captionTracks, baseUser);
    if (nativeTrack) {
        return { action: 'select_native', track: nativeTrack };
    }

    const sourceTrack = findTranslationSourceTrack(captionTracks);
    const translationTarget = findTranslationTarget(translationLanguages, baseUser);
    if (sourceTrack && translationTarget) {
        return { action: 'translate', sourceTrack, translationTarget };
    }

    return { action: 'noop' };
}

function getStorageSafe(explicitStorage) {
    if (explicitStorage) return explicitStorage;
    try {
        return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    } catch {
        return null;
    }
}

function isMatchingActiveTrack(activeTrack, decision) {
    if (!activeTrack?.languageCode) return false;
    if (decision.action === 'select_native') {
        return (
            normalizeBaseLang(activeTrack.languageCode) === normalizeBaseLang(decision.track.languageCode) &&
            !activeTrack.translationLanguage?.languageCode
        );
    }
    if (decision.action === 'translate') {
        return (
            normalizeBaseLang(activeTrack.languageCode) === normalizeBaseLang(decision.sourceTrack.languageCode) &&
            normalizeBaseLang(activeTrack.translationLanguage?.languageCode) === normalizeBaseLang(decision.translationTarget.languageCode)
        );
    }
    return false;
}

const TIMEDTEXT_URL_RE = /\/api\/timedtext\b/;
const FALLBACK_BOX_ID = 'supratube-fallback-captions';
const MODULE_FALLBACK_HOLDER = {};
const MODULE_TT_HOLDER = {};

/** Encode byte array to standard base64 across browser and Node runtimes. */
export function encodeBase64Bytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa === 'function') return btoa(bin);
    return Buffer.from(bytes).toString('base64');
}

/** Return or initialize per-window timedtext capture and block state. */
export function getTtState(win) {
    const host = win || MODULE_TT_HOLDER;
    if (!host.__supratubeTtState) {
        host.__supratubeTtState = {
            originCuesByVid: new Map(),
            healthyLangByVid: new Map(),
            failedByVid: new Map(),
            directBlockedByVid: new Set(),
            rawUrlsByVid: new Map(),
            onFailureCallbacks: new Map()
        };
    }
    return host.__supratubeTtState;
}

function getFallbackCtrl(win) {
    const host = win || MODULE_FALLBACK_HOLDER;
    if (!host.__supratubeFallbackCtrl) {
        host.__supratubeFallbackCtrl = {
            activeVid: null,
            inflightVid: null,
            forceOverlay: false,
            whisperVid: null,
            stopWhisper: null,
            ccUi: null,
            sameLangVideos: new Set(),
            stopLoop: null,
            watchdogTimer: null,
            cache: new Map()
        };
    }
    return host.__supratubeFallbackCtrl;
}

/** Return true while fallback or live Whisper captions are actively driving subtitles for videoId. */
export function isFallbackCaptionsActive(win = typeof window !== 'undefined' ? window : null, videoId = '') {
    const ctrl = getFallbackCtrl(win);
    if (!videoId) return Boolean(ctrl.activeVid || ctrl.whisperVid);
    return ctrl.activeVid === videoId || ctrl.whisperVid === videoId;
}

function setBoundedCache(map, key, value, limit = 20) {
    if (map.has(key)) map.delete(key);
    while (map.size >= limit) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
    }
    map.set(key, value);
}

/** Decode numeric and standard HTML entities across one or more escape passes. */
export function decodeHtmlEntities(str, passes = 1) {
    let out = String(str ?? '');
    const limit = Math.max(1, Number(passes) || 1);
    for (let pass = 0; pass < limit; pass++) {
        if (!out.includes('&')) break;
        out = out.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi, (m, dec, hex, named) => {
            if (dec !== undefined) {
                const code = parseInt(dec, 10);
                return Number.isFinite(code) ? String.fromCodePoint(code) : m;
            }
            if (hex !== undefined) {
                const code = parseInt(hex, 16);
                return Number.isFinite(code) ? String.fromCodePoint(code) : m;
            }
            return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[named.toLowerCase()] || m;
        });
    }
    return out;
}

/** Parse YouTube json3 timedtext payload into sorted second-based cue objects. */
export function parseJson3Cues(dataOrText) {
    let data = dataOrText;
    if (typeof dataOrText === 'string') {
        const trimmed = dataOrText.trim();
        if (!trimmed || trimmed[0] !== '{') return [];
        try {
            data = JSON.parse(trimmed);
        } catch {
            return [];
        }
    }
    if (!data || !Array.isArray(data.events)) return [];
    const out = [];
    for (let i = 0; i < data.events.length; i++) {
        const ev = data.events[i];
        if (!Array.isArray(ev?.segs) || !ev.segs.length) continue;
        const text = ev.segs.map(s => s?.utf8 || '').join('').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const start = (Number(ev.tStartMs) || 0) / 1000;
        const dur = (Number(ev.dDurationMs) || 0) / 1000;
        out.push({ start, end: dur > 0 ? start + dur : start + 4, text });
    }
    return out;
}

function parseVttClockSeconds(rawClock) {
    const clean = String(rawClock || '').trim().replace(',', '.');
    const parts = clean.split(':').map(Number);
    if (!parts.length || parts.some(n => !Number.isFinite(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
}

function parseVttCues(rawVtt) {
    const raw = String(rawVtt || '').replace(/\r\n?/g, '\n');
    const parsedCues = [];
    for (const block of raw.split(/\n\n+/)) {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) continue;
        if (/^(?:WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
        const timeIdx = lines.findIndex(l => l.includes('-->'));
        if (timeIdx < 0) continue;
        const arrowParts = lines[timeIdx].split('-->');
        if (arrowParts.length < 2) continue;
        const start = parseVttClockSeconds(arrowParts[0]);
        const end = parseVttClockSeconds(arrowParts[1].trim().split(/\s+/)[0]);
        const dur = Math.max(0, end - start);
        const textLines = lines
            .slice(timeIdx + 1)
            .map(l => decodeHtmlEntities(l.replace(/<[^>]*>/g, ''), 2).replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        if (textLines.length) {
            parsedCues.push({ start, end: end > start ? end : start + dur, dur, textLines });
        }
    }
    if (!parsedCues.length) return [];

    // YouTube ASR WebVTT uses two-line rolling overlap and <=50ms transition flushes.
    const isRollingYt = /<c(?:\.[^>]+)?>|<\d{2}:\d{2}:\d{2}\.\d{3}>/.test(raw) ||
        /^Kind:\s*captions/im.test(raw) ||
        parsedCues.some(c => c.dur > 0 && c.dur <= 0.05);

    const out = [];
    if (!isRollingYt) {
        for (const c of parsedCues) {
            const text = c.textLines.join(' ').replace(/\s+/g, ' ').trim();
            if (!text) continue;
            const prev = out[out.length - 1];
            if (prev && prev.text === text && Math.abs(c.start - prev.start) < 0.2) continue;
            out.push({ start: c.start, end: c.dur > 0 ? c.start + c.dur : c.start + 4, text });
        }
        return out;
    }

    let prevLine = '';
    let prevEnd = 0;
    for (const c of parsedCues) {
        const isTinyFlush = c.dur <= 0.05;
        const picked = [];
        for (const line of c.textLines) {
            const isCarry = line === prevLine && (c.textLines.length > 1 || isTinyFlush || Math.abs(c.start - prevEnd) < 0.25);
            if (isCarry) continue;
            const lastOut = out[out.length - 1];
            if (lastOut && lastOut.text === line && Math.abs(c.start - lastOut.start) < 1.5) continue;
            if (isTinyFlush && lastOut && lastOut.text.endsWith(line)) continue;
            picked.push(line);
        }
        prevLine = c.textLines[c.textLines.length - 1] || prevLine;
        prevEnd = c.end;
        const text = picked.join(' ').replace(/\s+/g, ' ').trim();
        if (text) out.push({ start: c.start, end: c.dur > 0.05 ? c.start + c.dur : c.start + 2.5, text });
    }
    return out;
}

/** Parse json3, XML timedtext (<p>/<text>), or WebVTT payloads into cue objects. */
export function parseTimedtextResponseText(bodyText) {
    const trimmed = String(bodyText || '').trim();
    if (!trimmed) return [];
    if (trimmed[0] === '{') return parseJson3Cues(trimmed);
    if (trimmed.includes('WEBVTT') || trimmed.includes('-->')) {
        const vttCues = parseVttCues(trimmed);
        if (vttCues.length) return vttCues;
    }
    if (trimmed[0] !== '<') return [];
    const cues = [];
    for (const m of trimmed.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
        const tAttr = /\bt="([\d.]+)"/.exec(m[1])?.[1];
        const dAttr = /\bd="([\d.]+)"/.exec(m[1])?.[1];
        const sAttr = /\bstart="([\d.]+)"/.exec(m[1])?.[1];
        const durAttr = /\bdur="([\d.]+)"/.exec(m[1])?.[1];
        const t = tAttr !== undefined ? Number(tAttr) / 1000 : Number(sAttr || 0);
        const d = dAttr !== undefined ? Number(dAttr) / 1000 : Number(durAttr || 0);
        const txt = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ''), 2).replace(/\s+/g, ' ').trim();
        if (txt) cues.push({ start: t, end: d > 0 ? t + d : t + 4, text: txt });
    }
    if (!cues.length) {
        for (const m of trimmed.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
            const t = Number(/\bstart="([\d.]+)"/.exec(m[1])?.[1] || 0);
            const d = Number(/\bdur="([\d.]+)"/.exec(m[1])?.[1] || 0);
            const txt = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ''), 2).replace(/\s+/g, ' ').trim();
            if (txt) cues.push({ start: t, end: d > 0 ? t + d : t + 4, text: txt });
        }
    }
    return cues;
}

function recordTimedtextOutcome(win, rawUrl, status, bodyText) {
    let parsedUrl;
    try {
        parsedUrl = new URL(String(rawUrl), win?.location?.origin || 'https://www.youtube.com');
    } catch {
        return;
    }
    const vid = parsedUrl.searchParams.get('v');
    if (!vid) return;

    const lang = normalizeBaseLang(parsedUrl.searchParams.get('lang'));
    const tlang = normalizeBaseLang(parsedUrl.searchParams.get('tlang'));
    const st = getTtState(win);

    const cleanUrl = new URL(parsedUrl.toString());
    cleanUrl.searchParams.delete('tlang');
    cleanUrl.searchParams.set('fmt', 'json3');
    if (tlang || parsedUrl.searchParams.has('pot')) {
        st.rawUrlsByVid.set(vid, cleanUrl.toString());
    }

    const cues = (status >= 200 && status < 300) ? parseTimedtextResponseText(bodyText) : [];
    if (status >= 400 || cues.length === 0) {
        if (!tlang && (status >= 400 || !parsedUrl.searchParams.has('pot'))) {
            st.directBlockedByVid.add(vid);
        }
        st.failedByVid.set(vid, { status, hasTlang: Boolean(tlang), lang, ts: Date.now() });
        const cb = st.onFailureCallbacks.get(vid);
        if (typeof cb === 'function') {
            st.onFailureCallbacks.delete(vid);
            try { cb(vid); } catch {}
        }
        return;
    }

    if (!tlang) {
        st.originCuesByVid.set(vid, { lang, cues, ts: Date.now() });
    }
    st.healthyLangByVid.set(vid, tlang || lang);
}

/**
 * Intercept YouTube /api/timedtext fetch & XHR responses to detect HTTP 429 or empty bodies
 * immediately and preserve origin-language cues when only &tlang= fails.
 */
export function installTimedtextMonitor(win = typeof window !== 'undefined' ? window : null) {
    if (!win || win.__supratubeTtMonitor) return;
    win.__supratubeTtMonitor = true;

    if (typeof win.fetch === 'function') {
        const origFetch = win.fetch;
        win.fetch = function (input, init) {
            let url = '';
            try { url = typeof input === 'string' ? input : (input?.url || ''); } catch {}
            const p = origFetch.apply(this, arguments);
            if (!TIMEDTEXT_URL_RE.test(url)) return p;
            return p.then(resp => {
                try {
                    const reader = resp?.clone ? resp.clone() : resp;
                    if (reader && typeof reader.text === 'function') {
                        Promise.resolve(reader.text())
                            .then(txt => recordTimedtextOutcome(win, url, resp.status || 0, txt))
                            .catch(() => recordTimedtextOutcome(win, url, resp?.status || 0, ''));
                    } else {
                        recordTimedtextOutcome(win, url, resp?.status || 0, '');
                    }
                } catch {}
                return resp;
            }).catch(err => {
                recordTimedtextOutcome(win, url, 0, '');
                throw err;
            });
        };
    }

    try {
        const proto = win.XMLHttpRequest?.prototype;
        if (proto && !proto.__supratubeTtHooked) {
            proto.__supratubeTtHooked = true;
            const origOpen = proto.open;
            const origSend = proto.send;
            proto.open = function (method, url) {
                this.__supratubeTtUrl = String(url || '');
                return origOpen.apply(this, arguments);
            };
            proto.send = function () {
                const reqUrl = this.__supratubeTtUrl || '';
                if (TIMEDTEXT_URL_RE.test(reqUrl) && typeof this.addEventListener === 'function') {
                    this.addEventListener('loadend', () => {
                        try {
                            let body = '';
                            if (this.responseType === '' || this.responseType === 'text') {
                                body = this.responseText || '';
                            } else if (this.response && typeof this.response === 'object') {
                                body = JSON.stringify(this.response);
                            } else if (typeof this.response === 'string') {
                                body = this.response;
                            }
                            recordTimedtextOutcome(win, reqUrl, this.status || 0, body);
                        } catch {}
                    }, { once: true });
                }
                return origSend.apply(this, arguments);
            };
        }
    } catch {}
}

/** Build the deterministic base64 protobuf params for YouTube PAmodern_transcript_view get_panel calls. */
export function buildTranscriptPanelParams(videoId) {
    const vid = String(videoId || '').trim();
    if (!vid) return '';
    const enc = typeof TextEncoder === 'function'
        ? new TextEncoder().encode(vid)
        : Array.from(unescape(encodeURIComponent(vid)), c => c.charCodeAt(0));
    const inner = [0x0a, enc.length, ...enc, 0x18, 0x01];
    const outer = [0xaa, 0x09, inner.length, ...inner];
    return encodeBase64Bytes(outer);
}

/** Parse a player timestamp string ("0:03", "12:34", "1:02:03") into seconds. */
export function parseTimestampSeconds(ts) {
    const clean = String(ts || '').trim();
    if (!/^\d+(?::\d{1,2}){1,2}$/.test(clean)) return null;
    const parts = clean.split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function findNestedStartSeconds(node) {
    if (!node || typeof node !== 'object') return null;
    if (typeof node.startTimeSeconds === 'number' && Number.isFinite(node.startTimeSeconds)) {
        return node.startTimeSeconds;
    }
    if (typeof node.startMs === 'string' || typeof node.startMs === 'number') {
        const ms = Number(node.startMs);
        if (Number.isFinite(ms)) return ms / 1000;
    }
    const vals = Array.isArray(node) ? node : Object.values(node);
    for (let i = 0; i < vals.length; i++) {
        if (vals[i] && typeof vals[i] === 'object') {
            const hit = findNestedStartSeconds(vals[i]);
            if (hit !== null) return hit;
        }
    }
    return null;
}

/** Extract timed subtitle segments from YouTube /youtubei/v1/get_panel (or legacy get_transcript) JSON. */
export function parseTranscriptPanelResponse(data) {
    if (!data || typeof data !== 'object') return [];
    const raw = [];
    const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (node.timelineItemViewModel) {
            const item = node.timelineItemViewModel;
            const nestedSegs = [];
            const collectSegs = n => {
                if (!n || typeof n !== 'object') return;
                if (n.transcriptSegmentViewModel) {
                    nestedSegs.push(n.transcriptSegmentViewModel);
                    return;
                }
                const ch = Array.isArray(n) ? n : Object.values(n);
                for (let i = 0; i < ch.length; i++) collectSegs(ch[i]);
            };
            collectSegs(item.contentItems || item);
            const text = nestedSegs.map(s => s?.simpleText || '').join(' ').replace(/\s+/g, ' ').trim();
            const tsSec = findNestedStartSeconds(item) ?? parseTimestampSeconds(nestedSegs[0]?.timestamp ?? item.timestamp);
            if (text && tsSec !== null) {
                raw.push({ start: tsSec, end: null, text });
            }
            return;
        }
        if (node.transcriptSegmentViewModel) {
            const vm = node.transcriptSegmentViewModel;
            const text = String(vm.simpleText || '').replace(/\s+/g, ' ').trim();
            const tsSec = parseTimestampSeconds(vm.timestamp);
            if (text && tsSec !== null) {
                raw.push({ start: tsSec, end: null, text });
            }
            return;
        }
        if (node.transcriptSegmentRenderer) {
            const sr = node.transcriptSegmentRenderer;
            const text = (sr.snippet?.runs || []).map(r => r?.text || '').join('').replace(/\s+/g, ' ').trim();
            const startMs = Number(sr.startMs);
            const endMs = Number(sr.endMs);
            if (text && Number.isFinite(startMs)) {
                raw.push({
                    start: startMs / 1000,
                    end: Number.isFinite(endMs) && endMs > startMs ? endMs / 1000 : null,
                    text
                });
            }
            return;
        }
        const children = Array.isArray(node) ? node : Object.values(node);
        for (let i = 0; i < children.length; i++) walk(children[i]);
    };
    walk(data);

    raw.sort((a, b) => a.start - b.start);
    const deduped = [];
    const seen = new Set();
    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        const key = `${item.start}|${item.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({ ...item });
    }
    for (let i = 0; i < deduped.length; i++) {
        const cur = deduped[i];
        if (!(cur.end > cur.start)) {
            const next = deduped[i + 1];
            cur.end = next && next.start > cur.start ? next.start : cur.start + 6;
        }
    }
    return deduped;
}

/** Break a long translated block into natural <= maxChars subtitle chunks proportional in time. */
export function splitTranslatedTextIntoTimedChunks(start, end, text, maxChars = 84) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const safeEnd = end > start ? end : start + 4;
    if (clean.length <= maxChars) {
        return [{ start, end: safeEnd, text: clean }];
    }

    const words = clean.split(' ');
    const pieces = [];
    let current = '';
    const minBreakLen = Math.floor(maxChars * 0.45);
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const next = current ? `${current} ${w}` : w;
        if (current && next.length > maxChars) {
            pieces.push(current);
            current = w;
            continue;
        }
        current = next;
        if (current.length >= minBreakLen && /[.!?…]$/.test(w) && i < words.length - 1) {
            pieces.push(current);
            current = '';
        }
    }
    if (current) pieces.push(current);

    const totalWeight = pieces.reduce((acc, p) => acc + Math.max(1, p.length), 0);
    const totalDur = safeEnd - start;
    const chunks = [];
    let cursor = start;
    for (let i = 0; i < pieces.length; i++) {
        const isLast = i === pieces.length - 1;
        const share = isLast ? (safeEnd - cursor) : totalDur * (Math.max(1, pieces[i].length) / totalWeight);
        const chunkEnd = isLast ? safeEnd : cursor + Math.max(0.4, share);
        chunks.push({ start: cursor, end: chunkEnd, text: pieces[i] });
        cursor = chunkEnd;
    }
    return chunks;
}

function parseGtxResponse(rawText) {
    const data = JSON.parse(rawText);
    if (Array.isArray(data?.sentences)) {
        return data.sentences.map(s => s?.trans || '').join('');
    }
    if (Array.isArray(data?.[0])) {
        return data[0].map(pair => pair?.[0] || '').join('');
    }
    return '';
}

async function requestTranslateHttp(url, opts, requestFn) {
    try {
        const res = await requestFn(url, opts);
        if (res?.status === 200 && res.text) return res;
    } catch {}
    if (typeof fetch === 'function') {
        const resp = await fetch(url, {
            method: opts.method || 'GET',
            headers: opts.headers,
            body: opts.body,
            credentials: 'omit'
        });
        return { status: resp.status, text: await resp.text() };
    }
    return { status: 0, text: '' };
}

async function translateSingleViaClients5(text, sl, tl, requestFn) {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
    const res = await requestTranslateHttp(url, { method: 'GET', anonymous: true, timeout: 8000 }, requestFn);
    if (res?.status !== 200 || !res.text) return null;
    try {
        const parsed = JSON.parse(res.text);
        if (typeof parsed === 'string') return parsed.trim();
        if (Array.isArray(parsed)) {
            const first = parsed[0];
            if (typeof first === 'string') return first.trim();
            if (Array.isArray(first) && typeof first[0] === 'string') return first[0].trim();
        }
    } catch {}
    return null;
}

/** Translate an array of subtitle strings in batch via translate.googleapis.com (with clients5 fallback). */
export async function translateCueBatch({ texts, sourceLang = 'auto', targetLang = 'es', requestFn = gmRequest }) {
    if (!Array.isArray(texts) || !texts.length) return [];
    const normalized = texts.map(t => String(t || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim());
    const sl = normalizeBaseLang(sourceLang) || 'auto';
    const tl = normalizeBaseLang(targetLang) || 'es';
    if (sl !== 'auto' && sl === tl) return normalized;

    const batchUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&dj=1`;
    try {
        const res = await requestTranslateHttp(
            batchUrl,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                body: `q=${encodeURIComponent(normalized.join('\n'))}`,
                anonymous: true,
                timeout: 10000
            },
            requestFn
        );
        if (res?.status === 200 && res.text) {
            const joined = parseGtxResponse(res.text);
            const split = joined.split(/\r?\n/);
            if (split.length === normalized.length) {
                return split.map((line, i) => line.trim() || normalized[i]);
            }
        }
    } catch {}

    const out = [];
    for (let i = 0; i < normalized.length; i++) {
        const line = normalized[i];
        if (!line) {
            out.push('');
            continue;
        }
        const single = await translateSingleViaClients5(line, sl, tl, requestFn).catch(() => null);
        out.push(single || line);
    }
    return out;
}

/** Fetch and parse transcript segments via YouTube's modern PAmodern_transcript_view panel. */
export async function fetchTranscriptViaGetPanel(videoId, win) {
    if (!win || typeof win.fetch !== 'function') return [];
    const params = buildTranscriptPanelParams(videoId);
    if (!params) return [];
    const ctx = win.ytcfg?.get?.('INNERTUBE_CONTEXT') || {
        client: {
            clientName: 'WEB',
            clientVersion: win.ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_VERSION') || '2.20261112.10.00'
        }
    };
    const headers = { 'Content-Type': 'application/json' };
    const clientName = win.ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_NAME');
    const clientVer = win.ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_VERSION');
    if (clientName) headers['X-YouTube-Client-Name'] = String(clientName);
    if (clientVer) headers['X-YouTube-Client-Version'] = String(clientVer);

    const resp = await win.fetch('/youtubei/v1/get_panel?prettyPrint=false', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ context: ctx, panelId: 'PAmodern_transcript_view', params })
    });
    if (!resp?.ok) return [];
    const data = typeof resp.json === 'function' ? await resp.json() : JSON.parse(await resp.text());
    return parseTranscriptPanelResponse(data);
}

function collectPerformanceTimedtextUrl(win, videoId) {
    try {
        const entries = win?.performance?.getEntriesByType?.('resource') || [];
        for (let i = entries.length - 1; i >= 0; i--) {
            const name = String(entries[i]?.name || '');
            if (!TIMEDTEXT_URL_RE.test(name)) continue;
            const parsed = new URL(name);
            if (parsed.searchParams.get('v') !== videoId) continue;
            if (!parsed.searchParams.has('pot')) continue;
            parsed.searchParams.delete('tlang');
            parsed.searchParams.set('fmt', 'json3');
            return parsed.toString();
        }
    } catch {}
    return '';
}

async function obtainRawSegmentsForVideo(videoId, win, opts = {}) {
    if (typeof __supratubeTdExports?.tdRecoverRawSubtitleCues === 'function') {
        try {
            return await __supratubeTdExports.tdRecoverRawSubtitleCues({
                videoId,
                userLang: opts.userLang || 'es',
                captionTracksHint: opts.captionTracks || [],
                doc: opts.doc || null,
                win,
                requestFn: opts.requestFn || gmRequest
            });
        } catch {}
    }

    const st = getTtState(win);
    const cachedOrigin = st.originCuesByVid.get(videoId);
    if (cachedOrigin?.cues?.length) {
        return { lang: cachedOrigin.lang, segments: cachedOrigin.cues, alreadyTranslated: false, audioLang: '', captionTracks: [] };
    }

    const rawUrl = st.rawUrlsByVid.get(videoId) || collectPerformanceTimedtextUrl(win, videoId);
    if (rawUrl && (!st.directBlockedByVid.has(videoId) || rawUrl.includes('pot=')) && typeof win?.fetch === 'function') {
        try {
            const resp = await win.fetch(rawUrl, { credentials: 'include' });
            if (resp?.ok) {
                const txt = await resp.text();
                const cues = parseTimedtextResponseText(txt);
                if (cues.length) {
                    const lang = normalizeBaseLang(new URL(rawUrl).searchParams.get('lang'));
                    st.originCuesByVid.set(videoId, { lang, cues, ts: Date.now() });
                    return { lang, segments: cues, alreadyTranslated: false, audioLang: '', captionTracks: [] };
                }
            }
        } catch {}
    }

    const panelSegs = await fetchTranscriptViaGetPanel(videoId, win).catch(() => []);
    return { lang: '', segments: panelSegs, alreadyTranslated: false, audioLang: '', captionTracks: [] };
}

function getActiveVideoIdSafe(player, win) {
    return player?.getVideoData?.()?.video_id || getVideoId(win?.location?.href || '');
}

function hasVisibleNativeCaptions(player) {
    if (!player?.querySelectorAll) return false;
    const nodes = player.querySelectorAll('.ytp-caption-segment');
    for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (el.getAttribute?.('data-supratube-seg') === '1') continue;
        if (String(el.textContent || '').trim()) return true;
    }
    return false;
}

function ensureFallbackBox(player, doc, win) {
    if (!player || !doc) return null;
    let box = player.querySelector?.(`#${FALLBACK_BOX_ID}`) || doc.getElementById?.(FALLBACK_BOX_ID);
    if (!box) {
        box = doc.createElement('div');
        box.id = FALLBACK_BOX_ID;
        box.setAttribute('data-supratube-captions', '1');
        const span = doc.createElement('span');
        span.className = 'supratube-caption-segment';
        span.setAttribute('data-supratube-seg', '1');
        box.appendChild(span);
        player.appendChild?.(box);
    }
    const isShorts = Boolean(player.id === 'shorts-player' || isShortsUrl(win?.location?.pathname || ''));
    const cw = Number(player.clientWidth) || (isShorts ? 380 : 900);
    const fontPx = Math.round(Math.max(isShorts ? 19 : 16, Math.min(isShorts ? 24 : 30, cw * (isShorts ? 0.058 : 0.024))));
    Object.assign(box.style, {
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: isShorts ? '19%' : '11%',
        width: 'max-content',
        maxWidth: isShorts ? '90%' : '84%',
        zIndex: '60',
        pointerEvents: 'none',
        textAlign: 'center'
    });
    const segEl = box.children?.[0];
    if (segEl?.style) {
        Object.assign(segEl.style, {
            display: 'inline-block',
            background: 'rgba(8, 8, 8, 0.78)',
            color: '#ffffff',
            fontFamily: '"YouTube Noto", Roboto, Arial, Helvetica, sans-serif',
            fontSize: `${fontPx}px`,
            fontWeight: isShorts ? '600' : '500',
            lineHeight: isShorts ? '1.28' : '1.35',
            padding: isShorts ? '5px 10px' : '4px 10px',
            borderRadius: '4px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
            whiteSpace: 'pre-wrap'
        });
    }
    return box;
}

const CC_ACTIVE_STYLE_ID = 'supratube-cc-active-style';
const SHORTS_CAPTION_STYLE_ID = 'supratube-shorts-caption-style';
const FILLED_CC_SVG_PATH =
    'M21 3H3C2.46 3 1.96 3.21 1.58 3.58C1.21 3.96 1 4.46 1 5V19C1 19.53 1.21 20.03 1.58 20.41C1.96 20.78 2.46 21 3 21H21C21.53 21 22.03 20.78 22.41 20.41C22.78 20.03 23 19.53 23 19V5C23 4.46 22.78 3.96 22.41 3.58C22.03 3.21 21.53 3 21 3ZM6 11H8C8.26 11 8.51 11.10 8.70 11.29C8.89 11.48 9 11.73 9 12C9 12.26 8.89 12.51 8.70 12.70C8.51 12.89 8.26 13 8 13H6C5.73 13 5.48 12.89 5.29 12.70C5.10 12.51 5 12.26 5 12C5 11.73 5.10 11.48 5.29 11.29C5.48 11.10 5.73 11 6 11ZM12 11H18C18.26 11 18.51 11.10 18.70 11.29C18.89 11.48 19 11.73 19 12C19 12.26 18.89 12.51 18.70 12.70C18.51 12.89 18.26 13 18 13H12C11.73 13 11.48 12.89 11.29 12.70C11.10 12.51 11 12.26 11 12C11 11.73 11.10 11.48 11.29 11.29C11.48 11.10 11.73 11 12 11ZM16 15H18C18.26 15 18.51 15.10 18.70 15.29C18.89 15.48 19 15.73 19 16C19 16.26 18.89 16.51 18.70 16.70C18.51 16.89 18.26 17 18 17H16C15.73 17 15.48 16.89 15.29 16.70C15.10 16.51 15 16.26 15 16C15 15.73 15.10 15.48 15.29 15.29C15.48 15.10 15.73 15 16 15ZM6 15H12C12.26 15 12.51 15.10 12.70 15.29C12.89 15.48 13 15.73 13 16C13 16.26 12.89 16.51 12.70 16.70C12.51 16.89 12.26 17 12 17H6C5.73 17 5.48 16.89 5.29 16.70C5.10 16.51 5 16.26 5 16C5 15.73 5.10 15.48 5.29 15.29C5.48 15.10 5.73 15 6 15Z';
const CC_TRACKED_ATTRS = ['aria-pressed', 'aria-disabled', 'aria-label', 'data-tooltip-title', 'data-title-no-tooltip'];

function ensureDocStyle(doc, id, css) {
    if (!doc?.createElement || !id) return;
    const existing = doc.getElementById?.(id);
    if (existing) {
        if (existing.textContent !== css) existing.textContent = css;
        return;
    }
    const target = doc.head || doc.documentElement;
    if (!target?.appendChild) return;
    const style = doc.createElement('style');
    style.id = id;
    style.textContent = css;
    target.appendChild(style);
}

function ensureCcActiveStyle(doc) {
    ensureDocStyle(doc, CC_ACTIVE_STYLE_ID, [
        '.ytp-subtitles-button[data-supratube-cc-active="1"] { opacity: 1 !important; pointer-events: auto !important; cursor: pointer !important; color: #fff !important; }',
        '.ytp-subtitles-button[data-supratube-cc-active="1"] .ytp-subtitles-button-icon, .ytp-subtitles-button[data-supratube-cc-active="1"] svg, .ytp-subtitles-button[data-supratube-cc-active="1"] path { opacity: 1 !important; fill-opacity: 1 !important; }'
    ].join('\n'));
}

function ensureShortsCaptionStyle(doc) {
    ensureDocStyle(doc, SHORTS_CAPTION_STYLE_ID, [
        '#shorts-player .caption-window, ytd-reel-video-renderer .caption-window, ytd-shorts .caption-window {',
        '    left: 50% !important;',
        '    right: auto !important;',
        '    margin-left: 0 !important;',
        '    margin-right: 0 !important;',
        '    transform: translateX(-50%) !important;',
        '    width: max-content !important;',
        '    max-width: 90% !important;',
        '    text-align: center !important;',
        '    box-sizing: border-box !important;',
        '}',
        '#shorts-player .caption-window .captions-text, ytd-reel-video-renderer .caption-window .captions-text, ytd-shorts .caption-window .captions-text,',
        '#shorts-player .caption-visual-line, ytd-reel-video-renderer .caption-visual-line, ytd-shorts .caption-visual-line {',
        '    display: block !important;',
        '    text-align: center !important;',
        '    white-space: normal !important;',
        '}',
        '#shorts-player .ytp-caption-segment, ytd-reel-video-renderer .ytp-caption-segment, ytd-shorts .ytp-caption-segment {',
        '    font-size: clamp(18px, 1.55vw, 21px) !important;',
        '    line-height: 1.28 !important;',
        '    padding: 2px 7px !important;',
        '    font-weight: 600 !important;',
        '    white-space: normal !important;',
        '}'
    ].join('\n'));
}

const IA_CC_BTN_ID = 'supratube-ia-cc-btn';
const IA_CC_STYLE_ID = 'supratube-ia-cc-style';
const SVG_NS = 'http://www.w3.org/2000/svg';
const IA_GLYPHS_PATH = 'M6.8 7.8H8.8V16.2H6.8ZM13 7.8H15L17.2 16.2H15.3L14.8 14.3H13.2L12.7 16.2H10.8ZM14 9.6L13.45 12.7H14.55Z';
const IA_OUTLINE_BOX_PATH = 'M4.5 4H19.5A2.5 2.5 0 0 1 22 6.5V17.5A2.5 2.5 0 0 1 19.5 20H4.5A2.5 2.5 0 0 1 2 17.5V6.5A2.5 2.5 0 0 1 4.5 4Z';
const IA_FILLED_CUTOUT_PATH = `M3.5 3H20.5A2.5 2.5 0 0 1 23 5.5V18.5A2.5 2.5 0 0 1 20.5 21H3.5A2.5 2.5 0 0 1 1 18.5V5.5A2.5 2.5 0 0 1 3.5 3Z ${IA_GLYPHS_PATH}`;

function ensureIaButtonStyle(doc) {
    ensureDocStyle(doc, IA_CC_STYLE_ID, [
        '.supratube-ia-cc-btn { display: inline-flex !important; align-items: center !important; justify-content: center !important; opacity: 0.92 !important; color: #fff !important; cursor: pointer !important; vertical-align: middle !important; }',
        '.supratube-ia-cc-btn:hover, .supratube-ia-cc-btn[data-active="1"] { opacity: 1 !important; }',
        '.supratube-ia-cc-btn .ytp-subtitles-button-icon { display: inline-flex; align-items: center; justify-content: center; }'
    ].join('\n'));
}

function createSvgNode(doc, tag, attrs = {}) {
    const el = typeof doc.createElementNS === 'function' ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute?.(k, String(v));
    }
    return el;
}

function renderIaButtonIcon(btn, doc, active) {
    if (!btn || !doc) return;
    let wrap = btn.querySelector?.('.ytp-subtitles-button-icon');
    if (!wrap) {
        wrap = doc.createElement('div');
        wrap.className = 'ytp-subtitles-button-icon';
        btn.appendChild?.(wrap);
    }
    wrap.setAttribute?.('fill-opacity', '1');
    let svg = wrap.querySelector?.('svg');
    if (!svg) {
        svg = createSvgNode(doc, 'svg', { fill: 'none', height: 24, viewBox: '0 0 24 24', width: 24 });
        wrap.appendChild?.(svg);
    }

    const modeKey = active ? '1' : '0';
    if (svg.getAttribute?.('data-ia-mode') === modeKey) return;
    svg.setAttribute?.('data-ia-mode', modeKey);
    svg.replaceChildren?.();

    if (active) {
        svg.appendChild?.(createSvgNode(doc, 'path', {
            d: IA_FILLED_CUTOUT_PATH,
            fill: 'white',
            'fill-rule': 'evenodd',
            'clip-rule': 'evenodd'
        }));
    } else {
        svg.appendChild?.(createSvgNode(doc, 'path', {
            d: IA_OUTLINE_BOX_PATH,
            fill: 'none',
            stroke: 'white',
            'stroke-width': '1.8'
        }));
        svg.appendChild?.(createSvgNode(doc, 'path', {
            d: IA_GLYPHS_PATH,
            fill: 'white',
            'fill-rule': 'evenodd',
            'clip-rule': 'evenodd'
        }));
    }
}

function applyIaButtonState(btn, doc, active) {
    if (!btn) return;
    const label = active ? 'Desactivar subtítulos IA' : 'Subtítulos IA';
    btn.setAttribute?.('data-active', active ? '1' : '0');
    btn.setAttribute?.('aria-pressed', active ? 'true' : 'false');
    btn.setAttribute?.('aria-label', label);
    btn.setAttribute?.('title', label);
    btn.setAttribute?.('data-tooltip-title', label);
    btn.setAttribute?.('data-title-no-tooltip', label);
    renderIaButtonIcon(btn, doc, active);
}

/** Sync active state of all injected SupraTube IA caption buttons with current Whisper session. */
export function syncAiSubtitleButtonState(
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null
) {
    if (!doc) return;
    const ctrl = getFallbackCtrl(win);
    const active = Boolean(ctrl.whisperVid && ctrl.activeVid === ctrl.whisperVid);
    const nodes = [];
    if (typeof doc.querySelectorAll === 'function') {
        try {
            const list = doc.querySelectorAll(`.${IA_CC_BTN_ID}, #${IA_CC_BTN_ID}`);
            if (list) nodes.push(...list);
        } catch {}
    }
    if (!nodes.length && typeof doc.getElementById === 'function') {
        const single = doc.getElementById(IA_CC_BTN_ID);
        if (single) nodes.push(single);
    }
    for (const btn of nodes) {
        applyIaButtonState(btn, doc, active);
    }
}

/** Remove all SupraTube IA caption buttons (on teardown or disabling feature). */
export function removeAiSubtitleButtons(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc?.querySelectorAll) return;
    try {
        for (const el of Array.from(doc.querySelectorAll(`.${IA_CC_BTN_ID}, #${IA_CC_BTN_ID}`))) {
            el.remove?.();
        }
    } catch {}
}

/** Mount the IA subtitles button beside the native YouTube CC button on Watch controls. */
export function ensureAiSubtitleButton({
    player,
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    enabled = true,
    onToggle = null
} = {}) {
    if (!doc || !win) return null;
    if (!enabled || !player || player.id === 'shorts-player' || isShortsUrl(win?.location?.pathname || '')) {
        removeAiSubtitleButtons(doc);
        return null;
    }

    const ctrl = getFallbackCtrl(win);
    if (typeof onToggle === 'function') ctrl.onIaToggle = onToggle;

    const ccBtn = findFallbackCcButton(player, doc);
    const parent = ccBtn?.parentElement;
    if (!ccBtn || !parent) return null;
    if (typeof ccBtn.closest === 'function' && !ccBtn.closest('.ytp-right-controls')) return null;

    ensureIaButtonStyle(doc);

    let btn = parent.querySelector?.(`#${IA_CC_BTN_ID}`) || doc.getElementById?.(IA_CC_BTN_ID) || null;
    if (!btn) {
        btn = doc.createElement('button');
        btn.id = IA_CC_BTN_ID;
        btn.type = 'button';
        btn.className = `ytp-button ${IA_CC_BTN_ID}`;
        btn.setAttribute?.('data-priority', '5');
        btn.addEventListener?.('click', ev => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            getFallbackCtrl(win).onIaToggle?.(win, doc);
        });
    }

    if (btn.parentElement !== parent || ccBtn.nextSibling !== btn) {
        parent.insertBefore?.(btn, ccBtn.nextSibling || null);
    }

    const active = Boolean(ctrl.whisperVid && ctrl.activeVid === ctrl.whisperVid);
    applyIaButtonState(btn, doc, active);
    return btn;
}

/** Toggle live Whisper AI captions manually on the active video, even if the video has no tracks or matches user language. */
export function startManualAiCaptions({
    player,
    videoId,
    userLang = 'es',
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null
} = {}) {
    if (!player || !videoId || !doc || !win) return false;
    const ctrl = getFallbackCtrl(win);
    if (ctrl.whisperVid === videoId && ctrl.activeVid === videoId) {
        if (ctrl.whisperManualForce) {
            clearFallbackCaptions(doc, win);
            return false;
        }
    }

    const video = player?.querySelector?.('video') || doc?.querySelector?.('video');
    if (!video) return false;

    ctrl.sameLangVideos.delete(videoId);
    ctrl.manualForcePendingVid = null;
    try { player.setOption?.('captions', 'track', {}); } catch {}
    if (typeof player.isSubtitlesOn === 'function' && player.isSubtitlesOn()) {
        try { player.toggleSubtitles?.(); } catch {}
    }

    const ok = startWhisperLiveFallback({
        player,
        video,
        videoId,
        userLang: normalizeBaseLang(userLang) || 'es',
        doc,
        win,
        manualForce: true,
        initialMessage: 'Iniciando subtítulos IA...'
    });
    syncAiSubtitleButtonState(doc, win);
    return ok;
}

const UNAVAILABLE_CC_TT_RE = /subt[ií]tulos no disponibles|captions unavailable|subtitles.*unavailable/i;

function syncCcHoverTooltip(doc, label) {
    if (!doc) return;
    const nodes = [];
    if (typeof doc.querySelectorAll === 'function') {
        try {
            const list = doc.querySelectorAll('.ytp-tooltip-text');
            if (list) nodes.push(...list);
        } catch {}
    }
    if (!nodes.length && typeof doc.querySelector === 'function') {
        try {
            const single = doc.querySelector('.ytp-tooltip-text');
            if (single) nodes.push(single);
        } catch {}
    }
    for (const tt of nodes) {
        if (!tt || !UNAVAILABLE_CC_TT_RE.test(String(tt.textContent || ''))) continue;
        const childNodes = tt.childNodes ? Array.from(tt.childNodes) : [];
        const hasElementChild = childNodes.some((n) => n && n.nodeType === 1);
        if (hasElementChild) {
            let replaced = false;
            for (const child of childNodes) {
                if (child?.nodeType === 3 && UNAVAILABLE_CC_TT_RE.test(String(child.textContent || ''))) {
                    child.textContent = `${label} `;
                    replaced = true;
                    break;
                }
            }
            if (replaced) continue;
        }
        tt.textContent = label;
    }
}

function findFallbackCcButton(player, doc) {
    return player?.querySelector?.('.ytp-subtitles-button') || doc?.querySelector?.('.ytp-subtitles-button') || null;
}

function applyCcActiveAttrs(ui, doc) {
    if (!ui?.active || !ui.ccBtn || ui.suppressObs) return;
    const { ccBtn } = ui;
    ui.suppressObs = true;
    try {
        const label = ui.mode === 'whisper' ? 'Subtítulos IA' : 'Subtítulos';
        const tooltip = `${label} (c)`;
        const setIfDiff = (el, k, v) => {
            if (el?.getAttribute?.(k) !== v) el?.setAttribute?.(k, v);
        };
        setIfDiff(ccBtn, 'data-supratube-cc-active', '1');
        setIfDiff(ccBtn, 'aria-pressed', 'true');
        setIfDiff(ccBtn, 'aria-label', tooltip);
        setIfDiff(ccBtn, 'data-tooltip-title', tooltip);
        setIfDiff(ccBtn, 'data-title-no-tooltip', label);
        if (ccBtn.hasAttribute?.('aria-disabled') || ccBtn.getAttribute?.('aria-disabled') !== null) {
            ccBtn.removeAttribute?.('aria-disabled');
        }
        if (ccBtn.disabled) ccBtn.disabled = false;
        if (ccBtn.hasAttribute?.('disabled')) ccBtn.removeAttribute?.('disabled');
        if (ccBtn.style?.display === 'none') ccBtn.style.display = '';

        const iconWrap = ccBtn.querySelector?.('.ytp-subtitles-button-icon');
        if (iconWrap) {
            if (ui.origIconFillOpacity === undefined) {
                ui.origIconFillOpacity = iconWrap.getAttribute?.('fill-opacity') ?? null;
            }
            setIfDiff(iconWrap, 'fill-opacity', '1');
        }

        const svg = ccBtn.querySelector?.('svg');
        if (svg) {
            if (ui.origSvgFillOpacity === undefined) {
                ui.origSvgFillOpacity = svg.getAttribute?.('fill-opacity') ?? null;
            }
            if (svg.hasAttribute?.('fill-opacity') || svg.getAttribute?.('fill-opacity') !== null) {
                svg.removeAttribute?.('fill-opacity');
            }
        }

        const path = ccBtn.querySelector?.('svg path');
        if (path) {
            if (ui.origPathFillOpacity === undefined) {
                ui.origPathFillOpacity = path.getAttribute?.('fill-opacity') ?? null;
            }
            if (path.hasAttribute?.('fill-opacity') || path.getAttribute?.('fill-opacity') !== null) {
                path.removeAttribute?.('fill-opacity');
            }
            if (svg?.getAttribute?.('viewBox') === '0 0 24 24') {
                if (ui.origPathD === null) ui.origPathD = path.getAttribute?.('d') ?? null;
                if (path.getAttribute?.('d') !== FILLED_CC_SVG_PATH) {
                    path.setAttribute?.('d', FILLED_CC_SVG_PATH);
                }
            }
        }
        syncCcHoverTooltip(doc, label);
    } finally {
        ui.suppressObs = false;
    }
}

function restoreCcAttr(el, attr, prev) {
    if (!el) return;
    if (prev === null || prev === undefined) el.removeAttribute?.(attr);
    else el.setAttribute?.(attr, prev);
}

function clearUiTooltipTimers(ui) {
    if (!ui?.tooltipTimers?.length) return;
    for (const id of ui.tooltipTimers) clearTimeout(id);
    ui.tooltipTimers.length = 0;
}

function restoreFallbackCcButton(win) {
    const ctrl = getFallbackCtrl(win);
    const ui = ctrl.ccUi;
    if (!ui) return;
    ctrl.ccUi = null;
    ui.active = false;
    ui.suppressObs = true;
    try {
        try { ui.observer?.disconnect?.(); } catch {}
        clearUiTooltipTimers(ui);
        const { ccBtn } = ui;
        if (!ccBtn) return;
        if (ui.onHover) {
            for (const ev of ['pointerenter', 'mouseenter', 'focus']) {
                ccBtn.removeEventListener?.(ev, ui.onHover, true);
            }
        }
        ccBtn.removeAttribute?.('data-supratube-cc-active');
        for (const attr of CC_TRACKED_ATTRS) {
            restoreCcAttr(ccBtn, attr, ui.origAttrs[attr]);
        }
        ccBtn.disabled = Boolean(ui.origDisabled);
        if (ui.origDisabled) ccBtn.setAttribute?.('disabled', '');
        if (ccBtn.style) ccBtn.style.display = ui.origDisplay;
        if (ui.origIconFillOpacity !== undefined) {
            restoreCcAttr(ccBtn.querySelector?.('.ytp-subtitles-button-icon'), 'fill-opacity', ui.origIconFillOpacity);
        }
        if (ui.origSvgFillOpacity !== undefined) {
            restoreCcAttr(ccBtn.querySelector?.('svg'), 'fill-opacity', ui.origSvgFillOpacity);
        }
        const path = ccBtn.querySelector?.('svg path');
        if (path) {
            if (ui.origPathFillOpacity !== undefined) {
                restoreCcAttr(path, 'fill-opacity', ui.origPathFillOpacity);
            }
            if (ui.origPathD !== null) {
                path.setAttribute?.('d', ui.origPathD);
            }
        }
    } finally {
        ui.suppressObs = false;
    }
}

function setFallbackCcActive(player, doc, win, mode = 'layer1') {
    const ccBtn = findFallbackCcButton(player, doc);
    if (!ccBtn) return;
    const ctrl = getFallbackCtrl(win);
    if (ctrl.ccUi && ctrl.ccUi.ccBtn !== ccBtn) {
        restoreFallbackCcButton(win);
    }
    if (!ctrl.ccUi) {
        const nativelyActive =
            ccBtn.getAttribute?.('aria-pressed') === 'true' &&
            !ccBtn.disabled &&
            ccBtn.getAttribute?.('aria-disabled') !== 'true' &&
            ccBtn.style?.display !== 'none' &&
            !/no disponibles|unavailable/i.test(
                `${ccBtn.getAttribute?.('aria-label') || ''} ${ccBtn.getAttribute?.('data-tooltip-title') || ''}`
            );
        if (nativelyActive) return;

        ensureCcActiveStyle(doc);
        const origAttrs = {};
        for (const attr of CC_TRACKED_ATTRS) {
            origAttrs[attr] = ccBtn.getAttribute?.(attr) ?? null;
        }
        const svg = ccBtn.querySelector?.('svg');
        const path = ccBtn.querySelector?.('svg path');
        const ui = {
            ccBtn,
            origAttrs,
            origDisabled: Boolean(ccBtn.disabled),
            origDisplay: ccBtn.style?.display ?? '',
            origPathD: (svg?.getAttribute?.('viewBox') === '0 0 24 24' && path) ? (path.getAttribute?.('d') ?? null) : null,
            origIconFillOpacity: undefined,
            origSvgFillOpacity: undefined,
            origPathFillOpacity: undefined,
            tooltipTimers: [],
            onHover: null,
            observer: null,
            suppressObs: false,
            active: true,
            mode
        };
        ui.onHover = () => {
            if (!ui.active) return;
            applyCcActiveAttrs(ui, doc);
            clearUiTooltipTimers(ui);
            const label = ui.mode === 'whisper' ? 'Subtítulos IA' : 'Subtítulos';
            for (const delay of [0, 60, 160]) {
                ui.tooltipTimers.push(setTimeout(() => {
                    if (ui.active) syncCcHoverTooltip(doc, label);
                }, delay));
            }
        };
        for (const ev of ['pointerenter', 'mouseenter', 'focus']) {
            ccBtn.addEventListener?.(ev, ui.onHover, true);
        }
        if (typeof win?.MutationObserver === 'function') {
            try {
                ui.observer = new win.MutationObserver(() => {
                    if (ui.active && !ui.suppressObs) applyCcActiveAttrs(ui, doc);
                });
                ui.observer.observe(ccBtn, {
                    attributes: true,
                    attributeFilter: [...CC_TRACKED_ATTRS, 'disabled', 'style', 'fill-opacity', 'd'],
                    childList: true,
                    subtree: true
                });
            } catch {}
        }
        ctrl.ccUi = ui;
    } else {
        ctrl.ccUi.mode = mode;
        ctrl.ccUi.active = true;
    }
    applyCcActiveAttrs(ctrl.ccUi, doc);
}

/** Hide and remove the fallback caption overlay and tear down its sync loop or Whisper session. */
export function clearFallbackCaptions(doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null) {
    const ctrl = getFallbackCtrl(win);
    clearTimeout(ctrl.watchdogTimer);
    ctrl.watchdogTimer = null;
    ctrl.activeVid = null;
    ctrl.inflightVid = null;
    ctrl.manualForcePendingVid = null;
    ctrl.forceOverlay = false;
    restoreFallbackCcButton(win);
    if (typeof ctrl.stopWhisper === 'function') {
        try { ctrl.stopWhisper(); } catch {}
        ctrl.stopWhisper = null;
    }
    ctrl.whisperVid = null;
    ctrl.whisperManualForce = false;
    if (typeof ctrl.stopLoop === 'function') {
        try { ctrl.stopLoop(); } catch {}
        ctrl.stopLoop = null;
    }
    const existing = doc?.getElementById?.(FALLBACK_BOX_ID);
    if (existing) {
        try { existing.remove(); } catch {}
    }
    syncAiSubtitleButtonState(doc, win);
}

function findActiveChunkText(chunks, timeSec) {
    if (!chunks.length) return '';
    let lo = 0;
    let hi = chunks.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const c = chunks[mid];
        if (timeSec < c.start) hi = mid - 1;
        else if (timeSec >= c.end) lo = mid + 1;
        else return c.text;
    }
    return '';
}

function startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks }) {
    const ctrl = getFallbackCtrl(win);
    if (typeof ctrl.stopLoop === 'function') {
        try { ctrl.stopLoop(); } catch {}
    }
    ctrl.activeVid = videoId;
    setFallbackCcActive(player, doc, win, 'layer1');

    const renderTick = () => {
        if (ctrl.activeVid !== videoId) return;
        const curVid = getActiveVideoIdSafe(player, win);
        if (curVid && curVid !== videoId) {
            clearFallbackCaptions(doc, win);
            return;
        }
        if (!ctrl.forceOverlay && typeof player.isSubtitlesOn === 'function' && player.isSubtitlesOn() === false) {
            clearFallbackCaptions(doc, win);
            return;
        }
        if (!ctrl.ccUi || ctrl.ccUi.ccBtn?.isConnected === false) {
            setFallbackCcActive(player, doc, win, 'layer1');
        }
        const box = ensureFallbackBox(player, doc, win);
        if (!box) return;
        if (hasVisibleNativeCaptions(player)) {
            box.style.display = 'none';
            return;
        }
        const t = Number(video?.currentTime) || 0;
        const txt = findActiveChunkText(getChunks(), t);
        const segEl = box.children?.[0];
        if (segEl) segEl.textContent = txt;
        box.style.display = txt ? 'block' : 'none';
    };

    const onTime = () => renderTick();
    video.addEventListener?.('timeupdate', onTime, { passive: true });
    video.addEventListener?.('seeked', onTime, { passive: true });
    const timer = typeof setInterval === 'function' ? setInterval(() => {
        if (ctrl.activeVid === videoId && !video.paused) renderTick();
    }, 180) : null;
    if (timer && typeof timer.unref === 'function') timer.unref();

    ctrl.stopLoop = () => {
        video.removeEventListener?.('timeupdate', onTime);
        video.removeEventListener?.('seeked', onTime);
        if (timer !== null) clearInterval(timer);
    };
    renderTick();
}

function buildChunksForSegments(segments, translatedByIdx, maxChars) {
    const chunks = [];
    for (let i = 0; i < segments.length; i++) {
        const text = translatedByIdx[i] ?? segments[i].text;
        chunks.push(...splitTranslatedTextIntoTimedChunks(segments[i].start, segments[i].end, text, maxChars));
    }
    return chunks;
}

function dispatchWhisperCmd(win, detail) {
    if (!win || typeof win.dispatchEvent !== 'function') return false;
    const Ev = typeof win.CustomEvent === 'function' ? win.CustomEvent : (typeof CustomEvent === 'function' ? CustomEvent : null);
    if (!Ev) return false;
    win.dispatchEvent(new Ev('supratube-whisper-cmd', { detail }));
    return true;
}

function startWhisperLiveFallback({ player, video, videoId, userLang, doc, win, manualForce = false, initialMessage = '' }) {
    if (doc?.documentElement?.dataset?.supratubeWhisperBridge !== '1') return false;
    const ctrl = getFallbackCtrl(win);
    if (ctrl.whisperVid === videoId) {
        if (manualForce && !ctrl.whisperManualForce) {
            ctrl.whisperManualForce = true;
            dispatchWhisperCmd(win, { action: 'start', videoId, targetLang: userLang, manualForce: true });
            syncAiSubtitleButtonState(doc, win);
        }
        return true;
    }
    if (typeof ctrl.stopWhisper === 'function') {
        try { ctrl.stopWhisper(); } catch {}
        ctrl.stopWhisper = null;
    }
    if (typeof ctrl.stopLoop === 'function') {
        try { ctrl.stopLoop(); } catch {}
        ctrl.stopLoop = null;
    }

    ctrl.activeVid = videoId;
    ctrl.whisperVid = videoId;
    ctrl.whisperManualForce = Boolean(manualForce);
    ctrl.forceOverlay = true;
    video?.setAttribute?.('data-supratube-whisper-target', videoId);
    setFallbackCcActive(player, doc, win, 'whisper');
    syncAiSubtitleButtonState(doc, win);

    let fadeTimer = null;
    const showLine = (text, autoFadeMs = 0) => {
        if (ctrl.whisperVid !== videoId || ctrl.activeVid !== videoId) return;
        const curVid = getActiveVideoIdSafe(player, win);
        if ((curVid && curVid !== videoId) || (!ctrl.whisperManualForce && hasVisibleNativeCaptions(player))) {
            clearFallbackCaptions(doc, win);
            return;
        }
        const box = ensureFallbackBox(player, doc, win);
        if (!box) return;
        const segEl = box.children?.[0];
        if (segEl) segEl.textContent = text;
        box.style.display = text ? 'block' : 'none';
        clearTimeout(fadeTimer);
        if (text && autoFadeMs > 0) {
            fadeTimer = setTimeout(() => {
                if (ctrl.whisperVid === videoId) {
                    const el = doc?.getElementById?.(FALLBACK_BOX_ID);
                    if (el) el.style.display = 'none';
                }
            }, autoFadeMs);
        }
    };

    if (initialMessage) {
        showLine(initialMessage, 0);
    }

    const onEvt = ev => {
        const d = ev?.detail;
        if (!d || typeof d !== 'object') return;
        if (d.videoId && d.videoId !== videoId) return;
        if (ctrl.whisperVid !== videoId) return;

        if (!ctrl.ccUi || ctrl.ccUi.ccBtn?.isConnected === false) {
            setFallbackCcActive(player, doc, win, 'whisper');
        }
        if (d.kind === 'same_language' && !ctrl.whisperManualForce) {
            ctrl.sameLangVideos.add(videoId);
            clearFallbackCaptions(doc, win);
            return;
        }
        if (d.kind === 'progress') {
            if (d.pct > 0 && d.pct < 100) showLine(`Subtítulos IA (${d.pct}%)...`, 0);
            return;
        }
        if (d.kind === 'waiting_play') {
            showLine('', 0);
            return;
        }
        if (d.kind === 'ready') {
            showLine(ctrl.whisperManualForce ? 'Subtítulos IA escuchando...' : '', ctrl.whisperManualForce ? 2200 : 0);
            return;
        }
        if (d.kind === 'caption') {
            const txt = String(d.translated || d.raw || '').trim();
            if (txt) showLine(txt, 4500);
            return;
        }
        if (d.kind === 'preempted') {
            clearFallbackCaptions(doc, win);
            return;
        }
        if (d.kind === 'error') {
            const manualErr = ctrl.whisperManualForce ? String(d.error || '').trim() : '';
            clearFallbackCaptions(doc, win);
            if (manualErr && player && doc) {
                const box = ensureFallbackBox(player, doc, win);
                if (box) {
                    const segEl = box.children?.[0];
                    if (segEl) segEl.textContent = `Subtítulos IA: ${manualErr}`;
                    box.style.display = 'block';
                    setTimeout(() => {
                        if (!getFallbackCtrl(win).activeVid) {
                            doc.getElementById?.(FALLBACK_BOX_ID)?.remove?.();
                        }
                    }, 2500);
                }
            }
        }
    };

    win?.addEventListener?.('supratube-whisper-evt', onEvt);
    ctrl.stopWhisper = () => {
        clearTimeout(fadeTimer);
        win?.removeEventListener?.('supratube-whisper-evt', onEvt);
        video?.removeAttribute?.('data-supratube-whisper-target');
        dispatchWhisperCmd(win, { action: 'stop', videoId });
    };

    dispatchWhisperCmd(win, { action: 'start', videoId, targetLang: userLang, manualForce: Boolean(manualForce) });
    return true;
}

async function runFallbackSubtitles({
    player,
    videoId,
    sourceLang,
    userLang,
    captionTracks = [],
    doc,
    win,
    requestFn,
    forceOverlay = false,
    allowWhisper = false,
    manualForce = false
}) {
    const ctrl = getFallbackCtrl(win);
    if (ctrl.sameLangVideos.has(videoId) && !manualForce) return;
    if (ctrl.activeVid === videoId) return;
    if (ctrl.inflightVid === videoId) {
        if (manualForce) ctrl.manualForcePendingVid = videoId;
        return;
    }
    if (hasVisibleNativeCaptions(player)) return;
    const video = player?.querySelector?.('video') || doc?.querySelector?.('video');
    if (!video) return;

    ctrl.inflightVid = videoId;
    try {
        const targetBase = normalizeBaseLang(userLang) || 'es';
        const cacheKey = `${videoId}:${targetBase}`;
        const isShorts = Boolean(player.id === 'shorts-player' || isShortsUrl(win?.location?.pathname || ''));
        const maxChars = isShorts ? 54 : 84;

        let chunks = ctrl.cache.get(cacheKey) || null;
        if (chunks?.length) {
            ctrl.forceOverlay = Boolean(forceOverlay);
            startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks: () => chunks });
            return;
        }

        const recovered = await obtainRawSegmentsForVideo(videoId, win, { userLang: targetBase, captionTracks, doc, requestFn });
        const forced = Boolean(manualForce || ctrl.manualForcePendingVid === videoId);
        if (ctrl.manualForcePendingVid === videoId) ctrl.manualForcePendingVid = null;
        const segments = recovered?.segments || [];
        if (getActiveVideoIdSafe(player, win) !== videoId || hasVisibleNativeCaptions(player)) return;

        const recoveredAudioLang = normalizeBaseLang(
            recovered?.audioLang ||
            sourceLang ||
            detectVideoAudioLang({ captionTracks: recovered?.captionTracks || [] })
        );
        if (!forced && recoveredAudioLang && recoveredAudioLang === targetBase) {
            ctrl.sameLangVideos.add(videoId);
            clearFallbackCaptions(doc, win);
            return;
        }

        if (!segments.length) {
            if (allowWhisper && (forced || doc?.visibilityState !== 'hidden')) {
                startWhisperLiveFallback({ player, video, videoId, userLang: targetBase, doc, win, manualForce: forced });
            }
            return;
        }

        ctrl.forceOverlay = Boolean(forceOverlay);
        const segLang = normalizeBaseLang(recovered?.lang || sourceLang);
        const alreadyInTarget = Boolean(recovered?.alreadyTranslated) || (segLang && segLang === targetBase);

        if (alreadyInTarget) {
            chunks = buildChunksForSegments(segments, segments.map(s => s.text), maxChars);
            setBoundedCache(ctrl.cache, cacheKey, chunks);
            startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks: () => chunks });
            return;
        }

        const srcLang = segLang || 'auto';
        const translated = new Array(segments.length);
        const curTime = Number(video.currentTime) || 0;
        let firstIdx = segments.findIndex(s => s.end > curTime);
        if (firstIdx < 0) firstIdx = 0;

        const firstBatchEnd = Math.min(segments.length, firstIdx + 10);
        const firstTexts = segments.slice(firstIdx, firstBatchEnd).map(s => s.text);
        const firstOut = await translateCueBatch({ texts: firstTexts, sourceLang: srcLang, targetLang: targetBase, requestFn });
        if (getActiveVideoIdSafe(player, win) !== videoId || hasVisibleNativeCaptions(player)) return;

        for (let k = 0; k < firstOut.length; k++) {
            translated[firstIdx + k] = firstOut[k];
        }
        chunks = buildChunksForSegments(segments, translated, maxChars);
        startFallbackSyncLoop({ player, video, videoId, doc, win, getChunks: () => chunks });

        const ranges = [];
        for (let i = firstBatchEnd; i < segments.length; i += 15) {
            ranges.push([i, Math.min(segments.length, i + 15)]);
        }
        for (let i = 0; i < firstIdx; i += 15) {
            ranges.push([i, Math.min(firstIdx, i + 15)]);
        }

        for (let r = 0; r < ranges.length; r++) {
            if (ctrl.activeVid !== videoId || getActiveVideoIdSafe(player, win) !== videoId) return;
            const [s, e] = ranges[r];
            const part = await translateCueBatch({
                texts: segments.slice(s, e).map(seg => seg.text),
                sourceLang: srcLang,
                targetLang: targetBase,
                requestFn
            });
            for (let k = 0; k < part.length; k++) translated[s + k] = part[k];
            chunks = buildChunksForSegments(segments, translated, maxChars);
        }
        if (ctrl.activeVid === videoId) {
            setBoundedCache(ctrl.cache, cacheKey, chunks);
        }
    } finally {
        if (ctrl.inflightVid === videoId) ctrl.inflightVid = null;
    }
}

function armFallbackWatchdog({ player, decision, videoId, userLang, captionTracks, doc, win, requestFn, delayMs = 1800, skipWhisperFallback = false }) {
    if (!videoId || (!player?.querySelector && !doc?.querySelector)) return;
    const st = getTtState(win);
    const ctrl = getFallbackCtrl(win);
    const targetBase = normalizeBaseLang(userLang);
    const sourceLang = decision.action === 'translate'
        ? decision.sourceTrack?.languageCode
        : decision.track?.languageCode;

    const triggerNow = () => {
        if (ctrl.activeVid === videoId || ctrl.inflightVid === videoId) return;
        if (getActiveVideoIdSafe(player, win) !== videoId) return;
        if (hasVisibleNativeCaptions(player)) return;
        if (typeof player.isSubtitlesOn === 'function' && player.isSubtitlesOn() === false) return;
        runFallbackSubtitles({
            player,
            videoId,
            sourceLang,
            userLang,
            captionTracks,
            doc,
            win,
            requestFn,
            forceOverlay: true,
            allowWhisper: !skipWhisperFallback
        }).catch(() => {});
    };

    if (st.failedByVid.has(videoId) && st.healthyLangByVid.get(videoId) !== targetBase) {
        triggerNow();
        return;
    }

    st.onFailureCallbacks.set(videoId, () => {
        clearTimeout(ctrl.watchdogTimer);
        triggerNow();
    });

    clearTimeout(ctrl.watchdogTimer);
    ctrl.watchdogTimer = setTimeout(() => {
        st.onFailureCallbacks.delete(videoId);
        if (st.healthyLangByVid.get(videoId) === targetBase && decision.action === 'translate') return;
        triggerNow();
    }, delayMs);
}

function isShortsCaptionMenuClick(target) {
    const popup = target?.closest?.('ytd-popup-container, tp-yt-iron-dropdown, .ytp-settings-menu');
    if (!popup) return false;
    const item = target.closest('yt-list-item-view-model, [role="menuitemradio"], [role="menuitem"], tp-yt-paper-item, .ytp-menuitem');
    if (!item) return false;
    const popupText = popup.textContent || '';
    return /subt[ií]tulos|captions|traducir autom[aá]ticamente|traducción autom[aá]tica|auto-translate/i.test(popupText);
}

export function bindManualCaptionListeners(
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    explicitStorage = null,
    onManualAction = null
) {
    if (!doc || !win) return;
    if (typeof onManualAction === 'function') {
        doc.__supratubeOnManualCaption = onManualAction;
    }
    if (doc.__supratubeCapListenerBound) return;
    doc.__supratubeCapListenerBound = true;
    const storage = getStorageSafe(explicitStorage);
    const clearAutoFlag = () => {
        try { storage?.setItem(CC_AUTO_STORAGE_KEY, '0'); } catch {}
        try { doc.__supratubeOnManualCaption?.(); } catch {}
    };

    const isDisabledCcClick = ev => {
        const controls = ev.target?.closest?.('.ytp-right-controls, .ytp-chrome-controls');
        if (!controls || typeof ev.clientX !== 'number') return false;
        const cc = controls.querySelector?.('.ytp-subtitles-button');
        if (!cc?.disabled && cc?.getAttribute?.('aria-disabled') !== 'true') return false;
        const r = cc.getBoundingClientRect?.();
        return Boolean(r && r.width > 0 && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom);
    };

    doc.addEventListener('click', ev => {
        if (!ev.isTrusted) return;
        if (ev.target?.closest?.('.ytp-subtitles-button') || isShortsCaptionMenuClick(ev.target) || isDisabledCcClick(ev)) {
            clearAutoFlag();
        }
    }, true);

    win.addEventListener('keydown', ev => {
        if (!ev.isTrusted || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        if (String(ev.key || '').toLowerCase() !== 'c') return;
        const tag = ev.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target?.isContentEditable) return;
        clearAutoFlag();
    }, true);
}

function readPlayerSubsOn(player, ccBtn) {
    const playerSubsOn = typeof player.isSubtitlesOn === 'function' ? player.isSubtitlesOn() : null;
    if (playerSubsOn !== null) return Boolean(playerSubsOn);
    return ccBtn?.getAttribute?.('aria-pressed') === 'true' || Boolean(player.getOption?.('captions', 'track')?.languageCode);
}

export async function applySmartSubtitles(player, deps = {}) {
    if (!deps.enabled || !player) return false;
    const doc = deps.doc || (typeof document !== 'undefined' ? document : null);
    const win = deps.win || (typeof window !== 'undefined' ? window : null);
    const storage = getStorageSafe(deps.storage);
    const scheduleFn = deps.scheduleFn || (fn => setTimeout(fn, 120));
    const requestFn = deps.gmRequestFn || gmRequest;

    const playerVid = getActiveVideoIdSafe(player, win);
    if (deps.expectedVideoId && playerVid && playerVid !== deps.expectedVideoId) {
        return false;
    }
    const targetVideoId = deps.expectedVideoId || playerVid || '';
    if (player.id === 'shorts-player' || isShortsUrl(win?.location?.pathname || '')) {
        ensureShortsCaptionStyle(doc);
    }

    try { player.loadModule?.('captions'); } catch {}

    const pr = player.getPlayerResponse?.() || {};
    const prCaps = pr.captions?.playerCaptionsTracklistRenderer || {};
    const tracklist = player.getOption?.('captions', 'tracklist', { includeAsr: true });
    const captionTracks = (Array.isArray(tracklist) && tracklist.length) ? tracklist : (prCaps.captionTracks || []);
    const translationLanguages =
        (Array.isArray(prCaps.translationLanguages) && prCaps.translationLanguages.length)
            ? prCaps.translationLanguages
            : (player.getOption?.('captions', 'translationLanguages') || []);

    const activeTrack = player.getOption?.('captions', 'track');
    const scopedBtn = player.querySelector?.('.ytp-subtitles-button');
    const ccBtn = scopedBtn || (typeof player.querySelector !== 'function' ? doc?.querySelector?.('.ytp-subtitles-button') : null);
    const captionsCurrentlyOn = readPlayerSubsOn(player, ccBtn);
    const autoActivatedByScript = storage?.getItem(CC_AUTO_STORAGE_KEY) === '1';

    const videoLang = detectVideoAudioLang({
        activeAudioTrack: player.getAudioTrack?.(),
        availableAudioTracks: player.getAvailableAudioTracks?.(),
        adaptiveFormats: pr.streamingData?.adaptiveFormats,
        captionTracks,
        playerResponse: pr
    });

    const ctrl = getFallbackCtrl(win);
    if (targetVideoId && ctrl.sameLangVideos.has(targetVideoId) && !deps.manualForce) {
        return false;
    }

    const decision = chooseSubtitleAction({
        videoLang,
        userLang: deps.userLang,
        captionTracks,
        translationLanguages,
        captionsCurrentlyOn,
        autoActivatedByScript
    });

    if (decision.action === 'noop') {
        const baseVideo = normalizeBaseLang(videoLang);
        const baseUser = normalizeBaseLang(deps.userLang);
        if (!baseUser || (baseVideo && baseVideo === baseUser) || deps.skipFallbackCheck || !targetVideoId) {
            return false;
        }
        if (captionsCurrentlyOn && !deps.manualForce) return false;
        runFallbackSubtitles({
            player,
            videoId: targetVideoId,
            sourceLang: videoLang || '',
            userLang: deps.userLang,
            captionTracks,
            doc,
            win,
            requestFn,
            forceOverlay: true,
            allowWhisper: !deps.skipWhisperFallback,
            manualForce: Boolean(deps.manualForce)
        }).catch(() => {});
        return true;
    }

    if (decision.action === 'disable') {
        clearFallbackCaptions(doc, win);
        try { player.setOption?.('captions', 'track', {}); } catch {}
        if (readPlayerSubsOn(player, ccBtn)) {
            try { player.toggleSubtitles?.(); } catch {}
        }
        try { storage?.setItem(CC_AUTO_STORAGE_KEY, '0'); } catch {}
        return true;
    }

    const alreadyMatched = captionsCurrentlyOn && isMatchingActiveTrack(activeTrack, decision);
    if (!alreadyMatched) {
        if (!captionsCurrentlyOn) {
            try { storage?.setItem(CC_AUTO_STORAGE_KEY, '1'); } catch {}
        }
        if (decision.action === 'select_native') {
            const tlMatch = findMatchingTracklistItem(tracklist, decision.track);
            const arg = buildPlayerTrackArg(decision.track, null, tlMatch);
            try { player.setOption?.('captions', 'track', arg); } catch {}
            if (!readPlayerSubsOn(player, ccBtn)) {
                try { player.toggleSubtitles?.(); } catch {}
            }
        } else if (decision.action === 'translate') {
            const tlMatch = findMatchingTracklistItem(tracklist, decision.sourceTrack);
            const translatedArg = buildPlayerTrackArg(decision.sourceTrack, decision.translationTarget, tlMatch);
            try { player.setOption?.('captions', 'track', translatedArg); } catch {}
            scheduleFn(() => {
                const nowTrack = player.getOption?.('captions', 'track');
                const wantTarget = normalizeBaseLang(decision.translationTarget.languageCode);
                if (normalizeBaseLang(nowTrack?.translationLanguage?.languageCode) !== wantTarget) {
                    const baseArg = buildPlayerTrackArg(decision.sourceTrack, null, tlMatch);
                    try { player.setOption?.('captions', 'track', baseArg); } catch {}
                    try { player.setOption?.('captions', 'track', translatedArg); } catch {}
                }
                if (!readPlayerSubsOn(player, ccBtn) && !player.getOption?.('captions', 'track')?.languageCode) {
                    try { player.toggleSubtitles?.(); } catch {}
                }
            });
        }
    }

    if (!deps.skipFallbackCheck && targetVideoId) {
        armFallbackWatchdog({
            player,
            decision,
            videoId: targetVideoId,
            userLang: deps.userLang,
            captionTracks,
            doc,
            win,
            requestFn,
            delayMs: deps.fallbackWatchdogMs ?? 1800,
            skipWhisperFallback: Boolean(deps.skipWhisperFallback)
        });
    }

    return true;
}

// Descarga de transcripción (.txt) integrada aquí para compatibilidad automática incluso desde v1.0.3.
export const __supratubeTdExports = (() => {
    'use strict';

    const TD_STYLE_ID = 'supratube-td-style';
    const TD_ITEM_ATTR = 'data-supratube-td-item';
    const TD_TOAST_ID = 'supratube-td-toast';
    const TD_BLOCK_SIZE = 200;
    const TD_HEROICON_SVG_URL = 'https://api.iconify.design/heroicons/arrow-down-tray.svg';
    const TD_HEROICON_FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/heroicons@2.2.0/24/outline/arrow-down-tray.svg';

    const TD_INNERTUBE_CLIENTS = Object.freeze([
        {
            name: 'ANDROID',
            id: '3',
            context: {
                clientName: 'ANDROID',
                clientVersion: '20.10.38',
                androidSdkVersion: 34,
                osName: 'Android',
                osVersion: '14',
                hl: 'es',
                gl: 'ES'
            }
        },
        {
            name: 'IOS',
            id: '5',
            context: {
                clientName: 'IOS',
                clientVersion: '20.10.4',
                deviceMake: 'Apple',
                deviceModel: 'iPhone16,2',
                osName: 'iPhone',
                osVersion: '17.5.1.21F90',
                hl: 'es',
                gl: 'ES'
            }
        },
        {
            name: 'ANDROID_VR',
            id: '28',
            context: {
                clientName: 'ANDROID_VR',
                clientVersion: '1.62.27',
                androidSdkVersion: 32,
                osName: 'Android',
                osVersion: '12L',
                hl: 'es',
                gl: 'ES'
            }
        },
        {
            name: 'MWEB',
            id: '2',
            context: {
                clientName: 'MWEB',
                clientVersion: '2.20260401.01.00',
                hl: 'es',
                gl: 'ES'
            }
        },
        {
            name: 'WEB_EMBEDDED_PLAYER',
            id: '56',
            context: {
                clientName: 'WEB_EMBEDDED_PLAYER',
                clientVersion: '1.20260401.01.00',
                hl: 'es',
                gl: 'ES'
            }
        }
    ]);

    const TD_LATIN_LANG_RE = /^(?:es|en|pt|fr|it|de|ca|gl|nl|sv|no|da|ro|pl|cs|hu|fi|id|ms|tr)(?:-|$)/i;
    const TD_ROOT_SHORTS_MENU_RE = /(?:descripci[oó]n|description|guardar|playlist|modo ambiente|ambient mode|subt[ií]tulos|captions|subtitles|pantalla completa|full\s*screen|pista de audio|audio track|velocidad|playback speed|no me interesa|not interested|denunciar|report)/i;
    const TD_WATCH_MENU_RE = /(?:preguntar|ask|guardar|save|clip|descargar|download|mostrar transcripci|show transcript|denunciar|report|mirar sin anuncios|premium)/i;
    const TD_FORBIDDEN_CONTAINER_SEL = '#related, ytd-compact-video-renderer, ytd-lockup-view-model, yt-lockup-view-model, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-playlist-panel-video-renderer, ytd-comment-view-model, ytd-comment-thread-renderer, ytd-topbar-menu-button-renderer';

    /** Decode entities and normalize caption noise ([Música], >>, musical notes) in a cue string. */
    function cleanTranscriptCueText(rawText, cleanNoise = true) {
        let text = decodeHtmlEntities(String(rawText ?? ''), 2);
        if (cleanNoise) {
            text = text
                .replace(/\[.*?\]/g, '')
                .replace(/\s*>>\s*/g, ' ')
                .replace(/\s*[♪━]\s*/g, ' ');
        }
        return text.replace(/\s+/g, ' ').trim();
    }

    /** Format seconds into YouTube-a-TXT timestamp strings ("0:05", "12:34", "1:02:03"). */
    function formatTranscriptTimestamp(seconds) {
        const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
        const hours = Math.floor(safe / 3600);
        const minutes = Math.floor((safe % 3600) / 60);
        const secs = safe % 60;
        const p2 = n => String(n).padStart(2, '0');
        if (hours > 0) return `${hours}:${p2(minutes)}:${p2(secs)}`;
        return `${minutes}:${p2(secs)}`;
    }

    /** Group subtitle cues into readable <= blockSize character chunks preserving start/end timestamps. */
    function buildTranscriptBlocks(cues, blockSize = TD_BLOCK_SIZE) {
        if (!Array.isArray(cues) || !cues.length) return [];
        const blocks = [];
        let current = null;
        let curLen = 0;

        for (let i = 0; i < cues.length; i++) {
            const raw = cleanTranscriptCueText(cues[i]?.text, true);
            if (!raw) continue;
            const start = Number.isFinite(cues[i]?.start) ? cues[i].start : 0;
            const end = Number.isFinite(cues[i]?.end) && cues[i].end >= start ? cues[i].end : start + 4;

            if (current && curLen + raw.length + 1 <= blockSize) {
                current.end = end;
                current.parts.push(raw);
                curLen += raw.length + 1;
                continue;
            }
            if (current) {
                blocks.push({ start: current.start, end: current.end, text: current.parts.join(' ') });
            }
            current = { start, end, parts: [raw] };
            curLen = raw.length;
        }

        if (current) {
            blocks.push({ start: current.start, end: current.end, text: current.parts.join(' ') });
        }
        return blocks;
    }

    /** Format the full .txt export matching "Youtube a TXT" (title + youtu.be URL + timestamped 200-char blocks). */
    function buildTranscriptTxt(cues, { title = '', videoId = '', blockSize = TD_BLOCK_SIZE } = {}) {
        const blocks = buildTranscriptBlocks(cues, blockSize);
        const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim();
        const url = videoId ? `https://youtu.be/${videoId}` : '';
        const headParts = [cleanTitle, url].filter(Boolean);
        const head = headParts.length ? `${headParts.join('\n')}\n\n` : '';
        const body = blocks
            .map(b => `${formatTranscriptTimestamp(b.start)}\n${b.text}`)
            .join('\n\n');
        return head + body;
    }

    /** Sanitize video publish date and title into a safe Windows/macOS .txt filename. */
    function sanitizeTranscriptFilename(title, publishDate = '0000-00-00') {
        const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(String(publishDate || '').trim());
        const datePrefix = dateMatch ? dateMatch[1] : '0000-00-00';
        const cleanTitle = String(title ?? '')
            .replace(/[\u200b-\u200d\ufeff\u00a0]/g, ' ')
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[. ]+$/g, '')
            .slice(0, 140) || 'Sin titulo';
        return `${datePrefix} ${cleanTitle}.txt`;
    }

    /** Pick the optimal caption track for transcript download relative to the user's IP language. */
    function chooseTranscriptDownloadTrack(captionTracks, userLang = 'es') {
        if (!Array.isArray(captionTracks) || !captionTracks.length) return null;
        const target = normalizeBaseLang(userLang) || 'es';

        const native = findBestNativeCaptionTrack(captionTracks, target);
        if (native) return { ...native, needsTranslate: false };

        const enManual = captionTracks.find(t => normalizeBaseLang(t.languageCode) === 'en' && t.kind !== 'asr');
        if (enManual) return { ...enManual, needsTranslate: target !== 'en' };

        const latinManual = captionTracks.find(t => TD_LATIN_LANG_RE.test(String(t.languageCode || '')) && t.kind !== 'asr');
        if (latinManual) return { ...latinManual, needsTranslate: normalizeBaseLang(latinManual.languageCode) !== target };

        const anyManual = captionTracks.find(t => t.kind !== 'asr');
        if (anyManual) return { ...anyManual, needsTranslate: normalizeBaseLang(anyManual.languageCode) !== target };

        const sourceAuto = findTranslationSourceTrack(captionTracks) || captionTracks[0];
        return {
            ...sourceAuto,
            needsTranslate: normalizeBaseLang(sourceAuto.languageCode) !== target
        };
    }

    function tdEncodeVarint(num) {
        const out = [];
        let n = num >>> 0;
        while (n > 127) {
            out.push((n & 0x7f) | 0x80);
            n >>>= 7;
        }
        out.push(n);
        return out;
    }

    function tdEncodeProtoString(fieldNumber, str) {
        const strVal = String(str ?? '');
        const utf8 = typeof TextEncoder === 'function'
            ? Array.from(new TextEncoder().encode(strVal))
            : Array.from(unescape(encodeURIComponent(strVal)), c => c.charCodeAt(0));
        return [...tdEncodeVarint((fieldNumber << 3) | 2), ...tdEncodeVarint(utf8.length), ...utf8];
    }

    /** Build ordered protobuf parameter candidates for /youtubei/v1/get_transcript fallback queries. */
    function buildGetTranscriptParamsCandidates(videoId, langCode = 'es', kind = 'asr') {
        const vid = String(videoId || '').trim();
        if (!vid) return [];
        const langs = Array.from(new Set([langCode || 'es', 'es', 'es-419', 'en'].filter(Boolean)));
        const kinds = Array.from(new Set([kind ?? 'asr', 'asr', '']));
        const out = [];

        for (const lang of langs.slice(0, 3)) {
            for (const k of kinds.slice(0, 2)) {
                const inner = [
                    ...tdEncodeProtoString(1, k),
                    ...tdEncodeProtoString(2, lang),
                    ...tdEncodeProtoString(3, '')
                ];
                const innerB64 = encodeBase64Bytes(inner);
                out.push(encodeBase64Bytes([...tdEncodeProtoString(1, vid), ...tdEncodeProtoString(2, encodeURIComponent(innerB64)), 0x18, 0x01]));
                out.push(encodeBase64Bytes([...tdEncodeProtoString(1, vid), ...tdEncodeProtoString(2, innerB64), 0x18, 0x01]));
            }
        }
        out.push(encodeBase64Bytes([...tdEncodeProtoString(1, vid), 0x18, 0x01]));
        return Array.from(new Set(out));
    }

    function tdBuildUrlWithParam(rawUrl, key, value) {
        if (!rawUrl) return '';
        const clean = String(rawUrl).replace(/\\u0026/g, '&');
        const re = new RegExp(`([?&])${key}=[^&]*`);
        if (re.test(clean)) return clean.replace(re, `$1${key}=${encodeURIComponent(value)}`);
        return `${clean}${clean.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
    }

    function tdExtractPublishDateFromPr(pr) {
        const mf = pr?.microformat?.playerMicroformatRenderer;
        const raw = mf?.publishDate || mf?.uploadDate || '';
        const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw));
        return m ? m[1] : '0000-00-00';
    }

    function tdCollectTranscriptParams(obj, depth = 0, out = new Set()) {
        if (!obj || typeof obj !== 'object' || depth > 14 || out.size >= 6) return out;
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) tdCollectTranscriptParams(obj[i], depth + 1, out);
            return out;
        }
        if (typeof obj.getTranscriptEndpoint?.params === 'string' && obj.getTranscriptEndpoint.params) {
            out.add(obj.getTranscriptEndpoint.params);
        }
        for (const val of Object.values(obj)) {
            if (val && typeof val === 'object') tdCollectTranscriptParams(val, depth + 1, out);
        }
        return out;
    }

    function tdFindDomTitleAndDate(doc, win, videoId) {
        let title = '';
        let publishDate = '0000-00-00';
        if (!doc) return { title, publishDate };

        const isShorts = isShortsUrl(win?.location?.pathname || '');
        const titleSels = isShorts
            ? [
                'ytd-reel-video-renderer[is-active] yt-shorts-video-title-view-model',
                'ytd-reel-video-renderer[is-active] h2',
                'ytd-reel-video-renderer[is-active] #video-title'
            ]
            : [
                'ytd-watch-metadata h1 yt-formatted-string',
                'ytd-watch-metadata h1',
                '#title h1'
            ];
        for (const sel of titleSels) {
            const el = doc.querySelector?.(sel);
            const txt = String(el?.textContent || '').replace(/\s+/g, ' ').trim();
            if (txt) {
                title = txt;
                break;
            }
        }
        if (!title && doc.title) {
            const cleaned = String(doc.title).replace(/\s*-\s*YouTube$/i, '').trim();
            if (cleaned && !/^YouTube$/i.test(cleaned)) title = cleaned;
        }

        const metaDate = doc.querySelector?.('meta[itemprop="datePublished"], meta[itemprop="uploadDate"]')?.getAttribute?.('content');
        const dm = /^(\d{4}-\d{2}-\d{2})/.exec(String(metaDate || ''));
        if (dm) {
            publishDate = dm[1];
        } else {
            const ldNode = doc.querySelector?.('#microformat script[type="application/ld+json"]');
            const ldMatch = /"uploadDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/.exec(String(ldNode?.textContent || ''));
            if (ldMatch) publishDate = ldMatch[1];
        }

        if (videoId && title === videoId) title = '';
        return { title, publishDate };
    }

    function tdParsePlayerSummary(pr, sourceName) {
        if (!pr || typeof pr !== 'object') return null;
        const vd = pr.videoDetails || {};
        const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        return {
            source: sourceName,
            videoId: vd.videoId || '',
            title: String(vd.title || '').replace(/\s+/g, ' ').trim(),
            publishDate: tdExtractPublishDateFromPr(pr),
            captionTracks: Array.isArray(tracks) ? tracks : [],
            adaptiveFormats: Array.isArray(pr.streamingData?.adaptiveFormats) ? pr.streamingData.adaptiveFormats : []
        };
    }

    function tdGetYtCfg(win) {
        const ytcfg = win?.ytcfg;
        const fullCtx = ytcfg?.get?.('INNERTUBE_CONTEXT') || null;
        const apiKey = ytcfg?.get?.('INNERTUBE_API_KEY') || '';
        const clientVersion = ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_VERSION') || '2.20260401.01.00';
        const clientName = ytcfg?.get?.('INNERTUBE_CONTEXT_CLIENT_NAME') || '1';
        const hl = ytcfg?.get?.('HL') || fullCtx?.client?.hl || 'es';
        const gl = ytcfg?.get?.('GL') || fullCtx?.client?.gl || 'ES';
        const visitorData = ytcfg?.get?.('VISITOR_DATA') || fullCtx?.client?.visitorData || '';
        return { fullCtx, apiKey, clientVersion, clientName, hl, gl, visitorData };
    }

    async function tdPostInnertubeJson({ endpoint, payload, headers = {}, anonymous = false, win, requestFn, timeout = 6500 }) {
        const origin = win?.location?.origin || 'https://www.youtube.com';
        const cfg = tdGetYtCfg(win);
        const keyPart = cfg.apiKey ? `&key=${encodeURIComponent(cfg.apiKey)}` : '';
        const url = `${origin}/youtubei/v1/${endpoint}?prettyPrint=false${keyPart}`;
        const bodyStr = JSON.stringify(payload);
        const reqHeaders = { 'Content-Type': 'application/json', ...headers };

        if (typeof win?.fetch === 'function') {
            try {
                const resp = await win.fetch(url, {
                    method: 'POST',
                    credentials: anonymous ? 'omit' : 'include',
                    headers: reqHeaders,
                    body: bodyStr
                });
                if (resp?.ok) {
                    const txt = typeof resp.text === 'function' ? await resp.text() : JSON.stringify(await resp.json());
                    return { status: resp.status || 200, data: JSON.parse(txt) };
                }
                if (resp?.status === 400 || resp?.status === 403 || resp?.status === 429) {
                    return { status: resp.status, data: null };
                }
            } catch {}
        }

        if (typeof requestFn === 'function') {
            try {
                const res = await requestFn(url, {
                    method: 'POST',
                    headers: reqHeaders,
                    body: bodyStr,
                    anonymous,
                    timeout
                });
                if (res?.status === 200 && res.text) {
                    return { status: 200, data: JSON.parse(res.text) };
                }
                return { status: res?.status || 0, data: null };
            } catch {}
        }
        return { status: 0, data: null };
    }

    async function tdResolveVideoMetadata({ videoId, titleHint = '', dateHint = '0000-00-00', doc, win, requestFn }) {
        const domInfo = tdFindDomTitleAndDate(doc, win, videoId);
        const hasExplicitHint = Boolean(String(titleHint || '').trim());
        let title = String(titleHint || '').trim();
        let publishDate = /^(\d{4}-\d{2}-\d{2})/.test(String(dateHint || '')) && dateHint !== '0000-00-00'
            ? dateHint.slice(0, 10)
            : domInfo.publishDate;
        let captionTracks = [];
        let audioLang = '';

        const absorbPr = pr => {
            if (!pr || (pr.videoDetails?.videoId && pr.videoDetails.videoId !== videoId)) return;
            const summary = tdParsePlayerSummary(pr, 'DOM');
            if (!summary) return;
            if (!hasExplicitHint && summary.title) title = summary.title;
            if (publishDate === '0000-00-00' && summary.publishDate !== '0000-00-00') publishDate = summary.publishDate;
            if (!captionTracks.length && summary.captionTracks.length) captionTracks = summary.captionTracks;
            if (!audioLang) {
                audioLang = detectVideoAudioLang({
                    adaptiveFormats: summary.adaptiveFormats,
                    captionTracks: summary.captionTracks
                });
            }
        };

        const player = selectActivePlayer(doc, win?.location?.pathname || '', videoId);
        try { absorbPr(player?.getPlayerResponse?.()); } catch {}
        try { absorbPr(win?.ytInitialPlayerResponse); } catch {}

        const cfg = tdGetYtCfg(win);
        if (!captionTracks.length || publishDate === '0000-00-00' || !title) {
            const webRes = await tdPostInnertubeJson({
                endpoint: 'player',
                payload: {
                    context: {
                        client: {
                            clientName: 'WEB',
                            clientVersion: cfg.clientVersion,
                            hl: cfg.hl,
                            gl: cfg.gl,
                            ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {})
                        }
                    },
                    videoId,
                    contentCheckOk: true,
                    racyCheckOk: true
                },
                headers: {
                    'X-YouTube-Client-Name': '1',
                    'X-YouTube-Client-Version': String(cfg.clientVersion)
                },
                anonymous: false,
                win,
                requestFn
            });
            absorbPr(webRes.data);
        }

        if (!title) title = domInfo.title;

        const clientTrackSets = [];
        if (captionTracks.length) {
            clientTrackSets.push({ source: 'WEB', tracks: captionTracks });
        }

        // Query ANDROID first, then probe remaining Innertube clients in parallel if needed.
        let checkedMobileClients = false;
        const needsMobileClient = !captionTracks.length;
        if (needsMobileClient) {
            checkedMobileClients = true;
            const results = await tdProbeInnertubeClients(videoId, cfg, win, requestFn);
            for (const { cli, sum } of results) {
                if (!sum) continue;
                if (!title && sum.title) title = sum.title;
                if (publishDate === '0000-00-00' && sum.publishDate !== '0000-00-00') publishDate = sum.publishDate;
                if (!audioLang) {
                    audioLang = detectVideoAudioLang({
                        adaptiveFormats: sum.adaptiveFormats,
                        captionTracks: sum.captionTracks
                    });
                }
                if (sum.captionTracks.length) {
                    clientTrackSets.push({ source: cli.name, tracks: sum.captionTracks });
                    if (!captionTracks.length) captionTracks = sum.captionTracks;
                }
            }
        }

        return {
            title: title || videoId,
            publishDate,
            captionTracks,
            clientTrackSets,
            audioLang,
            checkedMobileClients
        };
    }

    async function tdFetchTrackCues(baseUrl, targetLang, needsTranslate, win, requestFn) {
        if (!baseUrl) return null;
        const formats = ['json3', 'srv3', 'vtt'];
        const urls = [];
        if (needsTranslate && targetLang) {
            for (const fmt of formats) {
                urls.push({ url: tdBuildUrlWithParam(tdBuildUrlWithParam(baseUrl, 'tlang', targetLang), 'fmt', fmt), lang: targetLang });
            }
        }
        for (const fmt of formats) {
            urls.push({ url: tdBuildUrlWithParam(baseUrl, 'fmt', fmt), lang: '' });
        }
        urls.push({ url: String(baseUrl).replace(/\\u0026/g, '&'), lang: '' });

        for (let i = 0; i < urls.length; i++) {
            const entry = urls[i];
            let status = 0;
            let text = '';
            if (typeof win?.fetch === 'function') {
                try {
                    const resp = await win.fetch(entry.url, { credentials: 'include' });
                    status = resp?.status || 0;
                    if (status === 200) text = await resp.text();
                } catch {}
            }
            if (status === 0 && typeof requestFn === 'function') {
                try {
                    const res = await requestFn(entry.url, { method: 'GET', timeout: 6000 });
                    status = res?.status || 0;
                    if (status === 200) text = res.text || '';
                } catch {}
            }
            if (status === 429) {
                return { rateLimited: true, cues: [] };
            }
            if (status === 200 && text) {
                const parsed = parseTimedtextResponseText(text);
                if (parsed.length) return { rateLimited: false, cues: parsed, lang: entry.lang };
            }
        }
        return { rateLimited: false, cues: [] };
    }

    async function tdFetchClientSummary(cli, videoId, cfg, win, requestFn) {
        const res = await tdPostInnertubeJson({
            endpoint: 'player',
            payload: {
                context: {
                    client: {
                        ...cli.context,
                        ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {})
                    },
                    ...(cli.name === 'WEB_EMBEDDED_PLAYER' ? { thirdParty: { embedUrl: 'https://www.youtube.com/' } } : {})
                },
                videoId,
                contentCheckOk: true,
                racyCheckOk: true
            },
            headers: {
                'X-YouTube-Client-Name': cli.id,
                'X-YouTube-Client-Version': cli.context.clientVersion,
                ...(cfg.visitorData ? { 'X-Goog-Visitor-Id': cfg.visitorData } : {})
            },
            anonymous: true,
            win,
            requestFn
        });
        return { cli, sum: tdParsePlayerSummary(res.data, cli.name) };
    }

    async function tdProbeInnertubeClients(videoId, cfg, win, requestFn) {
        if (!TD_INNERTUBE_CLIENTS.length) return [];
        const first = await tdFetchClientSummary(TD_INNERTUBE_CLIENTS[0], videoId, cfg, win, requestFn)
            .catch(() => ({ cli: TD_INNERTUBE_CLIENTS[0], sum: null }));
        if (first?.sum?.captionTracks?.length) return [first];
        const rest = await Promise.all(
            TD_INNERTUBE_CLIENTS.slice(1).map(cli =>
                tdFetchClientSummary(cli, videoId, cfg, win, requestFn).catch(() => ({ cli, sum: null }))
            )
        );
        return [first, ...rest];
    }

    async function tdFetchMobileCaptionTracks(videoId, cfg, win, requestFn) {
        const results = await tdProbeInnertubeClients(videoId, cfg, win, requestFn);
        for (const { sum } of results) {
            if (sum?.captionTracks?.length) return sum.captionTracks;
        }
        return [];
    }

    async function tdFetchViaGetTranscript(videoId, chosenTrack, doc, win, requestFn) {
        const cfg = tdGetYtCfg(win);
        const paramSet = new Set();
        if (win?.ytInitialData) {
            const initialVid = win.ytInitialData?.currentVideoEndpoint?.watchEndpoint?.videoId;
            if (!initialVid || initialVid === videoId) {
                tdCollectTranscriptParams(win.ytInitialData, 0, paramSet);
            }
        }
        if (!paramSet.size) {
            const nextRes = await tdPostInnertubeJson({
                endpoint: 'next',
                payload: {
                    context: cfg.fullCtx || { client: { clientName: 'WEB', clientVersion: cfg.clientVersion, hl: cfg.hl, gl: cfg.gl } },
                    videoId
                },
                headers: { 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': String(cfg.clientVersion) },
                anonymous: false,
                win,
                requestFn
            });
            if (nextRes.data) tdCollectTranscriptParams(nextRes.data, 0, paramSet);
        }
        const hadKnownParam = paramSet.size > 0;
        for (const p of buildGetTranscriptParamsCandidates(videoId, chosenTrack?.languageCode || 'es', chosenTrack?.kind ?? 'asr')) {
            paramSet.add(p);
        }

        const candidates = Array.from(paramSet).slice(0, 5);
        const context = cfg.fullCtx || {
            client: {
                clientName: 'WEB',
                clientVersion: cfg.clientVersion,
                hl: cfg.hl,
                gl: cfg.gl,
                ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {})
            }
        };
        const headers = {
            'X-YouTube-Client-Name': String(cfg.clientName || '1'),
            'X-YouTube-Client-Version': String(cfg.clientVersion)
        };

        const queryTranscript = params => tdPostInnertubeJson({
            endpoint: 'get_transcript',
            payload: { context, params },
            headers,
            anonymous: false,
            win,
            requestFn
        });

        let batch = candidates;
        if (hadKnownParam && candidates.length) {
            const firstRes = await queryTranscript(candidates[0]);
            if (firstRes.data) {
                const parsed = parseTranscriptPanelResponse(firstRes.data);
                if (parsed.length) return parsed;
            }
            if (firstRes.status === 400 || firstRes.status === 403 || firstRes.status === 429) return [];
            batch = candidates.slice(1);
        }
        if (batch.length) {
            const rest = await Promise.all(batch.map(p => queryTranscript(p).catch(() => ({ status: 0, data: null }))));
            for (const res of rest) {
                if (res.data) {
                    const parsed = parseTranscriptPanelResponse(res.data);
                    if (parsed.length) return parsed;
                }
            }
        }
        return [];
    }

    function tdReadDomTranscriptSegments(doc) {
        if (!doc?.querySelectorAll) return [];
        const nodes = doc.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model');
        const cues = [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const tsEl = node.querySelector?.('.segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp');
            const txtEl = node.querySelector?.('.segment-text, yt-formatted-string, span[role="text"], .yt-core-attributed-string');
            const body = String(txtEl?.textContent || '').replace(/\s+/g, ' ').trim();
            if (!body) continue;
            const sec = parseTimestampSeconds(tsEl?.textContent || '0:00');
            cues.push({
                start: Number.isFinite(sec) ? sec : 0,
                end: (Number.isFinite(sec) ? sec : 0) + 3,
                text: body
            });
        }
        return cues;
    }

    function tdLooksLikeSpanish(cues) {
        const sample = cues.slice(0, 12).map(c => String(c.text || '').toLowerCase()).join(' ');
        if (/[áéíóúñü¿¡]/.test(sample)) return true;
        const esHits = (sample.match(/\b(?:que|de|la|el|en|y|un|una|los|las|para|por|con|como|pero|más|este|esta)\b/g) || []).length;
        const enHits = (sample.match(/\b(?:the|and|that|with|this|for|you|are|was|have|from|they|what)\b/g) || []).length;
        return esHits > enHits;
    }

    function tdInferCueLang({ explicitLang, cues, meta, baseUser }) {
        const normExplicit = normalizeBaseLang(explicitLang);
        if (normExplicit) return normExplicit;

        const trackLangs = Array.from(new Set((meta.captionTracks || []).map(t => normalizeBaseLang(t.languageCode)).filter(Boolean)));
        if (trackLangs.length === 1) return trackLangs[0];

        if (baseUser === 'es' && cues.length) {
            return tdLooksLikeSpanish(cues) ? 'es' : (meta.audioLang || 'auto');
        }
        if (meta.audioLang) return meta.audioLang;
        return trackLangs[0] || 'auto';
    }

    async function tdTranslateCuesInBatches(cues, sourceLang, targetLang, requestFn) {
        const translated = [];
        let idx = 0;
        while (idx < cues.length) {
            const batch = [];
            let encodedLen = 0;
            while (idx < cues.length && batch.length < 25) {
                const clean = cleanTranscriptCueText(cues[idx].text, false);
                const cost = encodeURIComponent(`${clean}\n`).length;
                if (batch.length > 0 && encodedLen + cost > 1300) break;
                batch.push({ ...cues[idx], clean });
                encodedLen += cost;
                idx++;
            }
            const texts = batch.map(b => b.clean);
            const outTexts = await translateCueBatch({
                texts,
                sourceLang: sourceLang || 'auto',
                targetLang,
                requestFn
            });
            for (let j = 0; j < batch.length; j++) {
                translated.push({
                    ...batch[j],
                    text: outTexts[j] || batch[j].clean
                });
            }
        }
        return translated;
    }

    function tdIsServerTranslatedResponse(cues, returnedLang, origLang, baseUser) {
        if (!returnedLang || origLang === baseUser) return false;
        if (baseUser !== 'es') return true;
        return tdLooksLikeSpanish(cues);
    }

    /** Shared 7-layer YouTube caption/transcript recovery used by both live subtitles and TXT export. */
    async function tdRecoverRawSubtitleCues({
        videoId,
        userLang = 'es',
        titleHint = '',
        dateHint = '0000-00-00',
        captionTracksHint = [],
        doc = typeof document !== 'undefined' ? document : null,
        win = typeof window !== 'undefined' ? window : null,
        requestFn = gmRequest
    } = {}) {
        const vid = String(videoId || getVideoId(win?.location?.href || '') || '').trim();
        const baseUser = normalizeBaseLang(userLang) || 'es';
        const meta = await tdResolveVideoMetadata({ videoId: vid, titleHint, dateHint, doc, win, requestFn });
        if (!meta.captionTracks.length && Array.isArray(captionTracksHint) && captionTracksHint.length) {
            meta.captionTracks = captionTracksHint;
            if (!meta.audioLang) {
                meta.audioLang = detectVideoAudioLang({ captionTracks: meta.captionTracks });
            }
        }
        const chosen = chooseTranscriptDownloadTrack(meta.captionTracks, baseUser);

        let cues = [];
        let sourceLang = '';
        let alreadyTranslated = false;
        const st = getTtState(win);

        // Layer 1a: Live timedtext cache captured during playback.
        const cachedOrigin = st.originCuesByVid.get(vid);
        if (cachedOrigin?.cues?.length) {
            const cachedBase = normalizeBaseLang(cachedOrigin.lang);
            if (!chosen || normalizeBaseLang(chosen.languageCode) === cachedBase || cachedBase === baseUser) {
                cues = cachedOrigin.cues;
                sourceLang = cachedBase;
            }
        }

        // Layer 1b: Captured / PerformanceObserver PO-token timedtext URL.
        const perfRawUrl = st.rawUrlsByVid.get(vid) || collectPerformanceTimedtextUrl(win, vid);
        if (!cues.length && perfRawUrl && (!st.directBlockedByVid.has(vid) || perfRawUrl.includes('pot=')) && typeof win?.fetch === 'function') {
            try {
                const resp = await win.fetch(perfRawUrl, { credentials: 'include' });
                if (resp?.ok) {
                    const parsed = parseTimedtextResponseText(await resp.text());
                    if (parsed.length) {
                        cues = parsed;
                        sourceLang = normalizeBaseLang(new URL(perfRawUrl).searchParams.get('lang'));
                        st.originCuesByVid.set(vid, { lang: sourceLang, cues: parsed, ts: Date.now() });
                    }
                }
            } catch {}
        }

        // Layer 1c: Direct track fetch on active tracks; retry via ANDROID/IOS/ANDROID_VR/MWEB on empty/429.
        const rateLimited = st.directBlockedByVid.has(vid);
        if (!cues.length && chosen?.baseUrl && !rateLimited) {
            const directRes = await tdFetchTrackCues(chosen.baseUrl, baseUser, chosen.needsTranslate, win, requestFn);
            if (!directRes?.rateLimited && directRes?.cues?.length) {
                cues = directRes.cues;
                const origLang = normalizeBaseLang(chosen.languageCode);
                const serverTranslated = tdIsServerTranslatedResponse(cues, directRes.lang, origLang, baseUser);
                alreadyTranslated = serverTranslated;
                sourceLang = serverTranslated ? normalizeBaseLang(directRes.lang) : origLang;
            }
        }

        if (!cues.length && !meta.checkedMobileClients) {
            const cfg = tdGetYtCfg(win);
            const mobileTracks = await tdFetchMobileCaptionTracks(vid, cfg, win, requestFn);
            if (mobileTracks.length) {
                if (!meta.captionTracks.length) meta.captionTracks = mobileTracks;
                if (!meta.audioLang) meta.audioLang = detectVideoAudioLang({ captionTracks: mobileTracks });
                const mobileChosen = chooseTranscriptDownloadTrack(mobileTracks, baseUser);
                const mobRes = await tdFetchTrackCues(mobileChosen.baseUrl, baseUser, mobileChosen.needsTranslate, win, requestFn);
                if (mobRes?.cues?.length) {
                    cues = mobRes.cues;
                    const origLang = normalizeBaseLang(mobileChosen.languageCode);
                    const serverTranslated = tdIsServerTranslatedResponse(cues, mobRes.lang, origLang, baseUser);
                    alreadyTranslated = serverTranslated;
                    sourceLang = serverTranslated ? normalizeBaseLang(mobRes.lang) : origLang;
                }
            }
        }

        // Layer 1d + 1e: Innertube get_panel and /next + get_transcript in parallel.
        if (!cues.length) {
            const [panelCues, trCues] = await Promise.all([
                fetchTranscriptViaGetPanel(vid, win).catch(() => []),
                tdFetchViaGetTranscript(vid, chosen, doc, win, requestFn).catch(() => [])
            ]);
            const bestCues = panelCues.length ? panelCues : trCues;
            if (bestCues.length) {
                cues = bestCues;
                sourceLang = tdInferCueLang({ explicitLang: '', cues: bestCues, meta, baseUser });
            }
        }

        // Layer 1f: Active /watch DOM transcript panel segments.
        if (!cues.length && !isShortsUrl(win?.location?.pathname || '') && getVideoId(win?.location?.href || '') === vid) {
            const domCues = tdReadDomTranscriptSegments(doc);
            if (domCues.length) {
                cues = domCues;
                sourceLang = tdInferCueLang({ explicitLang: '', cues: domCues, meta, baseUser });
            }
        }

        const effectiveSource = sourceLang || tdInferCueLang({ explicitLang: '', cues, meta, baseUser });
        return {
            videoId: vid,
            segments: cues,
            cues,
            lang: effectiveSource,
            alreadyTranslated,
            audioLang: meta.audioLang || detectVideoAudioLang({ captionTracks: meta.captionTracks }),
            captionTracks: meta.captionTracks,
            meta
        };
    }

    /** Multi-layer single video / Short transcript extractor, translator, and .txt formatter. */
    async function extractVideoTranscript({
        videoId,
        userLang = 'es',
        titleHint = '',
        dateHint = '0000-00-00',
        doc = typeof document !== 'undefined' ? document : null,
        win = typeof window !== 'undefined' ? window : null,
        requestFn = gmRequest
    } = {}) {
        const vid = String(videoId || getVideoId(win?.location?.href || '') || '').trim();
        if (!vid) {
            const err = new Error('No se detectó el ID del video');
            err.noCaptions = true;
            throw err;
        }

        const baseUser = normalizeBaseLang(userLang) || 'es';
        const recovered = await tdRecoverRawSubtitleCues({
            videoId: vid,
            userLang: baseUser,
            titleHint,
            dateHint,
            doc,
            win,
            requestFn
        });
        let cues = recovered.cues;
        const meta = recovered.meta;

        if (!cues.length) {
            const err = new Error('Este video no tiene transcripción ni subtítulos disponibles');
            err.noCaptions = true;
            throw err;
        }

        let translated = Boolean(recovered.alreadyTranslated);
        const effectiveSource = tdInferCueLang({ explicitLang: recovered.lang, cues, meta, baseUser });
        if (!translated && effectiveSource !== baseUser) {
            cues = await tdTranslateCuesInBatches(cues, effectiveSource, baseUser, requestFn);
            translated = true;
        }

        const text = buildTranscriptTxt(cues, {
            title: meta.title,
            videoId: vid,
            blockSize: TD_BLOCK_SIZE
        });
        if (!text.trim()) {
            const err = new Error('Transcripción vacía');
            err.noCaptions = true;
            throw err;
        }

        return {
            videoId: vid,
            title: meta.title,
            publishDate: meta.publishDate,
            lang: translated ? baseUser : effectiveSource,
            translated,
            cueCount: cues.length,
            filename: sanitizeTranscriptFilename(meta.title, meta.publishDate),
            text
        };
    }

    function tdTriggerBlobDownload(doc, content, filename) {
        if (!doc) return;
        const bytes = typeof TextEncoder === 'function'
            ? new TextEncoder().encode(content)
            : content;
        const blob = new Blob([bytes], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        a.addEventListener?.('click', e => e.stopPropagation?.());
        (doc.body || doc.documentElement).appendChild(a);
        a.click();
        setTimeout(() => {
            try { a.remove?.(); } catch {}
            try { URL.revokeObjectURL(url); } catch {}
        }, 10000);
    }

    async function tdCopyTextToClipboard(win, doc, text) {
        if (typeof GM_setClipboard === 'function') {
            try {
                GM_setClipboard(text, 'text');
                return true;
            } catch {}
        }
        try {
            if (win?.navigator?.clipboard?.writeText) {
                await win.navigator.clipboard.writeText(text);
                return true;
            }
        } catch {}
        try {
            if (doc?.createElement && typeof doc.execCommand === 'function') {
                const ta = doc.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                ta.style.pointerEvents = 'none';
                (doc.body || doc.documentElement).appendChild(ta);
                ta.select();
                const ok = doc.execCommand('copy');
                ta.remove();
                return Boolean(ok);
            }
        } catch {}
        return false;
    }

    function tdEnsureStyles(doc) {
        if (!doc?.createElement || doc.getElementById?.(TD_STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = TD_STYLE_ID;
        style.textContent = `
            [${TD_ITEM_ATTR}="1"] {
                display: flex;
                align-items: center;
                gap: 16px;
                box-sizing: border-box;
                width: 100%;
                min-height: 40px;
                padding: 0 16px;
                border: 0;
                margin: 0;
                background: transparent;
                color: var(--yt-spec-text-primary, #0f0f0f);
                font-family: "Roboto", "Arial", sans-serif;
                font-size: 14px;
                font-weight: 400;
                line-height: 20px;
                white-space: nowrap;
                text-align: left;
                cursor: pointer;
                user-select: none;
                transition: background-color 0.12s ease;
            }
            [${TD_ITEM_ATTR}="1"].supratube-td-shorts {
                gap: 12px;
                padding: 0 16px;
                min-height: 40px;
            }
            [${TD_ITEM_ATTR}="1"].supratube-td-watch {
                gap: 16px;
                padding: 0 12px 0 16px;
                min-height: 36px;
            }
            [${TD_ITEM_ATTR}="1"].supratube-td-dark {
                color: var(--yt-spec-text-primary, #f1f1f1);
            }
            [${TD_ITEM_ATTR}="1"]:hover,
            [${TD_ITEM_ATTR}="1"]:focus-visible {
                background-color: var(--yt-spec-10-percent-layer, rgba(128, 128, 128, 0.14));
                outline: none;
            }
            [${TD_ITEM_ATTR}="1"][data-busy="1"] {
                opacity: 0.72;
                cursor: wait;
            }
            [${TD_ITEM_ATTR}="1"] .supratube-td-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                flex-shrink: 0;
                color: inherit;
            }
            [${TD_ITEM_ATTR}="1"] .supratube-td-icon-img {
                display: block;
                width: 22px;
                height: 22px;
                object-fit: contain;
                pointer-events: none;
                filter: brightness(0) invert(0.06);
            }
            html[dark] [${TD_ITEM_ATTR}="1"] .supratube-td-icon-img,
            [${TD_ITEM_ATTR}="1"].supratube-td-dark .supratube-td-icon-img {
                filter: brightness(0) invert(0.945);
            }
            [${TD_ITEM_ATTR}="1"] .supratube-td-label {
                flex: 1 1 auto;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #${TD_TOAST_ID} {
                position: fixed;
                left: 50%;
                bottom: 24px;
                transform: translateX(-50%);
                z-index: 999999;
                padding: 10px 16px;
                border-radius: 8px;
                background: rgba(15, 15, 18, 0.94);
                color: #f8fafc;
                border: 1px solid rgba(255, 255, 255, 0.14);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
                font: 500 13px/1.4 "Roboto", "Arial", sans-serif;
                pointer-events: none;
                white-space: nowrap;
            }
            #${TD_TOAST_ID}[data-kind="error"] {
                border-color: rgba(248, 113, 113, 0.45);
            }
        `;
        (doc.head || doc.documentElement)?.appendChild(style);
    }

    function tdShowToast(doc, message, kind = 'ok', durationMs = 3200) {
        if (!doc?.createElement) return;
        tdEnsureStyles(doc);
        let toast = doc.getElementById?.(TD_TOAST_ID);
        if (!toast) {
            toast = doc.createElement('div');
            toast.id = TD_TOAST_ID;
            (doc.body || doc.documentElement)?.appendChild(toast);
        }
        toast.setAttribute?.('data-kind', kind);
        toast.textContent = message;
        clearTimeout(toast.__supratubeHideTimer);
        toast.__supratubeHideTimer = setTimeout(() => {
            try { toast.remove?.(); } catch {}
        }, durationMs);
    }

    function tdBuildDownloadIcon(doc) {
        const wrap = doc.createElement('span');
        wrap.className = 'supratube-td-icon';
        wrap.setAttribute('aria-hidden', 'true');
        const img = doc.createElement('img');
        img.className = 'supratube-td-icon-img';
        img.src = TD_HEROICON_SVG_URL;
        img.setAttribute('src', TD_HEROICON_SVG_URL);
        img.setAttribute('width', '22');
        img.setAttribute('height', '22');
        img.setAttribute('alt', '');
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('decoding', 'async');
        img.setAttribute('referrerpolicy', 'no-referrer');
        let usedFallback = false;
        img.addEventListener?.('error', () => {
            if (usedFallback) return;
            usedFallback = true;
            img.src = TD_HEROICON_FALLBACK_URL;
            img.setAttribute('src', TD_HEROICON_FALLBACK_URL);
        });
        wrap.appendChild(img);
        return wrap;
    }

    function tdIsDarkTheme(doc, sibColor) {
        const m = String(sibColor || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (m) {
            const lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
            return lum > 128;
        }
        return Boolean(
            doc?.documentElement?.hasAttribute?.('dark') ||
            doc?.documentElement?.hasAttribute?.('darker-dark-theme')
        );
    }

    function tdIsDropdownVisible(dropdown, win) {
        if (!dropdown) return false;
        if (dropdown.getAttribute?.('aria-hidden') === 'true') return false;
        if (dropdown.style?.display === 'none' || dropdown.style?.visibility === 'hidden') return false;
        if (typeof win?.getComputedStyle === 'function') {
            const cs = win.getComputedStyle(dropdown);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        }
        return (dropdown.offsetWidth === undefined || dropdown.offsetWidth > 0) &&
            (dropdown.offsetHeight === undefined || dropdown.offsetHeight > 0);
    }

    function tdIsShortsSubmenu(sheet, listEl) {
        const header = sheet?.querySelector?.('.ytContextualSheetLayoutHeaderContainer');
        if (header) {
            const hdrText = String(header.textContent || '').trim();
            if (hdrText.length > 0 || Boolean(header.querySelector?.('h2, yt-panel-header-view-model'))) {
                return true;
            }
        }
        const items = listEl?.querySelectorAll?.('yt-list-item-view-model') || [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].getAttribute?.(TD_ITEM_ATTR) === '1') continue;
            const role = items[i].getAttribute?.('role');
            if (role === 'menuitemradio' || items[i].getAttribute?.('aria-checked') === 'true') return true;
            const txt = String(items[i].textContent || '').trim();
            if (/^(?:0\.\d+|1\.\d+|2(?:\.0+)?|normal)$/i.test(txt)) return true;
        }
        return false;
    }

    function tdIdentifyMenuTarget(dropdown, win, lastTrigger) {
        const shortsMode = isShortsUrl(win?.location?.pathname || '');
        const sheet = dropdown.querySelector?.('yt-sheet-view-model');
        const sheetList = sheet?.querySelector?.('yt-list-view-model[role="menu"], yt-list-view-model');

        if (shortsMode && sheet && sheetList) {
            if (tdIsShortsSubmenu(sheet, sheetList)) {
                return { ok: false, staleItemContainer: sheetList };
            }
            const pos = dropdown.positionTarget;
            if (pos?.closest?.(TD_FORBIDDEN_CONTAINER_SEL)) return { ok: false };
            const items = sheetList.querySelectorAll?.('yt-list-item-view-model') || [];
            const hasRootAction = Array.from(items).some(el => TD_ROOT_SHORTS_MENU_RE.test(String(el.textContent || '')));
            const fromShortsTrigger = Boolean(pos?.closest?.('ytd-reel-video-renderer, ytd-shorts')) ||
                (lastTrigger?.kind === 'shorts' && Date.now() - lastTrigger.ts < 2500);
            if (!hasRootAction && !fromShortsTrigger) return { ok: false };
            return { ok: true, kind: 'shorts', popup: sheet, listEl: sheetList };
        }

        const menuPopup = dropdown.querySelector?.('ytd-menu-popup-renderer');
        const listbox = menuPopup?.querySelector?.('tp-yt-paper-listbox#items, tp-yt-paper-listbox');
        const watchList = listbox || (sheet && sheetList ? sheetList : null);
        const popupWrapper = menuPopup || sheet;
        if (!watchList || !popupWrapper) return { ok: false };

        const pos = dropdown.positionTarget;
        if (pos) {
            if (pos.closest?.(TD_FORBIDDEN_CONTAINER_SEL)) return { ok: false };
            if (pos.closest?.('ytd-watch-metadata, ytd-video-primary-info-renderer')) {
                return { ok: true, kind: 'watch', popup: popupWrapper, listEl: watchList };
            }
            return { ok: false };
        }

        const recentWatch = lastTrigger?.kind === 'watch' && Date.now() - lastTrigger.ts < 2500;
        const itemTexts = Array.from(watchList.children || []).map(el => String(el.textContent || ''));
        const hasWatchAction = itemTexts.some(t => TD_WATCH_MENU_RE.test(t));
        if (recentWatch || (!shortsMode && hasWatchAction && lastTrigger?.kind !== 'other')) {
            return { ok: true, kind: 'watch', popup: popupWrapper, listEl: watchList };
        }
        return { ok: false };
    }

    function tdExpandPopupBounds(popup, win) {
        if (!popup?.style) return;
        const rect = popup.getBoundingClientRect?.() || {};
        const maxAvailW = Math.max(250, (win?.innerWidth || 1280) - 24);
        const maxAvailH = Math.max(220, (win?.innerHeight || 900) - Math.max(0, Number(rect.top) || 0) - 16);

        const curMaxW = parseFloat(popup.style.maxWidth);
        if (Number.isFinite(curMaxW) && curMaxW > 0 && curMaxW < 250) {
            const nextW = `${Math.min(maxAvailW, 270)}px`;
            if (popup.dataset) {
                if (!Object.prototype.hasOwnProperty.call(popup.dataset, 'supratubeOrigMaxW')) {
                    popup.dataset.supratubeOrigMaxW = popup.style.maxWidth;
                }
                popup.dataset.supratubeSetMaxW = nextW;
            }
            popup.style.maxWidth = nextW;
        }
        const curMaxH = parseFloat(popup.style.maxHeight);
        if (Number.isFinite(curMaxH) && curMaxH > 0) {
            const nextH = `${Math.min(maxAvailH, curMaxH + 56)}px`;
            if (popup.dataset) {
                if (!Object.prototype.hasOwnProperty.call(popup.dataset, 'supratubeOrigMaxH')) {
                    popup.dataset.supratubeOrigMaxH = popup.style.maxHeight;
                }
                popup.dataset.supratubeSetMaxH = nextH;
            }
            popup.style.maxHeight = nextH;
        }
    }

    function tdRestorePopupBounds(popup) {
        if (!popup?.style || !popup.dataset) return;
        if (Object.prototype.hasOwnProperty.call(popup.dataset, 'supratubeOrigMaxW')) {
            if (popup.style.maxWidth === popup.dataset.supratubeSetMaxW) {
                popup.style.maxWidth = popup.dataset.supratubeOrigMaxW;
            }
            delete popup.dataset.supratubeOrigMaxW;
            delete popup.dataset.supratubeSetMaxW;
        }
        if (Object.prototype.hasOwnProperty.call(popup.dataset, 'supratubeOrigMaxH')) {
            if (popup.style.maxHeight === popup.dataset.supratubeSetMaxH) {
                popup.style.maxHeight = popup.dataset.supratubeOrigMaxH;
            }
            delete popup.dataset.supratubeOrigMaxH;
            delete popup.dataset.supratubeSetMaxH;
        }
    }

    function tdFindInsertionRef(listEl, kind) {
        const kids = Array.from(listEl?.children || []);
        if (kind === 'shorts') {
            for (let i = 0; i < kids.length; i++) {
                const txt = String(kids[i].textContent || '');
                if (/subt[ií]tulos|captions|subtitles/i.test(txt)) {
                    return kids[i + 1] || null;
                }
            }
            for (let i = 0; i < kids.length; i++) {
                const txt = String(kids[i].textContent || '');
                if (/descripci[oó]n|description/i.test(txt)) {
                    return kids[i + 1] || null;
                }
            }
        }
        for (let i = 0; i < kids.length; i++) {
            const txt = String(kids[i].textContent || '');
            if (/denunciar|report|no me interesa|not interested/i.test(txt)) {
                return kids[i];
            }
        }
        return null;
    }

    function tdCreateMenuItem(doc, kind, siblingHeight, siblingColor, isDark, onActivate) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = `supratube-td-menuitem supratube-td-${kind === 'watch' ? 'watch' : 'shorts'}${isDark ? ' supratube-td-dark' : ''}`;
        btn.setAttribute('role', 'menuitem');
        btn.setAttribute(TD_ITEM_ATTR, '1');
        if (siblingHeight >= 34 && siblingHeight <= 56) {
            btn.style.minHeight = `${siblingHeight}px`;
        }
        if (siblingColor && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(siblingColor)) {
            btn.style.color = siblingColor;
        }

        const icon = tdBuildDownloadIcon(doc);
        const label = doc.createElement('span');
        label.className = 'supratube-td-label';
        label.textContent = 'Descargar transcripción';

        btn.appendChild(icon);
        btn.appendChild(label);
        btn.addEventListener('click', ev => {
            ev.preventDefault?.();
            ev.stopPropagation?.();
            onActivate(btn, label);
        });
        return btn;
    }

    /** Create lifecycle controller that injects Descargar transcripción into Shorts and /watch 3-dots menus. */
    function createTranscriptDownloadController({
        doc = typeof document !== 'undefined' ? document : null,
        win = typeof window !== 'undefined' ? window : null,
        getUserLang = () => 'es',
        requestFn = gmRequest,
        downloadFile = (content, filename) => tdTriggerBlobDownload(doc, content, filename),
        copyText = txt => tdCopyTextToClipboard(win, doc, txt),
        extractorFn = extractVideoTranscript
    } = {}) {
        let enabled = false;
        let lastTrigger = { kind: '', ts: 0 };
        let observer = null;
        let scanScheduled = false;

        const onDocClickCapture = ev => {
            const target = ev?.target;
            if (!target?.closest) return;
            const watchBtn = target.closest('ytd-menu-renderer.ytd-watch-metadata button, ytd-video-primary-info-renderer ytd-menu-renderer button');
            if (watchBtn) {
                lastTrigger = { kind: 'watch', ts: Date.now() };
                scheduleScan();
                return;
            }
            const forbidden = target.closest(TD_FORBIDDEN_CONTAINER_SEL);
            if (forbidden) {
                lastTrigger = { kind: 'other', ts: Date.now() };
                return;
            }
            const shortsBtn = target.closest('ytd-reel-video-renderer button, ytd-shorts button');
            if (shortsBtn) {
                const al = `${shortsBtn.getAttribute?.('aria-label') || ''} ${shortsBtn.title || ''}`;
                if (/m[aá]s|more|acciones|actions|menu/i.test(al)) {
                    lastTrigger = { kind: 'shorts', ts: Date.now() };
                    scheduleScan();
                }
            }
        };

        const handleActivate = async (btn, labelEl, dropdown) => {
            if (btn.getAttribute('data-busy') === '1') return;
            const vid = getVideoId(win?.location?.href || '');
            if (!vid) {
                tdShowToast(doc, 'No se detectó un video activo', 'error');
                return;
            }

            btn.setAttribute('data-busy', '1');
            labelEl.textContent = 'Extrayendo transcripción...';

            try {
                const result = await extractorFn({
                    videoId: vid,
                    userLang: typeof getUserLang === 'function' ? getUserLang() : 'es',
                    doc,
                    win,
                    requestFn
                });
                downloadFile(result.text, result.filename);
                const copied = await copyText(result.text).catch(() => false);
                labelEl.textContent = copied ? '✓ Descargado y copiado' : '✓ TXT descargado';
                tdShowToast(
                    doc,
                    copied ? '✓ Transcripción descargada y copiada al portapapeles' : '✓ Transcripción descargada en TXT',
                    'ok'
                );
                setTimeout(() => {
                    try { dropdown?.close?.(); } catch {}
                    labelEl.textContent = 'Descargar transcripción';
                    btn.removeAttribute?.('data-busy');
                }, 650);
            } catch (err) {
                const msg = err?.noCaptions
                    ? 'Este video no tiene subtítulos ni transcripción disponible'
                    : (err?.message || 'Error al extraer la transcripción');
                labelEl.textContent = err?.noCaptions ? 'Sin subtítulos disponibles' : 'Error al extraer';
                tdShowToast(doc, msg, 'error', 3800);
                setTimeout(() => {
                    labelEl.textContent = 'Descargar transcripción';
                    btn.removeAttribute?.('data-busy');
                }, 1800);
            }
        };

        const cleanupDropdown = dd => {
            const stale = dd?.querySelectorAll?.(`[${TD_ITEM_ATTR}="1"]`) || [];
            for (let j = 0; j < stale.length; j++) {
                try { stale[j].remove(); } catch {}
            }
            const popups = dd?.querySelectorAll?.('yt-sheet-view-model, ytd-menu-popup-renderer') || [];
            for (let j = 0; j < popups.length; j++) {
                tdRestorePopupBounds(popups[j]);
            }
        };

        const removeInjectedItems = () => {
            const dropdowns = doc?.querySelectorAll?.('tp-yt-iron-dropdown') || [];
            for (let i = 0; i < dropdowns.length; i++) {
                cleanupDropdown(dropdowns[i]);
            }
            const items = doc?.querySelectorAll?.(`[${TD_ITEM_ATTR}="1"]`) || [];
            for (let i = 0; i < items.length; i++) {
                try { items[i].remove(); } catch {}
            }
        };

        const scan = () => {
            if (!doc) return;
            if (!enabled) {
                removeInjectedItems();
                return;
            }

            const collectMenuHosts = () => {
                const seen = new Set();
                const out = [];
                const dropdowns = doc.querySelectorAll?.('tp-yt-iron-dropdown') || [];
                for (let i = 0; i < dropdowns.length; i++) {
                    if (!seen.has(dropdowns[i])) {
                        seen.add(dropdowns[i]);
                        out.push(dropdowns[i]);
                    }
                }
                const sheets = doc.querySelectorAll?.('yt-sheet-view-model') || [];
                for (let i = 0; i < sheets.length; i++) {
                    if (sheets[i].closest?.('tp-yt-iron-dropdown')) continue;
                    const host = sheets[i].parentElement || sheets[i];
                    if (!seen.has(host)) {
                        seen.add(host);
                        out.push(host);
                    }
                }
                return out;
            };

            const dropdowns = collectMenuHosts();
            for (let i = 0; i < dropdowns.length; i++) {
                const dd = dropdowns[i];
                if (!tdIsDropdownVisible(dd, win)) {
                    cleanupDropdown(dd);
                    continue;
                }
                const match = tdIdentifyMenuTarget(dd, win, lastTrigger);
                if (!match.ok) {
                    cleanupDropdown(dd);
                    continue;
                }
                if (match.listEl.querySelector?.(`[${TD_ITEM_ATTR}="1"]`)) continue;

                tdEnsureStyles(doc);
                tdExpandPopupBounds(match.popup, win);

                const sampleItem = match.listEl.querySelector?.('yt-list-item-view-model, ytd-menu-service-item-renderer, tp-yt-paper-item');
                const sibH = sampleItem?.getBoundingClientRect?.().height || (match.kind === 'watch' ? 36 : 40);
                const sampleTextHost = sampleItem?.querySelector?.('.ytListItemViewModelTitle, .ytAttributedStringHost, .yt-core-attributed-string, yt-formatted-string') || sampleItem;
                const sibColor = sampleTextHost && typeof win?.getComputedStyle === 'function'
                    ? (win.getComputedStyle(sampleTextHost)?.color || '')
                    : '';
                const isDark = tdIsDarkTheme(doc, sibColor);
                const itemEl = tdCreateMenuItem(doc, match.kind, Math.round(sibH), sibColor, isDark, (btn, labelEl) => {
                    handleActivate(btn, labelEl, dd);
                });
                const refNode = tdFindInsertionRef(match.listEl, match.kind);
                if (refNode && typeof match.listEl.insertBefore === 'function') {
                    match.listEl.insertBefore(itemEl, refNode);
                } else {
                    match.listEl.appendChild(itemEl);
                }
            }
        };

        const scheduleScan = () => {
            if (scanScheduled || !enabled) return;
            scanScheduled = true;
            setTimeout(() => {
                scanScheduled = false;
                scan();
            }, 40);
        };

        const ensureListenersAndObserver = () => {
            if (!doc) return;
            if (!observer && typeof win?.MutationObserver === 'function') {
                doc.addEventListener?.('click', onDocClickCapture, true);
                observer = new win.MutationObserver(() => scheduleScan());
                const root = doc.body || doc.documentElement || doc.querySelector?.('ytd-popup-container');
                if (root) {
                    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'aria-hidden'] });
                }
            }
        };

        const setEnabled = val => {
            enabled = Boolean(val);
            if (enabled) {
                ensureListenersAndObserver();
                scan();
            } else {
                removeInjectedItems();
            }
        };

        const destroy = () => {
            enabled = false;
            removeInjectedItems();
            try { doc?.getElementById?.(TD_TOAST_ID)?.remove?.(); } catch {}
            try { doc?.removeEventListener?.('click', onDocClickCapture, true); } catch {}
            if (observer) {
                try { observer.disconnect(); } catch {}
                observer = null;
            }
        };

        return { setEnabled, scan, destroy };
    }

    return {
        TD_STYLE_ID,
        TD_ITEM_ATTR,
        TD_TOAST_ID,
        TD_BLOCK_SIZE,
        TD_HEROICON_SVG_URL,
        TD_HEROICON_FALLBACK_URL,
        TD_INNERTUBE_CLIENTS,
        cleanTranscriptCueText,
        formatTranscriptTimestamp,
        buildTranscriptBlocks,
        buildTranscriptTxt,
        sanitizeTranscriptFilename,
        chooseTranscriptDownloadTrack,
        buildGetTranscriptParamsCandidates,
        tdRecoverRawSubtitleCues,
        extractVideoTranscript,
        createTranscriptDownloadController
    };
})();
