// Small polyfills for older browsers players still use: imported first by @core and @core/three,
// so they are in place before any game module draws.
//
// roundRect (CanvasRenderingContext2D, OffscreenCanvasRenderingContext2D and Path2D) arrived in
// Safari 16; iOS 15 (and in-app browsers built on it) throw "roundRect is not a function" when a
// menu theme paints its rounded panels and buttons. The fallback draws the same path with arcTo,
// following the spec: radii as a number, a DOMPointInit or a list of 1–4 of them, negative widths
// and heights flipped, and corners scaled down together when they do not fit.

type Radius = number | DOMPointInit;
type RoundRectTarget = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'arcTo' | 'closePath' | 'rect'>;

interface Corner { x: number; y: number }

function corner(r: Radius): Corner {
  if (typeof r === 'number') {
    if (!(r >= 0)) throw new RangeError(`roundRect: radius ${r} is negative or not a number`);
    return { x: r, y: r };
  }
  const x = r.x ?? 0, y = r.y ?? 0;
  if (!(x >= 0) || !(y >= 0)) throw new RangeError('roundRect: radius is negative or not a number');
  return { x, y };
}

/** The four corners (top-left, top-right, bottom-right, bottom-left) from the spec's 1–4 radii. */
function corners(radii: Radius | Radius[] | undefined): [Corner, Corner, Corner, Corner] {
  const list = radii === undefined ? [0] : Array.isArray(radii) ? radii : [radii];
  if (list.length < 1 || list.length > 4) throw new RangeError(`roundRect: ${list.length} radii (1 to 4 expected)`);
  const c = list.map(corner);
  switch (c.length) {
    case 1: return [c[0], c[0], c[0], c[0]];
    case 2: return [c[0], c[1], c[0], c[1]];
    case 3: return [c[0], c[1], c[2], c[1]];
    default: return [c[0], c[1], c[2], c[3]];
  }
}

function roundRect(this: RoundRectTarget, x: number, y: number, w: number, h: number, radii?: Radius | Radius[]): void {
  if (![x, y, w, h].every(Number.isFinite)) return;
  let [tl, tr, br, bl] = corners(radii);
  // a negative width or height mirrors the rectangle, and its corners with it
  if (w < 0) { x += w; w = -w; [tl, tr, br, bl] = [tr, tl, bl, br]; }
  if (h < 0) { y += h; h = -h; [tl, tr, br, bl] = [bl, br, tr, tl]; }
  // corners that overlap are all scaled down by the same factor
  const scale = Math.min(
    1,
    w / (tl.x + tr.x || Infinity), w / (bl.x + br.x || Infinity),
    h / (tl.y + bl.y || Infinity), h / (tr.y + br.y || Infinity),
  );
  if (scale < 1) for (const c of [tl, tr, br, bl]) { c.x *= scale; c.y *= scale; }
  // elliptical corners are drawn circular (radius = the smaller axis): close enough for UI panels
  const r = (c: Corner): number => Math.min(c.x, c.y);
  const rtl = r(tl), rtr = r(tr), rbr = r(br), rbl = r(bl);
  if (rtl + rtr + rbr + rbl === 0) { this.rect(x, y, w, h); return; }
  this.moveTo(x + rtl, y);
  this.arcTo(x + w, y, x + w, y + h, rtr);
  this.arcTo(x + w, y + h, x, y + h, rbr);
  this.arcTo(x, y + h, x, y, rbl);
  this.arcTo(x, y, x + w, y, rtl);
  this.closePath();
  this.moveTo(x, y);
}

function install(proto: object | undefined): void {
  if (!proto || 'roundRect' in proto) return;
  Object.defineProperty(proto, 'roundRect', { value: roundRect, writable: true, configurable: true });
}

if (typeof window !== 'undefined') {
  install(globalThis.CanvasRenderingContext2D?.prototype);
  install(globalThis.Path2D?.prototype);
  install((globalThis as { OffscreenCanvasRenderingContext2D?: { prototype: object } }).OffscreenCanvasRenderingContext2D?.prototype);
}

export {};
