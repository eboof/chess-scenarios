import type { Pack, Scenario } from './storage';
import capablancaCh1to3 from './packs/capablanca-fundamentals-ch1-3.json';

// A few classic endgame positions loaded on first run so the library isn't empty.
// Capablanca opens "Chess Fundamentals" with exactly these basic endings.
export const SAMPLES: Partial<Scenario>[] = [
  {
    id: 'sample-kq-k',
    title: 'King and queen vs king',
    source: 'Basic mate (Capablanca, Chess Fundamentals, ch. 1)',
    goal: 'White to play and mate',
    notes: 'Use the queen to box the king in towards the edge, then bring your own king up. Watch out for stalemate!',
    tags: ['endgame', 'mate'],
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
  },
  {
    id: 'sample-kr-k',
    title: 'King and rook vs king',
    source: 'Basic mate (Capablanca, Chess Fundamentals, ch. 1)',
    goal: 'White to play and mate',
    notes: 'Use the king and rook together to drive the black king to the edge of the board.',
    tags: ['endgame', 'mate'],
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
  },
  {
    id: 'sample-kp-k',
    title: 'King and pawn vs king',
    source: 'Pawn endings (Capablanca, Chess Fundamentals, ch. 1)',
    goal: 'White to play and win',
    notes: 'Lead with the king, not the pawn. Gaining the opposition is the key idea.',
    tags: ['endgame', 'pawn'],
    fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
  },
  {
    id: 'sample-lucena',
    title: 'Lucena position',
    source: 'Classic rook ending',
    goal: 'White to play and win',
    notes: 'The black king is cut off. Win by “building a bridge” with the rook to shield your king from checks.',
    solution: '1. Rd1+ Ke7 2. Rd4 Ra1 3. Kc7 Rc1+ 4. Kb6 Rb1+ 5. Kc6 Rc1+ 6. Kb5 Rb1+ 7. Rb4',
    tags: ['endgame', 'rook'],
    fen: '1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1',
  },
];

// Built-in collections. Each one is added to the library once (see addNewPacks).
export const PACKS: Pack[] = [
  { id: 'samples', scenarios: SAMPLES },
  // Diagrams from chapters 1-3 of Capablanca's Chess Fundamentals (1921, public domain),
  // transcribed from the Project Gutenberg edition. The book's lines are in each solution field.
  { id: 'capablanca-fundamentals-ch1-3', scenarios: capablancaCh1to3 },
];
