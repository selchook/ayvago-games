// Neon Ronin: the neon palette and the kit's hazard stripes, shared by the theme, the screens and the HUD.
export const INK = '#0a0614';
export const MAGENTA = 0xff3fa8, CYAN = 0x3ff0ff, YELLOW = 0xffe040, LIME = 0x7cff6a, VIOLET = 0x8a7aff, RED = 0xff4a5a, STEEL = 0x8a90b0;


/** Yellow-and-black hazard stripes in a box. */
export function hazard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step = 12): void {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = '#ffd23a'; c.fillRect(x, y, w, h);
  c.fillStyle = '#16121e';
  for (let i = -h; i < w + h; i += step * 2) {
    c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + step, y + h); c.lineTo(x + i + step + h, y); c.lineTo(x + i + h, y); c.closePath(); c.fill();
  }
  c.restore();
}

