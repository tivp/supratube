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
    createTranscriptDownloadController,
    TD_IA_ITEM_ATTR,
    TD_HEROICON_SVG_URL,
    TD_HEROICON_FALLBACK_URL
} from '../modules/transcript-download.js';
import {
    getTtState,
    bindManualCaptionListeners,
    applySmartSubtitles,
    startManualAiCaptions,
    clearFallbackCaptions,
    isFallbackCaptionsActive,
    isManualAiCaptionsActive
} from '../modules/subtitles.js';
import { selectActivePlayer } from '../modules/utils.js';

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
        hasAttribute(k) {
            return this.attrs.has(k);
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
    sheet.style.maxHeight = '455.762px';
    sheet.style.maxWidth = '150px';
    doc.documentElement.setAttribute('dark', '');
    const header = doc.createElement('div');
    header.className = 'ytContextualSheetLayoutHeaderContainer';
    const list = doc.createElement('yt-list-view-model');
    list.setAttribute('role', 'menu');
    for (const label of ['Descripción', 'Modo ambiente', 'Subtítulos', 'Denunciar']) {
        if (label === 'Modo ambiente') {
            const sw = doc.createElement('switch-list-item-view-model');
            const inner = doc.createElement('yt-list-item-view-model');
            inner.textContent = label;
            sw.appendChild(inner);
            list.appendChild(sw);
        } else {
            const it = doc.createElement('yt-list-item-view-model');
            const titleSpan = doc.createElement('span');
            titleSpan.className = 'ytAttributedStringHost ytListItemViewModelTitle';
            titleSpan.textContent = label;
            it.appendChild(titleSpan);
            list.appendChild(it);
        }
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
    const aiToggles = [];
    let aiState = false;
    const ctrl = createTranscriptDownloadController({
        doc,
        win,
        getUserLang: () => 'es',
        downloadFile: (bytes, filename) => downloads.push({ bytes, filename }),
        copyText: async txt => { copied = txt; },
        isAiSubtitlesActive: () => aiState,
        onToggleAiSubtitles: async ({ videoId, userLang }) => {
            aiToggles.push({ videoId, userLang });
            aiState = !aiState;
            return aiState;
        }
    });
    ctrl.setEnabled(true);
    ctrl.scan();

    const injectedShorts = shortsDd.querySelectorAll('[data-supratube-td-item="1"]');
    const injectedShortsIa = shortsDd.querySelectorAll(`[${TD_IA_ITEM_ATTR}="1"]`);
    assert.equal(injectedShorts.length, 1);
    assert.equal(injectedShortsIa.length, 1);
    assert.ok(injectedShorts[0].classList.contains('supratube-td-shorts'));
    assert.ok(injectedShorts[0].classList.contains('supratube-td-dark'));
    assert.equal(injectedShorts[0].querySelector('svg'), null);
    assert.ok(injectedShortsIa[0].querySelector('svg'));
    assert.match(injectedShortsIa[0].textContent, /Subtítulos IA/);
    assert.equal(injectedShortsIa[0].getAttribute('data-active'), '0');
    const imgIcon = injectedShorts[0].querySelector('img.supratube-td-icon-img');
    assert.ok(imgIcon);
    assert.match(TD_HEROICON_SVG_URL, /^https:\/\/.*heroicons.*\.svg/i);
    assert.equal(imgIcon.src, TD_HEROICON_SVG_URL);
    imgIcon.dispatchEvent({ type: 'error' });
    assert.equal(imgIcon.src, TD_HEROICON_FALLBACK_URL);
    assert.equal(subDd.querySelectorAll('[data-supratube-td-item="1"]').length, 0);
    assert.equal(subDd.querySelectorAll(`[${TD_IA_ITEM_ATTR}="1"]`).length, 0);
    // Inserted immediately after Subtítulos (Descripción[0], Modo ambiente[1], Subtítulos[2], Descargar[3], Subtítulos IA[4]).
    assert.equal(list.children[3].getAttribute('data-supratube-td-item'), '1');
    assert.equal(list.children[4].getAttribute(TD_IA_ITEM_ATTR), '1');
    // Expanded tight inline sizing so item is not clipped or wrapped narrowly.
    assert.ok(parseFloat(sheet.style.maxHeight) > 455.762);
    assert.ok(parseFloat(sheet.style.maxWidth) >= 240);

    // Clicking Subtítulos IA activates AI subtitles for current Short in IP language and closes dropdown.
    injectedShortsIa[0].click();
    await new Promise(r => setTimeout(r, 30));
    assert.deepEqual(aiToggles, [{ videoId: 'KBIKtrmM80Y', userLang: 'es' }]);
    assert.equal(injectedShortsIa[0].getAttribute('data-active'), '1');
    await new Promise(r => setTimeout(r, 270));
    assert.equal(shortsDd.closed, 1);

    // Reopen Shorts dropdown -> repeated scans remain idempotent and show Activado state.
    shortsDd.style.display = 'block';
    shortsDd.offsetWidth = 280;
    shortsDd.offsetHeight = 200;
    ctrl.scan();
    assert.equal(shortsDd.querySelectorAll('[data-supratube-td-item="1"]').length, 1);
    assert.equal(shortsDd.querySelectorAll(`[${TD_IA_ITEM_ATTR}="1"]`).length, 1);
    assert.equal(shortsDd.querySelector(`[${TD_IA_ITEM_ATTR}="1"]`).getAttribute('data-active'), '1');

    // Closing the dropdown removes the injected items so reusing the dropdown never leaks elsewhere.
    shortsDd.style.display = 'none';
    ctrl.scan();
    assert.equal(shortsDd.querySelectorAll('[data-supratube-td-item="1"]').length, 0);
    assert.equal(shortsDd.querySelectorAll(`[${TD_IA_ITEM_ATTR}="1"]`).length, 0);

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
    const watchInjectedIa = watchDd.querySelector(`[${TD_IA_ITEM_ATTR}="1"]`);
    assert.ok(watchInjected);
    assert.ok(watchInjectedIa);
    assert.equal(listbox.children[0], watchInjected);
    assert.equal(listbox.children[1], watchInjectedIa);
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
    assert.equal(wDoc.querySelectorAll(`[${TD_IA_ITEM_ATTR}="1"]`).length, 0);
});

test('Shorts Subtítulos IA survives capture-phase bindManualCaptionListeners, prefers #shorts-player over #movie_player, and ignores unrelated Shorts menu items', async () => {
    const { doc, win } = createMenuFakeDom({ pathname: '/shorts/sHoRtId1234', videoTitle: 'BBC Doctor Who Short' });
    doc.documentElement.dataset.supratubeWhisperBridge = '1';
    doc.documentElement.dataset.supratubeSettings = JSON.stringify({ asrEngine: 'turbo', aiAudioLang: 'auto' });

    const docCaptureClicks = [];
    const origDocAdd = doc.addEventListener.bind(doc);
    doc.addEventListener = (type, fn, opts) => {
        origDocAdd(type, fn);
        const cap = opts === true || Boolean(opts && typeof opts === 'object' && opts.capture);
        if (type === 'click' && cap) docCaptureClicks.push(fn);
    };

    const winListeners = new Map();
    const whisperCmds = [];
    win.CustomEvent = class {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    };
    win.addEventListener = (type, fn) => {
        if (!winListeners.has(type)) winListeners.set(type, new Set());
        winListeners.get(type).add(fn);
    };
    win.removeEventListener = (type, fn) => {
        winListeners.get(type)?.delete(fn);
    };
    win.dispatchEvent = ev => {
        if (ev?.type === 'supratube-whisper-cmd') whisperCmds.push(ev.detail);
        for (const fn of [...(winListeners.get(ev?.type) || [])]) fn(ev);
    };

    // Simulate leftover hidden #movie_player from previous /watch navigation + active #shorts-player.
    const watchPlayer = doc.createElement('div');
    watchPlayer.id = 'movie_player';
    watchPlayer.getVideoData = () => ({ video_id: 'sHoRtId1234' });
    doc.body.appendChild(watchPlayer);

    const reel = doc.createElement('ytd-reel-video-renderer');
    reel.setAttribute('is-active', '');
    const shortsPlayer = doc.createElement('div');
    shortsPlayer.id = 'shorts-player';
    shortsPlayer.clientWidth = 380;
    shortsPlayer.clientHeight = 680;
    let toggleCalls = 0;
    let nativeSubsOn = false;
    shortsPlayer.isSubtitlesOn = () => nativeSubsOn;
    shortsPlayer.toggleSubtitles = () => {
        toggleCalls++;
        nativeSubsOn = !nativeSubsOn;
    };
    shortsPlayer.setOption = () => {};
    shortsPlayer.unloadModule = () => {};
    // Lagging player video_id (still previous Short) while URL is already /shorts/sHoRtId1234.
    shortsPlayer.getVideoData = () => ({ video_id: 'prevShort99' });
    shortsPlayer.getPlayerResponse = () => ({
        videoDetails: { videoId: 'sHoRtId1234', defaultAudioLanguage: 'en', title: 'BBC Clip' }
    });
    const shortsVideo = doc.createElement('video');
    shortsVideo.paused = false;
    shortsPlayer.appendChild(shortsVideo);
    reel.appendChild(shortsPlayer);
    doc.body.appendChild(reel);

    const selected = selectActivePlayer(doc, win.location.pathname, 'sHoRtId1234');
    assert.equal(selected, shortsPlayer);

    // Build Shorts 3-dots popup matching YouTube UI from screenshot.
    const sheet = doc.createElement('yt-sheet-view-model');
    const header = doc.createElement('div');
    header.className = 'ytContextualSheetLayoutHeaderContainer';
    const list = doc.createElement('yt-list-view-model');
    list.setAttribute('role', 'menu');
    const menuItems = {};
    for (const label of ['Descripción', 'Modo ambiente', 'Subtítulos', 'Denunciar']) {
        const it = doc.createElement('yt-list-item-view-model');
        it.setAttribute('role', 'menuitem');
        const span = doc.createElement('span');
        span.className = 'ytListItemViewModelTitle';
        span.textContent = label;
        it.appendChild(span);
        list.appendChild(it);
        menuItems[label] = it;
    }
    sheet.appendChild(header);
    sheet.appendChild(list);
    const shortsDd = doc.createElement('tp-yt-iron-dropdown');
    shortsDd.appendChild(sheet);
    doc.body.appendChild(shortsDd);

    // Bind capture-phase manual caption listeners with the exact main.js 60ms callback behavior.
    doc.__supratubeCapListenerBound = false;
    let currentVid = 'sHoRtId1234';
    bindManualCaptionListeners(doc, win, null, () => {
        const vid = currentVid;
        if (isFallbackCaptionsActive(win, vid)) {
            clearFallbackCaptions(doc, win);
            return;
        }
        const wasNativeOn = Boolean(shortsPlayer.isSubtitlesOn());
        setTimeout(() => {
            if (isManualAiCaptionsActive(win, vid)) return;
            const nowOn = Boolean(shortsPlayer.isSubtitlesOn());
            if (!wasNativeOn && !nowOn) {
                applySmartSubtitles(shortsPlayer, {
                    enabled: true,
                    userLang: 'es',
                    expectedVideoId: vid,
                    doc,
                    win,
                    manualForce: true
                }).catch(() => {});
            } else if (!nowOn) {
                clearFallbackCaptions(doc, win);
            }
        }, 60);
    });

    const tdCtrl = createTranscriptDownloadController({
        doc,
        win,
        getUserLang: () => 'es',
        requestFn: async () => ({
            status: 200,
            text: JSON.stringify({ sentences: [{ trans: 'Hola desde el Short en vivo.' }] })
        }),
        onToggleAiSubtitles: ({ videoId, userLang }) =>
            startManualAiCaptions({
                player: selectActivePlayer(doc, win.location.pathname, videoId),
                videoId,
                userLang,
                doc,
                win,
                requestFn: async () => ({
                    status: 200,
                    text: JSON.stringify({ sentences: [{ trans: 'Hola desde el Short en vivo.' }] })
                })
            })
    });
    tdCtrl.setEnabled(true);
    tdCtrl.scan();

    const iaBtn = shortsDd.querySelector(`[${TD_IA_ITEM_ATTR}="1"]`);
    const iaLabel = iaBtn?.querySelector('.supratube-td-label');
    assert.ok(iaBtn && iaLabel);

    const simulateTrustedClick = target => {
        const ev = {
            type: 'click',
            isTrusted: true,
            target,
            clientX: 720,
            clientY: 280,
            preventDefault() {},
            stopPropagation() {}
        };
        for (const fn of docCaptureClicks) fn(ev);
        let cur = target;
        while (cur) {
            cur.dispatchEvent?.(ev);
            cur = cur.parentElement;
        }
    };

    // Click inside the nested label span of [IA] Subtítulos IA -> starts AI captions without triggering manual-caption kill switch.
    simulateTrustedClick(iaLabel);
    await new Promise(r => setTimeout(r, 120));

    assert.equal(isManualAiCaptionsActive(win, 'sHoRtId1234'), true);
    assert.equal(isFallbackCaptionsActive(win, 'sHoRtId1234'), true);
    assert.equal(whisperCmds.filter(c => c.action === 'stop').length, 0);
    const startCmd = whisperCmds.find(c => c.action === 'start');
    assert.equal(startCmd?.videoId, 'sHoRtId1234');
    assert.equal(startCmd?.asrEngine, 'turbo');
    assert.equal(shortsPlayer.getAttribute('data-supratube-ai-subs-active'), '1');

    const box = shortsPlayer.querySelector('#supratube-fallback-captions');
    assert.ok(box, 'overlay must mount inside #shorts-player, not #movie_player');
    assert.equal(watchPlayer.querySelector('#supratube-fallback-captions'), null);

    // Emitting a live caption event renders inside #shorts-player even while player.getVideoData() still lags behind.
    win.dispatchEvent(new win.CustomEvent('supratube-whisper-evt', {
        detail: {
            kind: 'caption',
            videoId: 'sHoRtId1234',
            mode: 'final',
            engine: 'whisper',
            lang: 'en',
            raw: 'Hello from live Short.',
            translated: 'Hola desde el Short en vivo.'
        }
    }));
    assert.equal(box.children[0]?.textContent, 'Hola desde el Short en vivo.');
    assert.equal(box.style.display, 'block');

    // Clicking unrelated items in the Shorts root 3-dots menu (e.g. Descripción) must NOT kill AI captions.
    simulateTrustedClick(menuItems['Descripción'].children[0]);
    await new Promise(r => setTimeout(r, 80));
    assert.equal(isManualAiCaptionsActive(win, 'sHoRtId1234'), true);
    assert.equal(shortsPlayer.querySelector('#supratube-fallback-captions')?.children[0]?.textContent, 'Hola desde el Short en vivo.');

    // Clicking the native Subtítulos item in the Shorts 3-dots menu DOES turn off AI captions cleanly.
    simulateTrustedClick(menuItems['Subtítulos'].children[0]);
    assert.equal(isManualAiCaptionsActive(win, 'sHoRtId1234'), false);
    assert.equal(isFallbackCaptionsActive(win, 'sHoRtId1234'), false);
    assert.equal(shortsPlayer.querySelector('#supratube-fallback-captions'), null);
    assert.equal(toggleCalls, 0);

    await new Promise(r => setTimeout(r, 200));
    tdCtrl.destroy();
    clearFallbackCaptions(doc, win);
});
