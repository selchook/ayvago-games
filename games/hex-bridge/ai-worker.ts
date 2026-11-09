// Runs the Hex search off the main thread, so the board keeps animating while the AI thinks
// (a deep search can take most of a second on a phone).
import { chooseMove, type Level } from './hex';

interface Req { id: number; board: number[]; p: number; lvl: Level; budget: number }

self.onmessage = (e: MessageEvent<Req>) => {
  const d = e.data;
  const i = chooseMove(Int8Array.from(d.board), d.p, d.lvl, d.budget);
  self.postMessage({ id: d.id, r: i });
};
