// Computer strength levels. These are approximate ratings: Stockfish can't limit itself
// below about 1320 Elo, so the lower levels also play some random moves and search less.
// Change the numbers here to make a level easier or harder.

export interface Level {
  id: string;
  label: string;
  /** Stockfish's built-in strength limit, or null to use skill + depth instead. */
  elo: number | null;
  skill?: number;
  depth?: number;
  movetime?: number;
  /** Chance (0-1) of playing a random legal move instead of the engine's move. */
  randomChance: number;
}

export const LEVELS: Level[] = [
  { id: '500', label: '500 (beginner)', elo: null, skill: 0, depth: 1, randomChance: 0.4 },
  { id: '1000', label: '1000 (casual)', elo: 1320, movetime: 300, randomChance: 0.15 },
  { id: '1500', label: '1500 (club)', elo: 1500, movetime: 500, randomChance: 0 },
  { id: '2000', label: '2000 (strong)', elo: 2000, movetime: 800, randomChance: 0 },
];

const KEY = 'chess-scenarios.level';

export function getLevel(): Level {
  let id = '1000';
  try {
    id = localStorage.getItem(KEY) || id;
  } catch {}
  return LEVELS.find(l => l.id === id) ?? LEVELS[1];
}

export function setLevel(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}
