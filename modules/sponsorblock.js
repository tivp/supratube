import { CFG, SPONSOR_CATEGORIES, SPONSOR_ACTION_TYPES, SPONSOR_COLORS } from './config.js';
import { gmRequest } from './utils.js';

export function parseSponsorSegments(rawText, videoId) {
    try {
        const data = JSON.parse(rawText);
        let segs = [];
        if (Array.isArray(data) && data[0]?.segments) {
            const match = data.find(d => d.videoID === videoId);
            segs = match?.segments || [];
        } else if (Array.isArray(data) && data[0]?.segment) {
            segs = data;
        }
        return segs
            .filter(s => Array.isArray(s?.segment) && s.segment.length >= 2 && s.segment[1] > s.segment[0])
            .map(s => ({
                start: Number(s.segment[0]),
                end: Number(s.segment[1]),
                cat: s.category || 'sponsor',
                actionType: s.actionType || 'skip',
                uuid: s.UUID || `${s.segment[0]}-${s.segment[1]}`
            }))
            .sort((a, b) => a.start - b.start);
    } catch {
        return [];
    }
}

export function computeSegmentLayout(seg, duration) {
    const dur = Number(duration) || 0;
    if (!dur || dur <= 0) return null;
    const start = Math.max(0, Math.min(dur, Number(seg.start) || 0));
    const end = Math.max(start, Math.min(dur, Number(seg.end) || 0));
    if (end <= start) return null;
    return {
        leftPct: (start / dur) * 100,
        widthPct: ((end - start) / dur) * 100,
        color: SPONSOR_COLORS[seg.cat] || '#00d400'
    };
}

export function findSegmentToActOn(segments, currentTime, state) {
    if (!Array.isArray(segments) || !segments.length) return null;
    let activeSkipMatch = null;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.actionType === 'skip' && currentTime >= seg.start && currentTime < seg.end - 0.15) {
            activeSkipMatch = seg;
            break;
        }
    }
    if (!activeSkipMatch) {
        state.lastSkippedUuid = null;
        return null;
    }
    if (state.lastSkippedUuid === activeSkipMatch.uuid) {
        return null;
    }
    return activeSkipMatch;
}

export async function sha256Prefix(str) {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 4);
    } catch {
        return null;
    }
}

export async function fetchSponsorSegments(videoId, cacheMap = new Map()) {
    if (!videoId) return [];
    const cached = cacheMap.get(videoId);
    if (cached && Date.now() - cached.ts < CFG.sbCacheTTL) {
        return cached.segs;
    }

    const cats = `categories=${encodeURIComponent(JSON.stringify(SPONSOR_CATEGORIES))}`;
    const acts = `actionTypes=${encodeURIComponent(JSON.stringify(SPONSOR_ACTION_TYPES))}`;
    const prefix = await sha256Prefix(videoId);
    const urls = prefix
        ? [`${CFG.sbApi}/${prefix}?${cats}&${acts}`, `${CFG.sbApi}?videoID=${encodeURIComponent(videoId)}&${cats}&${acts}`]
        : [`${CFG.sbApi}?videoID=${encodeURIComponent(videoId)}&${cats}&${acts}`];

    for (let i = 0; i < urls.length; i++) {
        try {
            const res = await gmRequest(urls[i], { anonymous: true, timeout: 8000 });
            if (res.status === 200) {
                const segs = parseSponsorSegments(res.text, videoId);
                cacheMap.set(videoId, { ts: Date.now(), segs });
                return segs;
            }
            if (res.status === 404) {
                cacheMap.set(videoId, { ts: Date.now(), segs: [] });
                return [];
            }
        } catch {}
    }
    return [];
}

let _sbBarCssInjected = false;

export function injectSponsorBarStyles(doc = typeof document !== 'undefined' ? document : null) {
    if (_sbBarCssInjected || !doc) return;
    const css = `
        #supratube-sb-track {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            list-style: none;
            overflow: visible;
            pointer-events: none;
            z-index: 42;
            transform: scaleY(0.6);
            transform-origin: center;
            transition: transform 0.1s cubic-bezier(0, 0, 0.2, 1);
        }
        .ytp-big-mode #supratube-sb-track {
            transform: scaleY(0.625);
        }
        .ytp-delhi-modern #supratube-sb-track {
            transform: scaleY(0.667);
        }
        .ytp-progress-bar:hover #supratube-sb-track,
        .ytp-progress-bar-container:hover #supratube-sb-track,
        .ytp-drag #supratube-sb-track {
            transform: scaleY(1);
        }
        .progress-bar-line #supratube-sb-track,
        .advancement-bar-line #supratube-sb-track {
            transform: none;
        }
        .supratube-sb-segment {
            position: absolute;
            top: 0;
            bottom: 0;
            height: 100%;
            min-width: 1px;
            opacity: 0.85;
            pointer-events: none;
        }
    `;
    try {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
            _sbBarCssInjected = true;
            return;
        }
    } catch {}
    const target = doc.head || doc.documentElement;
    if (!target) return;
    const style = doc.createElement('style');
    style.id = 'supratube-sb-css';
    style.textContent = css;
    target.appendChild(style);
    _sbBarCssInjected = true;
}

export function renderGreenProgressBar(segments, duration, doc = typeof document !== 'undefined' ? document : null, enabled = true) {
    if (!doc) return;
    const existing = doc.getElementById('supratube-sb-track');
    if (!enabled || !duration || duration <= 0 || !Array.isArray(segments) || !segments.length) {
        if (existing) existing.remove();
        return;
    }

    injectSponsorBarStyles(doc);
    const bar =
        doc.querySelector('#movie_player .ytp-progress-bar') ||
        doc.querySelector('.ytp-progress-bar') ||
        doc.querySelector('.progress-bar-line') ||
        doc.querySelector('.advancement-bar-line');
    if (!bar) return;

    const track = existing || doc.createElement('ul');
    track.id = 'supratube-sb-track';
    track.setAttribute('aria-hidden', 'true');
    if (track.parentElement !== bar) {
        try {
            const pos = typeof getComputedStyle === 'function' ? getComputedStyle(bar).position : '';
            if (pos === 'static') bar.style.position = 'relative';
        } catch {}
        bar.appendChild(track);
    }

    const frag = doc.createDocumentFragment();
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const layout = computeSegmentLayout(seg, duration);
        if (!layout) continue;
        const li = doc.createElement('li');
        li.className = 'supratube-sb-segment';
        li.style.left = `${layout.leftPct}%`;
        li.style.width = `${layout.widthPct}%`;
        li.style.backgroundColor = layout.color;
        li.title = `${seg.cat} (${Math.round(seg.start)}s-${Math.round(seg.end)}s)`;
        frag.appendChild(li);
    }
    track.replaceChildren(frag);
}

export function tickSponsorBlock({ video, segments, state, enabled }) {
    if (!enabled || !video || video.paused || !Array.isArray(segments) || !segments.length) return;
    const t = video.currentTime;

    const muteSeg = segments.find(s => s.actionType === 'mute' && t >= s.start && t < s.end - 0.1);
    if (muteSeg) {
        if (state.mutedSegUuid !== muteSeg.uuid) {
            state.mutedSegUuid = muteSeg.uuid;
            state.prevVolume = typeof video.volume === 'number' ? video.volume : 1;
            video.muted = true;
        }
    } else if (state.mutedSegUuid) {
        video.muted = false;
        video.volume = state.prevVolume;
        state.mutedSegUuid = null;
    }

    const skipSeg = findSegmentToActOn(segments, t, state);
    if (skipSeg) {
        state.lastSkippedUuid = skipSeg.uuid;
        video.currentTime = skipSeg.end;
    }
}
