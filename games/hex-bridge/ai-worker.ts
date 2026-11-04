// Runs the Hex search off the main thread, so the board keeps animating while the AI thinks
// (a deep search can take most of a second on a phone).
import { chooseMove, LEVELS } from './hex';

interface Req { id: number; board: number[]; p: number; level: number; budget: number }

self.onmessage = (e: MessageEvent<Req>) => {
  const d = e.data;
  const i = chooseMove(Int8Array.from(d.board), d.p, LEVELS[Math.min(d.level, LEVELS.length - 1)], d.budget);
  self.postMessage({ id: d.id, r: i });
};
