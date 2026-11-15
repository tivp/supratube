// Adaptador ESM/bundle hacia __supratubeTdExports (en subtitles.js).
import { __supratubeTdExports } from './subtitles.js';

export const {
    TD_STYLE_ID,
    TD_ITEM_ATTR,
    TD_TOAST_ID,
    TD_BLOCK_SIZE,
    TD_HEROICON_SVG_URL,
    TD_HEROICON_FALLBACK_URL,
    TD_INNERTUBE_CLIENTS,
    cleanTranscriptCueText,
    formatTranscriptTimestamp,
    buildTranscriptBlocks,
    buildTranscriptTxt,
    sanitizeTranscriptFilename,
    chooseTranscriptDownloadTrack,
    buildGetTranscriptParamsCandidates,
    extractVideoTranscript,
    createTranscriptDownloadController
} = __supratubeTdExports;
