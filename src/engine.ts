// Thin wrapper around the Stockfish WASM engine running in a Web Worker (UCI protocol).

export interface SearchOptions {
  fen: string;
  /** null = full strength */
  elo: number | null;
  skill?: number; // 0-20, used when elo is null
  depth?: number;
  movetime?: number; // ms
}

export class Engine {
  private worker: Worker;
  private listeners: ((line: string) => void)[] = [];
  private ready: Promise<void>;
  private eloRange = { min: 1320, max: 3190 };
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    this.worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
    this.worker.onmessage = e => {
      const line = String(e.data);
      for (const l of [...this.listeners]) l(line);
    };
    this.ready = new Promise(resolve => {
      const onLine = (line: string) => {
        const m = line.match(/option name UCI_Elo type spin default \d+ min (\d+) max (\d+)/);
        if (m) this.eloRange = { min: +m[1], max: +m[2] };
        if (line === 'uciok') {
          this.off(onLine);
          resolve();
        }
      };
      this.on(onLine);
      this.send('uci');
    });
  }

  get minElo(): number {
    return this.eloRange.min;
  }

  private send(cmd: string): void {
    this.worker.postMessage(cmd);
  }
  private on(l: (line: string) => void): void {
    this.listeners.push(l);
  }
  private off(l: (line: string) => void): void {
    this.listeners = this.listeners.filter(x => x !== l);
  }

  private async isReady(): Promise<void> {
    await new Promise<void>(resolve => {
      const onLine = (line: string) => {
        if (line === 'readyok') {
          this.off(onLine);
          resolve();
        }
      };
      this.on(onLine);
      this.send('isready');
    });
  }

  newGame(): void {
    this.send('ucinewgame');
  }

  /** Returns the best move in UCI notation (e.g. "e2e4", "e7e8q"), or null if there is none. */
  bestMove(opts: SearchOptions): Promise<string | null> {
    // Serialize searches so options from one search never leak into another.
    const run = async () => {
      await this.ready;
      if (opts.elo !== null) {
        const elo = Math.max(this.eloRange.min, Math.min(this.eloRange.max, opts.elo));
        this.send('setoption name UCI_LimitStrength value true');
        this.send(`setoption name UCI_Elo value ${elo}`);
      } else {
        this.send('setoption name UCI_LimitStrength value false');
        this.send(`setoption name Skill Level value ${opts.skill ?? 20}`);
      }
      await this.isReady();
      this.send(`position fen ${opts.fen}`);
      return new Promise<string | null>(resolve => {
        const onLine = (line: string) => {
          if (!line.startsWith('bestmove')) return;
          this.off(onLine);
          const mv = line.split(/\s+/)[1];
          resolve(mv && mv !== '(none)' ? mv : null);
        };
        this.on(onLine);
        const parts = ['go'];
        if (opts.depth) parts.push('depth', String(opts.depth));
        if (opts.movetime) parts.push('movetime', String(opts.movetime));
        if (parts.length === 1) parts.push('movetime', '1000');
        this.send(parts.join(' '));
      });
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  stop(): void {
    this.send('stop');
  }
}

let shared: Engine | null = null;
export function getEngine(): Engine {
  if (!shared) shared = new Engine();
  return shared;
}
