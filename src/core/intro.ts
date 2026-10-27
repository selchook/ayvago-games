// Ayvago Games boot intro — 1:1 port of AyvagoBootIntro.cs (itself a port of the HTML piece).
// Same five PNGs, same clock, same easing and geometry; drawn on a DOM canvas that sits
// above the game, so the game can preload underneath while the intro plays.
//
// Only deviation from the Unity version: the reference-resolution scale is clamped so the
// lockup also fits on portrait phones (Unity's CanvasScaler would overflow there).

export interface IntroOptions {
  allowSkipOnTap?: boolean;
  speed?: number;          // 1 = authored 5.3s
  ground?: string;         // mürekkep #201e1d (kırmızı sürüm: #ec3013)
  accent?: string;         // marka kırmızısı
  paper?: string;          // kâğıt beyazı
  assetRoot?: string;      // folder that holds boot_*.png
}

// authored scene lengths (Tohum / İsim / Kilit / Bekleme)
const S1 = 1.5, S2 = 1.5, S3 = 1.4, S4 = 0.9;
export const INTRO_DURATION = S1 + S2 + S3 + S4;

// lockup geometry at the 1920x1080 reference resolution
const FS = 168;
const MARK = FS * 0.86;
const LETTERS_W = 1148, LETTERS_H = 336;
const ROW_W = LETTERS_W + 5 + MARK;
const GAMES_W = 364, GAMES_H = 66, RULE_W = 332;
const BIG = 2.15;
const SLOT_X = ROW_W * 0.5 - MARK * 0.5, SLOT_Y = 52 - 6;   // MARK_SLOT

const seg = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOutBack = (p: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('[AyvagoBoot] eksik sprite: ' + src));
    img.src = src;
  });
}

// Unity Image.color tint on a white sprite == recolour the alpha mask.
function tint(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function defaultAssetRoot(): string {
  return new URL('../../assets/ayvago/', document.baseURI).href;
}

/** Plays the Ayvago boot intro over the page. Resolves when it ends or is skipped. */
export async function playAyvagoIntro(opts: IntroOptions = {}): Promise<void> {
  const o = {
    allowSkipOnTap: true, speed: 1, ground: '#201e1d', accent: '#ec3013', paper: '#f3f2f2',
    assetRoot: defaultAssetRoot(), ...opts,
  };

  const overlay = document.createElement('div');
  overlay.id = 'ayvago-boot';
  overlay.setAttribute('aria-label', 'Ayvago Games');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483000', background: o.ground,
    touchAction: 'none', userSelect: 'none', cursor: 'pointer',
  } as CSSStyleDeclaration);
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
  overlay.appendChild(canvas);
  document.body.appendChild(overlay);

  let sprites: Record<'ring' | 'seed' | 'ayvag' | 'games', HTMLCanvasElement>;
  try {
    const [ring, seed, ayvag, games] = await Promise.all(
      ['boot_ring', 'boot_seed', 'boot_ayvag', 'boot_games'].map((n) => loadImage(o.assetRoot + n + '.png')),
    );
    sprites = { ring: tint(ring, o.paper), seed: tint(seed, o.accent), ayvag: tint(ayvag, o.paper), games: tint(games, o.paper) };
  } catch (e) {
    console.warn(e);
    overlay.remove();
    return;
  }

  const ctx = canvas.getContext('2d')!;
  let t = 0;

  return new Promise<void>((resolve) => {
    let done = false;
    let last = performance.now();

    const finish = () => {
      if (done) return;
      done = true;
      overlay.removeEventListener('pointerdown', finish);
      window.removeEventListener('keydown', finish);
      overlay.remove();
      resolve();
    };
    if (o.allowSkipOnTap) {
      overlay.addEventListener('pointerdown', finish);
      window.addEventListener('keydown', finish);
    }

    const frame = (now: number) => {
      if (done) return;
      t += Math.min(0.1, (now - last) / 1000) * Math.max(0.1, o.speed);
      last = now;
      render(t);
      if (t >= INTRO_DURATION) finish();
      else requestAnimationFrame(frame);
    };

    function render(time: number) {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const cw = overlay.clientWidth, ch = overlay.clientHeight;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      }
      // CanvasScaler ScaleWithScreenSize, match 0.5 (log blend) + fit-to-width clamp
      const unity = Math.sqrt((cw / 1920) * (ch / 1080));
      const k = Math.min(unity, (cw * 0.9) / (ROW_W * 1.05)) * dpr;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = o.ground;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // lockup space: origin at screen centre, reference units, y up (Unity UI)
      const drift = lerp(1, 1.05, easeInOut(seg(time, S1 + S2, S1 + S2 + S3 + S4)));
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(k * drift, -k * drift);

      // y-up helper: draws an image whose centre is (x, y) with size (w, h)
      const blit = (img: CanvasImageSource, x: number, y: number, w: number, h: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, -1);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      };

      // --- İsim: AYVAG revealed by a widening mask (pivot left, y = 52)
      const wipe = easeOut(seg(time, S1 + 0.6, S1 + 1.35));
      if (wipe > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-ROW_W / 2, 52 - LETTERS_H / 2, LETTERS_W * wipe, LETTERS_H);
        ctx.clip();
        blit(sprites.ayvag, -ROW_W / 2 + LETTERS_W / 2, 52, LETTERS_W, LETTERS_H);
        ctx.restore();
      }

      // --- mark: slot holds the final position, inner does the travel + scale
      const j = easeInOut(seg(time, S1 + 0.06, S1 + 0.87));
      const pop = easeOutBack(seg(time, 0.03, 0.6));
      const markScale = lerp(BIG * lerp(0.86, 1, pop), 1, j);
      const mx = SLOT_X + lerp(-SLOT_X, 0, j);
      const my = SLOT_Y + lerp(-SLOT_Y, 0, j);
      ctx.save();
      ctx.translate(mx, my);
      ctx.scale(markScale, markScale);

      // --- Tohum: ring draws (radial fill from top, clockwise)
      const ring = easeInOut(seg(time, 0.09, 0.69));
      if (ring > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        // y-up space: top = +90°, clockwise = decreasing angle
        ctx.arc(0, 0, MARK, Math.PI / 2, Math.PI / 2 - ring * Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        blit(sprites.ring, 0, 0, MARK, MARK);
        ctx.restore();
      }
      // seeds pop, one every 0.1125s, rotated -72° each
      for (let i = 0; i < 5; i++) {
        const s = easeOutBack(seg(time, 0.63 + i * 0.1125, 1.05 + i * 0.1125));
        if (s <= 0) continue;
        ctx.save();
        ctx.rotate((-72 * i * Math.PI) / 180);
        ctx.translate(0, lerp(MARK * 0.06, MARK * 0.19, s));
        ctx.scale(s, s);
        blit(sprites.seed, 0, 0, MARK * 0.13, MARK * 0.21);
        ctx.restore();
      }
      ctx.restore();

      // --- Kilit: rule draws, GAMES tracks in
      const r = easeInOut(seg(time, S1 + S2 + 0.06, S1 + S2 + 0.7));
      if (r > 0) {
        ctx.fillStyle = o.accent;
        ctx.fillRect(-361, -104 - 1.5, RULE_W * r, 3);
      }
      const g = easeOut(seg(time, S1 + S2 + 0.48, S1 + S2 + 1.15));
      if (g > 0) {
        ctx.globalAlpha = g;
        blit(sprites.games, 179 + (1 - g) * 26, -104, GAMES_W, GAMES_H);
        ctx.globalAlpha = 1;
      }
    }

    requestAnimationFrame(frame);
  });
}
