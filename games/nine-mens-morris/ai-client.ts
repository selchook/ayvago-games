// Asks the AI worker for a move. Falls back to searching on the main thread when workers are
// unavailable, fail to load or do not answer in time.

let worker: Worker | null = null;
let broken = false;
let seq = 0;
const waiting = new Map<number, { done: (r: unknown) => void; local: () => unknown; timer: number }>();

function getWorker(): Worker | null {
  if (worker || broken || typeof Worker === 'undefined') return worker;
  try {
    const w = new Worker(new URL('./ai-worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; r: unknown }>) => {
      const job = waiting.get(e.data.id);
      if (!job) return;
      waiting.delete(e.data.id);
      clearTimeout(job.timer);
      job.done(e.data.r);
    };
    w.onerror = (e) => {
      e.preventDefault();
      broken = true;
      w.terminate();
      if (worker === w) worker = null;
      for (const [id, job] of waiting) { waiting.delete(id); clearTimeout(job.timer); job.done(job.local()); }
    };
    worker = w;
  } catch {
    broken = true;
  }
  return worker;
}

/** Sends `req` to the worker; `local` computes the same answer on the main thread. */
export function think<R>(req: Record<string, unknown>, local: () => R, timeoutMs: number): Promise<R> {
  const w = getWorker();
  if (!w) return new Promise((resolve) => setTimeout(() => resolve(local()), 0));
  return new Promise((resolve) => {
    const id = ++seq;
    const timer = window.setTimeout(() => {
      const job = waiting.get(id);
      if (!job) return;
      waiting.delete(id);
      job.done(job.local());
    }, timeoutMs);
    waiting.set(id, { done: resolve as (r: unknown) => void, local, timer });
    w.postMessage({ id, ...req });
  });
}

/** A fresh id for each AI request, never reused across restarts (stale answers are dropped). */
export function nextToken(): number {
  return ++seq;
}
