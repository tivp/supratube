export const AI_STYLE_ID = 'supratube-ia-styles';
export const AI_RESUME_WRAP_ID = 'supratube-ia-resume-wrap';
export const AI_RESUME_BTN_ID = 'supratube-ia-resume-btn';
export const AI_CORRECT_BTN_ID = 'supratube-ia-correct-btn';
export const AI_CHIP_WRAP_CLASS = 'supratube-ia-chip-wrap';
export const AI_CHIP_BTN_CLASS = 'supratube-ia-chip-btn';
const AI_LEGACY_CARD_CLASS = 'supratube-ia-tarjeta-activa';

export const AI_SUMMARY_PROMPT = `Resume este video de YouTube.

Instrucciones IMPORTANTES:

1. LONGITUD: Tu respuesta debe ser con un maximo de 500 caracteres.
2. MARKDOWN: Usalo siempre en toda respuesta.
3. LA REGLA: Responde sin hipelalia, breve y directo. Siempre da respuestas que respondan como si fueran alguien que se vio el video completo. La respuesta debe ahorrarte verte el video, es un spoiler si o si que te evite verte el video. Añade los puntos donde se mencionan en el video lo que dices.
4. ESTRUCTURA DINÁMICA (Aplica la que corresponda al tipo de video):
   - Si el video es un "Top", ranking o lista: Enumera explícitamente cada puesto del top y redacta una breve descripción de lo que ocurre o se explica en cada uno. Has esto estructurado breve y sin hiperlalia.
   - Si el video es narrativo, un documental, un gameplay o explicativo: Divide tu resumen en tres bloques: "Inicio", "Desarrollo" y "Desenlace" pero no menciones el titulo de estos solo has un parrafo por cada uno y añade detalles que solo responderia si eres alguien que se vio el video completo.
   - Si el video es musica, identifica la obra original especifica autor, obra, año y nacionalidad quirurjicamente (aveces si es un autor indie puedes usar su pseudonimo y/o investigar en foros o en plataformas de archivos donde se publico su obra (soundcloud, newground, etc) y investigar minusiosamente aun más dando con el nombre del autor usando como termino de busqueda este pseudonimo y/o el nombre de la obra, (un ejemplo de busqueda minusiosa) por ejemplo: El caso de adobe universal patcher, buscando una obra puedes encontrar que la obra fue archivado en modarchive.org bajo el nombre de easter_egg.xm formato similar a un .midi que en su epoca era popular para componer temas para keygens y como autor påskchip, viendo los metadatos del archivo dice que el autor realmente es "Ghidorah" donde dice que la cancion fue hecha en "älandsbro" un lugar de europa), la obra siempre en negrita, el autor y la fecha tambien, menciona esto brevemente antes del inicio desarrollo y final.`;

const CORRECCION_ABSOLUTA_PROTOCOL = `Descomprime cronicas, relatos historicos, noticias polarizantes y argumentos mediante lectura por ejes, proceso de activacion, falsabilidad y la Prueba del Espejo. Usala cuando el usuario pida aplicar la correccion absoluta, analizar o desarmar una cronica o fuente sesgada, auditar la densidad artificial de un relato, o blindar y corregir un argumento sin puntos ciegos.

Instructions
Correccion Absoluta
Protocolo autocalibrado de lectura critica de fuentes, descompresion de cronicas y blindaje dialectico. Separa el ruido editorial o el impacto de un estallido de las proporciones reales mediante cuatro dimensiones independientes, criterios de falsabilidad previa y simetria probatoria.

Cuando Usar
El usuario pide aplicar la "correccion absoluta" o el protocolo de lectura de cronicas por ejes y proceso.
Se analiza una cronica historica, noticia, relato polarizante o fuente que presenta un conflicto o rechazo como si fuera un bloque monolitico y unanime.
Se busca auditar, corregir o blindar un argumento propio o ajeno eliminando dicotomias falsas, sesgos de confirmacion y puntos ciegos.
Se requiere un guion de debate riguroso basado en primeros principios, acero interpretativo (steelmanning) y control de simetria.
Pasos del Protocolo
1. Tesis Operativa y Descompresion Inicial
Toda cronica o relato registra lo que quiso destacar quien tenia la pluma, no cuantas personas pensaban igual. El tamano de un estallido violento o la dureza de una ley tampoco miden proporciones demograficas, porque una minoria organizada tiene apalancamiento asimetrico y puede causar un dano enorme o capturar una institucion ante una mayoria pasiva.

La ilusion de "densidad monolitica" ocurre cuando se proyecta sin evidencia lo que sucede en una dimension sobre las otras (mientras que confirmar con evidencia que todas eran altas es un hallazgo valido). Descomprimir un relato consiste en medir cada dimension por separado.

2. Evaluacion en las Cuatro Dimensiones
Evalua el caso separando cuatro ejes independientes antes de emitir un juicio:

Clima (Peso Medio) - ¿Estaba instalado el prejuicio o agravio?

Indicios hacia Amplio: Sermones, leyes previas, literatura o calumnias recurrentes durante decadas en varios estratos.
Indicios hacia Faccioso o Dividido: Convivencia previa documentada sin friccion; discurso hostil reciente o importado.
Participacion (Peso Alto) - ¿Quien actuo realmente y que hizo falta para moverlo?

Indicios hacia Amplio: Accion horizontal simultanea en varios lugares; composicion transversal documentada (grupos sin un mismo interes material actuando juntos, advirtiendo siempre que una faccion tambien puede reclutar a varios sectores con promesas distintas).
Indicios hacia Faccioso o Dividido: Grupos pequenos e identificables; incentivos selectivos registrados (quitas de deudas, botin) o amenazas y sanciones de segundo orden contra vecinos tibios.
Poder (Peso Alto) - ¿Como se comportaron y dividieron las capas de autoridad (central, local, gremial, judicial)?

Indicios hacia Amplio: Todas las capas empujan en la misma direccion, o intentan frenar el estallido y son desbordadas desde abajo.
Indicios hacia Faccioso o Dividido: Golpe institucional previo para deponer a autoridades locales protectoras; choque abierto entre capas de mando.
Dia Despues (Peso Bajo / Ambiguo) - ¿Que ocurrio cuando bajo la espuma?

Indicios hacia Amplio: Nuevo orden o exclusion sostenidos a bajo costo de vigilancia.
Indicios hacia Faccioso o Dividido: Evasion reiterada, quejas constantes por incumplimiento o readmision pragmatica (nunca decide por si solo, pues la readmision tambien puede deberse a costos fiscales insostenibles).
Asigna a cada dimension uno de cinco resultados validos:

Alto
Bajo
Dividido
Inclinado hacia [X] (con baja confianza): Usalo cuando los indicios sean debiles o indirectos pero apunten en una direccion antes de rendirte a la indeterminacion.
Indeterminado por falta de registro: Ultimo recurso cuando la fuente calla o las objeciones simetricas anulan ambas hipotesis. Nunca lo uses como refugio comodo para evitar analizar indicios, pero recuerda que basta para refutar afirmaciones de unanimidad absoluta.
3. Procedimiento de Auditoria en 7 Pasos
Delimitacion de jurisdiccion: Declara que prueba la fuente por si sola (existencia del discurso y capacidad de dano o registro) y que no prueba (proporcion demografica).
Auditoria de incentivos: Identifica quien escribe, para quien y en medio de que disputa para orientar la busqueda de omisiones, sin invalidar automaticamente sus datos.
Lectura forense interna (intramuros): Extrae las fricciones que el propio texto confiesa involuntariamente (autoridades desplazadas, reproches a vecinos tibios, promesas materiales, divisiones de mando).
Triangulacion externa (extramuros): Cruza con registros de incentivos opuestos (fiscales, judiciales, comerciales, cronicas rivales), considerando el sesgo de supervivencia de cada archivo.
Control de tasa base: Compara con comunidades equivalentes bajo el mismo estimulo. Si solo conoces casos aislados, declaralos como excepciones que prueban posibilidad, nunca frecuencia.
Clausula de falsabilidad previa: Declara antes de concluir que evidencia concreta te obligaria a cambiar de lectura y devolver la pieza eliminada (regla del 10% de primeros principios).
Control de simetria (La Prueba del Espejo): Toma la misma objecion metodologica con la que cuestionaste la fuente y aplicala palabra por palabra contra tu propia hipotesis alternativa. Si tu hipotesis cae ante la misma exigencia y no hay indicios menores que inclinen la balanza con baja confianza, declara la dimension como Indeterminada.
4. Guion de Bolsillo para Debate en Vivo
Cuando el usuario necesite responder en una conversacion o debate rapido, estructura la intervencion en tres movimientos:

Conceder y separar: Reconoce la gravedad del hecho y la existencia del clima cultural, pero separa de inmediato tres cosas: el clima de fondo, cuanta gente paso a la accion y que hicieron las autoridades.
Preguntar por el cuello de botella: Cuestiona si la accion fue horizontal y espontanea, o si requirio desplazar autoridades locales primero, ofrecer beneficios selectivos o presionar a los indecisos.
Abrir las tres salidas: Si fue horizontal y desbordo autoridades, concede que el rechazo activo era amplio; si hubo golpes previos o incentivos facciosos, senala que una faccion activo un prejuicio de fondo; si la fuente solo muestra el incendio final sin el proceso, concluye que prueba el dano pero deja indeterminado cuantos lo apoyaban.
Errores Comunes a Evitar
Confundir existencia o efecto con proporcion: Un disidente costoso prueba que no habia unanimidad, no que fuera mayoria. Un incendio enorme prueba capacidad destructiva, no mayoria ni minoria.
Restar motivos que se suman: Los incentivos materiales (deudas, botin) no prueban ausencia de prejuicio ideologico; demuestran oportunismo faccioso operando sobre un clima cultural.
Confundir excepcion personal con cambio de clima: Proteger o comerciar con un vecino conocido demuestra friccion practica, pero puede coexistir con hostilidad hacia el grupo en abstracto.
Usar el silencio de la fuente como prueba: Que el cronista no mencione incentivos o resistencias no prueba que no existieran; ausencia de registro no es ausencia del hecho.
Citar sin verificacion directa: Nunca cites signaturas, folios, cifras finas o repartos de multas que no esten verificados directamente. Tres casos solidos y verificados valen mas que diez referencias dudosas.
Exagerar fallos o contradicciones del interlocutor: Aplica caridad interpretativa (steelmanning), formula la tesis ajena en su version mas fuerte, concede rapido lo verdadero y verifica que una contradiccion sea real antes de senalarla.
Usar metaforas como pruebas: El bisturi de primeros principios (quitar peso muerto y devolver la pieza si el relato falla) ilustra la actitud de limpieza, pero solo la evidencia del proceso decide.`;

export const AI_CORRECTED_PROMPT = `Analiza este video y dame la versión corregida y honesta de lo que realmente pasó según su contenido y evidencia, quitando exageraciones o encuadres sesgados.

Reglas obligatorias de tu respuesta:
1. LONGITUD: Máximo 500 caracteres en total.
2. IDIOMA Y ESTILO: En español simple y neutro, no erudito, directo y fácil de entender.
3. HONESTIDAD: Di qué pasó realmente según los hechos verificables del video y qué queda sin probarse.

Aplica este protocolo para elaborar tu respuesta:

${CORRECCION_ABSOLUTA_PROTOCOL}`;

export const AI_ACTION_BUTTONS = [
    {
        id: AI_RESUME_BTN_ID,
        wrapId: 'supratube-ia-resume-chip-wrap',
        label: 'Resume de verdad',
        prompt: AI_SUMMARY_PROMPT
    },
    {
        id: AI_CORRECT_BTN_ID,
        wrapId: 'supratube-ia-correct-chip-wrap',
        label: 'Dame la version corregida',
        prompt: AI_CORRECTED_PROMPT
    }
];

const AI_SUMMARY_CSS = `
    .${AI_CHIP_WRAP_CLASS} {
        opacity: 1 !important;
        animation: none !important;
    }

    .ytwYouChatChipsDataChip.${AI_CHIP_BTN_CLASS} {
        border: 1.5px solid #22c55e !important;
        background: rgba(34, 197, 94, 0.12) !important;
        color: var(--yt-spec-text-primary, #f1f1f1) !important;
        transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .ytwYouChatChipsDataChip.${AI_CHIP_BTN_CLASS}:hover:not(:disabled) {
        background: rgba(34, 197, 94, 0.22) !important;
        border-color: #4ade80 !important;
        box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.35);
    }

    .ytwYouChatChipsDataChip.${AI_CHIP_BTN_CLASS}:disabled {
        opacity: 0.65;
        cursor: wait;
    }

    html:not([dark]) .ytwYouChatChipsDataChip.${AI_CHIP_BTN_CLASS} {
        color: var(--yt-spec-text-primary, #0f0f0f) !important;
        background: rgba(34, 197, 94, 0.10) !important;
    }
`;

function aiIsBoxVisible(el) {
    return Boolean(el && el.isConnected !== false && el.offsetWidth > 0 && el.offsetHeight > 0);
}

function aiIsInputVisible(el) {
    return Boolean(el && el.isConnected !== false && el.offsetParent !== null && el.offsetWidth > 0);
}

function aiFindFirstVisible(root, selector, visibilityFn = aiIsBoxVisible) {
    const list = root?.querySelectorAll?.(selector);
    if (!list) return null;
    for (let i = 0; i < list.length; i++) {
        if (visibilityFn(list[i])) return list[i];
    }
    return null;
}

function removeInjectedAiUi(doc) {
    doc?.body?.classList?.remove?.(AI_LEGACY_CARD_CLASS);
    doc?.getElementById?.(AI_RESUME_WRAP_ID)?.remove?.();
    for (const action of AI_ACTION_BUTTONS) {
        doc?.querySelectorAll?.(`#${action.wrapId}, #${action.id}`)?.forEach?.(el => el.remove?.());
    }
}

/** Inject YouTube IA green chip styles idempotently without hiding any chat elements. */
export function injectAiSummaryStyles(doc) {
    if (!doc?.createElement) return null;
    const existing = doc.getElementById?.(AI_STYLE_ID);
    if (existing) {
        if (existing.textContent !== AI_SUMMARY_CSS) {
            existing.textContent = AI_SUMMARY_CSS;
        }
        return existing;
    }

    const style = doc.createElement('style');
    style.id = AI_STYLE_ID;
    style.textContent = AI_SUMMARY_CSS;
    const target = doc.head || doc.documentElement;
    target?.appendChild?.(style);
    return style;
}

/** Mount green AI suggestion chips directly inside the first visible <you-chat-chips-data> list. */
export function ensureAiButtons(doc, onActionClick = null) {
    if (!doc?.querySelectorAll) return [];

    // Remove legacy outer wrapper so flex-row <you-chat-item-view-model> is never squeezed.
    doc.getElementById?.(AI_RESUME_WRAP_ID)?.remove?.();
    doc.body?.classList?.remove?.(AI_LEGACY_CARD_CLASS);

    const chipsEl = aiFindFirstVisible(doc, 'you-chat-chips-data');
    if (!chipsEl) return [];

    const mounted = [];
    for (const action of AI_ACTION_BUTTONS) {
        // Deduplicate any stale or duplicate copies across the panel.
        let keptWrap = null;
        const allWraps = doc.querySelectorAll(`#${action.wrapId}`);
        for (let i = 0; i < allWraps.length; i++) {
            if (!keptWrap && allWraps[i].parentElement === chipsEl) {
                keptWrap = allWraps[i];
            } else {
                allWraps[i].remove?.();
            }
        }
        const allBtns = doc.querySelectorAll(`#${action.id}`);
        for (let i = 0; i < allBtns.length; i++) {
            if (keptWrap && allBtns[i].parentElement === keptWrap) continue;
            if (allBtns[i].parentElement?.id === action.wrapId) {
                allBtns[i].parentElement.remove?.();
            } else {
                allBtns[i].remove?.();
            }
        }

        const existingBtn = keptWrap?.querySelector?.(`#${action.id}`);
        if (keptWrap && existingBtn) {
            existingBtn.__supratubeOnClick = () => onActionClick?.(action);
            mounted.push(existingBtn);
            continue;
        }
        keptWrap?.remove?.();

        const wrap = doc.createElement('div');
        wrap.id = action.wrapId;
        wrap.className = `ytwYouChatChipsDataChipWrapper ${AI_CHIP_WRAP_CLASS}`;

        wrap.addEventListener('click', ev => {
            ev?.stopPropagation?.();
        });

        const btn = doc.createElement('button');
        btn.id = action.id;
        btn.type = 'button';
        btn.className = `ytwYouChatChipsDataChip ${AI_CHIP_BTN_CLASS}`;
        btn.textContent = action.label;
        btn.__supratubeOnClick = () => onActionClick?.(action);
        btn.addEventListener('click', ev => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            btn.__supratubeOnClick?.();
        });

        wrap.appendChild(btn);
        chipsEl.appendChild(wrap);
        mounted.push(btn);
    }

    return mounted;
}

/** Create passive AI chip controller: injects the green chips only, never alters or hides chat UI. */
export function createAiSummaryController({
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = id => clearTimeout(id)
} = {}) {
    const state = {
        currentVideoId: '',
        inyectando: false,
        _submitTimer: null,
        _panelObs: null,
        _observedPanelRoot: null
    };

    function clearPendingTimers() {
        clearTimer(state._submitTimer);
        state._submitTimer = null;
    }

    function setButtonsDisabled(disabled) {
        for (const action of AI_ACTION_BUTTONS) {
            const btn = doc?.getElementById?.(action.id);
            if (btn) btn.disabled = Boolean(disabled);
        }
    }

    function resetForVideo(videoId = '') {
        clearPendingTimers();
        state.currentVideoId = videoId;
        state.inyectando = false;
        setButtonsDisabled(false);
        doc?.body?.classList?.remove?.(AI_LEGACY_CARD_CLASS);
    }

    function teardownDisabled() {
        clearPendingTimers();
        state._panelObs?.disconnect?.();
        state._panelObs = null;
        state._observedPanelRoot = null;
        state.inyectando = false;
        removeInjectedAiUi(doc);
        doc?.getElementById?.(AI_STYLE_ID)?.remove?.();
    }

    function setTextareaPromptValue(cajaTexto, text) {
        cajaTexto.click?.();
        cajaTexto.focus?.();
        cajaTexto.select?.();

        let inserted = false;
        try {
            if (typeof doc.execCommand === 'function') {
                inserted = doc.execCommand('insertText', false, text);
            }
        } catch {}

        if (!inserted || String(cajaTexto.value || '') !== text) {
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

    function handleActionClick(action) {
        if (state.inyectando || !state.currentVideoId || !action?.prompt) return;
        const cajaTexto = aiFindFirstVisible(doc, 'textarea.chatInputViewModelChatInput', aiIsInputVisible);
        if (!cajaTexto) return;

        state.inyectando = true;
        const clickVid = state.currentVideoId;
        setButtonsDisabled(true);

        setTextareaPromptValue(cajaTexto, action.prompt);

        state._submitTimer = setTimer(() => {
            if (state.currentVideoId !== clickVid) {
                state.inyectando = false;
                setButtonsDisabled(false);
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

            state.inyectando = false;
            setButtonsDisabled(false);
        }, 400);
    }

    function findAskPanelRoot() {
        const youChatEl =
            aiFindFirstVisible(doc, 'you-chat-chips-data') ||
            aiFindFirstVisible(doc, 'textarea.chatInputViewModelChatInput', aiIsInputVisible);
        return (
            youChatEl?.closest?.('ytd-engagement-panel-section-list-renderer') ||
            youChatEl?.parentElement ||
            doc?.body ||
            null
        );
    }

    function ensurePanelObserver() {
        if (typeof win?.MutationObserver !== 'function') return;
        const root = findAskPanelRoot();
        if (!root || state._observedPanelRoot === root) return;

        state._panelObs?.disconnect?.();
        state._observedPanelRoot = root;
        state._panelObs = new win.MutationObserver(() => {
            if (!state.currentVideoId) return;
            ensureAiButtons(doc, handleActionClick);
        });
        state._panelObs.observe(root, { childList: true, subtree: true });
    }

    function tick({ enabled = true, url = '', videoId = '' } = {}) {
        if (!doc) return;
        if (!enabled) {
            teardownDisabled();
            return;
        }

        if (!String(url).includes('/watch') || !videoId) {
            if (state.currentVideoId) resetForVideo('');
            return;
        }

        injectAiSummaryStyles(doc);

        if (videoId !== state.currentVideoId) {
            resetForVideo(videoId);
        }

        ensurePanelObserver();
        ensureAiButtons(doc, handleActionClick);
    }

    function destroy() {
        clearPendingTimers();
        state._panelObs?.disconnect?.();
        state._panelObs = null;
        state._observedPanelRoot = null;
        removeInjectedAiUi(doc);
        doc?.getElementById?.(AI_STYLE_ID)?.remove?.();
    }

    return {
        state,
        resetForVideo,
        tick,
        destroy
    };
}
