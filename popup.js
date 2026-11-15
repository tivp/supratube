// Popup de Supratube: toggles persistentes y sincronización de módulos desde GitHub.

import { DEFAULT_SETTINGS } from './modules/config.js';

const SETTINGS_KEY = 'supratube_settings';
const EXT_VERSION = chrome.runtime?.getManifest?.()?.version || '1.0.6';
const checkboxes = Array.from(document.querySelectorAll('input[data-setting]'));
const btnActualizar = document.getElementById('btn-actualizar-scripts');
const estadoEl = document.getElementById('estado-actualizacion');
const btnPermiso = document.getElementById('btn-permiso-userscripts');

let extensionIdActual = '';

function leerTogglesDOM() {
    const out = { ...DEFAULT_SETTINGS };
    for (const cb of checkboxes) {
        const key = cb.dataset.setting;
        if (key) out[key] = Boolean(cb.checked);
    }
    return out;
}

function aplicarTogglesDOM(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    for (const cb of checkboxes) {
        const key = cb.dataset.setting;
        if (key && key in merged) {
            cb.checked = Boolean(merged[key]);
        }
    }
}

chrome.storage.local.get(SETTINGS_KEY, datos => {
    if (!chrome.runtime.lastError) {
        aplicarTogglesDOM(datos?.[SETTINGS_KEY]);
    }
});

for (const cb of checkboxes) {
    cb.addEventListener('change', () => {
        chrome.storage.local.set({ [SETTINGS_KEY]: leerTogglesDOM() });
    });
}

function mostrarEstado(texto, tipo = '') {
    estadoEl.textContent = texto;
    estadoEl.className = tipo ? `estado-sync ${tipo}` : 'estado-sync';
}

function pintarEstadoGuardado(respuesta) {
    if (!respuesta || !respuesta.ok) {
        mostrarEstado(respuesta?.error || `Usando versión local v${EXT_VERSION}`);
        return;
    }

    extensionIdActual = respuesta.extensionId || chrome.runtime.id;
    btnPermiso.hidden = Boolean(respuesta.userScriptsActivo);

    if (respuesta.cache) {
        const c = respuesta.cache;
        const avisoPermiso = respuesta.userScriptsActivo
            ? ''
            : ' · Activa "Permitir scripts de usuario" para aplicar los cambios en vivo';
        mostrarEstado(
            `Sincronizado #${c.shaCorto} (${c.mensajeCommit}) · ${c.actualizadoEn}${avisoPermiso}`,
            respuesta.userScriptsActivo ? 'ok' : ''
        );
    } else if (!respuesta.userScriptsActivo) {
        mostrarEstado(
            `Usando módulos locales v${EXT_VERSION}. Activa "Permitir scripts de usuario" para auto-actualizar desde GitHub.`
        );
    } else {
        mostrarEstado(`Usando módulos locales v${EXT_VERSION}. Pulsa el botón para traer la última versión de GitHub.`);
    }
}

chrome.runtime.sendMessage({ action: 'SUPRATUBE_GET_STATUS' }, respuesta => {
    if (chrome.runtime.lastError) {
        mostrarEstado(`Usando versión local v${EXT_VERSION}`);
        return;
    }
    pintarEstadoGuardado(respuesta);
});

btnActualizar.addEventListener('click', () => {
    btnActualizar.disabled = true;
    const textoOriginal = btnActualizar.textContent;
    btnActualizar.textContent = 'Actualizando desde GitHub...';
    mostrarEstado('Descargando módulos desde GitHub...');

    chrome.runtime.sendMessage({ action: 'SUPRATUBE_UPDATE_SCRIPTS' }, respuesta => {
        btnActualizar.disabled = false;
        btnActualizar.textContent = textoOriginal;

        if (chrome.runtime.lastError) {
            mostrarEstado(`Error: ${chrome.runtime.lastError.message}`, 'error');
            return;
        }

        if (!respuesta || !respuesta.ok) {
            mostrarEstado(`Error: ${respuesta?.error || 'No se pudo actualizar'}`, 'error');
            return;
        }

        btnPermiso.hidden = Boolean(respuesta.userScriptsActivo);

        const c = respuesta.cache;
        const extraTabs = respuesta.pestanasActualizadas
            ? ` · ${respuesta.pestanasActualizadas} pestaña(s) actualizada(s)`
            : '';

        if (respuesta.userScriptsActivo) {
            mostrarEstado(
                `¡Actualizado! Commit #${c.shaCorto} (${c.mensajeCommit}) · ${c.actualizadoEn}${extraTabs}`,
                'ok'
            );
        } else {
            mostrarEstado(
                `Descargado #${c.shaCorto}, pero falta activar "Permitir scripts de usuario" en los detalles de la extensión.`,
                'error'
            );
        }
    });
});

btnPermiso.addEventListener('click', () => {
    const id = extensionIdActual || chrome.runtime.id;
    chrome.tabs.create({ url: `chrome://extensions/?id=${id}` });
});
