// Runs the Morris search off the main thread, so the board keeps animating while the AI thinks
// (the deepest level searches for most of a second).
import { choose, LEVELS, type State } from './rules';

interface Req { id: number; board: number[]; hand: [number, number, number]; turn: 1 | 2; quiet: number; level: number }

self.onmessage = (e: MessageEvent<Req>) => {
  const d = e.data;
  const s: State = { board: Int8Array.from(d.board), hand: [0, d.hand[1], d.hand[2]], turn: d.turn, quiet: d.quiet };
  const m = choose(s, LEVELS[Math.min(d.level, LEVELS.length - 1)]);
  self.postMessage({ id: d.id, r: m });
};
