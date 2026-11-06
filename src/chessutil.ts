import { Chess, SQUARES, type Square } from 'chess.js';
import type { Dests, Key } from '@lichess-org/chessground/types';
import type { Scenario } from './storage';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const EMPTY_PLACEMENT = '8/8/8/8/8/8/8/8';

/** Returns a human-readable problem with the position, or null if it is playable. */
export function positionProblem(fen: string): string | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch (e) {
    return friendly(e instanceof Error ? e.message : String(e));
  }
  const board = chess.board();
  const kings = { w: 0, b: 0 };
  for (const row of board) for (const p of row) if (p?.type === 'k') kings[p.color]++;
  if (kings.w !== 1 || kings.b !== 1) return 'Each side needs exactly one king.';
  for (const file of 'abcdefgh') {
    for (const rank of ['1', '8']) {
      const p = chess.get(`${file}${rank}` as Square);
      if (p?.type === 'p') return 'Pawns can’t stand on the first or last rank.';
    }
  }
  const mover = chess.turn();
  const other = mover === 'w' ? 'b' : 'w';
  const otherKing = SQUARES.find(sq => {
    const p = chess.get(sq);
    return p?.type === 'k' && p.color === other;
  });
  if (otherKing && chess.isAttacked(otherKing, mover)) {
    return `${other === 'w' ? 'White' : 'Black'} is in check but it’s ${mover === 'w' ? 'White' : 'Black'}’s move — check whose turn it is.`;
  }
  return null;
}

function friendly(msg: string): string {
  return 'That position isn’t valid: ' + msg.replace(/^Invalid FEN:\s*/i, '');
}

export function dests(chess: Chess): Dests {
  const d: Dests = new Map();
  for (const sq of SQUARES) {
    const ms = chess.moves({ square: sq, verbose: true });
    if (ms.length) d.set(sq as Key, ms.map(m => m.to as Key));
  }
  return d;
}

export function turnColor(chess: Chess): 'white' | 'black' {
  return chess.turn() === 'w' ? 'white' : 'black';
}

/** Splits a FEN into its parts, filling in defaults for missing fields. */
export function fenParts(fen: string) {
  const [placement = EMPTY_PLACEMENT, turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  return { placement, turn: turn === 'b' ? 'b' : 'w', castling, ep, half, full };
}

/** Removes castling rights that the pieces on the board can't actually have. */
export function legalCastling(placement: string, wanted: string): string {
  const chess = new Chess();
  chess.clear();
  try {
    chess.load(`${placement} w - - 0 1`, { skipValidation: true });
  } catch {
    return '-';
  }
  const is = (sq: Square, type: string, color: 'w' | 'b') => {
    const p = chess.get(sq);
    return p?.type === type && p.color === color;
  };
  let out = '';
  if (wanted.includes('K') && is('e1', 'k', 'w') && is('h1', 'r', 'w')) out += 'K';
  if (wanted.includes('Q') && is('e1', 'k', 'w') && is('a1', 'r', 'w')) out += 'Q';
  if (wanted.includes('k') && is('e8', 'k', 'b') && is('h8', 'r', 'b')) out += 'k';
  if (wanted.includes('q') && is('e8', 'k', 'b') && is('a8', 'r', 'b')) out += 'q';
  return out || '-';
}

function pgnEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** PGN for a scenario: its starting position plus any moves played from it. */
export function toPgn(s: Scenario, moves: string[] = [], result = '*', extra: Record<string, string> = {}): string {
  const headers: Record<string, string> = {
    Event: s.title,
    Site: s.source || '?',
    Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    White: '?',
    Black: '?',
    Result: result,
    ...extra,
    SetUp: '1',
    FEN: s.fen,
  };
  const head = Object.entries(headers)
    .map(([k, v]) => `[${k} "${pgnEscape(v)}"]`)
    .join('\n');
  const comment = [s.goal, s.notes].filter(Boolean).join(' — ').replace(/[{}]/g, '');
  return `${head}\n\n${comment ? `{ ${comment} } ` : ''}${movetext(s.fen, moves)} ${result}\n`;
}

/** Numbered SAN movetext, starting from the FEN's move number and side to move. */
export function movetext(fen: string, moves: string[]): string {
  const { turn, full } = fenParts(fen);
  let n = parseInt(full, 10) || 1;
  let white = turn === 'w';
  const out: string[] = [];
  moves.forEach((m, i) => {
    if (white) out.push(`${n}.`);
    else if (i === 0) out.push(`${n}...`);
    out.push(m);
    if (!white) n++;
    white = !white;
  });
  return out.join(' ');
}

/** Splits a (possibly multi-game) PGN file into separate games. */
export function splitPgn(text: string): string[] {
  // Every game in a standard PGN file begins with an [Event "..."] header.
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n(?=[ \t]*\[Event\s)/)
    .map(g => g.trim())
    .filter(Boolean);
}

function header(pgn: string, name: string): string {
  const m = pgn.match(new RegExp(`\\[${name}\\s+"((?:[^"\\\\]|\\\\.)*)"\\]`));
  return m ? m[1].replace(/\\(.)/g, '$1') : '';
}

/**
 * Turns each game in a PGN file into a scenario. By default the scenario is the game's
 * starting position (right for puzzle files); with useFinal, it's the position after the last move.
 */
export function scenariosFromPgn(text: string, useFinal = false): { items: Partial<Scenario>[]; errors: number } {
  const items: Partial<Scenario>[] = [];
  let errors = 0;
  for (const game of splitPgn(text)) {
    const chess = new Chess();
    try {
      chess.loadPgn(game);
    } catch {
      errors++;
      continue;
    }
    const startFen = header(game, 'FEN') || START_FEN;
    const fen = useFinal ? chess.fen() : startFen;
    const white = header(game, 'White');
    const black = header(game, 'Black');
    const players = white && black && white !== '?' ? `${white} – ${black}` : '';
    const event = header(game, 'Event');
    const title = [players, event && event !== '?' ? event : ''].filter(Boolean).join(', ') || 'Imported position';
    const solution = useFinal ? '' : movetext(startFen, chess.history());
    items.push({ title, source: header(game, 'Site').replace(/^\?$/, ''), fen, solution });
  }
  return { items, errors };
}
