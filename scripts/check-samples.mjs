// Sanity check: every built-in position loads, and every solution line is legal from it.
import { Chess } from 'chess.js';
import { readFileSync, readdirSync } from 'node:fs';
const root = new URL('../src/', import.meta.url);
const items = [];
const src = readFileSync(new URL('samples.ts', root), 'utf8');
for (const m of src.matchAll(/fen: '([^']+)'(?:,\s*\n?\s*)?/g)) items.push({ id: 'sample', fen: m[1], solution: '' });
const luc = src.match(/solution: '([^']+)'/);
if (luc) items.push({ id: 'sample-lucena', fen: '1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1', solution: luc[1] });
for (const f of readdirSync(new URL('packs/', root))) items.push(...JSON.parse(readFileSync(new URL(`packs/${f}`, root), 'utf8')));
const strip = t => { let o = '', d = 0; for (const ch of t.replace(/\{[^}]*\}/g, ' ')) { if (ch === '(') d++; else if (ch === ')') d--; else if (!d) o += ch; } return o; };
let bad = 0;
for (const s of items) {
  try {
    const c = new Chess(s.fen);
    for (const t of strip(s.solution || '').split(/\s+/).map(t => t.replace(/^\d+\.(\.\.)?/, '').replace(/[!?]+$/, '')).filter(t => t && !/^(\d+\.+|\.\.\.|1-0|0-1|1\/2-1\/2|\*)$/.test(t))) c.move(t);
  } catch (e) { bad++; console.log('BAD', s.id, e.message); }
}
console.log(`${items.length - bad}/${items.length} positions OK`);
process.exit(bad ? 1 : 0);
