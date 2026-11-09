import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Color, Key } from '@lichess-org/chessground/types';
import { Chess, type Move } from 'chess.js';
import * as store from '../storage';
import { dests, fenParts, solutionLine, toPgn, turnColor } from '../chessutil';
import { getEngine } from '../engine';
import { LEVELS, getLevel, setLevel, type Level } from '../levels';
import { h, copyText, dialog, saveFile, toast } from '../ui';
import { navigate } from '../router';

export function playView(root: HTMLElement, id: string): () => void {
  const scenario = store.get(id);
  if (!scenario) {
    navigate('');
    return () => {};
  }
  const engine = getEngine();
  const startTurn: Color = fenParts(scenario.fen).turn === 'b' ? 'black' : 'white';

  let chess = new Chess(scenario.fen);
  let history: Move[] = []; // moves played from the starting position
  let userColor: Color = startTurn;
  let level: Level = getLevel();
  let orientation: Color = userColor;
  let viewPly: number | null = null; // null = live position; otherwise looking back at an earlier move
  let thinking = false;
  let token = 0; // bumped to discard engine replies that are no longer wanted
  let destroyed = false;
  // Playing through the book's solution: 'playing' while moves are being shown, 'done' once it stops.
  const solutionMoves = solutionLine(scenario.fen, scenario.solution);
  // 'practice': you play your side, each move is checked against the book and the book plays the other side.
  let replay: 'off' | 'playing' | 'done' | 'practice' = 'off';
  let mistakes = 0;
  let hintsUsed = 0;
  let practiceMsg = '';
  let replayTimer: ReturnType<typeof setTimeout> | undefined;
  const REPLAY_DELAY = 500; // ms between moves

  const boardEl = h('div', { class: 'board' });
  const cg: Api = Chessground(boardEl, {
    fen: scenario.fen,
    orientation,
    premovable: { enabled: false },
    drawable: { enabled: true },
    blockTouchScroll: true,
    movable: { free: false, showDests: true, events: { after: onUserMove } },
  });

  // ---- Panel ----
  const status = h('div', { class: 'status' });
  const moveList = h('div', { class: 'moves' });

  const sideW = h('button', { onclick: () => chooseSide('white') }, 'White');
  const sideB = h('button', { onclick: () => chooseSide('black') }, 'Black');
  const levelSel = h('select', {}, ...LEVELS.map(l => h('option', { value: l.id, selected: l.id === level.id }, l.label)));
  levelSel.addEventListener('change', () => {
    level = LEVELS.find(l => l.id === levelSel.value) ?? level;
    setLevel(level.id);
  });

  const undoBtn = h('button', { onclick: undo }, '↶ Undo');
  const hintBtn = h('button', { onclick: hint }, '💡 Hint');
  const replayBtn = h('button', { onclick: () => (replay === 'playing' ? stopReplay() : playSolution()) }, '▶ Play solution');
  const practiceBtn = h('button', { onclick: startPractice }, '🎯 Practice');
  const playOnBtn = h('button', { class: 'primary', onclick: playOn }, 'Play on from here');
  const navFirst = h('button', { class: 'small', onclick: () => view(0), 'aria-label': 'First move' }, '⏮');
  const navPrev = h('button', { class: 'small', onclick: () => view((viewPly ?? history.length) - 1), 'aria-label': 'Previous move' }, '◀');
  const navNext = h('button', { class: 'small', onclick: () => view((viewPly ?? history.length) + 1), 'aria-label': 'Next move' }, '▶');
  const navLast = h('button', { class: 'small', onclick: () => view(history.length), 'aria-label': 'Latest move' }, '⏭');

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'back', onclick: () => navigate('') }, '‹ Library'),
      h('h1', {}, scenario.title),
      h('div', { class: 'actions' }, h('button', { onclick: () => navigate(`edit/${scenario.id}`) }, 'Edit position')),
    ),
    h(
      'main',
      { class: 'layout' },
      h('div', { class: 'board-col' }, h('div', { class: 'board-box' }, boardEl)),
      h(
        'div',
        { class: 'panel' },
        scenario.goal ? h('div', { class: 'goal big' }, scenario.goal) : null,
        scenario.source ? h('div', { class: 'source' }, scenario.source) : null,
        scenario.notes ? h('details', {}, h('summary', {}, 'Notes'), h('p', {}, scenario.notes)) : null,
        status,
        h('section', {}, h('h4', {}, 'You play'), h('div', { class: 'segmented' }, sideW, sideB)),
        h('section', { class: 'inline' }, h('h4', {}, 'Computer level'), levelSel),
        h(
          'section',
          { class: 'buttons' },
          undoBtn,
          h('button', { onclick: restart }, '⟲ Restart'),
          h('button', { onclick: flip }, '⇅ Flip'),
          hintBtn,
          scenario.solution ? h('button', { onclick: showSolution }, 'Solution') : null,
          solutionMoves.length ? replayBtn : null,
          solutionMoves.length ? practiceBtn : null,
        ),
        h('section', { class: 'buttons' }, playOnBtn),
        h('section', {}, h('h4', {}, 'Moves'), moveList, h('div', { class: 'nav' }, navFirst, navPrev, navNext, navLast)),
        h(
          'section',
          { class: 'buttons' },
          h('button', { onclick: () => copyText(pgn()) }, 'Copy PGN'),
          h('button', { onclick: () => saveFile(`${slug(scenario.title)}.pgn`, pgn(), 'application/x-chess-pgn') }, 'Save PGN'),
          h('button', { onclick: saveAsNew }, 'Save this position…'),
        ),
      ),
    ),
  );

  // ---- Game flow ----
  function sync() {
    const live = viewPly === null;
    const shown = live ? chess : positionAt(viewPly!);
    const last = live ? history[history.length - 1] : history[viewPly! - 1];
    const practising = replay === 'practice' && history.length < solutionMoves.length;
    const userTurn = live && (replay === 'off' || practising) && !thinking && !chess.isGameOver() && turnColor(chess) === userColor;
    cg.set({
      fen: shown.fen(),
      turnColor: turnColor(shown),
      orientation,
      lastMove: last ? [last.from as Key, last.to as Key] : undefined,
      check: shown.inCheck(),
      movable: { color: userTurn ? userColor : undefined, dests: userTurn ? dests(chess) : new Map() },
    });
    cg.setAutoShapes([]);
    sideW.classList.toggle('active', userColor === 'white');
    sideB.classList.toggle('active', userColor === 'black');
    undoBtn.disabled = history.length === 0 || replay === 'practice';
    hintBtn.disabled = !userTurn;
    replayBtn.textContent = replay === 'playing' ? '⏹ Stop' : '▶ Play solution';
    playOnBtn.parentElement!.hidden = !(replay === 'done' && !shown.isGameOver());
    navPrev.disabled = navFirst.disabled = (viewPly ?? history.length) === 0;
    navNext.disabled = navLast.disabled = live;
    renderStatus();
    renderMoves();
  }

  function positionAt(ply: number): Chess {
    const c = new Chess(scenario!.fen);
    for (const m of history.slice(0, ply)) c.move(m.san);
    return c;
  }

  function renderStatus() {
    let text: string;
    let cls = '';
    if (replay === 'playing') text = `Playing the book’s line… move ${history.length} of ${solutionMoves.length}`;
    else if (replay === 'practice' && viewPly === null) {
      const yourMove = turnColor(chess) === userColor;
      text = practiceMsg && yourMove ? `${practiceMsg}${practiceMsg.startsWith('✓') ? ' Your move.' : ''}` : yourMove ? 'Your move — play the book’s move.' : `${practiceMsg ? practiceMsg + ' ' : ''}Book reply…`;
      if (practiceMsg.startsWith('✗')) cls = 'bad';
      else if (practiceMsg.startsWith('✓')) cls = 'good';
    } else if (viewPly !== null) text = replay === 'done' ? 'Looking back — you can play on from this move.' : 'Looking back — tap ⏭ to return to the game.';
    else if (chess.isCheckmate()) {
      const userWon = turnColor(chess) !== userColor;
      text = userWon ? 'Checkmate — you win! 🎉' : 'Checkmate — the computer wins.';
      cls = userWon ? 'good' : 'bad';
    } else if (chess.isStalemate()) text = 'Stalemate — draw.';
    else if (chess.isInsufficientMaterial()) text = 'Draw — not enough material to mate.';
    else if (chess.isThreefoldRepetition()) text = 'Draw by threefold repetition.';
    else if (chess.isDrawByFiftyMoves()) text = 'Draw by the fifty-move rule.';
    else if (replay === 'done' && practiceMsg) {
      text = practiceMsg;
      cls = mistakes || hintsUsed ? '' : 'good';
    } else if (replay === 'done') text = history.length === solutionMoves.length ? 'End of the book’s line. Step back with ◀, or play on from here.' : 'Stopped. Step back with ◀, or play on from here.';
    else if (thinking) text = 'Computer is thinking…';
    else text = `Your move${chess.inCheck() ? ' — you’re in check!' : ''}`;
    status.textContent = text;
    status.className = `status ${cls}`;
  }

  function renderMoves() {
    moveList.replaceChildren();
    if (!history.length) {
      moveList.append(h('span', { class: 'hint' }, 'No moves yet.'));
      return;
    }
    const { full } = fenParts(scenario!.fen);
    let n = parseInt(full, 10) || 1;
    let white = startTurn === 'white';
    history.forEach((m, i) => {
      if (white) moveList.append(h('span', { class: 'num' }, `${n}.`));
      else if (i === 0) moveList.append(h('span', { class: 'num' }, `${n}…`));
      const ply = i + 1;
      const current = viewPly === null ? ply === history.length : ply === viewPly;
      moveList.append(h('button', { class: `mv${current ? ' current' : ''}`, onclick: () => view(ply) }, m.san));
      if (!white) n++;
      white = !white;
    });
    // Keep the current move visible by scrolling only the move list. scrollIntoView would also
    // scroll the page, which pushed the top of the board off screen on the iPad.
    const cur = moveList.querySelector<HTMLElement>('.current');
    if (cur) {
      const top = cur.offsetTop;
      const bottom = top + cur.offsetHeight;
      if (top < moveList.scrollTop) moveList.scrollTop = top - 8;
      else if (bottom > moveList.scrollTop + moveList.clientHeight) moveList.scrollTop = bottom - moveList.clientHeight + 8;
    }
  }

  function view(ply: number) {
    if (ply < 0 || ply > history.length) return;
    if (replay === 'playing') stopReplay();
    viewPly = ply >= history.length ? null : ply;
    sync();
  }

  async function onUserMove(orig: Key, dest: Key) {
    const piece = chess.get(orig as never);
    let promotion: string | undefined;
    if (piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1')) {
      promotion = (await dialog('Promote to', '', [
        { label: '♛ Queen', value: 'q', primary: true },
        { label: '♜ Rook', value: 'r' },
        { label: '♝ Bishop', value: 'b' },
        { label: '♞ Knight', value: 'n' },
      ])) ?? 'q';
    }
    let move: Move;
    try {
      move = chess.move({ from: orig, to: dest, promotion });
    } catch {
      return sync(); // Shouldn't happen since only legal destinations are offered.
    }
    history.push(move);
    viewPly = null;
    if (replay === 'practice') {
      const expected = solutionMoves[history.length - 1];
      if (move.san !== expected) {
        chess.undo();
        history.pop();
        mistakes++;
        practiceMsg = `✗ ${move.san} isn’t the book’s move — try again.`;
        return sync();
      }
      practiceMsg = `✓ ${move.san} is right.`;
      sync();
      return practiceStep();
    }
    sync();
    maybeEngineMove();
  }

  function startPractice() {
    cancelThinking();
    clearTimeout(replayTimer);
    chess = new Chess(scenario!.fen);
    history = [];
    viewPly = null;
    replay = 'practice';
    mistakes = 0;
    hintsUsed = 0;
    practiceMsg = '';
    sync();
    practiceStep();
  }

  /** In practice mode: play the book's reply when it's the other side's turn, or finish at the end of the line. */
  function practiceStep() {
    if (destroyed || replay !== 'practice') return;
    if (history.length >= solutionMoves.length) {
      replay = 'done';
      const extras = [mistakes && `${mistakes} mistake${mistakes === 1 ? '' : 's'}`, hintsUsed && `${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}`].filter(Boolean).join(', ');
      practiceMsg = extras ? `End of the book’s line (${extras}). Tap 🎯 Practice to try again, or play on.` : '🎉 Perfect — you played the book’s line with no mistakes!';
      return sync();
    }
    if (turnColor(chess) === userColor) return;
    replayTimer = setTimeout(() => {
      if (destroyed || replay !== 'practice') return;
      history.push(chess.move(solutionMoves[history.length]));
      sync();
      practiceStep();
    }, REPLAY_DELAY);
  }

  async function maybeEngineMove() {
    if (replay !== 'off') return;
    if (chess.isGameOver() || turnColor(chess) === userColor || thinking) return;
    thinking = true;
    const my = ++token;
    sync();
    const started = Date.now();
    let uci: string | null;
    const legal = chess.moves({ verbose: true });
    if (Math.random() < level.randomChance) {
      const m = legal[Math.floor(Math.random() * legal.length)];
      uci = m.from + m.to + (m.promotion ?? '');
    } else {
      uci = await engine.bestMove({ fen: chess.fen(), elo: level.elo, skill: level.skill, depth: level.depth, movetime: level.movetime });
    }
    // Small pause so the reply doesn't appear instantly.
    const wait = 350 - (Date.now() - started);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (destroyed || my !== token) return;
    thinking = false;
    if (uci) {
      try {
        history.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }));
      } catch {
        toast('The computer couldn’t find a move');
      }
    }
    viewPly = null;
    sync();
  }

  function cancelThinking() {
    if (thinking) {
      token++;
      thinking = false;
      engine.stop();
    }
  }

  function undo() {
    if (!history.length) return;
    if (replay !== 'off') {
      // Leave solution mode; the undo below then works on the moves shown so far.
      clearTimeout(replayTimer);
      replay = 'off';
    }
    const wasThinking = thinking;
    cancelThinking();
    // Take back the computer's reply (if any) and your last move.
    if (!wasThinking && turnColor(chess) === userColor && history.length >= 2) {
      chess.undo();
      history.pop();
    }
    chess.undo();
    history.pop();
    viewPly = null;
    sync();
    maybeEngineMove();
  }

  function restart() {
    cancelThinking();
    clearTimeout(replayTimer);
    replay = 'off';
    practiceMsg = '';
    chess = new Chess(scenario!.fen);
    history = [];
    viewPly = null;
    engine.newGame();
    sync();
    maybeEngineMove();
  }

  function chooseSide(c: Color) {
    if (c === userColor) return;
    userColor = c;
    orientation = c;
    restart();
  }

  function playSolution() {
    cancelThinking();
    clearTimeout(replayTimer);
    chess = new Chess(scenario!.fen);
    history = [];
    viewPly = null;
    replay = 'playing';
    practiceMsg = '';
    cg.setAutoShapes([]);
    sync();
    const step = () => {
      if (destroyed || replay !== 'playing') return;
      const san = solutionMoves[history.length];
      if (!san) return stopReplay();
      history.push(chess.move(san));
      sync();
      replayTimer = setTimeout(step, REPLAY_DELAY);
    };
    replayTimer = setTimeout(step, REPLAY_DELAY);
  }

  function stopReplay() {
    clearTimeout(replayTimer);
    replay = 'done';
    sync();
  }

  /** Leave solution mode and carry on as a normal game from the current position. */
  function playOn() {
    clearTimeout(replayTimer);
    replay = 'off';
    practiceMsg = '';
    if (viewPly !== null) {
      // Continue from the move being looked at, dropping the later moves.
      chess = positionAt(viewPly);
      history = history.slice(0, viewPly);
    }
    viewPly = null;
    sync();
    maybeEngineMove();
  }

  function flip() {
    orientation = orientation === 'white' ? 'black' : 'white';
    cg.set({ orientation });
  }

  async function hint() {
    if (replay === 'practice') {
      // In practice the hint is the book's move, not the engine's.
      const san = solutionMoves[history.length];
      const m = san && new Chess(chess.fen()).move(san);
      if (m) {
        hintsUsed++;
        cg.setAutoShapes([{ orig: m.from as Key, dest: m.to as Key, brush: 'green' }]);
      }
      return;
    }
    hintBtn.disabled = true;
    const my = token;
    const fen = chess.fen();
    const uci = await engine.bestMove({ fen, elo: null, skill: 20, movetime: 1200 });
    if (destroyed || my !== token || chess.fen() !== fen) return;
    hintBtn.disabled = false;
    if (uci) cg.setAutoShapes([{ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: 'green' }]);
  }

  function showSolution() {
    dialog('Solution', h('p', { class: 'solution' }, scenario!.solution), [{ label: 'Close', value: true, primary: true }]);
  }

  function result(): string {
    if (chess.isCheckmate()) return chess.turn() === 'w' ? '0-1' : '1-0';
    if (chess.isDraw() || chess.isStalemate()) return '1/2-1/2';
    return '*';
  }

  function pgn(): string {
    const you = 'You';
    const cpu = `Computer (${level.id})`;
    return toPgn(scenario!, history.map(m => m.san), result(), {
      White: userColor === 'white' ? you : cpu,
      Black: userColor === 'black' ? you : cpu,
    });
  }

  function saveAsNew() {
    const ply = viewPly ?? history.length;
    const copy = store.blank(positionAt(ply).fen());
    copy.title = ply ? `${scenario!.title} (after ${history[ply - 1].san})` : `${scenario!.title} (copy)`;
    copy.source = scenario!.source;
    copy.tags = [...scenario!.tags];
    store.upsert(copy);
    toast('Saved as a new position');
    navigate(`edit/${copy.id}`);
  }

  sync();
  maybeEngineMove();

  return () => {
    destroyed = true;
    clearTimeout(replayTimer);
    cancelThinking();
    cg.destroy();
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
}
