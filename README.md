<p align="center">
  <img width="128" height="128" alt="Supratube" src="icons/icon-128.png" />
</p>

# Supratube

Extensión modular Chrome MV3 (fork arquitectónico de Maximus / `chan2txt`) para YouTube, 100% silenciosa dentro de la web:

1. **Bloqueo y salto de anuncios:** Limpieza Capa 0 en `ytInitialPlayerResponse`, `fetch`, `XMLHttpRequest` y CSS + salto/aceleración 16x automática y cierre de diálogos anti-adblock.
2. **Calidad 1080p / Premium automática:** Prioriza `1080p60 Premium` > `1080p Premium` > `1080p60` > `1080p` > mejor resolución `< 1080p` disponible en la cuenta sin activar pantallas de pago en cuentas gratuitas.
3. **SponsorBlock + barra verde:** Salta o silencia patrocinadores y pinta los segmentos en verde sobre la barra de navegación del video.
4. **Idioma natal por IP en cookie:** Detecta el idioma del usuario según su IP y lo guarda en cookie en `.youtube.com` (`supratube_geo_lang`).
5. **Subtítulos inteligentes:** Si el video está en otro idioma, activa subtítulos en tu idioma natal (incluyendo variantes regionales como `es`, `es-MX`, `es-ES`, `es-419`) o auto-traduce desde inglés (`en` → idioma natal). Si el video está en tu idioma natal, conserva los subtítulos si los activaste manualmente.
6. **Actualización en vivo desde GitHub:** Desde el popup de la extensión puedes sincronizar los módulos directamente desde `https://github.com/tivp/supratube`.

## Instalación en Chrome

1. Abre `chrome://extensions/` y activa **Modo de desarrollador**.
2. Pulsa **Cargar descomprimida** y selecciona la carpeta `supratube`.
3. Entra a los detalles de **Supratube | Maximus** y activa **Permitir scripts de usuario** (*Allow User Scripts*) para habilitar actualizaciones en vivo desde GitHub.
