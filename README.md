<p align="center">
  <img width="128" height="128" alt="SupraTube" src="icons/icon-128.png" />
</p>

# SupraTube

Esta no es otra extensión que te mejora YouTube; es una extensión que entiende que moddear demasiado la experiencia no sirve, sino que lo correcto es moddear lo que es injusto: subtítulos que no se ponen solos, la calidad que te la ponen baja. Es equilibrar la experiencia para que sea segura y placentera, conservando lo vanilla.

Es superar lo que estaba mal, y ser algo bueno.

## Qué hace y cómo funciona (en palabras simples)

1. **Saca los anuncios que interrumpen ([`modules/adblock.js`](modules/adblock.js)):** Limpia los datos de publicidad antes de que empiece el video. Si algún anuncio logra meterse igual y no deja pulsar *Saltar*, lo acelera y le baja el volumen en silencio hasta terminar.
2. **Salta patrocinios y pinta la barra verde ([`modules/sponsorblock.js`](modules/sponsorblock.js)):** Consulta SponsorBlock para saltar los tramos donde el creador mete anuncios pagados o intros largas, y dibuja líneas verdes sobre la barra de tiempo del video para que sepas qué parte se saltará.
3. **Sube la calidad sin abrir ventanas de pago ([`modules/quality.js`](modules/quality.js)):** Elige `1080p` automáticamente (o `1080p Premium` solo si tu cuenta realmente lo tiene), para que YouTube no te baje el video a `480p` o `720p` ni te corte con anuncios para pagar Premium.
4. **Enciende los subtítulos en tu idioma ([`modules/subtitles.js`](modules/subtitles.js), [`modules/geo-lang.js`](modules/geo-lang.js), [`offscreen-src/worker.js`](offscreen-src/worker.js)):**
   - Mira de forma aproximada el idioma de tu país según tu conexión para saber en qué idioma quieres leer los subtítulos.
   - Si el video tiene subtítulos o traducciones disponibles, activa el botón `CC` por ti al abrir o cambiar de video (y respeta si tú decides apagarlo a mano).
   - Si YouTube oculta los subtítulos o el video directamente no tiene ninguno, intenta recuperarlos desde el panel de transcripción; y si tampoco hay texto, escucha el audio del video dentro de tu propia computadora con Whisper en el navegador para generar y traducir subtítulos sin mandar tu audio a servidores externos.
5. **Botones verdes útiles en el chat de IA ([`modules/ai-summary.js`](modules/ai-summary.js)):** Cuando abres el chat de IA debajo del video, agrega solo dos botones verdes (*"Resume de verdad"* y *"Versión corregida"*) sin borrar ni desordenar las preguntas que YouTube ya tenía ahí.
6. **Descarga lo que dice el video en `.txt` ([`modules/transcript-download.js`](modules/transcript-download.js)):** En el menú de los tres puntos junto al video agrega la opción *"Descargar transcripción"* para bajar el texto limpio y ordenado en un archivo de texto.
7. **Conserva el YouTube de siempre ([`modules/main.js`](modules/main.js), [`background.js`](background.js)):** No llena la pantalla ni el video de botones raros. Todo se controla desde la ventanita de la extensión, donde también puedes actualizar los scripts directo desde GitHub.

## De dónde salió cada función (créditos y fuentes)

Cada función importante de SupraTube está inspirada o basada en un proyecto previo o en un script de la comunidad. Aquí citamos todas las fuentes para que cualquiera pueda revisarlas, aprender de ellas y dar crédito a quienes las hicieron posibles:

### Proyectos propios de base (`tivp`)
- **Maximus Orden | Blackboard** (por `tivp`, proyecto padre bajo licencia GNU AGPL-3.0): Basado en este proyecto propio sacamos la estructura ordenada por módulos, la actualización directa desde GitHub y el puente seguro entre la página de YouTube y la extensión.
- **Canal de YouTube a TXT (`Chan2TXT`)** (por `tivp`): Basado en esta herramienta propia sacamos la función para descargar transcripciones ordenadas en bloques de texto de 200 caracteres, el reintento paciente cuando el documento `offscreen` está cargando, la captura de audio dentro de la misma página (`PCM16` / `WAV`) con envío al puente local `maximus-bridge-stt` o a Whisper público en Hugging Face Space, y la idea de rescatar el audio con Whisper dentro del navegador cuando un video no tiene subtítulos.

### Scripts de la comunidad (Greasy Fork y GitHub)
- **[EasyTube V5 — YouTube Ad Skip, SponsorBlock, Force 4K & HD Downloader](https://greasyfork.org/en/scripts/561432)** (script `#561432`, por **2pixel**, licencia MIT): Basado en este script (archivo base original del proyecto) sacamos la idea inicial de saltar anuncios y patrocinios, antes de quitarle los paneles flotantes y separarlo en módulos limpios.
- **[All-in-One Video Downloader & Ad Blocker](https://greasyfork.org/scripts/579352-all-in-one-video-downloader-ad-blocker-youtube-tiktok-x-instagram-facebook-more)** (script `#579352`, por **Juls**): Basado en este script sacamos la función para limpiar anuncios antes de que empiece el video y acelerar rápido cuando aparece un anuncio que no se puede saltar.
- **[SponsorBlock](https://sponsor.ajay.app)**, **[SponsorBlock Lite](https://greasyfork.org/scripts/560869-sponsorblock-lite)** (script `#560869`, por **hxueh**) y **[YT SuperTool](https://greasyfork.org/scripts/604559-yt-supertool)** (script `#604559`, por **CheemsGalaxy**): Basado en la API pública de SponsorBlock y en estos dos scripts sacamos la búsqueda privada de tramos patrocinados (enviando solo las primeras 4 letras del código del video), las marcas verdes sobre la barra en computadora o celular y la protección para que el reproductor no quede saltando en círculo.
- **[YouTube HD Plus](https://greasyfork.org/scripts/508784-youtube-hd-plus)** (script `#508784`, por **Fznhq**, licencia GNU GPLv3) y **[Youtube HD](https://greasyfork.org/scripts/23661-youtube-hd)** (script `#23661`, por **adisib**): Basado en estos dos scripts sacamos la función que revisa qué calidades sí tiene permitidas tu cuenta para poner `1080p` o `1080p Premium` sin activar ventanas de pago, junto con un método de respaldo clásico si el video no entrega esa lista.
- **[YouTube +](https://greasyfork.org/scripts/537017-youtube)** (script `#537017`, por **diorhc**): Basado en este script sacamos la forma de elegir la pista de subtítulos dentro del reproductor, rescatar subtítulos ocultos y volver a prender los subtítulos cuando cambias a otro video.
- **[YouTube Alchemy](https://greasyfork.org/scripts/521686-youtube-alchemy)** (script `#521686`, por **Tim Macy**): Basado en este script sacamos cómo saber en qué idioma está realmente el audio de un video, incluso cuando tiene doblaje automático.
- **[More YouTube Hotkeys](https://greasyfork.org/scripts/383570-more-youtube-hotkeys)** (script `#383570`, por **jcunews**): Basado en este script sacamos la forma de cargar las opciones internas de subtítulos de YouTube y activar la traducción automática.
- **[YouTube Enhancer Tools](https://greasyfork.org/scripts/543423-youtube-%E6%B2%B9%E7%AE%A1%E6%B5%8F%E8%A7%88%E5%8A%A9%E6%89%8B)** (script `#543423`, por **RunningCheese**) y **[YouTube Subtitle Downloader — Current Captions to TXT](https://greasyfork.org/scripts/593216-youtube-subtitle-downloader-current-captions-to-txt)** (script `#593216`, por **Johnny Chen**): Basado en estos scripts sacamos la forma de encontrar pistas de subtítulos dentro de la pista de audio (`getAudioTrack().captionTracks`) y aprovechar el permiso temporal (`pot=`) que usa el propio reproductor de YouTube para pedir subtítulos sin bloqueos.
- **[YouTube Force Transcript Loader & Debugger](https://greasyfork.org/scripts/581415-youtube-force-transcript-loader-debugger-trusted-types-dom)** (script `#581415`, por **User**): Basado en este script sacamos la manera de leer el texto desde el panel de transcripción de YouTube cuando el pedido normal de subtítulos falla o se queda sin cuota momentánea.
- **[VIE-Translate-by-me](https://github.com/chu0n6-iot/VIE-Translate-by-me-)** (por **chu0n6-iot**) y **[image-copy (Whisper offscreen)](https://github.com/rafa-coelho/image-copy)** (por **rafa-coelho**): Basado en estos dos repositorios sacamos cómo no apagar el botón manual de subtítulos `IA` cuando corren búsquedas en segundo plano, cómo evitar dobles clics accidentales, el respaldo para sacar audio del video (`createMediaElementSource`) cuando `captureStream` falla y el conteo real de avance al descargar los archivos del modelo Whisper.
- **[MouseTooltipTranslator](https://github.com/ttop32/MouseTooltipTranslator)** (por **ttop32**) y **[Youtube store/restore bilingual subtitles and playback speed](https://greasyfork.org/scripts/403096-youtube%E8%AE%B0%E5%BF%86%E6%81%A2%E5%A4%8D%E5%8F%8C%E8%AF%AD%E5%AD%97%E5%B9%95%E5%92%8C%E6%92%AD%E6%94%BE%E9%80%9F%E5%BA%A6-%E4%B8%8B%E8%BD%BD%E5%AD%97%E5%B9%95)** (script `#403096`, por **szdailei@gmail.com**): Basado en estos dos trabajos sacamos la limpieza ordenada al recargar scripts en pestañas que ya tenías abiertas, sin romper el reproductor ni dejar procesos colgados.

### Herramientas libres y servicios públicos incluidos
- **Whisper en el navegador (`offscreen-src/worker.js`):** Usa los modelos abiertos `onnx-community/whisper-base` y `onnx-community/whisper-tiny` con `Transformers.js` de Hugging Face, procesando el audio directo en tu computadora.
- **Idioma por país y traducción:** Usa servicios gratuitos públicos (`ipapi.co`, `freeipapi.com`, `ipwho.is` y `api.country.is`) para ubicar el idioma general del país y el punto público de traducción de Google (`translate.googleapis.com`) cuando hace falta traducir subtítulos.
- **Ícono de descarga:** Usa el ícono libre `arrow-down-tray` de **Heroicons** cargado por URL abierta (`Iconify` / `jsDelivr`) en el botón *Descargar transcripción*.
- **Protocolo de "Versión corregida":** El segundo botón verde del chat de IA aplica el protocolo *Corrección Absoluta* aportado por el autor del proyecto para revisar argumentos paso a paso.

## Transparencia, IA y respeto a la comunidad

No queremos ocultar de dónde salió cada pieza ni juntar código ajeno haciendo creer que lo hicimos solos. Cada script citado arriba queda a la vista para que cualquier chico en cualquier parte del mundo vea cómo se armó esta extensión con respeto por la comunidad.

También lo decimos con total franqueza: **SupraTube fue construido y ensamblado usando Gemini 4 Hydrogen Extra en Antigravity, el domingo 15 de noviembre de 2026.**

Las licencias de los trabajos previos citados incluyen **MIT** (*EasyTube V5*), **GNU GPLv3** (*YouTube HD Plus*) y **GNU AGPL-3.0** (*Maximus Orden*, proyecto padre). Si eres autor de alguno de los scripts nombrados o usuario de SupraTube y tienes alguna queja, ves un error o quieres que corrijamos un crédito o retiremos algo, respetamos tu queja y lo vamos a atender en los *issues* del repositorio.

## Cómo instalarla en Chrome o Brave

1. Descarga o clona esta carpeta y abre `chrome://extensions` (o `brave://extensions`).
2. Activa **Modo de desarrollador** arriba a la derecha.
3. Pulsa **Cargar descomprimida** y elige la carpeta `supratube`.
4. Entra a los detalles de **SupraTube** y activa **Permitir scripts de usuario** (*Allow User Scripts*) para que el botón de actualizar traiga las mejoras desde GitHub en vivo.
