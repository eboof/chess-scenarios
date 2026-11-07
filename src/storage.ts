// Scenario library, stored in the browser's localStorage.
// Use Library → Export regularly as a backup: Safari can clear site data.

export interface Scenario {
  id: string;
  title: string;
  source: string; // e.g. "Capablanca, Chess Fundamentals, p. 42"
  goal: string; // e.g. "White to play and win"
  notes: string;
  solution: string; // optional book solution, free text or SAN moves
  tags: string[];
  fen: string;
  createdAt: number;
  updatedAt: number;
}

const KEY = 'chess-scenarios.v1';
const SEEDED_KEY = 'chess-scenarios.seeded';

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function loadAll(): Scenario[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.map(normalize) : [];
  } catch {
    return [];
  }
}

function saveAll(list: Scenario[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function get(id: string): Scenario | undefined {
  return loadAll().find(s => s.id === id);
}

export function upsert(s: Scenario): void {
  const list = loadAll();
  const i = list.findIndex(x => x.id === s.id);
  s.updatedAt = Date.now();
  if (i >= 0) list[i] = s;
  else list.unshift(s);
  saveAll(list);
}

export function remove(id: string): void {
  saveAll(loadAll().filter(s => s.id !== id));
}

/** Adds scenarios, skipping any whose id already exists. Returns the number added. */
export function importMany(items: Partial<Scenario>[]): number {
  const list = loadAll();
  const ids = new Set(list.map(s => s.id));
  let added = 0;
  for (const item of items) {
    const s = normalize(item);
    if (!s.fen || ids.has(s.id)) continue;
    list.push(s);
    ids.add(s.id);
    added++;
  }
  saveAll(list);
  return added;
}

export function normalize(x: Partial<Scenario>): Scenario {
  const now = Date.now();
  return {
    id: x.id || newId(),
    title: x.title || 'Untitled position',
    source: x.source || '',
    goal: x.goal || '',
    notes: x.notes || '',
    solution: x.solution || '',
    tags: Array.isArray(x.tags) ? x.tags.map(String) : [],
    fen: x.fen || '',
    createdAt: x.createdAt || now,
    updatedAt: x.updatedAt || now,
  };
}

export function blank(fen: string): Scenario {
  return normalize({ fen });
}

export interface Pack {
  id: string;
  scenarios: Partial<Scenario>[];
}

const PACKS_KEY = 'chess-scenarios.packs';

/**
 * Adds each built-in collection to the library once. A collection that has already been added
 * isn't added again, so positions the user deleted stay deleted. Returns the number of positions added.
 */
export function addNewPacks(packs: Pack[]): number {
  let done: string[] = [];
  try {
    done = JSON.parse(localStorage.getItem(PACKS_KEY) || '[]');
  } catch {}
  // Libraries created before collections existed already got the samples on first run.
  if (localStorage.getItem(SEEDED_KEY) && !done.includes('samples')) done.push('samples');
  let added = 0;
  for (const p of packs) {
    if (done.includes(p.id)) continue;
    added += importMany(p.scenarios);
    done.push(p.id);
  }
  localStorage.setItem(PACKS_KEY, JSON.stringify(done));
  localStorage.setItem(SEEDED_KEY, '1');
  return added;
}

/** Ask Safari to keep our data rather than evicting it under storage pressure. */
export function requestPersistence(): void {
  navigator.storage?.persist?.().catch(() => {});
}
