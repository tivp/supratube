import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORDEN_MODULOS } from '../modules/config.js';

export function compileBundle(mapaModulos) {
    const bloques = ORDEN_MODULOS.map(nombre => {
        let codigo = String(mapaModulos[nombre] || '');
        codigo = codigo.replace(/^import\s+[\s\S]*?\bfrom\s+['"][^'"]+['"];?[ \t]*(?:\r?\n|$)/gm, '');
        codigo = codigo.replace(/^import\s+['"][^'"]+['"];?[ \t]*(?:\r?\n|$)/gm, '');
        codigo = codigo.replace(/^export\s+(async\s+function|function|const|let)/gm, '$1');
        return `// --- ${nombre} ---\n${codigo.trim()}`;
    });

    return `(() => {\n'use strict';\nif (window.__supratubeEjecutado) return;\nwindow.__supratubeEjecutado = true;\n\n${bloques.join('\n\n')}\n})();\n`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const modulos = {};
    for (const nombre of ORDEN_MODULOS) {
        modulos[nombre] = fs.readFileSync(path.join(root, 'modules', nombre), 'utf8');
    }
    const output = compileBundle(modulos);
    fs.writeFileSync(path.join(root, 'script.js'), output, 'utf8');
    console.log(`[build-bundle] script.js generado (${output.length} bytes, ${ORDEN_MODULOS.length} módulos).`);
}
