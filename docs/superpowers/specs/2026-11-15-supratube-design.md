# Supratube — Especificación de Diseño

**Fecha:** 2026-11-15  
**Proyecto:** `C:\Users\Sofía\Downloads\Miximus\supratube`  
**Repositorio de actualización:** `https://github.com/tivp/supratube`  
**Base técnica:** Fork arquitectónico de `Miximus` / `chan2txt` (extensión Chrome MV3 modular con auto-actualizador vía `chrome.userScripts` y respaldo local `script.js`), evolucionando el script base `supratube/yotube 1.txt` (EasyTube V5) con mecanismos verificados mediante el pipeline **Mr Beast** (Greasy Fork + GitHub + pruebas en vivo).

---

## 1. Principios de Diseño y Experiencia Visual

1. **Cero huella visual en YouTube (100% invisible):**
   - Se eliminan por completo el botón flotante (`#et4_tog`), el panel flotante (`#et4_panel`), las notificaciones toast (`#et4_toast`) y el botón de descarga externa del script base `yotube 1.txt`.
   - Toda la automatización corre en segundo plano desde `document_start` en el mundo `MAIN` de la página (`www.youtube.com` y `m.youtube.com`).
   - La **única** adición visual sobre YouTube son los marcadores verdes sobre la barra de progreso del reproductor que indican dónde están los anuncios/patrocinios dentro del video.
2. **Popup de Chrome estilo `Maximus` / `chan2txt`:**
   - Conserva la estética limpia y el logo Transformer (`Transfomer Logo.png` / `Transfomer Logo.svg`).
   - Muestra el estado de sincronización y el botón **Actualizar los scripts de la extensión** (contra `tivp/supratube`) + botón **Activar permiso UserScripts en Chrome** si el permiso aún no está habilitado.
   - Incluye switches simples por función (todos activados por defecto: Ad Skip, Barra Verde / SponsorBlock, Auto 1080p, Subtítulos automáticos por IP) persistidos en `chrome.storage.local` y sincronizados hacia el mundo `MAIN` vía `content.js`.

---

## 2. Arquitectura MV3 y Auto-Actualizador (`tivp/supratube`)

### 2.1 Archivos principales
- `manifest.json` — MV3 con permisos `storage`, `scripting`, `tabs`, `userScripts`; `host_permissions` para YouTube, `api.github.com`, `raw.githubusercontent.com`, `sponsor.ajay.app` y los proveedores de geolocalización IP (`ipapi.co`, `freeipapi.com`, `ipwho.is`, `api.country.is`).
  - `content_scripts`:
    - `page-hook.js` (`world: "MAIN"`, `run_at: "document_start"`, `all_frames: false`)
    - `content.js` (`world: "ISOLATED"`, `run_at: "document_start"`, `all_frames: false`)
- `background.js` — Service Worker:
  - Apunta a `https://api.github.com/repos/tivp/supratube/commits/main` y `https://raw.githubusercontent.com/tivp/supratube/main`.
  - Mantiene `ORDEN_MODULOS`: `['config.js', 'utils.js', 'adblock.js', 'sponsorblock.js', 'quality.js', 'geo-lang.js', 'subtitles.js', 'main.js']`.
  - Al actualizar desde GitHub, compila los módulos ES6 en una IIFE única con guardia de idempotencia (`window.__supratubeEjecutado`) y la registra en `chrome.userScripts` con `world: 'MAIN'` y `runAt: 'document_start'` (con fallback a `world: 'USER_SCRIPT'` si fuese necesario).
  - Si `chrome.userScripts` no está activo todavía al abrir una pestaña, `SUPRATUBE_INIT_TAB` inyecta inmediatamente `script.js` (bundle compilado local de respaldo) en `world: 'MAIN'`.
  - Provee proxy HTTP CORS (`SUPRATUBE_HTTP_REQUEST` + `SUPRATUBE_ABORT`) para `GM_xmlhttpRequest`.
- `page-hook.js` — Polyfill ligero en mundo `MAIN` (`GM_xmlhttpRequest`, `GM_getValue`, `GM_setValue`, `GM_addStyle` compatible con Trusted Types usando `<style>` + `textContent`).
- `content.js` — Puente DOM (`supratube-bridge-http`, `supratube-bridge-abort`), lectura/propagación de `supratube_settings` desde `chrome.storage.local` al atributo `document.documentElement.dataset.supratubeSettings` + evento `supratube-settings-updated`, y disparo de `SUPRATUBE_INIT_TAB`.
- `popup.html` / `popup.js` — Interfaz de actualización GitHub + toggles por defecto activos.
- `modules/*.js` + `script.js` — Lógica modular y su bundle compilado idéntico para ejecución sin conexión a GitHub o sin permiso `userScripts`.
- `tools/build-bundle.mjs` — Script de desarrollo en Node.js que genera `script.js` a partir de `modules/*.js` usando la misma regla de empaquetado que `background.js` para garantizar paridad 1:1.

---

## 3. Diseño de los 5 Módulos Funcionales

### 3.1 Bloqueo y Salto de Anuncios (`modules/adblock.js`)
Combinación de prevención temprana + salto activo (basado en `yotube 1.txt` + `gf_579352`):
1. **Capa 0 (`document_start`, antes del arranque de YouTube):**
   - CSS estático (`GM_addStyle`) ocultando contenedores de anuncios en feed, masthead, reproductor (`#player-ads`, `ytd-ad-slot-renderer`, `.ytp-ad-text-overlay`, `.ytp-ad-image-overlay`, `.ytp-ad-timed-pie-countdown-container`, etc.).
   - Parche de `window.ytInitialPlayerResponse` (eliminando `adPlacements`, `playerAds`, `adSlots`, `enforcementMessageViewModel`, `upsellDialogRenderer`).
   - Parche de `Object.assign` para inyectar `contentPlaybackContext.isInlinePlaybackNoAd = true` cuando corresponda.
   - Interceptación de `window.fetch` y `XMLHttpRequest` para `/youtubei/v1/(player|next|get_watch|reel/reel_item_watch|browse|search|guide)`: inyecta `isInlinePlaybackNoAd: true` en peticiones salientes y limpia recursivamente claves de anuncios y renderers promocionados en las respuestas JSON entrantes.
2. **Capa 1 (Respaldo activo en el reproductor):**
   - `MutationObserver` sobre `#movie_player` + evento `ratechange`/`ended` en `<video>` + intervalo de respaldo de bajo costo (800 ms solo cuando `adSkip` está activo).
   - Si aparece un anuncio saltable (`.ytp-skip-ad-button`, `.ytp-ad-skip-button-modern`, etc.), adelanta a `video.duration - 0.1` y dispara click real (`MouseEvent` + `.click()`).
   - Si aparece un anuncio no saltable (`ad-showing` / `ad-interrupting`), aplica `playbackRate = 16` y `muted = true` (guardando volumen previo) y restaura `playbackRate = 1` + volumen previo al terminar el anuncio o salir del estado de anuncio.
   - Cierra botones de overlay (`.ytp-ad-overlay-close-button`) y descarta modales anti-adblock (`ytd-enforcement-message-view-model`) restaurando `overflow` del documento si quedó bloqueado.

### 3.2 SponsorBlock + Barra de Navegación Verde (`modules/sponsorblock.js`)
Basado en `yotube 1.txt` + `SponsorBlock Lite` (#560869) + `YT SuperTool` (#604559) (verificado HTTP 200 contra `sponsor.ajay.app`):
1. **Obtención de segmentos:**
   - Calcula los primeros 4 caracteres hex del SHA-256 del `videoId` y consulta `https://sponsor.ajay.app/api/skipSegments/<prefix>` (categorías: `sponsor`, `selfpromo`, `interaction`, `intro`, `outro`, `preview`, `music_offtopic`, `filler`, `exclusive_access`; `actionTypes`: `["skip", "mute"]`), con fallback al endpoint `?videoID=<id>` y caché local TTL de 5 minutos.
2. **Salto automático de anuncios dentro del video:**
   - Loop ligero (`requestAnimationFrame` throttled cada ~300 ms o `timeupdate`, activo solo en `/watch` y `/shorts` y pausado si `<video>` está en pausa).
   - Cuando `currentTime` entra en `[seg.start, seg.end - 0.15]`:
     - Si `actionType === 'mute'`, silencia solo mientras está dentro del tramo y restaura el volumen al salir.
     - Si `actionType === 'skip'`, salta a `seg.end` registrando `lastSkippedUUID` (si el usuario retrocede manualmente a otro punto y vuelve a entrar desde fuera del rango, se permite re-evaluar, pero no queda atrapado en bucle).
3. **Marcas verdes en la barra de navegación del video:**
   - Inyecta un contenedor `ul.supratube-sb-track` (`pointer-events: none`, `z-index: 42`) dentro de `.ytp-progress-bar` (desktop) y `.progress-bar-line` / `.advancement-bar-line` (móvil `m.youtube.com`).
   - Imita la escala nativa de YouTube (`scaleY(0.6)` en reposo, `scaleY(0.667)` en `.ytp-delhi-modern` y `scaleY(1)` en `:hover` / `.ytp-drag`).
   - Pinta cada segmento en **verde visible** (`#00d400` para `sponsor`, `#16a34a` / `#22c55e` para categorías secundarias como `selfpromo`/`exclusive_access`/`intro`/`outro`) con `left: (start/duration)*100%` y `width: ((end-start)/duration)*100%` (mínimo `1px`).
   - Se actualiza automáticamente ante `durationchange`, `loadedmetadata`, `yt-navigate-finish` y reconstrucciones del reproductor.

### 3.3 Calidad Inteligente 1080p / 1080p60 / Premium (`modules/quality.js`)
Basado en `YouTube HD Plus` (#508784) y `Youtube HD` (#23661):
1. **Detección de capacidades reales del usuario:**
   - Lee `player.getAvailableQualityData()`. Filtra únicamente objetos donde `item.isPlayable !== false` (las cuentas gratuitas muestran `1080p Premium` en la lista con `paygatedQualityDetails` y `isPlayable: false`, por lo que quedan descartados automáticamente sin disparar popups de upsell).
2. **Prioridad estricta (objetivo 1080p sin subir a 4K):**
   - Busca en los candidatos reproducibles de 1080p (`quality === 'hd1080'` o `parseQualityLabel(qualityLabel) === 1080`):
     1. `1080p60` con `Premium` (`isPlayable === true`, etiqueta incluye `Premium` y `60`)
     2. `1080p` con `Premium` (`isPlayable === true`, etiqueta incluye `Premium`)
     3. `1080p60` (etiqueta incluye `60`)
     4. `1080p` estándar (`hd1080`)
   - Si el video **no** ofrece 1080p, elige la mayor calidad reproducible disponible por debajo de 1080p (`720p60` -> `720p` -> `480p` -> `360p` -> `240p` -> `144p`). Nunca fuerza `1440p` ni `2160p`/`4K`.
3. **Aplicación y respeto de cambios manuales:**
   - Invoca `player.setPlaybackQualityRange(best.quality, best.quality, best.formatId)` y `player.setPlaybackQuality(best.quality)` en `canplay`, `loadstart` y reintentos breves tras navegación (`yt-navigate-finish` / `yt-page-data-updated`).
   - Si `getAvailableQualityData()` aún no está disponible, usa `player.getAvailableQualityLevels()` buscando `'hd1080'` y descendiendo en la escala (`hd720`, `large`, `medium`, `small`, `tiny`).
   - Si el usuario cambia manualmente la calidad desde el menú `.ytp-settings-menu` durante el video actual, activa `manualOverride` para ese `videoId` hasta que navegue al siguiente video.

### 3.4 Seguimiento de IP + Cookie de Idioma Natal (`modules/geo-lang.js`)
Endpoints verificados en vivo con HTTP 200:
1. **Cookie de idioma en `.youtube.com`:**
   - Nombre: `supratube_geo_lang` (con `path=/; domain=.youtube.com; SameSite=Lax; max-age=604800`, 7 días).
   - Contenido JSON codificado con `encodeURIComponent`: `{ lang, cc, ip, ts }`.
   - Al cargar un video, si la cookie ya existe y es válida, devuelve `lang` de forma **síncrona e instantánea** sin hacer peticiones de red.
   - Si el TTL de actualización rápida (p. ej. 24 h) expiró, puede refrescar en segundo plano para detectar cambios de VPN/IP sin bloquear la reproducción actual.
2. **Cascada de detección por IP (vía `GM_xmlhttpRequest` en `background.js`, sin problemas CORS):**
   1. `https://ipapi.co/json/` (entrega `ip`, `country_code`, `languages` p. ej. `es-CL`)
   2. `https://freeipapi.com/api/json` (entrega `countryCode`, `languages` p. ej. `["es"]`)
   3. `https://ipwho.is/` (entrega `ip`, `country_code`) + tabla completa ISO-3166 `COUNTRY_TO_LANG`
   4. `https://api.country.is/` (entrega `ip`, `country`) + tabla `COUNTRY_TO_LANG`
   5. Fallback local final: `navigator.language` (`'es'` por defecto si no se puede determinar).
   - Normaliza siempre a idioma base (`es-CL`, `es-MX`, `es-ES`, `es-419` -> `'es'`).

### 3.5 Subtítulos Inteligentes y Auto-Traducción (`modules/subtitles.js`)
Basado en la API real verificada en `More YouTube Hotkeys` (#383570), `YouTube +` (#537017), `YouTube Alchemy` (#521686) y `Ali-Flt/yt_auto_sub`:
1. **Normalización de variantes:**
   - `normalizarIdiomaBase(code)` convierte `es`, `es-419`, `es-MX`, `es-ES`, `es-AR`, `es-CL`, `es-US`, `es-CO` en `'es'`. Todas las variantes hispanas se tratan como el mismo idioma.
2. **Detección del idioma del video (priorizando audio activo):**
   - Inspecciona en orden:
     1. Pista de audio activa (`player.getAudioTrack?.()`, mapeando su ID/nombre contra los `audioTrack` de `playerResponse.streamingData.adaptiveFormats`, p. ej. `es-419.10` -> `es`, `en.4` -> `en`) — cubre videos con pistas dobladas.
     2. Pista de audio por defecto en `streamingData.adaptiveFormats` (`audioIsDefault === true`).
     3. Pista de subtítulo automática `asr` (`kind === 'asr'` o `vssId` que empieza por `'a.'`) en `captionTracks`, que refleja el idioma hablado original.
     4. Metadatos de idioma (`videoDetails.defaultAudioLanguage` / `microformat`) cuando existan.
3. **Preservación estricta de subtítulos puestos por el usuario:**
   - Se mantiene un marcador por pestaña (`sessionStorage['supratube_cc_auto']`) que solo pasa a `'1'` cuando **el propio script** encendió los subtítulos desde estado **apagado** en un video extranjero.
   - Escucha interacciones reales del usuario (`event.isTrusted`) en `.ytp-subtitles-button` y la tecla `c` (fuera de inputs editables): si el usuario enciende o apaga manualmente los subtítulos, limpia `supratube_cc_auto = '0'` para ceder el control manual.
   - **Si el video está en el idioma natal del usuario** (ej. español de España, México, Latam o doblaje activo en español):
     - Si `supratube_cc_auto === '1'` (los encendió el script en un video extranjero previo), apaga los subtítulos (`player.setOption('captions', 'track', {})` y asegura `aria-pressed="false"`) y limpia `supratube_cc_auto = '0'`.
     - Si `supratube_cc_auto !== '1'` (el usuario los tenía prendidos o los prendió manualmente), **no los toca**: los subtítulos se conservan intactos.
4. **Si el video está en otro idioma distinto al natal:**
   - Carga el módulo de subtítulos si hace falta (`player.loadModule?.('captions')`).
   - Registra `supratube_cc_auto = '1'` únicamente si los subtítulos estaban apagados antes de actuar.
   - Lee pistas desde `player.getOption('captions', 'tracklist', { includeAsr: true })` con respaldo de `playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks`.
   - **Paso 1 (Pista directa en idioma natal):** Busca cualquier pista cuya base sea igual al idioma natal (`es`):
     1. Pista manual coincidente con país/región o estándar (`es-419`, `es-MX`, `es-ES`, `es`, etc.)
     2. Pista automática `asr` en idioma natal (`a.es`, `a.es-419`, etc.)
     - Si la encuentra, enciende subtítulos si estaban apagados y llama `player.setOption('captions', 'track', pista)`.
   - **Paso 2 (Rescate por inglés + traducción automática al idioma natal):** Si no existe ninguna pista `es*`:
     - Busca una pista traducible (`isTranslatable !== false`) priorizando inglés (`en`, `en-US`, `en-GB`, luego `a.en` `asr`) y como último rescate la pista `asr` u original traducible del video.
     - Busca el idioma destino (`es`) dentro de `playerResponse.captions.playerCaptionsTracklistRenderer.translationLanguages`.
     - Ejecuta la activación en dos pasos verificada:
       1. Enciende subtítulos (`toggleSubtitles()` si estaban apagados) y aplica `player.setOption('captions', 'track', trackOrigen)`.
       2. En el siguiente ciclo (`setTimeout(..., 0)` + verificación posterior), asigna `trackOrigen.translationLanguage = { languageCode: targetLang, languageName }` y vuelve a invocar `player.setOption('captions', 'track', trackOrigen)`.

---

## 4. Criterios de Verificación

1. **Pruebas unitarias/lógicas** (en Node sobre los módulos puros sin depender del navegador):
   - Normalización de idiomas (`es-MX`, `es-ES`, `es-419`, `es-CL` → `es`) y comparación idioma natal vs video.
   - Máquina de estados de subtítulos: preservación cuando los prendió el usuario, apagado al volver a video español solo si los prendió el script, cascada `es` directo → `en` + auto-translate `es`.
   - Selección de calidad `1080p`: elige `1080p60 Premium` > `1080p Premium` > `1080p60` > `1080p` > `<1080p`; ignora `isPlayable: false` / `4K` / `1440p`.
   - Cálculo porcentual de segmentos verdes SponsorBlock y lógica anti-bucle de salto.
   - Compilador de bundle `modules/*.js` → `script.js` y verificación de paridad sintáctica en todos los archivos JS.
2. **Verificación de endpoints / navegador real (cuando corresponda en ejecución):**
   - Sin errores en consola ni elementos visuales inyectados salvo los segmentos verdes sobre `.ytp-progress-bar`.
   - Registro válido de cookies en `.youtube.com` y funcionamiento del popup actualizador contra `tivp/supratube`.
