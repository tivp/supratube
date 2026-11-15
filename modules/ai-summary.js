export const AI_STYLE_ID = 'supratube-ia-styles';
export const AI_RESUME_WRAP_ID = 'supratube-ia-resume-wrap';
export const AI_RESUME_BTN_ID = 'supratube-ia-resume-btn';
export const AI_CARD_ACTIVE_CLASS = 'supratube-ia-tarjeta-activa';

export const AI_SUMMARY_PROMPT = `Resume este video de YouTube.

Instrucciones IMPORTANTES:

1. LONGITUD: Tu respuesta debe ser con un maximo de 500 caracteres.
2. MARKDOWN: Usalo siempre en toda respuesta.
3. LA REGLA: Responde sin hipelalia, breve y directo. Siempre da respuestas que respondan como si fueran alguien que se vio el video completo. La respuesta debe ahorrarte verte el video, es un spoiler si o si que te evite verte el video. Añade los puntos donde se mencionan en el video lo que dices.
4. ESTRUCTURA DINÁMICA (Aplica la que corresponda al tipo de video):
   - Si el video es un "Top", ranking o lista: Enumera explícitamente cada puesto del top y redacta una breve descripción de lo que ocurre o se explica en cada uno. Has esto estructurado breve y sin hiperlalia.
   - Si el video es narrativo, un documental, un gameplay o explicativo: Divide tu resumen en tres bloques: "Inicio", "Desarrollo" y "Desenlace" pero no menciones el titulo de estos solo has un parrafo por cada uno y añade detalles que solo responderia si eres alguien que se vio el video completo.
   - Si el video es musica, identifica la obra original especifica autor, obra, año y nacionalidad quirurjicamente (aveces si es un autor indie puedes usar su pseudonimo y/o investigar en foros o en plataformas de archivos donde se publico su obra (soundcloud, newground, etc) y investigar minusiosamente aun más dando con el nombre del autor usando como termino de busqueda este pseudonimo y/o el nombre de la obra, (un ejemplo de busqueda minusiosa) por ejemplo: El caso de adobe universal patcher, buscando una obra puedes encontrar que la obra fue archivado en modarchive.org bajo el nombre de easter_egg.xm formato similar a un .midi que en su epoca era popular para componer temas para keygens y como autor påskchip, viendo los metadatos del archivo dice que el autor realmente es "Ghidorah" donde dice que la cancion fue hecha en "älandsbro" un lugar de europa), la obra siempre en negrita, el autor y la fecha tambien, menciona esto brevemente antes del inicio desarrollo y final.`;

const AI_SUMMARY_CSS = `
    body.${AI_CARD_ACTIVE_CLASS} you-chat-chips-data,
    body.${AI_CARD_ACTIVE_CLASS} #${AI_RESUME_WRAP_ID} { display: none !important; }
    body.${AI_CARD_ACTIVE_CLASS} ytd-engagement-panel-title-header-renderer h2#title { display: none !important; }
    body.${AI_CARD_ACTIVE_CLASS} .ytwYouChatItemViewModelIcon { display: none !important; }
    body.${AI_CARD_ACTIVE_CLASS} yt-response-actions-view-model { display: none !important; }

    body.${AI_CARD_ACTIVE_CLASS} #footer yt-chat-input-view-model,
    body.${AI_CARD_ACTIVE_CLASS} #footer.ytd-engagement-panel-section-list-renderer {
        display: none !important; height: 0 !important; padding: 0 !important; margin: 0 !important; border: none !important;
    }

    body.${AI_CARD_ACTIVE_CLASS} .ytChatUserTurnViewModelTextContainer,
    body.${AI_CARD_ACTIVE_CLASS} yt-chat-user-turn-view-model {
        display: none !important; height: 0 !important; padding: 0 !important; margin: 0 !important;
    }

    body.${AI_CARD_ACTIVE_CLASS} ytw-you-chat-carousel-view-model,
    body.${AI_CARD_ACTIVE_CLASS} you-chat-carousel-view-model { display: none !important; }

    #${AI_RESUME_WRAP_ID} {
        display: flex !important;
        justify-content: flex-end !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        margin: 8px 0 4px 0 !important;
    }

    #${AI_RESUME_BTN_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        max-width: 90%;
        padding: 8px 16px;
        border-radius: 18px;
        border: 1.5px solid #22c55e !important;
        background: rgba(34, 197, 94, 0.12);
        color: var(--yt-spec-text-primary, #f1f1f1);
        font-family: "Roboto", "Arial", sans-serif;
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }

    #${AI_RESUME_BTN_ID}:hover:not(:disabled) {
        background: rgba(34, 197, 94, 0.22);
        border-color: #4ade80 !important;
        box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.35);
    }

    #${AI_RESUME_BTN_ID}:disabled {
        opacity: 0.65;
        cursor: wait;
    }

    html:not([dark]) #${AI_RESUME_BTN_ID} {
        color: var(--yt-spec-text-primary, #0f0f0f);
        background: rgba(34, 197, 94, 0.10);
    }
`;

function isBoxVisible(el) {
    return Boolean(el && el.isConnected !== false && el.offsetWidth > 0 && el.offsetHeight > 0);
}

function isInputVisible(el) {
    return Boolean(el && el.isConnected !== false && el.offsetParent !== null && el.offsetWidth > 0);
}

function findFirstVisible(doc, selector, checkFn = isBoxVisible) {
    if (!doc?.querySelectorAll) return null;
    const list = doc.querySelectorAll(selector);
    for (let i = 0; i < list.length; i++) {
        if (checkFn(list[i])) return list[i];
    }
    return null;
}

/** Inject YouTube IA styles idempotently; chip hiding only applies when card mode is active. */
export function injectAiSummaryStyles(doc) {
    if (!doc?.createElement) return null;
    const existing = doc.getElementById?.(AI_STYLE_ID);
    if (existing) return existing;

    const style = doc.createElement('style');
    style.id = AI_STYLE_ID;
    style.textContent = AI_SUMMARY_CSS;
    const target = doc.head || doc.documentElement;
    target?.appendChild?.(style);
    return style;
}

/** Mount the green-bordered "Resume de verdad" button immediately after <you-chat-chips-data>. */
export function ensureResumeButton(doc, win = null, onClick = null) {
    if (!doc?.querySelectorAll) return null;
    const chipsEl = findFirstVisible(doc, 'you-chat-chips-data');
    if (!chipsEl || !chipsEl.parentElement) return null;

    const nextSib = chipsEl.nextElementSibling;
    if (nextSib?.id === AI_RESUME_WRAP_ID) {
        const existingBtn = nextSib.querySelector?.(`#${AI_RESUME_BTN_ID}`) || doc.getElementById?.(AI_RESUME_BTN_ID);
        if (existingBtn) {
            if (typeof onClick === 'function') existingBtn.__supratubeOnResumeClick = onClick;
            return existingBtn;
        }
    }

    const oldWrap = doc.getElementById?.(AI_RESUME_WRAP_ID);
    if (oldWrap && oldWrap !== nextSib) {
        oldWrap.remove?.();
    }

    const wrap = doc.createElement('div');
    wrap.id = AI_RESUME_WRAP_ID;
    wrap.className = 'supratube-ia-resume-wrap';

    try {
        const cs = win?.getComputedStyle?.(chipsEl);
        if (cs?.paddingRight && cs.paddingRight !== '0px') {
            wrap.style.paddingRight = cs.paddingRight;
        }
        if (cs?.paddingLeft && cs.paddingLeft !== '0px') {
            wrap.style.paddingLeft = cs.paddingLeft;
        }
    } catch {}

    const btn = doc.createElement('button');
    btn.id = AI_RESUME_BTN_ID;
    btn.type = 'button';
    btn.className = 'ytwYouChatChipsDataChip supratube-ia-resume-btn';
    btn.textContent = 'Resume de verdad';
    btn.__supratubeOnResumeClick = onClick;
    btn.addEventListener('click', ev => {
        ev?.stopPropagation?.();
        btn.__supratubeOnResumeClick?.();
    });

    wrap.appendChild(btn);
    if (typeof chipsEl.insertAdjacentElement === 'function') {
        chipsEl.insertAdjacentElement('afterend', wrap);
    } else {
        chipsEl.parentElement.appendChild(wrap);
    }
    return btn;
}

function hideElementRemembered(state, el) {
    if (!el?.style) return;
    el.style.display = 'none';
    if (!state.hiddenElements.includes(el)) {
        state.hiddenElements.push(el);
    }
}

/** Create controller managing SPA transitions, auto-open, Resume click, and clean card state. */
export function createAiSummaryController({
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = id => clearTimeout(id),
    transitionDelayMs = 2000
} = {}) {
    const state = {
        currentVideoId: '',
        autoOpenDoneForVideo: '',
        resumenSolicitado: false,
        pasoMensajeEnviado: false,
        inyectando: false,
        tarjetaCompletada: false,
        buscandoEnMenu: false,
        ultimoMensajeIAConocido: null,
        enTransicion: false,
        videoSinSoporteIA: false,
        hiddenElements: [],
        _transitionTimer: null,
        _menuTimer: null,
        _menuUnlockTimer: null,
        _injectTimer: null,
        _submitTimer: null,
        _panelObs: null,
        _observedPanelRoot: null
    };

    function clearPendingTimers() {
        clearTimer(state._transitionTimer);
        clearTimer(state._menuTimer);
        clearTimer(state._menuUnlockTimer);
        clearTimer(state._injectTimer);
        clearTimer(state._submitTimer);
        state._transitionTimer = null;
        state._menuTimer = null;
        state._menuUnlockTimer = null;
        state._injectTimer = null;
        state._submitTimer = null;
    }

    function restoreDomVisibility() {
        doc?.body?.classList?.remove?.(AI_CARD_ACTIVE_CLASS);

        for (let i = 0; i < state.hiddenElements.length; i++) {
            const el = state.hiddenElements[i];
            if (el?.style) el.style.display = '';
        }
        state.hiddenElements.length = 0;

        const msgs = doc?.querySelectorAll?.(
            '.ytChatUserTurnViewModelTextContainer, div[role="alert"].ytwYouChatItemViewModelHost'
        );
        if (msgs) {
            for (let i = 0; i < msgs.length; i++) {
                if (msgs[i]?.style) msgs[i].style.display = '';
            }
        }

        const btn = doc?.getElementById?.(AI_RESUME_BTN_ID);
        if (btn) btn.disabled = false;
    }

    function resetForVideo(videoId = '', withTransitionDelay = true) {
        clearPendingTimers();
        state.currentVideoId = videoId;
        state.autoOpenDoneForVideo = '';
        state.resumenSolicitado = false;
        state.pasoMensajeEnviado = false;
        state.inyectando = false;
        state.tarjetaCompletada = false;
        state.buscandoEnMenu = false;
        state.ultimoMensajeIAConocido = null;
        state.videoSinSoporteIA = false;
        restoreDomVisibility();

        if (withTransitionDelay && videoId && transitionDelayMs > 0) {
            state.enTransicion = true;
            state._transitionTimer = setTimer(() => {
                if (state.currentVideoId === videoId) {
                    state.enTransicion = false;
                }
            }, transitionDelayMs);
        } else {
            state.enTransicion = false;
        }
    }

    function teardownDisabled() {
        clearPendingTimers();
        state.resumenSolicitado = false;
        state.pasoMensajeEnviado = false;
        state.inyectando = false;
        state.tarjetaCompletada = false;
        state.buscandoEnMenu = false;
        restoreDomVisibility();
        doc?.getElementById?.(AI_RESUME_WRAP_ID)?.remove?.();
    }

    function tryOpenAskPanel() {
        if (state.buscandoEnMenu || state.autoOpenDoneForVideo === state.currentVideoId) return;
        const barraActiva = findFirstVisible(doc, 'ytd-menu-renderer.ytd-watch-metadata');
        if (!barraActiva) return;

        // Plan A: direct Ask entrypoint button in watch action bar.
        const botonesPreguntar = barraActiva.querySelectorAll(
            '.you-chat-entrypoint-button button, button[aria-label="Preguntar"], button[aria-label="Ask"]'
        );
        for (let i = 0; i < botonesPreguntar.length; i++) {
            if (isBoxVisible(botonesPreguntar[i])) {
                state.autoOpenDoneForVideo = state.currentVideoId;
                botonesPreguntar[i].click();
                return;
            }
        }

        // Plan B: overflow 3-dots menu -> "Preguntar" / abort lock for music/unsupported videos.
        const btnTresPuntos = findFirstVisible(
            barraActiva,
            'yt-button-shape#button-shape button[aria-label="Más acciones"], yt-button-shape#button-shape button[aria-label="More actions"]'
        );
        if (!btnTresPuntos) return;

        state.buscandoEnMenu = true;
        const attemptVid = state.currentVideoId;
        btnTresPuntos.click();

        state._menuTimer = setTimer(() => {
            if (state.currentVideoId !== attemptVid) {
                state.buscandoEnMenu = false;
                return;
            }
            const opciones = doc.querySelectorAll('tp-yt-paper-item, ytd-menu-service-item-renderer');
            let encontrado = false;
            for (let i = 0; i < opciones.length; i++) {
                const label = String(opciones[i].textContent || '').trim().toLowerCase();
                if (label === 'preguntar' || label === 'ask') {
                    opciones[i].click();
                    encontrado = true;
                    break;
                }
            }

            state.autoOpenDoneForVideo = attemptVid;
            if (!encontrado) {
                doc.body?.click?.();
                state.videoSinSoporteIA = true;
            }

            state._menuUnlockTimer = setTimer(() => {
                state.buscandoEnMenu = false;
            }, 500);
        }, 500);
    }

    function setTextareaPromptValue(cajaTexto, text) {
        cajaTexto.click?.();
        cajaTexto.focus?.();

        let inserted = false;
        try {
            if (typeof doc.execCommand === 'function') {
                inserted = doc.execCommand('insertText', false, text);
            }
        } catch {}

        if (!inserted || !String(cajaTexto.value || '').includes('Resume este video')) {
            const proto = win?.HTMLTextAreaElement?.prototype;
            const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
            if (desc?.set) {
                desc.set.call(cajaTexto, text);
            } else {
                cajaTexto.value = text;
            }
        }

        const EventCtor = win?.Event || Event;
        cajaTexto.dispatchEvent(new EventCtor('input', { bubbles: true, cancelable: true, composed: true }));
        cajaTexto.dispatchEvent(new EventCtor('change', { bubbles: true, cancelable: true, composed: true }));
    }

    function handleResumeClick() {
        if (state.pasoMensajeEnviado || state.inyectando || !state.currentVideoId) return;
        const cajaTexto = findFirstVisible(doc, 'textarea.chatInputViewModelChatInput', isInputVisible);
        if (!cajaTexto) return;

        state.resumenSolicitado = true;
        state.inyectando = true;
        const clickVid = state.currentVideoId;

        const resumeBtn = doc.getElementById?.(AI_RESUME_BTN_ID);
        if (resumeBtn) resumeBtn.disabled = true;

        const mensajesAntes = doc.querySelectorAll?.('div[role="alert"].ytwYouChatItemViewModelHost') || [];
        state.ultimoMensajeIAConocido = mensajesAntes.length > 0 ? mensajesAntes[mensajesAntes.length - 1] : null;

        setTextareaPromptValue(cajaTexto, AI_SUMMARY_PROMPT);

        state._submitTimer = setTimer(() => {
            if (state.currentVideoId !== clickVid) {
                state.inyectando = false;
                return;
            }

            const KeyEventCtor = win?.KeyboardEvent || KeyboardEvent;
            const enterConfig = { bubbles: true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
            cajaTexto.dispatchEvent(new KeyEventCtor('keydown', enterConfig));
            cajaTexto.dispatchEvent(new KeyEventCtor('keypress', enterConfig));
            cajaTexto.dispatchEvent(new KeyEventCtor('keyup', enterConfig));

            const formulario = cajaTexto.closest?.('form.chatInputViewModelChatInputForm') || doc;
            const botonEnviar = formulario.querySelector?.(
                'button[aria-label="Enviar"], button[aria-label="Send"], button[type="submit"]'
            );
            if (botonEnviar && !botonEnviar.disabled) {
                botonEnviar.click();
            }

            state.pasoMensajeEnviado = true;
            state.inyectando = false;
        }, 400);
    }

    function transformIntoCleanCard() {
        doc?.body?.classList?.add?.(AI_CARD_ACTIVE_CLASS);

        const todosLosMensajesIA = doc.querySelectorAll?.('div[role="alert"].ytwYouChatItemViewModelHost') || [];
        if (todosLosMensajesIA.length > 0) {
            const ultimoMensaje = todosLosMensajesIA[todosLosMensajesIA.length - 1];
            const esMensajeDividido = Boolean(
                ultimoMensaje.classList?.contains('ytwYouChatItemViewModelChatResponseStyleMultiPartEnd') ||
                ultimoMensaje.querySelector?.('horizontal-shelf-view-model')
            );
            const limiteOcultamiento = (esMensajeDividido && todosLosMensajesIA.length > 1)
                ? todosLosMensajesIA.length - 2
                : todosLosMensajesIA.length - 1;

            for (let i = 0; i < limiteOcultamiento; i++) {
                hideElementRemembered(state, todosLosMensajesIA[i]);
            }
        }

        const elementosTexto = doc.querySelectorAll?.('span, yt-formatted-string') || [];
        for (let i = 0; i < elementosTexto.length; i++) {
            const el = elementosTexto[i];
            const texto = el.textContent || '';
            if (texto.includes('IA puede cometer errores') || texto.includes('AI can make mistakes')) {
                if (el.parentElement) hideElementRemembered(state, el.parentElement);
                hideElementRemembered(state, el);
            }
        }

        state.tarjetaCompletada = true;
    }

    function checkResponseComplete() {
        if (!state.resumenSolicitado || !state.pasoMensajeEnviado) return;
        const mensajesIA = doc.querySelectorAll?.('div[role="alert"].ytwYouChatItemViewModelHost') || [];
        if (mensajesIA.length === 0) return;

        const ultimoMensaje = mensajesIA[mensajesIA.length - 1];
        if (ultimoMensaje === state.ultimoMensajeIAConocido) return;

        if (ultimoMensaje.querySelector?.('yt-response-actions-view-model')) {
            transformIntoCleanCard();
        }
    }

    function findAskPanelRoot() {
        const youChatEl =
            findFirstVisible(doc, 'you-chat-chips-data') ||
            findFirstVisible(doc, 'textarea.chatInputViewModelChatInput', isInputVisible);
        return (
            youChatEl?.closest?.('ytd-engagement-panel-section-list-renderer') ||
            youChatEl?.parentElement ||
            doc?.body ||
            null
        );
    }

    function ensurePanelObserver(enabled) {
        if (!enabled || typeof win?.MutationObserver !== 'function') return;
        const root = findAskPanelRoot();
        if (!root || state._observedPanelRoot === root) return;

        state._panelObs?.disconnect?.();
        state._observedPanelRoot = root;
        state._panelObs = new win.MutationObserver(() => {
            if (!state.currentVideoId || state.tarjetaCompletada || state.enTransicion) return;
            ensureResumeButton(doc, win, handleResumeClick);
            if (state.resumenSolicitado && state.pasoMensajeEnviado) {
                checkResponseComplete();
            }
        });
        state._panelObs.observe(root, { childList: true, subtree: true });
    }

    function tick({ enabled = true, url = '', videoId = '' } = {}) {
        if (!doc) return;
        if (!enabled) {
            if (state.currentVideoId || doc.body?.classList?.contains?.(AI_CARD_ACTIVE_CLASS) || doc.getElementById?.(AI_RESUME_WRAP_ID)) {
                teardownDisabled();
            }
            return;
        }

        if (!String(url).includes('/watch') || !videoId) {
            if (state.currentVideoId) resetForVideo('', false);
            return;
        }

        injectAiSummaryStyles(doc);

        if (videoId !== state.currentVideoId) {
            resetForVideo(videoId, true);
            if (state.enTransicion) return;
        }

        if (state.enTransicion || state.tarjetaCompletada) return;

        ensurePanelObserver(true);
        ensureResumeButton(doc, win, handleResumeClick);

        if (state.resumenSolicitado && state.pasoMensajeEnviado) {
            checkResponseComplete();
            return;
        }

        const panelAbierto = Boolean(
            findFirstVisible(doc, 'textarea.chatInputViewModelChatInput', isInputVisible) ||
            findFirstVisible(doc, 'you-chat-chips-data')
        );
        if (panelAbierto) {
            state.autoOpenDoneForVideo = state.currentVideoId;
        } else if (!state.videoSinSoporteIA && state.autoOpenDoneForVideo !== state.currentVideoId) {
            tryOpenAskPanel();
        }
    }

    function destroy() {
        clearPendingTimers();
        state._panelObs?.disconnect?.();
        state._panelObs = null;
        state._observedPanelRoot = null;
        restoreDomVisibility();
        doc?.getElementById?.(AI_RESUME_WRAP_ID)?.remove?.();
    }

    return {
        state,
        resetForVideo,
        tick,
        destroy
    };
}
