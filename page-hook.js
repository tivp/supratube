// Provee GM_xmlhttpRequest, GM_addStyle, GM_getValue y GM_setValue en el mundo MAIN.

(() => {
    'use strict';

    if (typeof window !== 'undefined' && window.top !== window.self) {
        return;
    }

    if (window.__supratubeGmPolyfillReady) {
        return;
    }
    window.__supratubeGmPolyfillReady = true;

    let reqSeq = 0;
    const memStore = new Map();

    if (typeof window.GM_xmlhttpRequest !== 'function') {
        window.GM_xmlhttpRequest = function (detalles) {
            const opts = detalles || {};
            const requestId = `st_${++reqSeq}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const eventName = `supratube-bridge-res-${requestId}`;
            let terminado = false;
            let timer = null;

            const limpiar = () => {
                clearTimeout(timer);
                window.removeEventListener(eventName, onResp);
            };

            const onResp = ev => {
                if (terminado) return;
                terminado = true;
                limpiar();

                const payload = ev.detail || {};
                if (payload.error) {
                    if (/tiempo agotado/i.test(payload.error) && typeof opts.ontimeout === 'function') {
                        opts.ontimeout();
                    } else if (typeof opts.onerror === 'function') {
                        opts.onerror(payload);
                    }
                    return;
                }

                if (typeof opts.onload === 'function') {
                    opts.onload({
                        status: payload.status ?? 0,
                        responseText: payload.text ?? '',
                        finalUrl: payload.finalUrl || opts.url
                    });
                }
            };

            window.addEventListener(eventName, onResp);

            const timeoutMs = Number(opts.timeout) || 12000;
            timer = setTimeout(() => {
                if (terminado) return;
                terminado = true;
                limpiar();
                window.dispatchEvent(new CustomEvent('supratube-bridge-abort', { detail: { requestId } }));
                if (typeof opts.ontimeout === 'function') {
                    opts.ontimeout();
                }
            }, timeoutMs + 500);

            window.dispatchEvent(
                new CustomEvent('supratube-bridge-http', {
                    detail: {
                        requestId,
                        url: opts.url,
                        method: opts.method || 'GET',
                        headers: opts.headers ? { ...opts.headers } : {},
                        body: opts.data,
                        anonymous: Boolean(opts.anonymous),
                        timeout: timeoutMs
                    }
                })
            );

            return {
                abort() {
                    if (terminado) return;
                    terminado = true;
                    limpiar();
                    window.dispatchEvent(new CustomEvent('supratube-bridge-abort', { detail: { requestId } }));
                    if (typeof opts.onabort === 'function') {
                        opts.onabort();
                    }
                }
            };
        };
    }

    if (typeof window.GM_addStyle !== 'function') {
        window.GM_addStyle = function (cssText) {
            const style = document.createElement('style');
            style.textContent = String(cssText ?? '');
            const parent = document.head || document.documentElement;
            if (parent) parent.appendChild(style);
            return style;
        };
    }

    if (typeof window.GM_getValue !== 'function') {
        window.GM_getValue = function (clave, defecto) {
            try {
                const raw = localStorage.getItem(`supratube_gm_${clave}`);
                if (raw !== null) return JSON.parse(raw);
            } catch {
                // Respaldo en memoria si localStorage no está disponible.
            }
            return memStore.has(clave) ? memStore.get(clave) : defecto;
        };
    }

    if (typeof window.GM_setValue !== 'function') {
        window.GM_setValue = function (clave, valor) {
            memStore.set(clave, valor);
            try {
                localStorage.setItem(`supratube_gm_${clave}`, JSON.stringify(valor));
            } catch {
                // Ignorar error de cuota o almacenamiento privado.
            }
        };
    }

    if (!window.__supratubeAudioTap && typeof MediaSource === 'function' && typeof SourceBuffer === 'function') {
        const MAX_TAP_BYTES = 14 * 1024 * 1024;
        const entries = [];
        const sbMap = new WeakMap();
        let entrySeq = 0;
        let segSeq = 0;
        let totalTapBytes = 0;

        const getCurVid = () => {
            try {
                const href = String(window.location?.href || '');
                const u = new URL(href);
                if (u.searchParams.get('v')) return u.searchParams.get('v');
                const m = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/);
                if (m) return m[1];
            } catch {}
            return '';
        };

        const snapshotBuffered = tr => {
            const out = [];
            try {
                const len = Number(tr?.length) || 0;
                for (let i = 0; i < len; i++) {
                    out.push([Number(tr.start(i)) || 0, Number(tr.end(i)) || 0]);
                }
            } catch {}
            return out;
        };

        const diffBuffered = (before, after) => {
            let best = null;
            for (let i = 0; i < after.length; i++) {
                let s = after[i][0];
                let e = after[i][1];
                let chunks = [[s, e]];
                for (let j = 0; j < before.length; j++) {
                    const bs = before[j][0];
                    const be = before[j][1];
                    const next = [];
                    for (let k = 0; k < chunks.length; k++) {
                        const [cs, ce] = chunks[k];
                        if (be <= cs || bs >= ce) {
                            next.push([cs, ce]);
                        } else {
                            if (bs > cs) next.push([cs, Math.min(bs, ce)]);
                            if (be < ce) next.push([Math.max(be, cs), ce]);
                        }
                    }
                    chunks = next;
                }
                for (let k = 0; k < chunks.length; k++) {
                    const [cs, ce] = chunks[k];
                    const dur = ce - cs;
                    if (dur >= 0.35 && (!best || dur > best.end - best.start)) {
                        best = { start: +cs.toFixed(3), end: +ce.toFixed(3) };
                    }
                }
            }
            return best;
        };

        const readU32 = (u8, off) =>
            (((u8[off] << 24) >>> 0) + ((u8[off + 1] << 16) >>> 0) + (u8[off + 2] << 8) + u8[off + 3]) >>> 0;

        const boxTag = (u8, off) =>
            String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);

        const scanMp4Boxes = (u8, start, end, onBox) => {
            let off = start;
            while (off + 8 <= end) {
                let sz = readU32(u8, off);
                const tag = boxTag(u8, off + 4);
                let hdr = 8;
                if (sz === 1) {
                    if (off + 16 > end) break;
                    sz = readU32(u8, off + 8) * 4294967296 + readU32(u8, off + 12);
                    hdr = 16;
                } else if (sz === 0) {
                    sz = end - off;
                }
                if (sz < hdr || off + sz > end) break;
                const stop = onBox(tag, off, off + hdr, off + sz);
                if (stop === true) return true;
                off += sz;
            }
            return false;
        };

        const parseMp4Timescale = u8 => {
            if (!u8 || u8.length < 24) return 0;
            let found = 0;
            const walk = (s, e) => {
                scanMp4Boxes(u8, s, e, (tag, _bs, ps, pe) => {
                    if (tag === 'mdhd' && ps + 16 <= pe) {
                        const ver = u8[ps];
                        const tsOff = ver === 1 ? ps + 20 : ps + 12;
                        if (tsOff + 4 <= pe) {
                            const ts = readU32(u8, tsOff);
                            if (ts > 0) {
                                found = ts;
                                return true;
                            }
                        }
                    } else if (tag === 'moov' || tag === 'trak' || tag === 'mdia') {
                        walk(ps, pe);
                        if (found > 0) return true;
                    }
                    return false;
                });
            };
            walk(0, u8.length);
            return found;
        };

        const parseMp4TfdtSec = (u8, timescale = 48000) => {
            if (!u8 || u8.length < 24 || !timescale) return null;
            let found = null;
            const walk = (s, e) => {
                scanMp4Boxes(u8, s, e, (tag, _bs, ps, pe) => {
                    if (tag === 'tfdt' && ps + 8 <= pe) {
                        const ver = u8[ps];
                        const val = ver === 1 && ps + 12 <= pe
                            ? readU32(u8, ps + 4) * 4294967296 + readU32(u8, ps + 8)
                            : readU32(u8, ps + 4);
                        found = +(val / timescale).toFixed(3);
                        return true;
                    } else if (tag === 'moof' || tag === 'traf') {
                        walk(ps, pe);
                        if (found !== null) return true;
                    }
                    return false;
                });
            };
            walk(0, u8.length);
            return found;
        };

        const splitMp4InitAndMedia = u8 => {
            if (!u8 || u8.length < 16) return null;
            let sawMoov = false;
            let initEnd = 0;
            let hasInitTag = false;
            scanMp4Boxes(u8, 0, u8.length, (tag, bs, _ps, pe) => {
                if (tag === 'ftyp' || tag === 'moov') {
                    hasInitTag = true;
                    if (tag === 'moov') sawMoov = true;
                    initEnd = pe;
                    return false;
                }
                if (hasInitTag && (tag === 'styp' || tag === 'sidx' || tag === 'moof' || tag === 'mdat' || tag === 'emsg')) {
                    if (initEnd === 0) initEnd = bs;
                    return true;
                }
                return true;
            });
            if (!sawMoov || initEnd <= 0) return null;
            return {
                init: u8.slice(0, initEnd),
                media: initEnd < u8.length ? u8.slice(initEnd) : null
            };
        };

        const readEbmlVint = (u8, off) => {
            if (off >= u8.length) return null;
            const first = u8[off];
            if (!first) return null;
            let len = 1;
            let mask = 0x80;
            while (len <= 8 && (first & mask) === 0) {
                mask >>= 1;
                len++;
            }
            if (len > 8 || off + len > u8.length) return null;
            let val = first & (mask - 1);
            let allOnes = (first & (mask - 1)) === (mask - 1);
            for (let i = 1; i < len; i++) {
                val = val * 256 + u8[off + i];
                if (u8[off + i] !== 0xff) allOnes = false;
            }
            return { len, value: allOnes ? -1 : val };
        };

        const readEbmlId = (u8, off) => {
            if (off >= u8.length) return null;
            const first = u8[off];
            if (!first) return null;
            let len = 1;
            let mask = 0x80;
            while (len <= 4 && (first & mask) === 0) {
                mask >>= 1;
                len++;
            }
            if (len > 4 || off + len > u8.length) return null;
            let id = 0;
            for (let i = 0; i < len; i++) id = id * 256 + u8[off + i];
            return { len, id };
        };

        const readUintBE = (u8, off, len) => {
            let v = 0;
            for (let i = 0; i < len; i++) v = v * 256 + u8[off + i];
            return v;
        };

        const parseWebmTimecodeScale = u8 => {
            if (!u8 || u8.length < 8) return 1000000;
            for (let i = 0; i + 4 < Math.min(u8.length, 4096); i++) {
                if (u8[i] === 0x2a && u8[i + 1] === 0xd7 && u8[i + 2] === 0xb1) {
                    const sz = readEbmlVint(u8, i + 3);
                    if (sz && sz.value >= 1 && sz.value <= 8 && i + 3 + sz.len + sz.value <= u8.length) {
                        const val = readUintBE(u8, i + 3 + sz.len, sz.value);
                        if (val > 0) return val;
                    }
                }
            }
            return 1000000;
        };

        const findWebmClusterOffset = u8 => {
            if (!u8 || u8.length < 4) return -1;
            for (let i = 0; i + 4 <= u8.length; i++) {
                if (u8[i] === 0x1f && u8[i + 1] === 0x43 && u8[i + 2] === 0xb6 && u8[i + 3] === 0x75) {
                    return i;
                }
            }
            return -1;
        };

        const parseWebmClusterStartSec = (u8, tcScale = 1000000) => {
            const cOff = findWebmClusterOffset(u8);
            if (cOff < 0) return null;
            const cSz = readEbmlVint(u8, cOff + 4);
            if (!cSz) return null;
            let p = cOff + 4 + cSz.len;
            const limit = Math.min(u8.length, p + 64);
            while (p + 2 < limit) {
                const eid = readEbmlId(u8, p);
                if (!eid) break;
                const esz = readEbmlVint(u8, p + eid.len);
                if (!esz || esz.value < 0) break;
                const dataStart = p + eid.len + esz.len;
                if (eid.id === 0xe7 && esz.value <= 8 && dataStart + esz.value <= u8.length) {
                    const rawTc = readUintBE(u8, dataStart, esz.value);
                    return +((rawTc * tcScale) / 1e9).toFixed(3);
                }
                p = dataStart + esz.value;
            }
            return null;
        };

        const concatU8 = list => {
            let total = 0;
            for (let i = 0; i < list.length; i++) total += list[i].byteLength;
            const out = new Uint8Array(total);
            let off = 0;
            for (let i = 0; i < list.length; i++) {
                out.set(list[i], off);
                off += list[i].byteLength;
            }
            return out;
        };

        const evictIfNeeded = () => {
            while (totalTapBytes > MAX_TAP_BYTES) {
                let oldestEntry = null;
                for (let i = 0; i < entries.length; i++) {
                    const ent = entries[i];
                    if (!ent.segments.length) continue;
                    if (!oldestEntry || ent.segments[0].seq < oldestEntry.segments[0].seq) {
                        oldestEntry = ent;
                    }
                }
                if (!oldestEntry) break;
                const dropped = oldestEntry.segments.shift();
                if (dropped?.bytes) totalTapBytes -= dropped.bytes.byteLength;
            }
        };

        const origAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
        const origAppendBuffer = SourceBuffer.prototype.appendBuffer;
        const origAbort = SourceBuffer.prototype.abort;

        MediaSource.prototype.addSourceBuffer = function (mimeType) {
            const sb = origAddSourceBuffer.apply(this, arguments);
            if (sb && /^audio\//i.test(String(mimeType || ''))) {
                const entry = {
                    id: ++entrySeq,
                    sb,
                    mimeType: String(mimeType || ''),
                    isMp4: /mp4/i.test(String(mimeType || '')),
                    isWebm: /webm/i.test(String(mimeType || '')),
                    timescale: 48000,
                    timecodeScale: 1000000,
                    initSeg: null,
                    pendingChunks: [],
                    pendingBytes: 0,
                    lastBefore: [],
                    lastAppendTs: 0,
                    videoId: getCurVid(),
                    segments: [],
                    boundEnd: false
                };
                entries.push(entry);
                if (entries.length > 16) {
                    const gone = entries.shift();
                    for (let i = 0; i < gone.segments.length; i++) {
                        totalTapBytes -= gone.segments[i].bytes?.byteLength || 0;
                    }
                }
                sbMap.set(sb, entry);
            }
            return sb;
        };

        if (typeof origAbort === 'function') {
            SourceBuffer.prototype.abort = function () {
                const entry = sbMap.get(this);
                if (entry) {
                    entry.pendingChunks = [];
                    entry.pendingBytes = 0;
                }
                return origAbort.apply(this, arguments);
            };
        }

        SourceBuffer.prototype.appendBuffer = function (data) {
            const entry = sbMap.get(this);
            if (entry && data && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
                try {
                    const copy = data instanceof ArrayBuffer
                        ? new Uint8Array(data.slice(0))
                        : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
                    if (!entry.pendingChunks.length) {
                        entry.lastBefore = snapshotBuffered(this.buffered);
                    }
                    entry.videoId = getCurVid() || entry.videoId;
                    entry.lastAppendTs = Date.now();

                    let mediaPart = copy;
                    if (entry.isMp4 && copy.length >= 16) {
                        const split = splitMp4InitAndMedia(copy);
                        if (split) {
                            entry.initSeg = split.init;
                            const ts = parseMp4Timescale(split.init);
                            if (ts > 0) entry.timescale = ts;
                            mediaPart = split.media;
                        }
                    } else if (entry.isWebm && copy.length >= 8 && copy[0] === 0x1a && copy[1] === 0x45 && copy[2] === 0xdf && copy[3] === 0xa3) {
                        const cOff = findWebmClusterOffset(copy);
                        const initSlice = cOff > 0 ? copy.slice(0, cOff) : copy;
                        entry.initSeg = initSlice;
                        entry.timecodeScale = parseWebmTimecodeScale(initSlice);
                        mediaPart = cOff > 0 ? copy.slice(cOff) : null;
                    }

                    if (mediaPart && mediaPart.byteLength > 0) {
                        entry.pendingChunks.push(mediaPart);
                        entry.pendingBytes += mediaPart.byteLength;
                    }

                    if (!entry.boundEnd && typeof this.addEventListener === 'function') {
                        entry.boundEnd = true;
                        this.addEventListener('updateend', () => {
                            try {
                                if (!entry.pendingChunks.length) return;
                                const after = snapshotBuffered(entry.sb.buffered);
                                const added = diffBuffered(entry.lastBefore || [], after);
                                const merged = concatU8(entry.pendingChunks);
                                let startSec = added?.start ?? null;
                                let endSec = added?.end ?? null;
                                if (startSec === null && entry.pendingBytes >= 24576) {
                                    const containerStart = entry.isMp4
                                        ? parseMp4TfdtSec(merged, entry.timescale)
                                        : (entry.isWebm ? parseWebmClusterStartSec(merged, entry.timecodeScale) : null);
                                    if (containerStart !== null) {
                                        startSec = containerStart;
                                        endSec = +(containerStart + 10).toFixed(3);
                                    }
                                }
                                if (startSec !== null && endSec !== null && endSec - startSec >= 0.35 && entry.initSeg) {
                                    const seg = {
                                        seq: ++segSeq,
                                        videoId: entry.videoId || getCurVid(),
                                        startSec,
                                        endSec,
                                        bytes: merged,
                                        initSeg: entry.initSeg,
                                        mimeType: entry.mimeType
                                    };
                                    entry.pendingChunks = [];
                                    entry.pendingBytes = 0;
                                    entry.lastBefore = after;
                                    entry.segments.push(seg);
                                    totalTapBytes += merged.byteLength;
                                    evictIfNeeded();
                                    window.dispatchEvent(new CustomEvent('supratube-audio-segment', {
                                        detail: { videoId: seg.videoId, seq: seg.seq, startSec: seg.startSec, endSec: seg.endSec }
                                    }));
                                } else if (!added && entry.pendingBytes > 512 * 1024) {
                                    entry.pendingChunks = [];
                                    entry.pendingBytes = 0;
                                    entry.lastBefore = after;
                                }
                            } catch {}
                        }, { passive: true });
                    }
                } catch {}
            }
            return origAppendBuffer.apply(this, arguments);
        };

        const rangesOverlap = (rangesA, rangesB) => {
            for (let i = 0; i < rangesA.length; i++) {
                const [sA, eA] = rangesA[i];
                for (let j = 0; j < rangesB.length; j++) {
                    const [sB, eB] = rangesB[j];
                    if (Math.min(eA, eB) - Math.max(sA, sB) >= 0.5) return true;
                }
            }
            return false;
        };

        window.__supratubeAudioTap = {
            installed: true,
            getSegments(videoId, videoEl) {
                const out = [];
                const targetVid = String(videoId || '');
                for (let i = 0; i < entries.length; i++) {
                    const ent = entries[i];
                    for (let j = 0; j < ent.segments.length; j++) {
                        const seg = ent.segments[j];
                        if (!seg.initSeg || !seg.bytes?.byteLength) continue;
                        if (targetVid && seg.videoId === targetVid) out.push(seg);
                    }
                }
                if (!out.length && targetVid) {
                    const vBuf = snapshotBuffered(videoEl?.buffered);
                    const now = Date.now();
                    let bestEntry = null;
                    for (let i = entries.length - 1; i >= 0; i--) {
                        const ent = entries[i];
                        if (!ent.segments.length) continue;
                        if (now - ent.lastAppendTs > 15000 && vBuf.length === 0) continue;
                        const sbBuf = snapshotBuffered(ent.sb?.buffered);
                        if (!vBuf.length || !sbBuf.length || rangesOverlap(vBuf, sbBuf)) {
                            bestEntry = ent;
                            break;
                        }
                    }
                    if (bestEntry) {
                        for (let j = 0; j < bestEntry.segments.length; j++) {
                            const seg = bestEntry.segments[j];
                            if (seg.initSeg && seg.bytes?.byteLength) out.push(seg);
                        }
                    }
                }
                return out.sort((a, b) => a.startSec - b.startSec);
            },
            clearVideo(videoId) {
                const targetVid = String(videoId || '');
                for (let i = 0; i < entries.length; i++) {
                    const ent = entries[i];
                    const kept = [];
                    for (let j = 0; j < ent.segments.length; j++) {
                        const seg = ent.segments[j];
                        if (!targetVid || seg.videoId === targetVid) {
                            totalTapBytes -= seg.bytes?.byteLength || 0;
                        } else {
                            kept.push(seg);
                        }
                    }
                    ent.segments = kept;
                }
            },
            getStats() {
                return { totalTapBytes, entryCount: entries.length };
            }
        };
    }
})();
