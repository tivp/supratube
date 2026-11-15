import test from 'node:test';
import assert from 'node:assert/strict';
import {
    cleanTranscriptCueText,
    formatTranscriptTimestamp,
    buildTranscriptBlocks,
    buildTranscriptTxt,
    sanitizeTranscriptFilename,
    chooseTranscriptDownloadTrack,
    buildGetTranscriptParamsCandidates,
    extractVideoTranscript,
    createTranscriptDownloadController
} from '../modules/transcript-download.js';
import { getTtState } from '../modules/subtitles.js';

function createMenuFakeDom({ pathname = '/shorts/KBIKtrmM80Y', search = '', videoTitle = 'Doctor Who Short' } = {}) {
    class ClassList {
        constructor() { this.set = new Set(); }
        add(...n) { n.forEach(x => this.set.add(x)); }
        remove(...n) { n.forEach(x => this.set.delete(x)); }
        contains(n) { return this.set.has(n); }
        toArray() { return [...this.set]; }
    }

    const matchSelectorPart = (el, part) => {
        const clean = part.trim();
        if (!clean) return true;
        if (clean.includes(':not(')) {
            const m = clean.match(/^([^:]*):not\(([^)]+)\)(.*)$/);
            if (m) {
                const baseOk = (!m[1] || matchSelectorPart(el, m[1])) && (!m[3] || matchSelectorPart(el, m[3]));
                return baseOk && !matchSelectorPart(el, m[2]);
            }
        }
        const tagMatch = clean.match(/^([a-zA-Z0-9_-]+)/);
        if (tagMatch && el.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;
        for (const m of clean.matchAll(/#([a-zA-Z0-9_-]+)/g)) {
            if (el.id !== m[1]) return false;
        }
        for (const m of clean.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
            if (!el.classList.contains(m[1])) return false;
        }
        for (const m of clean.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
            const attrName = m[1].trim();
            const val = el.getAttribute(attrName);
            if (m[2] !== undefined) {
                if (val !== m[2]) return false;
            } else if (val === null) {
                return false;
            }
        }
        return true;
    };

    const matchesSingle = (el, sel) => {
        const parts = sel.trim().split(/\s+/);
        if (!matchSelectorPart(el, parts[parts.length - 1])) return false;
        let cur = el.parentElement;
        for (let i = parts.length - 2; i >= 0; i--) {
            while (cur && !matchSelectorPart(cur, parts[i])) {
                cur = cur.parentElement;
            }
            if (!cur) return false;
            cur = cur.parentElement;
        }
        return true;
    };

    const matchesAny = (el, selector) =>
        selector.split(',').some(s => matchesSingle(el, s));

    class FakeEl {
        constructor(tagName = 'div', owner = null) {
            this.tagName = String(tagName).toUpperCase();
            this.ownerDocument = owner;
            this.id = '';
            this.classList = new ClassList();
            this.children = [];
            this.parentElement = null;
            this.style = { display: '', visibility: '' };
            this.dataset = {};
            this.attrs = new Map();
            this.listeners = new Map();
            this._text = '';
            this.offsetWidth = 280;
            this.offsetHeight = 200;
            this.disabled = false;
            this.positionTarget = null;
            this._rect = { left: 700, top: 140, width: 340, height: 336 };
            this.closed = 0;
        }
        get className() { return this.classList.toArray().join(' '); }
        set className(v) { this.classList.set = new Set(String(v || '').trim().split(/\s+/).filter(Boolean)); }
        get textContent() {
            if (!this.children.length) return this._text;
            return this._text + this.children.map(c => c.textContent).join('');
        }
        set textContent(v) {
            this._text = String(v ?? '');
            this.children = [];
        }
        setAttribute(k, v) {
            if (k === 'id') this.id = String(v);
            if (k === 'class') this.className = String(v);
            this.attrs.set(k, String(v));
        }
        getAttribute(k) {
            if (k === 'id' && this.id) return this.id;
            return this.attrs.get(k) ?? null;
        }
        removeAttribute(k) {
            if (k === 'id') this.id = '';
            if (k === 'class') this.className = '';
            this.attrs.delete(k);
        }
        appendChild(child) {
            if (child.parentElement) {
                const idx = child.parentElement.children.indexOf(child);
                if (idx >= 0) child.parentElement.children.splice(idx, 1);
            }
            child.parentElement = this;
            this.children.push(child);
            return child;
        }
        insertBefore(node, refNode) {
            if (!refNode) return this.appendChild(node);
            const idx = this.children.indexOf(refNode);
            if (idx < 0) return this.appendChild(node);
            if (node.parentElement) {
                const oldIdx = node.parentElement.children.indexOf(node);
                if (oldIdx >= 0) node.parentElement.children.splice(oldIdx, 1);
            }
            node.parentElement = this;
            this.children.splice(idx, 0, node);
            return node;
        }
        insertAdjacentElement(pos, el) {
            if (!this.parentElement) return null;
            if (pos === 'afterend') {
                const idx = this.parentElement.children.indexOf(this);
                return this.parentElement.insertBefore(el, this.parentElement.children[idx + 1] || null);
            }
            if (pos === 'beforebegin') {
                return this.parentElement.insertBefore(el, this);
            }
            return null;
        }
        remove() {
            if (!this.parentElement) return;
            const idx = this.parentElement.children.indexOf(this);
            if (idx >= 0) this.parentElement.children.splice(idx, 1);
            this.parentElement = null;
        }
        closest(selector) {
            let cur = this;
            while (cur) {
                if (matchesAny(cur, selector)) return cur;
                cur = cur.parentElement;
            }
            return null;
        }
        querySelectorAll(selector) {
            const out = [];
            const walk = node => {
                for (const c of node.children) {
                    if (matchesAny(c, selector)) out.push(c);
                    walk(c);
                }
            };
            walk(this);
            return out;
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        addEventListener(type, fn) {
            if (!this.listeners.has(type)) this.listeners.set(type, []);
            this.listeners.get(type).push(fn);
        }
        dispatchEvent(ev) {
            for (const fn of (this.listeners.get(ev.type) || [])) {
                fn.call(this, ev);
            }
        }
        click() {
            this.dispatchEvent({ type: 'click', target: this, stopPropagation() {}, preventDefault() {} });
        }
        close() {
            this.closed++;
            this.style.display = 'none';
            this.offsetWidth = 0;
            this.offsetHeight = 0;
        }
        getBoundingClientRect() {
            return { ...this._rect, right: this._rect.left + this._rect.width, bottom: this._rect.top + this._rect.height };
        }
    }

    const doc = {
        title: `${videoTitle} - YouTube`,
        documentElement: null,
        head: null,
        body: null,
        _docListeners: new Map(),
        createElement(tag) { return new FakeEl(tag, doc); },
        createElementNS(_ns, tag) { return new FakeEl(tag, doc); },
        getElementById(id) { return doc.documentElement.querySelector(`#${id}`); },
        querySelector(sel) { return doc.documentElement.querySelector(sel); },
        querySelectorAll(sel) { return doc.documentElement.querySelectorAll(sel); },
        addEventListener(type, fn) {
            if (!doc._docListeners.has(type)) doc._docListeners.set(type, []);
            doc._docListeners.get(type).push(fn);
        },
        removeEventListener(type, fn) {
            const arr = doc._docListeners.get(type) || [];
            const i = arr.indexOf(fn);
            if (i >= 0) arr.splice(i, 1);
        }
    };
    doc.documentElement = new FakeEl('html', doc);
    doc.head = new FakeEl('head', doc);
    doc.body = new FakeEl('body', doc);
    doc.documentElement.appendChild(doc.head);
    doc.documentElement.appendChild(doc.body);

    const win = {
        document: doc,
        innerWidth: 1280,
        innerHeight: 900,
        location: {
            origin: 'https://www.youtube.com',
            pathname,
            search,
            href: `https://www.youtube.com${pathname}${search}`
        },
        getComputedStyle(el) {
            return {
                display: el.style.display || 'block',
                visibility: el.style.visibility || 'visible'
            };
        },
        addEventListener() {},
        removeEventListener() {}
    };
    return { doc, win };
}

test('cleanTranscriptCueText, formatTranscriptTimestamp, buildTranscriptBlocks, buildTranscriptTxt, and sanitizeTranscriptFilename match Youtube a TXT format', () => {
    assert.equal(cleanTranscriptCueText('Hola &amp;#39;pro&#39; [Música] >> ♪ mundo  '), "Hola 'pro' mundo");
    assert.equal(formatTranscriptTimestamp(5), '0:05');
    assert.equal(formatTranscriptTimestamp(65), '1:05');
    assert.equal(formatTranscriptTimestamp(3665), '1:01:05');

    const cues = [
        { start: 0, end: 2, text: 'Primera frase corta.' },
        { start: 2, end: 5, text: 'Segunda frase corta.' },
        { start: 10, end: 15, text: 'X'.repeat(190) }
    ];
    const blocks = buildTranscriptBlocks(cues, 200);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].text, 'Primera frase corta. Segunda frase corta.');
    assert.equal(blocks[1].start, 10);

    const txt = buildTranscriptTxt(cues, { title: 'Video Epico', videoId: 'KBIKtrmM80Y' });
    assert.equal(
        txt,
        [
            'Video Epico',
            'https://youtu.be/KBIKtrmM80Y',
            '',
            '0:00',
            'Primera frase corta. Segunda frase corta.',
            '',
            '0:10',
            'X'.repeat(190)
        ].join('\n')
    );

    assert.equal(
        sanitizeTranscriptFilename('¿Qué pasó? <Dr. Who>: Parte 1/2 *pro*', '2026-04-12T10:20:00-07:00'),
        '2026-04-12 ¿Qué pasó Dr. Who Parte 1 2 pro.txt'
    );
    assert.equal(sanitizeTranscriptFilename('   ', ''), '0000-00-00 Sin titulo.txt');
});

test('chooseTranscriptDownloadTrack prioritizes userLang manual > userLang asr > en > other, and builds get_transcript params', () => {
    const esFirst = chooseTranscriptDownloadTrack(
        [
            { languageCode: 'en', kind: 'asr', baseUrl: 'https://yt/en' },
            { languageCode: 'es-419', kind: 'asr', baseUrl: 'https://yt/es419' },
            { languageCode: 'es-ES', baseUrl: 'https://yt/es-manual' }
        ],
        'es'
    );
    assert.equal(esFirst.languageCode, 'es-ES');
    assert.equal(esFirst.needsTranslate, false);

    const enFallback = chooseTranscriptDownloadTrack(
        [
            { languageCode: 'ja', kind: 'asr', baseUrl: 'https://yt/ja' },
            { languageCode: 'en', baseUrl: 'https://yt/en' }
        ],
        'es'
    );
    assert.equal(enFallback.languageCode, 'en');
    assert.equal(enFallback.needsTranslate, true);

    const cands = buildGetTranscriptParamsCandidates('KBIKtrmM80Y', 'es-419', 'asr');
    assert.ok(Array.isArray(cands) && cands.length >= 3);
    assert.ok(cands.every(c => typeof c === 'string' && c.length > 10));
});

test('extractVideoTranscript resolves metadata, uses multi-client Innertube + get_panel + auto-translates foreign transcripts to IP lang', async () => {
    const { doc, win } = createMenuFakeDom({ pathname: '/shorts/vidEng12345', videoTitle: 'Foreign Short' });
    win.fetch = async (url, init) => {
        if (String(url).includes('/youtubei/v1/player')) {
            const body = JSON.parse(init.body);
            if (body?.context?.client?.clientName === 'WEB') {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        videoDetails: { videoId: 'vidEng12345', title: 'Foreign Short Real' },
                        microformat: { playerMicroformatRenderer: { publishDate: '2026-10-01' } },
                        captions: {
                            playerCaptionsTracklistRenderer: {
                                captionTracks: [{ languageCode: 'en', kind: 'asr', baseUrl: 'https://www.youtube.com/api/timedtext?v=vidEng12345&lang=en' }]
                            }
                        }
                    })
                };
            }
            if (body?.context?.client?.clientName === 'ANDROID') {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        videoDetails: { videoId: 'vidEng12345', title: 'Foreign Short Real' },
                        captions: {
                            playerCaptionsTracklistRenderer: {
                                captionTracks: [{ languageCode: 'en', kind: 'asr', baseUrl: 'https://www.youtube.com/api/timedtext?v=vidEng12345&lang=en&c=ANDROID' }]
                            }
                        }
                    })
                };
            }
        }
        if (String(url).includes('c=ANDROID') && String(url).includes('json3') && !String(url).includes('tlang=')) {
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    events: [
                        { tStartMs: 0, dDurationMs: 2500, segs: [{ utf8: 'Hello world' }] },
                        { tStartMs: 2500, dDurationMs: 2500, segs: [{ utf8: 'This is a test' }] }
                    ]
                })
            };
        }
        return { ok: false, status: 404, text: async () => '' };
    };

    const gtxCalls = [];
    const requestFn = async url => {
        if (String(url).includes('translate.googleapis.com')) {
            gtxCalls.push(url);
            return {
                status: 200,
                text: JSON.stringify({ sentences: [{ trans: 'Hola mundo\nEsto es una prueba' }] })
            };
        }
        return { status: 404, text: '' };
    };

    const res = await extractVideoTranscript({
        videoId: 'vidEng12345',
        userLang: 'es',
        doc,
        win,
        requestFn
    });

    assert.equal(res.filename, '2026-10-01 Foreign Short Real.txt');
    assert.equal(res.translated, true);
    assert.ok(gtxCalls.length >= 1);
    assert.match(res.text, /^Foreign Short Real\nhttps:\/\/youtu\.be\/vidEng12345\n\n0:00\nHola mundo Esto es una prueba$/);

    // Spanish timedtext cache hit should skip GTX translation completely.
    const st = getTtState(win);
    st.originCuesByVid.set('vidEsp99999', {
        lang: 'es',
        cues: [{ start: 1, end: 4, text: 'Video ya en español' }]
    });
    const resCached = await extractVideoTranscript({
        videoId: 'vidEsp99999',
        userLang: 'es',
        titleHint: 'Mi Video ES',
        dateHint: '2026-11-15',
        doc,
        win,
        requestFn
    });
    assert.equal(resCached.translated, false);
    assert.equal(resCached.filename, '2026-11-15 Mi Video ES.txt');
    assert.match(resCached.text, /Video ya en español/);
});

test('extractVideoTranscript falls back cleanly through get_panel and active /watch DOM and throws noCaptions when absent', async () => {
    const { doc, win } = createMenuFakeDom({ pathname: '/watch', search: '?v=domVid12345', videoTitle: 'DOM Video' });
    win.fetch = async url => {
        if (String(url).includes('/youtubei/v1/get_panel')) {
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ error: 'empty' }),
                json: async () => ({ error: 'empty' })
            };
        }
        return { ok: false, status: 404, text: async () => '' };
    };

    const seg = doc.createElement('ytd-transcript-segment-renderer');
    const ts = doc.createElement('div');
    ts.className = 'segment-timestamp';
    ts.textContent = '0:12';
    const body = doc.createElement('div');
    body.className = 'segment-text';
    body.textContent = 'Texto desde el DOM';
    seg.appendChild(ts);
    seg.appendChild(body);
    doc.body.appendChild(seg);

    const resDom = await extractVideoTranscript({
        videoId: 'domVid12345',
        userLang: 'es',
        doc,
        win,
        requestFn: async () => ({ status: 404, text: '' })
    });
    assert.match(resDom.text, /0:12\nTexto desde el DOM/);

    seg.remove();
    await assert.rejects(
        () => extractVideoTranscript({
            videoId: 'noCapsVid12',
            userLang: 'es',
            doc,
            win,
            requestFn: async () => ({ status: 404, text: '' })
        }),
        err => err?.noCaptions === true
    );
});

test('controller injects Descargar transcripción in Shorts root dropdown (not submenus) and Watch Más acciones only (not sidebar cards)', async () => {
    const { doc, win } = createMenuFakeDom({ pathname: '/shorts/KBIKtrmM80Y', videoTitle: 'Dr Who' });

    const sheet = doc.createElement('yt-sheet-view-model');
    sheet.style.maxHeight = '336px';
    sheet.style.maxWidth = '150px';
    const header = doc.createElement('div');
    header.className = 'ytContextualSheetLayoutHeaderContainer';
    const list = doc.createElement('yt-list-view-model');
    list.setAttribute('role', 'menu');
    for (const label of ['Descripción', 'Subtítulos', 'Denunciar']) {
        const it = doc.createElement('yt-list-item-view-model');
        it.textContent = label;
        list.appendChild(it);
    }
    sheet.appendChild(header);
    sheet.appendChild(list);

    const shortsDd = doc.createElement('tp-yt-iron-dropdown');
    shortsDd.appendChild(sheet);
    doc.body.appendChild(shortsDd);

    // Submenu (with non-empty header) should NEVER receive the injected item.
    const subDd = doc.createElement('tp-yt-iron-dropdown');
    const subSheet = doc.createElement('yt-sheet-view-model');
    const subHeader = doc.createElement('div');
    subHeader.className = 'ytContextualSheetLayoutHeaderContainer';
    const subTitle = doc.createElement('span');
    subTitle.textContent = 'Velocidad de reproducción';
    subHeader.appendChild(subTitle);
    const subList = doc.createElement('yt-list-view-model');
    subList.setAttribute('role', 'menu');
    for (const label of ['0.5', 'Normal', '1.5']) {
        const it = doc.createElement('yt-list-item-view-model');
        it.textContent = label;
        subList.appendChild(it);
    }
    subSheet.appendChild(subHeader);
    subSheet.appendChild(subList);
    subDd.appendChild(subSheet);
    doc.body.appendChild(subDd);

    let downloads = [];
    let copied = '';
    const ctrl = createTranscriptDownloadController({
        doc,
        win,
        getUserLang: () => 'es',
        downloadFile: (bytes, filename) => downloads.push({ bytes, filename }),
        copyText: async txt => { copied = txt; }
    });
    ctrl.setEnabled(true);
    ctrl.scan();

    const injectedShorts = shortsDd.querySelectorAll('[data-supratube-td-item="1"]');
    assert.equal(injectedShorts.length, 1);
    assert.ok(injectedShorts[0].classList.contains('supratube-td-shorts'));
    assert.equal(subDd.querySelectorAll('[data-supratube-td-item="1"]').length, 0);
    // Inserted immediately after Subtítulos.
    assert.equal(list.children[2].getAttribute('data-supratube-td-item'), '1');
    // Expanded tight inline sizing so item is not clipped or wrapped narrowly.
    assert.ok(parseFloat(sheet.style.maxHeight) > 336);
    assert.ok(parseFloat(sheet.style.maxWidth) >= 240);

    // Repeated scans must remain idempotent.
    ctrl.scan();
    assert.equal(shortsDd.querySelectorAll('[data-supratube-td-item="1"]').length, 1);

    // Closing the dropdown removes the injected item so reusing the dropdown never leaks elsewhere.
    shortsDd.style.display = 'none';
    ctrl.scan();
    assert.equal(shortsDd.querySelectorAll('[data-supratube-td-item="1"]').length, 0);

    // Watch context: only inject for ytd-watch-metadata positionTarget, not sidebar compact video card!
    const { doc: wDoc, win: wWin } = createMenuFakeDom({ pathname: '/watch', search: '?v=4Pg9rUF1RQ0', videoTitle: 'Watch Pro' });
    const watchMeta = wDoc.createElement('ytd-watch-metadata');
    const watchMenuBtn = wDoc.createElement('button');
    watchMenuBtn.setAttribute('aria-label', 'Más acciones');
    watchMeta.appendChild(watchMenuBtn);
    wDoc.body.appendChild(watchMeta);

    const related = wDoc.createElement('div');
    related.id = 'related';
    const cardBtn = wDoc.createElement('button');
    related.appendChild(cardBtn);
    wDoc.body.appendChild(related);

    const watchPopup = wDoc.createElement('ytd-menu-popup-renderer');
    watchPopup.style.maxWidth = '150.89px';
    watchPopup.style.maxHeight = '52px';
    const listbox = wDoc.createElement('tp-yt-paper-listbox');
    listbox.id = 'items';
    const repItem = wDoc.createElement('ytd-menu-service-item-renderer');
    repItem.textContent = 'Denunciar';
    listbox.appendChild(repItem);
    watchPopup.appendChild(listbox);

    const watchDd = wDoc.createElement('tp-yt-iron-dropdown');
    watchDd.positionTarget = cardBtn;
    watchDd.appendChild(watchPopup);
    wDoc.body.appendChild(watchDd);

    const stW = getTtState(wWin);
    stW.originCuesByVid.set('4Pg9rUF1RQ0', {
        lang: 'es',
        cues: [{ start: 2, end: 5, text: 'Hola Watch desde caché' }]
    });

    const wCtrl = createTranscriptDownloadController({
        doc: wDoc,
        win: wWin,
        getUserLang: () => 'es',
        requestFn: async () => ({ status: 404, text: '' }),
        downloadFile: (bytes, filename) => downloads.push({ bytes, filename }),
        copyText: async txt => { copied = txt; return true; }
    });
    wCtrl.setEnabled(true);
    wCtrl.scan();
    assert.equal(watchDd.querySelectorAll('[data-supratube-td-item="1"]').length, 0);

    // Reassign positionTarget to watch metadata button and rescan -> injects cleanly before Denunciar.
    watchDd.positionTarget = watchMenuBtn;
    wCtrl.scan();
    const watchInjected = watchDd.querySelector('[data-supratube-td-item="1"]');
    assert.ok(watchInjected);
    assert.equal(listbox.children[0], watchInjected);
    assert.ok(parseFloat(watchPopup.style.maxWidth) >= 240);
    assert.ok(parseFloat(watchPopup.style.maxHeight) > 52);

    // Click triggers download + clipboard copy.
    watchInjected.click();
    await new Promise(r => setTimeout(r, 80));
    assert.equal(downloads.length, 1);
    assert.match(downloads[0].filename, /Watch Pro\.txt$/);
    assert.match(copied, /0:02\nHola Watch desde caché/);
    await new Promise(r => setTimeout(r, 700));

    wCtrl.destroy();
    assert.equal(wDoc.querySelectorAll('[data-supratube-td-item="1"]').length, 0);
});
