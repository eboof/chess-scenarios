// Copies the single-threaded "lite" Stockfish WASM build into public/engine.
// This build needs no special server headers, so it works on GitHub Pages and iPad Safari.
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/stockfish/bin');
const dest = join(root, 'public/engine');
mkdirSync(dest, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(join(src, f), join(dest, f));
}
console.log('Stockfish engine copied to public/engine');
