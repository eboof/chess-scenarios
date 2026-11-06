// Sanity check: every sample position loads, and any solution line is legal.
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/samples.ts', import.meta.url), 'utf8');
const fens = [...src.matchAll(/fen: '([^']+)'/g)].map(m => m[1]);
const sols = [...src.matchAll(/solution: '([^']+)'/g)].map(m => m[1]);
let ok = true;
for (const f of fens) { try { new Chess(f); console.log('ok  ', f); } catch (e) { ok = false; console.log('BAD ', f, e.message); } }
const luc = new Chess('1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1');
for (const sol of sols) {
  try { luc.loadPgn(`[SetUp "1"]\n[FEN "${luc.fen()}"]\n\n${sol}`); console.log('ok   solution ->', luc.fen()); }
  catch (e) { ok = false; console.log('BAD solution', e.message); }
}
process.exit(ok ? 0 : 1);
