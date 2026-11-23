// Last Convoy: the theme's colours and small painters, shared by the menu theme (menu.ts), the
// inner screens (screens.ts) and the HUD, kept apart so those modules do not import each other.
export const INK = '#14100c';
export const YELLOW = 0xf2b21a;
export const RUST = 0x7a4a2e;
export const STEEL = 0x4a4e54;
export const DARK = 0x24221f;
export const GREEN = 0x2f8a4a;
export const RED = 0xc8382a;
export const SIGN = 0x1f6a3a;

export const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
export function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Rust stains, scratches and dents on a plate. */
export function grime(c: CanvasRenderingContext2D, w: number, h: number, seed: number, k = 1): void {
  const r = rng(seed);
  for (let i = 0; i < ((w * h) / 2600) * k; i++) {
    const x = r() * w, y = r() * h, rr = 2 + r() * 9;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(122,58,24,${0.25 + r() * 0.3})`); g.addColorStop(1, 'rgba(122,58,24,0)');
    c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  c.lineWidth = 1;
  for (let i = 0; i < ((w * h) / 4000) * k; i++) {
    const x = r() * w, y = r() * h, l = 6 + r() * 22, a = (r() - 0.5) * 0.8;
    c.strokeStyle = `rgba(255,255,255,${0.06 + r() * 0.1})`;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
}

/** Black-and-yellow hazard stripes over a rectangle. */
export function hazard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step = 16, alpha = 1): void {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = css(YELLOW, alpha); c.fillRect(x, y, w, h);
  c.fillStyle = `rgba(20,16,12,${alpha})`;
  for (let k = -h; k < w + h; k += step * 2) { c.beginPath(); c.moveTo(x + k, y + h); c.lineTo(x + k + step, y + h); c.lineTo(x + k + step + h, y); c.lineTo(x + k + h, y); c.closePath(); c.fill(); }
  c.restore();
}

