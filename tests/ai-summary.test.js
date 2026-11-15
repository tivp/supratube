import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AI_SUMMARY_PROMPT,
    injectAiSummaryStyles,
    ensureResumeButton,
    createAiSummaryController
} from '../modules/ai-summary.js';

function createFakeDom() {
    class ClassList {
        constructor() { this.set = new Set(); }
        add(...names) { names.forEach(n => this.set.add(n)); }
        remove(...names) { names.forEach(n => this.set.delete(n)); }
        contains(name) { return this.set.has(name); }
        toArray() { return [...this.set]; }
    }

    class FakeElement {
        constructor(tagName = 'div', ownerDoc = null) {
            this.tagName = String(tagName).toUpperCase();
            this.ownerDocument = ownerDoc;
            this.id = '';
            this.classList = new ClassList();
            this.children = [];
            this.parentElement = null;
            this.style = { display: '' };
            this.dataset = {};
            this.attrs = new Map();
            this.listeners = new Map();
            this._text = '';
            this.value = '';
            this.disabled = false;
            this.type = '';
            this.offsetWidth = 120;
            this.offsetHeight = 32;
            this.offsetParent = {};
            this.focused = false;
            this.clicked = 0;
            this.dispatchedEvents = [];
        }
        get className() {
            return this.classList.toArray().join(' ');
        }
        set className(val) {
            this.classList.set = new Set(String(val || '').trim().split(/\s+/).filter(Boolean));
        }
        get nextElementSibling() {
            if (!this.parentElement) return null;
            const idx = this.parentElement.children.indexOf(this);
            return idx >= 0 ? (this.parentElement.children[idx + 1] || null) : null;
        }
        get isConnected() {
            let cur = this;
            while (cur) {
                if (cur === this.ownerDocument?.documentElement || cur === this.ownerDocument?.body) return true;
                cur = cur.parentElement;
            }
            return false;
        }
        get textContent() {
            if (this.children.length === 0) return this._text;
            return this._text + this.children.map(c => c.textContent).join('');
        }
        set textContent(v) {
            this._text = String(v ?? '');
            this.children = [];
        }
        setAttribute(k, v) { this.attrs.set(k, String(v)); }
        getAttribute(k) { return this.attrs.get(k) ?? null; }
        appendChild(child) {
            if (child.parentElement) {
                const i = child.parentElement.children.indexOf(child);
                if (i >= 0) child.parentElement.children.splice(i, 1);
            }
            child.parentElement = this;
            this.children.push(child);
            return child;
        }
        insertAdjacentElement(pos, el) {
            if (pos === 'afterend' && this.parentElement) {
                if (el.parentElement) {
                    const prevIdx = el.parentElement.children.indexOf(el);
                    if (prevIdx >= 0) el.parentElement.children.splice(prevIdx, 1);
                }
                const idx = this.parentElement.children.indexOf(this);
                el.parentElement = this.parentElement;
                this.parentElement.children.splice(idx + 1, 0, el);
                return el;
            }
            return null;
        }
        remove() {
            if (!this.parentElement) return;
            const i = this.parentElement.children.indexOf(this);
            if (i >= 0) this.parentElement.children.splice(i, 1);
            this.parentElement = null;
        }
        addEventListener(type, fn) {
            if (!this.listeners.has(type)) this.listeners.set(type, []);
            this.listeners.get(type).push(fn);
        }
        dispatchEvent(ev) {
            this.dispatchedEvents.push(ev);
            for (const fn of (this.listeners.get(ev.type) || [])) {
                fn.call(this, ev);
            }
            return true;
        }
        click() {
            this.clicked += 1;
            this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} });
        }
        focus() { this.focused = true; }
        matches(sel) {
            return sel.split(',').map(s => s.trim()).some(part => matchesCompound(this, part));
        }
        closest(sel) {
            let cur = this;
            while (cur) {
                if (cur.matches(sel)) return cur;
                cur = cur.parentElement;
            }
            return null;
        }
        querySelectorAll(sel) {
            const out = [];
            const walk = node => {
                for (const c of node.children) {
                    if (c.matches(sel)) out.push(c);
                    walk(c);
                }
            };
            walk(this);
            return out;
        }
        querySelector(sel) {
            return this.querySelectorAll(sel)[0] || null;
        }
    }

    function matchesSimple(el, token) {
        if (!el || !token) return false;
        let rem = token;
        const tagMatch = rem.match(/^[a-zA-Z0-9_-]+/);
        if (tagMatch) {
            if (el.tagName !== tagMatch[0].toUpperCase()) return false;
            rem = rem.slice(tagMatch[0].length);
        }
        while (rem.length > 0) {
            if (rem[0] === '#') {
                const m = rem.slice(1).match(/^[a-zA-Z0-9_-]+/);
                if (!m || el.id !== m[0]) return false;
                rem = rem.slice(1 + m[0].length);
            } else if (rem[0] === '.') {
                const m = rem.slice(1).match(/^[a-zA-Z0-9_-]+/);
                const cls = String(el.className || '').split(/\s+/);
                if (!m || (!cls.includes(m[0]) && !el.classList.contains(m[0]))) return false;
                rem = rem.slice(1 + m[0].length);
            } else if (rem[0] === '[') {
                const end = rem.indexOf(']');
                const inside = rem.slice(1, end);
                const eq = inside.indexOf('=');
                if (eq === -1) {
                    if (!el.attrs.has(inside)) return false;
                } else {
                    const k = inside.slice(0, eq).trim();
                    const v = inside.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
                    if (el.getAttribute(k) !== v) return false;
                }
                rem = rem.slice(end + 1);
            } else {
                return false;
            }
        }
        return true;
    }

    function splitSelectorParts(selector) {
        const parts = [];
        let cur = '';
        let inBracket = false;
        for (const ch of String(selector).trim()) {
            if (ch === '[') inBracket = true;
            else if (ch === ']') inBracket = false;
            if (!inBracket && /\s/.test(ch)) {
                if (cur) { parts.push(cur); cur = ''; }
            } else {
                cur += ch;
            }
        }
        if (cur) parts.push(cur);
        return parts;
    }

    function matchesCompound(el, selector) {
        const parts = splitSelectorParts(selector);
        if (!matchesSimple(el, parts[parts.length - 1])) return false;
        let cur = el.parentElement;
        for (let i = parts.length - 2; i >= 0; i--) {
            while (cur && !matchesSimple(cur, parts[i])) cur = cur.parentElement;
            if (!cur) return false;
            cur = cur.parentElement;
        }
        return true;
    }

    const doc = {
        execCommands: [],
        createElement: tag => new FakeElement(tag, doc),
        getElementById: id => doc.documentElement.querySelector(`#${id}`),
        querySelector: sel => doc.documentElement.querySelector(sel),
        querySelectorAll: sel => doc.documentElement.querySelectorAll(sel),
        execCommand: (cmd, ui, val) => {
            doc.execCommands.push({ cmd, ui, val });
            if (cmd === 'insertText' && doc.activeEl) {
                doc.activeEl.value = String(val ?? '');
                return true;
            }
            return false;
        }
    };
    doc.documentElement = new FakeElement('html', doc);
    doc.head = new FakeElement('head', doc);
    doc.body = new FakeElement('body', doc);
    doc.documentElement.appendChild(doc.head);
    doc.documentElement.appendChild(doc.body);
    return { doc, FakeElement };
}

test('injectAiSummaryStyles scopes chip hiding strictly under active card class and styles green Resume de verdad button', () => {
    const { doc } = createFakeDom();
    const s1 = injectAiSummaryStyles(doc);
    const s2 = injectAiSummaryStyles(doc);
    assert.equal(s1, s2);
    assert.equal(doc.head.children.length, 1);

    const css = s1.textContent;
    assert.match(css, /body\.supratube-ia-tarjeta-activa\s+you-chat-chips-data/);
    assert.doesNotMatch(css, /(^|\n)\s*you-chat-chips-data\s*\{/);
    assert.match(css, /#supratube-ia-resume-btn[\s\S]*border[\s\S]*#22c55e/);
});

test('ensureResumeButton mounts Resume de verdad immediately after you-chat-chips-data without duplicating', () => {
    const { doc } = createFakeDom();
    const panelBody = doc.createElement('div');
    const chips = doc.createElement('you-chat-chips-data');
    chips.className = 'ytwYouChatChipsDataHost';
    const nativeWrap = doc.createElement('div');
    nativeWrap.className = 'ytwYouChatChipsDataChipWrapper';
    const nativeBtn = doc.createElement('button');
    nativeBtn.className = 'ytwYouChatChipsDataChip';
    nativeBtn.textContent = 'Resume el video';
    nativeWrap.appendChild(nativeBtn);
    chips.appendChild(nativeWrap);
    panelBody.appendChild(chips);
    doc.body.appendChild(panelBody);

    let clicks = 0;
    const btn1 = ensureResumeButton(doc, null, () => { clicks += 1; });
    const btn2 = ensureResumeButton(doc, null, () => { clicks += 1; });

    assert.ok(btn1);
    assert.equal(btn1, btn2);
    assert.equal(btn1.textContent, 'Resume de verdad');
    // Must live outside <you-chat-chips-data>, as its immediate next sibling, so YouTube Wiz reconciler never wipes it.
    assert.equal(chips.children.length, 1);
    assert.equal(chips.nextElementSibling?.id, 'supratube-ia-resume-wrap');
    assert.equal(panelBody.querySelectorAll('#supratube-ia-resume-btn').length, 1);

    btn1.click();
    assert.equal(clicks, 1);
});

test('AI controller auto-opens Preguntar once per video, aborts on music videos, and cleans card only on Resume de verdad click', () => {
    const { doc } = createFakeDom();
    const scheduled = [];
    const setTimer = (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; };
    const win = {
        Event: class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
        KeyboardEvent: class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
        HTMLTextAreaElement: function () {}
    };
    win.HTMLTextAreaElement.prototype = {};

    // Metadata bar with Preguntar entrypoint
    const menuBar = doc.createElement('ytd-menu-renderer');
    menuBar.className = 'ytd-watch-metadata';
    const epWrap = doc.createElement('div');
    epWrap.className = 'you-chat-entrypoint-button';
    const askBtn = doc.createElement('button');
    askBtn.setAttribute('aria-label', 'Preguntar');
    epWrap.appendChild(askBtn);
    menuBar.appendChild(epWrap);
    doc.body.appendChild(menuBar);

    const ctrl = createAiSummaryController({ doc, win, setTimer, transitionDelayMs: 0 });
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });
    // Release transition timer
    scheduled.splice(0).forEach(t => t.fn());
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });

    assert.equal(askBtn.clicked, 1, 'must auto-click Preguntar once upon entering watch page');

    // Simulate Ask panel appearing with chips, disclaimer, textarea & Enviar button
    const panel = doc.createElement('ytd-engagement-panel-section-list-renderer');
    const chips = doc.createElement('you-chat-chips-data');
    chips.className = 'ytwYouChatChipsDataHost';
    const form = doc.createElement('form');
    form.className = 'chatInputViewModelChatInputForm';
    const textarea = doc.createElement('textarea');
    textarea.className = 'chatInputViewModelChatInput';
    textarea.addEventListener('focus', () => { doc.activeEl = textarea; });
    const sendBtn = doc.createElement('button');
    sendBtn.setAttribute('aria-label', 'Enviar');
    form.appendChild(textarea);
    form.appendChild(sendBtn);
    const footer = doc.createElement('div');
    footer.id = 'footer';
    footer.appendChild(form);
    const discWrap = doc.createElement('div');
    const discSpan = doc.createElement('span');
    discSpan.textContent = 'La IA puede cometer errores, así que verifica las respuestas.';
    discWrap.appendChild(discSpan);
    panel.appendChild(chips);
    panel.appendChild(discWrap);
    panel.appendChild(footer);
    doc.body.appendChild(panel);

    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });
    const resumeBtn = doc.getElementById('supratube-ia-resume-btn');
    assert.ok(resumeBtn, 'Resume de verdad button must appear once panel opens');
    assert.equal(textarea.value, '', 'must NOT auto-send prompt before clicking Resume de verdad');

    // If user uses a native chip / regular chat, must NOT hide UI into clean card
    const regularMsg = doc.createElement('div');
    regularMsg.setAttribute('role', 'alert');
    regularMsg.className = 'ytwYouChatItemViewModelHost';
    const regularActions = doc.createElement('yt-response-actions-view-model');
    regularMsg.appendChild(regularActions);
    panel.appendChild(regularMsg);
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });
    assert.equal(doc.body.classList.contains('supratube-ia-tarjeta-activa'), false);

    // Click Resume de verdad!
    resumeBtn.click();
    assert.equal(textarea.value, AI_SUMMARY_PROMPT);
    assert.equal(resumeBtn.disabled, true);
    // Run submit timer
    scheduled.splice(0).forEach(t => t.fn());
    assert.equal(sendBtn.clicked, 1);

    // Prior message must NOT trigger completion; wait for a NEW multipart response
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });
    assert.equal(doc.body.classList.contains('supratube-ia-tarjeta-activa'), false);

    const part1 = doc.createElement('div');
    part1.setAttribute('role', 'alert');
    part1.className = 'ytwYouChatItemViewModelHost';
    const part2 = doc.createElement('div');
    part2.setAttribute('role', 'alert');
    part2.className = 'ytwYouChatItemViewModelHost ytwYouChatItemViewModelChatResponseStyleMultiPartEnd';
    const actions2 = doc.createElement('yt-response-actions-view-model');
    part2.appendChild(actions2);
    panel.appendChild(part1);
    panel.appendChild(part2);

    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });
    assert.equal(doc.body.classList.contains('supratube-ia-tarjeta-activa'), true);
    assert.equal(regularMsg.style.display, 'none');
    assert.equal(part1.style.display, '');
    assert.equal(part2.style.display, '');
    assert.equal(discSpan.style.display, 'none');
    assert.equal(discWrap.style.display, 'none');

    // Navigate to a music video without Preguntar -> must reset card and abort cleanly via 3-dots lock
    askBtn.remove();
    panel.remove();
    const moreBtn = doc.createElement('button');
    moreBtn.setAttribute('aria-label', 'Más acciones');
    const shape = doc.createElement('yt-button-shape');
    shape.id = 'button-shape';
    shape.appendChild(moreBtn);
    menuBar.appendChild(shape);
    const paperItem = doc.createElement('tp-yt-paper-item');
    paperItem.textContent = 'Mostrar transcripción';
    doc.body.appendChild(paperItem);

    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=musicVid222', videoId: 'musicVid222' });
    assert.equal(doc.body.classList.contains('supratube-ia-tarjeta-activa'), false);
    assert.equal(regularMsg.style.display, '');
    scheduled.splice(0).forEach(t => t.fn());
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=musicVid222', videoId: 'musicVid222' });
    assert.equal(moreBtn.clicked, 1);
    scheduled.splice(0).forEach(t => t.fn()); // inspects menu and locks musicVid222
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=musicVid222', videoId: 'musicVid222' });
    assert.equal(moreBtn.clicked, 1, 'music video lock must prevent re-opening 3-dots menu in a loop');
});

test('AI controller respects manual panel close and tears down cleanly when popup toggle is disabled', () => {
    const { doc } = createFakeDom();
    const win = {};
    const menuBar = doc.createElement('ytd-menu-renderer');
    menuBar.className = 'ytd-watch-metadata';
    const epWrap = doc.createElement('div');
    epWrap.className = 'you-chat-entrypoint-button';
    const askBtn = doc.createElement('button');
    askBtn.setAttribute('aria-label', 'Preguntar');
    epWrap.appendChild(askBtn);
    menuBar.appendChild(epWrap);
    doc.body.appendChild(menuBar);

    const ctrl = createAiSummaryController({ doc, win, transitionDelayMs: 0 });
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidClose111', videoId: 'vidClose111' });
    assert.equal(askBtn.clicked, 1);

    // User closed panel before chips rendered -> next ticks do not re-click Preguntar
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidClose111', videoId: 'vidClose111' });
    assert.equal(askBtn.clicked, 1);

    // User manually re-opens Ask panel -> Resume de verdad button mounts cleanly
    const panel = doc.createElement('div');
    const chips = doc.createElement('you-chat-chips-data');
    chips.className = 'ytwYouChatChipsDataHost';
    panel.appendChild(chips);
    doc.body.appendChild(panel);
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidClose111', videoId: 'vidClose111' });
    assert.ok(doc.getElementById('supratube-ia-resume-btn'));

    // User disables aiSummary toggle in popup -> clean removal
    doc.body.classList.add('supratube-ia-tarjeta-activa');
    ctrl.tick({ enabled: false, url: 'https://www.youtube.com/watch?v=vidClose111', videoId: 'vidClose111' });
    assert.equal(doc.body.classList.contains('supratube-ia-tarjeta-activa'), false);
    assert.equal(doc.getElementById('supratube-ia-resume-btn'), null);
});
