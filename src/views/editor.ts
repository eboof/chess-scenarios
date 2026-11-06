import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Color, Key, Piece, Role } from '@lichess-org/chessground/types';
import { Chess } from 'chess.js';
import * as store from '../storage';
import { EMPTY_PLACEMENT, START_FEN, fenParts, legalCastling, positionProblem } from '../chessutil';
import { h, dialog, toast } from '../ui';
import { navigate } from '../router';

type Tool = { kind: 'move' } | { kind: 'erase' } | { kind: 'piece'; piece: Piece };

const ROLES: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

export function editorView(root: HTMLElement, id: string): () => void {
  const existing = id === 'new' ? undefined : store.get(id);
  if (id !== 'new' && !existing) {
    navigate('');
    return () => {};
  }
  const scenario = existing ? { ...existing } : store.blank(START_FEN);
  const parts = fenParts(scenario.fen);
  let turn: 'w' | 'b' = parts.turn as 'w' | 'b';
  let wantedCastling = parts.castling === '-' ? '' : parts.castling;
  let moveNumber = parseInt(parts.full, 10) || 1;
  let tool: Tool = { kind: 'move' };
  let orientation: Color = 'white';

  // ---- Board ----
  const boardEl = h('div', { class: 'board' });
  const cg: Api = Chessground(boardEl, {
    fen: parts.placement,
    orientation,
    movable: { free: true, color: 'both', showDests: false },
    draggable: { deleteOnDropOff: true },
    premovable: { enabled: false },
    highlight: { lastMove: false, check: false },
    animation: { enabled: false },
    drawable: { enabled: false },
    blockTouchScroll: true,
    events: { change: onBoardChange, select: onSelect },
  });

  function onSelect(key: Key) {
    if (tool.kind === 'move') return;
    const current = cg.state.pieces.get(key);
    let next: Piece | undefined;
    if (tool.kind === 'piece') {
      const same = current && current.role === tool.piece.role && current.color === tool.piece.color;
      next = same ? undefined : tool.piece; // tap the same piece again to remove it
    }
    cg.setPieces(new Map([[key, next]]));
    cg.selectSquare(null);
    onBoardChange();
  }

  // ---- Palette ----
  const paletteButtons: HTMLButtonElement[] = [];
  const toolButton = (t: Tool, content: Node | string, title: string) => {
    const b = h('button', { class: 'tool', title, 'aria-label': title, onclick: () => setTool(t, b) }, content);
    paletteButtons.push(b);
    return b;
  };
  const pieceIcon = (color: Color, role: Role) => {
    const p = document.createElement('piece');
    p.className = `${role} ${color}`;
    return h('div', { class: 'cg-wrap piece-icon' }, p);
  };
  const palette = h(
    'div',
    { class: 'palette' },
    h('div', { class: 'palette-row' }, toolButton({ kind: 'move' }, '✋', 'Move pieces'), ...ROLES.map(r => toolButton({ kind: 'piece', piece: { role: r, color: 'white' } }, pieceIcon('white', r), `White ${r}`))),
    h('div', { class: 'palette-row' }, toolButton({ kind: 'erase' }, '🗑', 'Remove pieces'), ...ROLES.map(r => toolButton({ kind: 'piece', piece: { role: r, color: 'black' } }, pieceIcon('black', r), `Black ${r}`))),
  );
  const paletteHint = h('p', { class: 'hint' });
  function setTool(t: Tool, btn: HTMLButtonElement) {
    tool = t;
    paletteButtons.forEach(b => b.classList.toggle('active', b === btn));
    const moving = t.kind === 'move';
    cg.set({ movable: { color: moving ? 'both' : undefined }, draggable: { enabled: moving } });
    cg.selectSquare(null);
    paletteHint.textContent = moving
      ? 'Drag pieces to move them. Drag a piece off the board to remove it.'
      : t.kind === 'erase'
        ? 'Tap pieces to remove them.'
        : 'Tap squares to place this piece. Tap it again to remove it.';
  }
  setTool({ kind: 'move' }, paletteButtons[0]);

  // ---- Position settings ----
  const turnW = h('button', { onclick: () => setTurn('w') }, 'White');
  const turnB = h('button', { onclick: () => setTurn('b') }, 'Black');
  function setTurn(t: 'w' | 'b') {
    turn = t;
    turnW.classList.toggle('active', t === 'w');
    turnB.classList.toggle('active', t === 'b');
    refresh();
  }

  const castleBoxes = (['K', 'Q', 'k', 'q'] as const).map(c => {
    const input = h('input', { type: 'checkbox' });
    input.addEventListener('change', () => {
      wantedCastling = castleBoxes.filter(x => x.input.checked).map(x => x.c).join('');
      refresh();
    });
    const label = { K: 'White O-O', Q: 'White O-O-O', k: 'Black O-O', q: 'Black O-O-O' }[c];
    return { c, input, el: h('label', { class: 'check' }, input, ` ${label}`) };
  });

  const moveNumInput = h('input', { type: 'number', min: 1, value: moveNumber, class: 'narrow' });
  moveNumInput.addEventListener('input', () => {
    moveNumber = Math.max(1, parseInt(moveNumInput.value, 10) || 1);
    refresh();
  });

  const fenInput = h('input', { type: 'text', class: 'fen', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
  const status = h('div', { class: 'status' });

  function currentFen(): string {
    const placement = cg.getFen();
    return `${placement} ${turn} ${legalCastling(placement, wantedCastling)} - 0 ${moveNumber}`;
  }

  function onBoardChange() {
    refresh();
  }

  function refresh() {
    const placement = cg.getFen();
    const possible = legalCastling(placement, 'KQkq');
    for (const b of castleBoxes) {
      const ok = possible.includes(b.c);
      b.input.disabled = !ok;
      b.input.checked = ok && wantedCastling.includes(b.c);
    }
    const fen = currentFen();
    if (document.activeElement !== fenInput) fenInput.value = fen;
    const problem = positionProblem(fen);
    status.textContent = problem ?? '✓ Position is ready to play';
    status.className = `status ${problem ? 'bad' : 'good'}`;
  }

  function loadFen(fen: string) {
    const p = fenParts(fen);
    cg.set({ fen: p.placement });
    turn = p.turn as 'w' | 'b';
    wantedCastling = p.castling === '-' ? '' : p.castling;
    moveNumber = parseInt(p.full, 10) || 1;
    moveNumInput.value = String(moveNumber);
    setTurn(turn);
  }

  fenInput.addEventListener('change', () => {
    const v = fenInput.value.trim();
    if (!v) return;
    try {
      new Chess(v, { skipValidation: true });
      loadFen(v);
    } catch {
      toast('That FEN couldn’t be read');
      refresh();
    }
  });
  fenInput.addEventListener('blur', refresh);

  // ---- Details ----
  const field = (label: string, input: HTMLElement) => h('label', { class: 'field' }, h('span', {}, label), input);
  const titleIn = h('input', { type: 'text', value: scenario.title === 'Untitled position' ? '' : scenario.title, placeholder: 'e.g. Capablanca – Tartakower, 1924' });
  const sourceIn = h('input', { type: 'text', value: scenario.source, placeholder: 'Book, chapter, page' });
  const goalIn = h('input', { type: 'text', value: scenario.goal, placeholder: 'e.g. White to play and win' });
  const tagsIn = h('input', { type: 'text', value: scenario.tags.join(', '), placeholder: 'endgame, rook, Capablanca' });
  const notesIn = h('textarea', { rows: 3, placeholder: 'Anything to remember about this position' });
  notesIn.value = scenario.notes;
  const solutionIn = h('textarea', { rows: 2, placeholder: 'Optional: the book’s solution, e.g. 1. Rd1+ Ke7 2. Rd4' });
  solutionIn.value = scenario.solution;

  function save(): boolean {
    const fen = currentFen();
    const problem = positionProblem(fen);
    if (problem) {
      toast(problem, 4000);
      return false;
    }
    Object.assign(scenario, {
      fen,
      title: titleIn.value.trim() || 'Untitled position',
      source: sourceIn.value.trim(),
      goal: goalIn.value.trim(),
      tags: tagsIn.value.split(',').map(t => t.trim()).filter(Boolean),
      notes: notesIn.value.trim(),
      solution: solutionIn.value.trim(),
    });
    store.upsert(scenario);
    return true;
  }

  // ---- Layout ----
  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'back', onclick: () => navigate('') }, '‹ Library'),
      h('h1', {}, existing ? 'Edit position' : 'New position'),
      h(
        'div',
        { class: 'actions' },
        h('button', { onclick: () => save() && (toast('Saved'), navigate('')) }, 'Save'),
        h('button', { class: 'primary', onclick: () => save() && navigate(`play/${scenario.id}`) }, 'Save & play'),
      ),
    ),
    h(
      'main',
      { class: 'layout editor' },
      h('div', { class: 'board-col' }, h('div', { class: 'board-box' }, boardEl), palette, paletteHint),
      h(
        'div',
        { class: 'panel' },
        status,
        h('section', {}, h('h4', {}, 'Side to move'), h('div', { class: 'segmented' }, turnW, turnB)),
        h('section', {}, h('h4', {}, 'Castling allowed'), h('div', { class: 'checks' }, ...castleBoxes.map(b => b.el))),
        h('section', { class: 'inline' }, h('h4', {}, 'Move number'), moveNumInput),
        h(
          'section',
          { class: 'buttons' },
          h('button', { onclick: () => loadFen(START_FEN) }, 'Start position'),
          h('button', { onclick: () => (cg.set({ fen: EMPTY_PLACEMENT }), refresh()) }, 'Clear board'),
          h('button', { onclick: () => ((orientation = orientation === 'white' ? 'black' : 'white'), cg.set({ orientation })) }, 'Flip board'),
          h('button', { onclick: fromPgn }, 'From PGN…'),
        ),
        h('section', {}, h('h4', {}, 'FEN'), fenInput, h('p', { class: 'hint' }, 'Paste a FEN here to load it.')),
        h('section', {}, h('h4', {}, 'Details'), field('Title', titleIn), field('Source', sourceIn), field('Goal', goalIn), field('Tags', tagsIn), field('Notes', notesIn), field('Solution', solutionIn)),
      ),
    ),
  );

  setTurn(turn);

  // ---- PGN import: pick the position after any move of a game ----
  async function fromPgn() {
    const area = h('textarea', { rows: 6, placeholder: 'Paste a PGN game here', class: 'pgn-area' });
    const slider = h('input', { type: 'range', min: 0, max: 0, value: 0, disabled: true });
    const label = h('div', { class: 'hint' }, 'Paste a game, then choose the position.');
    const previewEl = h('div', { class: 'board' });
    const preview = Chessground(previewEl, { viewOnly: true, coordinates: false, animation: { enabled: false }, fen: EMPTY_PLACEMENT });
    let fens: string[] = [];
    let sans: string[] = [];
    let startFen = START_FEN;
    const showAt = (i: number) => {
      preview.set({ fen: fens[i] });
      if (i === 0) label.textContent = 'Starting position';
      else {
        const { turn: t, full } = fenParts(startFen);
        const ply = i - 1 + (t === 'b' ? 1 : 0);
        const n = (parseInt(full, 10) || 1) + Math.floor(ply / 2);
        label.textContent = `After ${n}.${ply % 2 ? '..' : ''} ${sans[i - 1]}`;
      }
    };
    area.addEventListener('input', () => {
      const c = new Chess();
      try {
        c.loadPgn(area.value);
      } catch {
        label.textContent = 'Couldn’t read that PGN yet.';
        slider.disabled = true;
        return;
      }
      sans = c.history();
      const replay = new Chess(c.getHeaders().FEN || START_FEN);
      startFen = replay.fen();
      fens = [startFen];
      for (const m of sans) fens.push((replay.move(m), replay.fen()));
      slider.max = String(fens.length - 1);
      slider.value = slider.max;
      slider.disabled = false;
      showAt(fens.length - 1);
    });
    slider.addEventListener('input', () => showAt(+slider.value));
    const body = h('div', { class: 'pgn-dialog' }, area, h('div', { class: 'pgn-preview' }, h('div', { class: 'board-box small' }, previewEl), h('div', {}, label, slider)));
    const ok = await dialog('Load from PGN', body, [
      { label: 'Cancel', value: false },
      { label: 'Use this position', value: true, primary: true },
    ]);
    preview.destroy();
    if (ok && fens.length) loadFen(fens[+slider.value]);
  }

  return () => cg.destroy();
}
