// Kickflip Park: the deck graphics printed under the Kenney board, painted on a canvas (the board's
// length runs down the canvas). boardmodel.ts turns them into the deck texture. Add a painter here
// and name it in a board's `deck` (boards.ts) to make a new graphic.

type Painter = (g: CanvasRenderingContext2D, W: number, H: number) => void;

const bg = (g: CanvasRenderingContext2D, W: number, H: number, c: string) => { g.fillStyle = c; g.fillRect(0, 0, W, H); };

function vgrad(g: CanvasRenderingContext2D, W: number, H: number, stops: [number, string][]): void {
  const grd = g.createLinearGradient(0, 0, 0, H);
  for (const [k, c] of stops) grd.addColorStop(k, c);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, n = 5): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r0 : r1;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

/** A seeded scatter (the same dots every time). */
function scatter(n: number, seed: number, f: (x: number, y: number, k: number, i: number) => void): void {
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) f(r(), r(), r(), i);
}

export const DECK_ART: Record<string, Painter> = {
  classic(g, W, H) {
    bg(g, W, H, '#ef5b2a');
    g.fillStyle = '#ffd23f'; g.fillRect(0, H * 0.39, W, H * 0.07); g.fillRect(0, H * 0.54, W, H * 0.07);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ef5b2a'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.125, 0, Math.PI * 2); g.fill();
  },
  flame(g, W, H) {
    bg(g, W, H, '#26222e');
    for (let i = 0; i < 6; i++) {
      const x = W * (0.08 + i * 0.17);
      const grd = g.createLinearGradient(0, H, 0, H * 0.23);
      grd.addColorStop(0, '#ffdf3a'); grd.addColorStop(0.5, '#ff7a1a'); grd.addColorStop(1, '#e8322b');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x - W * 0.11, H); g.quadraticCurveTo(x - W * 0.14, H * 0.58, x + (i % 2 ? 1 : -1) * W * 0.05, H * (0.27 + ((i * 23) % 50) / 256));
      g.quadraticCurveTo(x + W * 0.11, H * 0.62, x + W * 0.11, H); g.fill();
    }
  },
  checker(g, W, H) {
    bg(g, W, H, '#f4f1ea');
    g.fillStyle = '#26222e';
    const s = W / 4;
    for (let y = 0; y < Math.ceil(H / s); y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * s, y * s, s, s);
  },
  wave(g, W, H) {
    bg(g, W, H, '#2f7fd8');
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = i % 2 ? '#9fe8ff' : '#ffffff'; g.lineWidth = W * 0.055;
      g.beginPath();
      for (let x = 0; x <= W; x += W / 16) g.lineTo(x, H * (i / 8.6) + H * 0.04 + Math.sin(x / (W * 0.11) + i) * H * 0.03);
      g.stroke();
    }
  },
  galaxy(g, W, H) {
    vgrad(g, W, H, [[0, '#2a1259'], [0.5, '#7a2fb8'], [1, '#1a0f3a']]);
    g.fillStyle = '#ffffff';
    scatter(70, 7, (x, y, k) => { g.beginPath(); g.arc(x * W, y * H, k > 0.85 ? W * 0.02 : W * 0.009, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#ffd6ff'; star(g, W * 0.5, H * 0.5, W * 0.05, W * 0.16, 4);
  },
  gold(g, W, H) {
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#fff2a8'); grd.addColorStop(0.5, '#e8b020'); grd.addColorStop(1, '#fff0a0');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff'; star(g, W / 2, H / 2, W * 0.125, W * 0.3);
  },
  mint(g, W, H) {
    bg(g, W, H, '#e8fff4');
    g.fillStyle = '#5fe0b0';
    for (let i = -4; i < 12; i++) { g.beginPath(); g.moveTo(0, i * H / 8); g.lineTo(W, i * H / 8 - W); g.lineTo(W, i * H / 8 - W + H / 16); g.lineTo(0, i * H / 8 + H / 16); g.fill(); }
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.3, H * 0.13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2fae7a'; g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.2, H * 0.08, 0, 0, Math.PI * 2); g.fill();
  },
  bubblegum(g, W, H) {
    vgrad(g, W, H, [[0, '#ff9ad0'], [1, '#ff5aa8']]);
    scatter(16, 11, (x, y, k) => {
      const r = W * (0.06 + k * 0.12);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x * W, y * H, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x * W - r * 0.35, y * H - r * 0.35, r * 0.22, 0, Math.PI * 2); g.fill();
    });
  },
  skyline(g, W, H) {
    vgrad(g, W, H, [[0, '#5ac8ff'], [0.6, '#bfe8ff'], [1, '#ffe7c4']]);
    g.fillStyle = '#ffffff';
    scatter(5, 3, (x, y) => { const cx = x * W, cy = y * H * 0.45 + H * 0.05; g.beginPath(); g.ellipse(cx, cy, W * 0.22, H * 0.025, 0, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#24304a';
    let x = 0;
    scatter(12, 5, (_a, b, k) => { const w = W * (0.1 + k * 0.12), h = H * (0.12 + b * 0.25); g.fillRect(x, H - h, w, h); x += w; });
    g.fillStyle = '#ffd23f';
    scatter(30, 9, (a, b) => g.fillRect(a * W, H - b * H * 0.3, W * 0.03, W * 0.03));
  },
  nightowl(g, W, H) {
    vgrad(g, W, H, [[0, '#120e2a'], [1, '#3a2a6a']]);
    g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(W * 0.5, H * 0.24, W * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#120e2a'; g.beginPath(); g.arc(W * 0.6, H * 0.21, W * 0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; scatter(30, 13, (a, b) => g.fillRect(a * W, b * H, W * 0.015, W * 0.015));
    // two owl eyes
    for (const dx of [-1, 1]) {
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(W / 2 + dx * W * 0.17, H * 0.64, W * 0.14, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#120e2a'; g.beginPath(); g.arc(W / 2 + dx * W * 0.17, H * 0.64, W * 0.065, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ff9a3c'; g.beginPath(); g.moveTo(W / 2 - W * 0.06, H * 0.7); g.lineTo(W / 2 + W * 0.06, H * 0.7); g.lineTo(W / 2, H * 0.76); g.fill();
  },
  royal(g, W, H) {
    vgrad(g, W, H, [[0, '#4a1a7a'], [1, '#2a0f4a']]);
    g.strokeStyle = '#ffc93a'; g.lineWidth = W * 0.04; g.strokeRect(W * 0.1, H * 0.06, W * 0.8, H * 0.88);
    g.fillStyle = '#ffc93a';
    const cy = H / 2, cw = W * 0.56, x0 = W / 2 - cw / 2;
    g.beginPath(); g.moveTo(x0, cy + W * 0.14); g.lineTo(x0, cy - W * 0.1); g.lineTo(x0 + cw * 0.25, cy + W * 0.02); g.lineTo(W / 2, cy - W * 0.2);
    g.lineTo(x0 + cw * 0.75, cy + W * 0.02); g.lineTo(x0 + cw, cy - W * 0.1); g.lineTo(x0 + cw, cy + W * 0.14); g.fill();
    g.fillStyle = '#ff5a8a'; g.beginPath(); g.arc(W / 2, cy + W * 0.05, W * 0.04, 0, Math.PI * 2); g.fill();
  },
  cassette(g, W, H) {
    bg(g, W, H, '#2a2433');
    g.fillStyle = '#ff6fd8'; g.fillRect(W * 0.1, H * 0.3, W * 0.8, H * 0.4);
    g.fillStyle = '#ffd23f'; g.fillRect(W * 0.1, H * 0.3, W * 0.8, H * 0.07);
    g.fillStyle = '#ffffff'; g.fillRect(W * 0.25, H * 0.43, W * 0.5, H * 0.16);
    for (const y of [0.47, 0.55]) { g.fillStyle = '#2a2433'; g.beginPath(); g.arc(W / 2, H * y, W * 0.07, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#4a4058'; g.fillRect(W * 0.2, H * 0.74, W * 0.6, H * 0.06);
    g.fillStyle = '#ff9ae6';
    for (const y of [0.08, 0.16, 0.86, 0.92]) g.fillRect(W * 0.1, H * y, W * 0.8, H * 0.025);
  },
  neon(g, W, H) {
    vgrad(g, W, H, [[0, '#14102a'], [0.55, '#3a1260'], [1, '#14102a']]);
    // a sunset disc with bands, a grid floor
    g.fillStyle = '#ff4fd8'; g.beginPath(); g.arc(W / 2, H * 0.36, W * 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(W / 2, H * 0.36, W * 0.3, Math.PI, Math.PI * 2); g.fill();
    g.fillStyle = '#3a1260'; for (let i = 0; i < 4; i++) g.fillRect(0, H * (0.37 + i * 0.05), W, H * 0.012 * (i + 1));
    g.strokeStyle = '#3cf0ff'; g.lineWidth = W * 0.02;
    for (let i = 0; i < 7; i++) { const y = H * 0.6 + Math.pow(i / 6, 1.7) * H * 0.4; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(W / 2 + i * W * 0.05, H * 0.6); g.lineTo(W / 2 + i * W * 0.3, H); g.stroke(); }
  },
  sunset(g, W, H) {
    vgrad(g, W, H, [[0, '#ffcf6a'], [0.45, '#ff8a4a'], [0.75, '#e8508a'], [1, '#5a2a7a']]);
    g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(W / 2, H * 0.42, W * 0.26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a1a3a';
    g.fillRect(0, H * 0.66, W, H * 0.34);
    // a palm
    g.fillRect(W * 0.66, H * 0.38, W * 0.05, H * 0.3);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * 0.95 + i * Math.PI * 0.38;
      g.beginPath(); g.ellipse(W * 0.685 + Math.cos(a) * W * 0.14, H * 0.38 + Math.sin(a) * W * 0.07, W * 0.16, W * 0.04, a, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,242,192,0.5)';
    for (let i = 0; i < 5; i++) g.fillRect(W * (0.2 + i * 0.05), H * (0.7 + i * 0.05), W * (0.6 - i * 0.1), H * 0.012);
  },
  lava(g, W, H) {
    bg(g, W, H, '#1a0c08');
    g.strokeStyle = '#ff5a1a'; g.lineCap = 'round';
    scatter(9, 17, (x, y, k, i) => {
      g.lineWidth = W * (0.03 + k * 0.05);
      g.strokeStyle = i % 3 ? '#ff5a1a' : '#ffd23f';
      g.beginPath(); g.moveTo(x * W, y * H);
      for (let s = 1; s < 6; s++) g.lineTo(x * W + Math.sin(s * 2.1 + i) * W * 0.25, y * H + s * H * 0.06);
      g.stroke();
    });
    const grd = g.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W * 0.5);
    grd.addColorStop(0, 'rgba(255,210,63,0.9)'); grd.addColorStop(1, 'rgba(255,90,26,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  },
};

/** A canvas with a deck graphic (w × h, the board's length down the canvas). */
export function paintDeck(art: string | undefined, w = 128, h = 256): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  (DECK_ART[art ?? 'classic'] ?? DECK_ART.classic)(g, w, h);
  return cv;
}
