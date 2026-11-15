# Transcript Download (Shorts & Watch 3-Dots Menu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `"Descargar transcripción"` inside the 3-dots dropdown menu on YouTube Shorts (`yt-list-view-model`) and `/watch` videos (`ytd-menu-popup-renderer`), powered by a multi-layer Innertube + timedtext + DOM extractor, automatic IP-language translation, `YYYY-MM-DD Título.txt` formatting (200-char blocks + timestamps), and auto-clipboard copy.

**Architecture:** Extract shared parser/translator helpers in `modules/subtitles.js` without breaking existing caption playback, implement the new feature in `modules/transcript-download.js` (zero global identifier collisions when compiled into `script.js`), wire lifecycle hooks in `modules/main.js`, add the `transcriptDownload` toggle across `modules/config.js`, `content.js`, `popup.html`, and `background.js`, rebuild `script.js`, verify with `node --test`, and test live in headless Chrome.

**Tech Stack:** Chrome Extension MV3, Pure ES Modules -> single IIFE (`tools/build-bundle.mjs` + `background.js`), `node --test`, Python Selenium Chrome verification.

---

### Task 1: Config, Parity & Popup Toggle (`transcriptDownload`)
- Update `modules/config.js`: add `'transcript-download.js'` before `'main.js'` in `ORDEN_MODULOS`, add `transcriptDownload: true` to `DEFAULT_SETTINGS`, add `INNERTUBE_CLIENT_CONFIGS`.
- Update `background.js`: mirror `'transcript-download.js'` in `ORDEN_MODULOS` (must remain 1:1 with `modules/config.js`).
- Update `content.js`: mirror `transcriptDownload: true` in `DEFAULT_SETTINGS`.
- Update `popup.html`: add checkbox `<input type="checkbox" data-setting="transcriptDownload">` labeled `"Descargar transcripción en menú (3 puntos)"`, bump displayed version to `v1.0.4`.
- Update `manifest.json` & `package.json`: bump version to `1.0.4`.
- Update `tests/config-utils.test.js` & `tests/bundle.test.js` for the 10-module `ORDEN_MODULOS` and `DEFAULT_SETTINGS.transcriptDownload`.

### Task 2: Expose Shared Subtitle Parsing & Translation Primitives in `modules/subtitles.js`
- Export `parseTimedtextResponseText`, `fetchTranscriptViaGetPanel`, `getTtState`, and `translateCueBatch` cleanly (already present in `subtitles.js`).
- Ensure `parseTimedtextResponseText` also handles `<p t="..." d="...">`, rolling WebVTT ASR deduplication, and full HTML entity decoding (`decodeHtmlEntities`) cleanly.
- Add unit tests in `tests/subtitles.test.js` covering rolling VTT, `<p t="" d="">`, and entity decoding.

### Task 3: `modules/transcript-download.js` — Extraction, Formatting, Translation & Menu UI
- Pure formatting & filename helpers:
  - `decodeTranscriptHtml`, `cleanTranscriptCueText`, `formatTranscriptTimestamp` (`M:SS` / `H:MM:SS`), `buildTranscriptBlocks` (<=200 chars), `buildTranscriptTxt` (`title\nhttps://youtu.be/id\n\n` + blocks), `sanitizeTranscriptFilename` (`YYYY-MM-DD Título.txt`).
- Multi-layer extraction (`extractVideoTranscript`):
  - Metadata resolution (`resolveVideoMetadata`: active player -> DOM -> Innertube `WEB` player -> multi-client `ANDROID`/`IOS`/`MWEB`/`WEB_EMBEDDED_PLAYER` for title, `publishDate`, `captionTracks`).
  - Language selection (`chooseTranscriptDownloadTrack`: manual/ASR in `userLang` first, else English -> Latin -> first track).
  - Extraction cascade: active timedtext cache -> direct caption track formats (`json3`/`srv3`/`vtt`) -> `/youtubei/v1/get_panel` (`PAmodern_transcript_view`) -> Innertube `/next` + `/get_transcript` -> active `/watch` DOM transcript segments.
  - Auto-translation via `translateCueBatch` when extracted segments differ from `userLang`.
- Native 3-dots Dropdown Menu Integration & Controller:
  - Track recent menu button triggers + check `dropdown.positionTarget` so Shorts only injects into the root Shorts sheet (`yt-sheet-view-model yt-list-view-model[role="menu"]` excluding Subtítulos/Audio/Velocidad submenus) and `/watch` only injects into `"Más acciones"` (`ytd-watch-metadata`) popups (never sidebar cards or comments).
  - Expand `max-height` inline on `yt-sheet-view-model` / `ytd-menu-popup-renderer` within viewport bounds so the new item is never clipped.
  - Inject `Descargar transcripción` with dark/light YouTube theme parity, clipboard + `Blob` `.txt` download, inline progress state, and discreet bottom toast notification.
- TDD tests in `tests/transcript-download.test.js` first (fail -> pass).

### Task 4: Wire into `modules/main.js`, Rebuild `script.js` & Verify Live in Chrome
- Initialize `createTranscriptDownloadController` in `modules/main.js`, wire `scan()`, cleanup on navigation, and obey `S.settings.transcriptDownload`.
- Run `npm run build` (`script.js`) and `npm test` (must pass 100%).
- Live E2E test in Chrome headless: inspect Shorts 3-dots menu (`KBIKtrmM80Y`) and Watch 3-dots `"Más acciones"` menu (`4Pg9rUF1RQ0`), capture screenshots, verify right-contrast/alignment/non-clipping, click item, verify `.txt` Blob download content + 200-char block structure.
- Update changelog/version if needed, commit, and push to `origin/main`.
