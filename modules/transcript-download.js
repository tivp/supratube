import { getVideoId, isShortsUrl, selectActivePlayer, normalizeBaseLang, gmRequest } from './utils.js';
import {
    decodeHtmlEntities,
    parseTimedtextResponseText,
    parseTranscriptPanelResponse,
    parseTimestampSeconds,
    encodeBase64Bytes,
    getTtState,
    translateCueBatch,
    fetchTranscriptViaGetPanel,
    findBestNativeCaptionTrack,
    findTranslationSourceTrack,
    detectVideoAudioLang
} from './subtitles.js';

export const TD_STYLE_ID = 'supratube-td-style';
export const TD_ITEM_ATTR = 'data-supratube-td-item';
export const TD_TOAST_ID = 'supratube-td-toast';
export const TD_BLOCK_SIZE = 200;

export const TD_INNERTUBE_CLIENTS = Object.freeze([
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
export function cleanTranscriptCueText(rawText, cleanNoise = true) {
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
export function formatTranscriptTimestamp(seconds) {
    const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    const p2 = n => String(n).padStart(2, '0');
    if (hours > 0) return `${hours}:${p2(minutes)}:${p2(secs)}`;
    return `${minutes}:${p2(secs)}`;
}

/** Group subtitle cues into readable <= blockSize character chunks preserving start/end timestamps. */
export function buildTranscriptBlocks(cues, blockSize = TD_BLOCK_SIZE) {
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
export function buildTranscriptTxt(cues, { title = '', videoId = '', blockSize = TD_BLOCK_SIZE } = {}) {
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
export function sanitizeTranscriptFilename(title, publishDate = '0000-00-00') {
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
export function chooseTranscriptDownloadTrack(captionTracks, userLang = 'es') {
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
export function buildGetTranscriptParamsCandidates(videoId, langCode = 'es', kind = 'asr') {
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

    // Query ANDROID/IOS/MWEB/WEB_EMBEDDED_PLAYER when tracks are missing or need PO-token-free URLs.
    const needsMobileClient = !captionTracks.length;
    if (needsMobileClient) {
        for (let i = 0; i < TD_INNERTUBE_CLIENTS.length; i++) {
            const cli = TD_INNERTUBE_CLIENTS[i];
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
            const sum = tdParsePlayerSummary(res.data, cli.name);
            if (sum) {
                if (!title && sum.title) title = sum.title;
                if (publishDate === '0000-00-00' && sum.publishDate !== '0000-00-00') publishDate = sum.publishDate;
                if (sum.captionTracks.length) {
                    clientTrackSets.push({ source: cli.name, tracks: sum.captionTracks });
                    if (!captionTracks.length) captionTracks = sum.captionTracks;
                    break;
                }
            }
        }
    }

    return {
        title: title || videoId,
        publishDate,
        captionTracks,
        clientTrackSets,
        audioLang
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

async function tdFetchMobileCaptionTracks(videoId, cfg, win, requestFn) {
    for (let i = 0; i < TD_INNERTUBE_CLIENTS.length; i++) {
        const cli = TD_INNERTUBE_CLIENTS[i];
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
        const sum = tdParsePlayerSummary(res.data, cli.name);
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

    for (let i = 0; i < candidates.length; i++) {
        const res = await tdPostInnertubeJson({
            endpoint: 'get_transcript',
            payload: { context, params: candidates[i] },
            headers,
            anonymous: false,
            win,
            requestFn
        });
        if (res.status === 400 || res.status === 403 || res.status === 429) break;
        if (res.data) {
            const parsed = parseTranscriptPanelResponse(res.data);
            if (parsed.length) return parsed;
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

/** Multi-layer single video / Short transcript extractor, translator, and .txt formatter. */
export async function extractVideoTranscript({
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
    const meta = await tdResolveVideoMetadata({ videoId: vid, titleHint, dateHint, doc, win, requestFn });
    const chosen = chooseTranscriptDownloadTrack(meta.captionTracks, baseUser);

    let cues = [];
    let sourceLang = '';
    const st = getTtState(win);

    // Layer 1: Live timedtext cache captured during playback.
    const cachedOrigin = st.originCuesByVid.get(vid);
    if (cachedOrigin?.cues?.length) {
        const cachedBase = normalizeBaseLang(cachedOrigin.lang);
        if (!chosen || normalizeBaseLang(chosen.languageCode) === cachedBase || cachedBase === baseUser) {
            cues = cachedOrigin.cues;
            sourceLang = cachedBase;
        }
    }

    // Layer 2: Direct track fetch on active tracks; on 429 or missing direct URL, retry via ANDROID/IOS/MWEB clients.
    let rateLimited = st.directBlockedByVid.has(vid);
    if (!cues.length && chosen?.baseUrl && !rateLimited) {
        const directRes = await tdFetchTrackCues(chosen.baseUrl, baseUser, chosen.needsTranslate, win, requestFn);
        if (directRes?.rateLimited) {
            rateLimited = true;
        } else if (directRes?.cues?.length) {
            cues = directRes.cues;
            const origLang = normalizeBaseLang(chosen.languageCode);
            const serverTranslated = directRes.lang && origLang !== baseUser &&
                (baseUser !== 'es' || cues.length < 2 || tdLooksLikeSpanish(cues));
            sourceLang = serverTranslated ? normalizeBaseLang(directRes.lang) : origLang;
        }
    }

    if (!cues.length) {
        const cfg = tdGetYtCfg(win);
        const mobileTracks = await tdFetchMobileCaptionTracks(vid, cfg, win, requestFn);
        if (mobileTracks.length) {
            if (!meta.captionTracks.length) meta.captionTracks = mobileTracks;
            const mobileChosen = chooseTranscriptDownloadTrack(mobileTracks, baseUser);
            const mobRes = await tdFetchTrackCues(mobileChosen.baseUrl, baseUser, mobileChosen.needsTranslate, win, requestFn);
            if (mobRes?.cues?.length) {
                cues = mobRes.cues;
                const origLang = normalizeBaseLang(mobileChosen.languageCode);
                const serverTranslated = mobRes.lang && origLang !== baseUser &&
                    (baseUser !== 'es' || cues.length < 2 || tdLooksLikeSpanish(cues));
                sourceLang = serverTranslated ? normalizeBaseLang(mobRes.lang) : origLang;
            }
        }
    }

    // Layer 3: Innertube /youtubei/v1/get_panel (PAmodern_transcript_view).
    if (!cues.length) {
        const panelCues = await fetchTranscriptViaGetPanel(vid, win).catch(() => []);
        if (panelCues.length) {
            cues = panelCues;
            sourceLang = tdInferCueLang({ explicitLang: '', cues: panelCues, meta, baseUser });
        }
    }

    // Layer 4: Innertube /next + /youtubei/v1/get_transcript.
    if (!cues.length) {
        const trCues = await tdFetchViaGetTranscript(vid, chosen, doc, win, requestFn);
        if (trCues.length) {
            cues = trCues;
            sourceLang = tdInferCueLang({ explicitLang: '', cues: trCues, meta, baseUser });
        }
    }

    // Layer 5: Active /watch DOM transcript panel segments.
    if (!cues.length && !isShortsUrl(win?.location?.pathname || '') && getVideoId(win?.location?.href || '') === vid) {
        const domCues = tdReadDomTranscriptSegments(doc);
        if (domCues.length) {
            cues = domCues;
            sourceLang = tdInferCueLang({ explicitLang: '', cues: domCues, meta, baseUser });
        }
    }

    if (!cues.length) {
        const err = new Error('Este video no tiene transcripción ni subtítulos disponibles');
        err.noCaptions = true;
        throw err;
    }

    let translated = false;
    const effectiveSource = tdInferCueLang({ explicitLang: sourceLang, cues, meta, baseUser });
    if (effectiveSource !== baseUser) {
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
            fill: currentColor;
            color: inherit;
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

function tdBuildDownloadIconSvg(doc) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const wrap = doc.createElement('span');
    wrap.className = 'supratube-td-icon';
    wrap.setAttribute('aria-hidden', 'true');
    const createSvg = typeof doc.createElementNS === 'function'
        ? tag => doc.createElementNS(svgNs, tag)
        : tag => doc.createElement(tag);
    const svg = createSvg('svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    const path = createSvg('path');
    // Material transcript / text-file icon cleanly matching YouTube 24px stroke geometry.
    path.setAttribute(
        'd',
        'M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.414a2 2 0 0 0-.586-1.414l-4.414-4.414A2 2 0 0 0 13.586 2H6Zm0 2h7v4a1 1 0 0 0 1 1h4v11H6V4Zm2 7a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H8Zm0 4a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H8Z'
    );
    svg.appendChild(path);
    wrap.appendChild(svg);
    return wrap;
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
        if (hdrText.length > 0 || (header.children && header.children.length > 0)) {
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

function tdCreateMenuItem(doc, kind, siblingHeight, siblingColor, onActivate) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = `supratube-td-menuitem supratube-td-${kind === 'watch' ? 'watch' : 'shorts'}`;
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute(TD_ITEM_ATTR, '1');
    if (siblingHeight >= 34 && siblingHeight <= 56) {
        btn.style.minHeight = `${siblingHeight}px`;
    }
    if (siblingColor && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(siblingColor)) {
        btn.style.color = siblingColor;
    }

    const icon = tdBuildDownloadIconSvg(doc);
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
export function createTranscriptDownloadController({
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

        const dropdowns = doc.querySelectorAll?.('tp-yt-iron-dropdown') || [];
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
            const sampleTextHost = sampleItem?.querySelector?.('.yt-core-attributed-string, yt-formatted-string') || sampleItem;
            const sibColor = sampleTextHost && typeof win?.getComputedStyle === 'function'
                ? (win.getComputedStyle(sampleTextHost)?.color || '')
                : '';
            const itemEl = tdCreateMenuItem(doc, match.kind, Math.round(sibH), sibColor, (btn, labelEl) => {
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
            const root = doc.querySelector?.('ytd-popup-container') || doc.body || doc.documentElement;
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
