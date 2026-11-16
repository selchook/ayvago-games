// Hex Realm: the illuminated manuscript page (the menu's how-to card, the pause and result cards,
// the inner screens' cards and the power cards' faces), in a module of its own so the screens and
// the menu theme can both paint it.
function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** The how-to and the pause / result card: vellum with a gold-leaf frame, blue and red rules, vines in the corners. */
export function paintVellum(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(w * 7 + h * 3);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
  c.fillStyle = '#e8d8b0';
  c.beginPath(); c.roundRect(0, 0, w, h, 10); c.fill();
  c.restore();
  c.save();
  c.beginPath(); c.roundRect(0, 0, w, h, 10); c.clip();
  const base = c.createLinearGradient(0, 0, w * 0.4, h);
  base.addColorStop(0, '#f7ecd0'); base.addColorStop(1, '#ead6a8');
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 1100; i++) {
    const x = r() * w, y = r() * h, rad = 8 + r() * 26;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(160,110,50,${0.03 + r() * 0.05})`); g.addColorStop(1, 'rgba(160,110,50,0)');
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const rim = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.max(w, h) * 0.66);
  rim.addColorStop(0, 'rgba(120,80,30,0)'); rim.addColorStop(1, 'rgba(110,70,20,0.28)');
  c.fillStyle = rim; c.fillRect(0, 0, w, h);
  c.restore();
  // the gold-leaf frame: a thick gold band, a blue rule and a red rule inside
  const gold = c.createLinearGradient(0, 0, w, h);
  gold.addColorStop(0, '#fff0a8'); gold.addColorStop(0.35, '#d8a83a'); gold.addColorStop(0.65, '#f4d478'); gold.addColorStop(1, '#a87a1a');
  c.lineWidth = 6; c.strokeStyle = gold;
  c.beginPath(); c.roundRect(7, 7, w - 14, h - 14, 6); c.stroke();
  c.lineWidth = 1.2; c.strokeStyle = '#5a3a10';
  c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 8); c.stroke();
  c.beginPath(); c.roundRect(10, 10, w - 20, h - 20, 4); c.stroke();
  c.lineWidth = 2; c.strokeStyle = '#2c4a9a';
  c.strokeRect(15, 15, w - 30, h - 30);
  c.lineWidth = 1; c.strokeStyle = '#8a1c24';
  c.strokeRect(19, 19, w - 38, h - 38);
  // vines with gold berries curling out of each corner (not on the small cards)
  if (w < 300 || h < 230) return;
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as number[][]) {
    c.save(); c.translate(x, y); c.scale(sx, sy);
    c.strokeStyle = '#2e6a3a'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(16, 16); c.bezierCurveTo(40, 18, 52, 30, 46, 44); c.bezierCurveTo(42, 54, 30, 50, 34, 42); c.stroke();
    c.beginPath(); c.moveTo(16, 16); c.bezierCurveTo(18, 40, 30, 52, 44, 46); c.stroke();
    c.fillStyle = '#2e6a3a';
    for (const [lx, ly, a] of [[30, 20, 0.4], [20, 31, 1.2], [44, 30, 1.9]]) { c.save(); c.translate(lx, ly); c.rotate(a); c.beginPath(); c.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
    c.fillStyle = gold;
    for (const [bx, by] of [[16, 16], [48, 40], [36, 50]]) { c.beginPath(); c.arc(bx, by, 3.4, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#8a1c24';
    c.beginPath(); c.arc(16, 16, 1.6, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}
