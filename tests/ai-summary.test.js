import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AI_SUMMARY_PROMPT,
    AI_CORRECTED_PROMPT,
    AI_RESUME_BTN_ID,
    AI_CORRECT_BTN_ID,
    injectAiSummaryStyles,
    ensureAiButtons,
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

test('injectAiSummaryStyles styles green chip buttons without hiding any YouTube chat elements', () => {
    const { doc } = createFakeDom();
    const s1 = injectAiSummaryStyles(doc);
    const s2 = injectAiSummaryStyles(doc);
    assert.equal(s1, s2);
    assert.equal(doc.head.children.length, 1);

    const css = s1.textContent;
    assert.doesNotMatch(css, /supratube-ia-tarjeta-activa/);
    assert.doesNotMatch(css, /yt-chat-input-view-model|#footer/);
    assert.doesNotMatch(css, /display:\s*none/);
    assert.match(css, /\.ytwYouChatChipsDataChip\.supratube-ia-chip-btn[\s\S]*border[\s\S]*#22c55e/);
    assert.match(css, /\.supratube-ia-chip-wrap[\s\S]*opacity:\s*1/);
});

test('ensureAiButtons mounts both green chips inside first visible you-chat-chips-data without duplicating or adding extra wrappers', () => {
    const { doc } = createFakeDom();
    const panelBody = doc.createElement('div');
    const itemRow = doc.createElement('you-chat-item-view-model');
    itemRow.className = 'ytwYouChatItemViewModelYouChatItemViewModel';

    const chips = doc.createElement('you-chat-chips-data');
    chips.className = 'ytwYouChatChipsDataHost';
    const nativeWrap = doc.createElement('div');
    nativeWrap.className = 'ytwYouChatChipsDataChipWrapper';
    const nativeBtn = doc.createElement('button');
    nativeBtn.className = 'ytwYouChatChipsDataChip';
    nativeBtn.textContent = 'Resume el video';
    nativeWrap.appendChild(nativeBtn);
    chips.appendChild(nativeWrap);
    itemRow.appendChild(chips);

    // Second native chip group further down in panel (must NOT get duplicate custom buttons)
    const secondChips = doc.createElement('you-chat-chips-data');
    secondChips.className = 'ytwYouChatChipsDataHost';

    // Simulate stale legacy sibling wrapper left behind before upgrade
    const staleLegacy = doc.createElement('div');
    staleLegacy.id = 'supratube-ia-resume-wrap';
    itemRow.appendChild(staleLegacy);

    panelBody.appendChild(itemRow);
    panelBody.appendChild(secondChips);
    doc.body.appendChild(panelBody);

    const clickedActions = [];
    const btns1 = ensureAiButtons(doc, action => clickedActions.push(action.id));
    const btns2 = ensureAiButtons(doc, action => clickedActions.push(action.id));

    assert.equal(btns1.length, 2);
    assert.deepEqual(btns2, btns1);
    assert.equal(doc.getElementById('supratube-ia-resume-wrap'), null, 'stale outer wrapper must be removed');
    assert.equal(itemRow.children.length, 1, 'must NOT add sibling elements inside flex-row you-chat-item-view-model');
    assert.equal(chips.children.length, 3, 'two green chips appended cleanly inside first you-chat-chips-data');
    assert.equal(secondChips.children.length, 0, 'must NOT duplicate buttons into secondary chip groups');

    const [resumeBtn, correctBtn] = btns1;
    assert.equal(resumeBtn.id, AI_RESUME_BTN_ID);
    assert.equal(resumeBtn.textContent, 'Resume de verdad');
    assert.ok(resumeBtn.classList.contains('ytwYouChatChipsDataChip'));
    assert.equal(correctBtn.id, AI_CORRECT_BTN_ID);
    assert.equal(correctBtn.textContent, 'Dame la version corregida');
    assert.ok(correctBtn.classList.contains('ytwYouChatChipsDataChip'));

    resumeBtn.click();
    correctBtn.click();
    assert.deepEqual(clickedActions, [AI_RESUME_BTN_ID, AI_CORRECT_BTN_ID]);
});

test('AI controller never auto-clicks Preguntar/menu, never hides chat UI, and sends both prompts cleanly', () => {
    const { doc } = createFakeDom();
    const scheduled = [];
    const setTimer = (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; };
    const win = {
        Event: class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
        KeyboardEvent: class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
        HTMLTextAreaElement: function () {}
    };
    win.HTMLTextAreaElement.prototype = {};

    // Metadata bar with Preguntar & 3-dots menu (must never be auto-clicked)
    const menuBar = doc.createElement('ytd-menu-renderer');
    menuBar.className = 'ytd-watch-metadata';
    const epWrap = doc.createElement('div');
    epWrap.className = 'you-chat-entrypoint-button';
    const askBtn = doc.createElement('button');
    askBtn.setAttribute('aria-label', 'Preguntar');
    epWrap.appendChild(askBtn);
    menuBar.appendChild(epWrap);
    const moreBtn = doc.createElement('button');
    moreBtn.setAttribute('aria-label', 'Más acciones');
    menuBar.appendChild(moreBtn);
    doc.body.appendChild(menuBar);

    const ctrl = createAiSummaryController({ doc, win, setTimer });
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });
    scheduled.splice(0).forEach(t => t.fn());
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });

    assert.equal(askBtn.clicked, 0, 'must NOT auto-click Preguntar');
    assert.equal(moreBtn.clicked, 0, 'must NOT auto-open 3-dots menu');

    // User manually opens Ask panel
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
    const priorMsg = doc.createElement('div');
    priorMsg.setAttribute('role', 'alert');
    priorMsg.className = 'ytwYouChatItemViewModelHost';
    const actions = doc.createElement('yt-response-actions-view-model');
    priorMsg.appendChild(actions);

    panel.appendChild(chips);
    panel.appendChild(priorMsg);
    panel.appendChild(discWrap);
    panel.appendChild(footer);
    doc.body.appendChild(panel);

    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });
    const resumeBtn = doc.getElementById(AI_RESUME_BTN_ID);
    const correctBtn = doc.getElementById(AI_CORRECT_BTN_ID);
    assert.ok(resumeBtn, 'Resume de verdad button must appear once Ask panel is open');
    assert.ok(correctBtn, 'Dame la version corregida button must appear once Ask panel is open');
    assert.equal(textarea.value, '', 'must NOT auto-send prompt before clicking a green chip');

    // Click Resume de verdad
    resumeBtn.click();
    assert.equal(textarea.value, AI_SUMMARY_PROMPT);
    assert.equal(resumeBtn.disabled, true);
    assert.equal(correctBtn.disabled, true);
    scheduled.splice(0).forEach(t => t.fn());
    assert.equal(sendBtn.clicked, 1);
    assert.equal(resumeBtn.disabled, false);
    assert.equal(correctBtn.disabled, false);

    // Response arrives -> must NOT delete or hide any chat elements
    const reply = doc.createElement('div');
    reply.setAttribute('role', 'alert');
    reply.className = 'ytwYouChatItemViewModelHost';
    reply.appendChild(doc.createElement('yt-response-actions-view-model'));
    panel.appendChild(reply);
    ctrl.tick({ enabled: true, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });

    assert.equal(doc.body.classList.contains('supratube-ia-tarjeta-activa'), false);
    assert.equal(priorMsg.style.display, '');
    assert.equal(discSpan.style.display, '');
    assert.equal(discWrap.style.display, '');
    assert.equal(footer.style.display, '');

    // Click Dame la version corregida -> sends full Correccion Absoluta + simple neutral Spanish 500-char prompt
    correctBtn.click();
    assert.equal(textarea.value, AI_CORRECTED_PROMPT);
    assert.match(AI_CORRECTED_PROMPT, /500 caracteres/);
    assert.match(AI_CORRECTED_PROMPT, /español simple y neutro, no erudito/);
    assert.match(AI_CORRECTED_PROMPT, /Descomprime cronicas, relatos historicos, noticias polarizantes/);
    assert.match(AI_CORRECTED_PROMPT, /La Prueba del Espejo/);
    assert.match(AI_CORRECTED_PROMPT, /solo la evidencia del proceso decide\.$/);
    scheduled.splice(0).forEach(t => t.fn());
    assert.equal(sendBtn.clicked, 2);

    // User disables aiSummary toggle in popup -> removes only our two chips cleanly
    ctrl.tick({ enabled: false, url: 'https://www.youtube.com/watch?v=vidOne11111', videoId: 'vidOne11111' });
    assert.equal(doc.getElementById(AI_RESUME_BTN_ID), null);
    assert.equal(doc.getElementById(AI_CORRECT_BTN_ID), null);
    assert.equal(footer.style.display, '');
});
