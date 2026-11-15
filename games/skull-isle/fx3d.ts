// Skull Isle: the effects layer, all instanced so a busy beach stays at a few draw calls.
//   - Billboards: camera-facing or flat quads with a canvas-drawn texture, one InstancedMesh each
//     (blob shadows, glows, rings, flares, streaks, slash arcs, ink, sand puffs).
//   - Particles: sparks, splashes, sand, smoke and coin glints on one billboard set per blend mode.
//   - Telegraphs: the red warnings on the sand (circles, cones and lanes that fill up as the blow
//     comes; gold for the player's own cannon fire), one instanced quad with a small shader.
//   - Water: the sea round the island, a shader that knows the coastline (shallows, foam lines
//     that roll in, soft glints near the camera) and bobs a little; swellY() is the same swell on
//     the CPU, so foam, rings and wakes ride the waves instead of cutting through them.
//   - Health bars: one instanced quad per hurt foe, billboarded in the shader (one draw call).
//   - Wakes: foam ribbons on the water behind ships, sharks' fins and swimmers (one draw call).
import { THREE } from '@core/three';

// ------------------------------------------------------------------ textures

/** Canvases drawn once per page; each world wraps them in its own texture (freed with it). */
const canvases = new Map<string, HTMLCanvasElement>();

export function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  let cv = canvases.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d')!);
    canvases.set(key, cv);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const radial = (stops: [number, string][]) => (g: CanvasRenderingContext2D) => {
  const s = g.canvas.width;
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [k, c] of stops) r.addColorStop(k, c);
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
};

export const TEX = {
  glow: () => canvasTex('glow', 64, 64, radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']])),
  soft: () => canvasTex('soft', 64, 64, radial([[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']])),
  shadow: () => canvasTex('shadow', 64, 64, radial([[0, 'rgba(0,0,0,0.55)'], [0.55, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']])),
  ring: () => canvasTex('ring', 128, 128, radial([[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'], [0.78, 'rgba(255,255,255,1)'], [0.88, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']])),
  disc: () => canvasTex('disc', 128, 128, radial([[0, 'rgba(255,255,255,0.35)'], [0.8, 'rgba(255,255,255,0.5)'], [0.9, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']])),
  flare: () => canvasTex('flare', 64, 64, (g) => {
    radial([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']])(g);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(32, 0); g.lineTo(35, 29); g.lineTo(64, 32); g.lineTo(35, 35); g.lineTo(32, 64); g.lineTo(29, 35); g.lineTo(0, 32); g.lineTo(29, 29);
    g.closePath();
    g.fill();
  }),
  /** A streak along y (bullets, dashes). */
  streak: () => canvasTex('streak', 32, 128, (g) => {
    const lin = g.createLinearGradient(0, 0, 32, 0);
    lin.addColorStop(0, 'rgba(255,255,255,0)'); lin.addColorStop(0.35, 'rgba(255,255,255,0.6)'); lin.addColorStop(0.5, 'rgba(255,255,255,1)');
    lin.addColorStop(0.65, 'rgba(255,255,255,0.6)'); lin.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lin;
    g.fillRect(0, 0, 32, 128);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.15, 'rgba(0,0,0,1)'); v.addColorStop(0.85, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, 32, 128);
  }),
  /** A crescent slash, bright at the leading edge (the sword's trail). */
  slash: () => canvasTex('slash', 128, 128, (g) => {
    const c = 64;
    for (let i = 0; i < 40; i++) {
      const k = i / 39;
      g.beginPath();
      g.arc(c, c, 62 - k * 2, -Math.PI / 2 - 1.3 + k * 0.1, -Math.PI / 2 + 1.3 - k * 0.1);
      g.arc(c, c, 38 + k * 20, -Math.PI / 2 + 1.3 - k * 0.1, -Math.PI / 2 - 1.3 + k * 0.1, true);
      g.closePath();
      g.fillStyle = `rgba(255,255,255,${0.04 + k * 0.05})`;
      g.fill();
    }
  }),
  /** Kraken ink: a dark blob with a purple sheen. */
  ink: () => canvasTex('ink', 64, 64, (g) => {
    g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fillStyle = 'rgba(20,6,30,0.9)'; g.fill();
    const r = g.createRadialGradient(24, 24, 0, 32, 32, 24);
    r.addColorStop(0, '#c89aff'); r.addColorStop(0.4, '#4a2070'); r.addColorStop(1, '#12061c');
    g.beginPath(); g.arc(32, 32, 23, 0, Math.PI * 2); g.fillStyle = r; g.fill();
  }),
  /** A splat on the sand (ink pools, scorch marks). */
  splat: () => canvasTex('splat', 128, 128, (g) => {
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, d = 28 + rnd() * 26, r = 5 + rnd() * 12;
      g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
    }
  }),
  /** A gull seen from below: a flat V of two wings (the islet's hint). */
  gull: () => canvasTex('gull', 64, 32, (g) => {
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(4, 10); g.quadraticCurveTo(18, 2, 32, 18); g.quadraticCurveTo(46, 2, 60, 10); g.stroke();
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath(); g.ellipse(32, 18, 4, 3, 0, 0, Math.PI * 2); g.fill();
  }),
  /** The next island far off on the horizon: a hazy hump with palms (fades as the real one comes out of the fog). */
  isle: () => canvasTex('isle', 256, 96, (g) => {
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath(); g.moveTo(0, 96); g.bezierCurveTo(40, 70, 70, 58, 128, 56); g.bezierCurveTo(186, 58, 216, 70, 256, 96); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(86, 70); g.bezierCurveTo(110, 30, 150, 34, 170, 66); g.closePath(); g.fill();
    for (const [x, h, lean] of [[98, 40, -6], [132, 54, 4], [160, 44, 8]] as [number, number, number][]) {
      g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,1)';
      g.beginPath(); g.moveTo(x, 64); g.quadraticCurveTo(x + lean * 0.5, 64 - h * 0.6, x + lean, 64 - h); g.stroke();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI * 0.95 + i * Math.PI * 0.22;
        g.beginPath(); g.moveTo(x + lean, 64 - h);
        g.quadraticCurveTo(x + lean + Math.cos(a) * 12, 64 - h + Math.sin(a) * 10 - 4, x + lean + Math.cos(a) * 22, 64 - h + Math.sin(a) * 6 + 8);
        g.lineWidth = 5; g.stroke();
      }
    }
  }),
  /** Sea foam that tiles: soft blotches and lacy holes (wakes). */
  foam: () => canvasTex('foam', 128, 128, (g) => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.clearRect(0, 0, 128, 128);
    // blotches drawn wrapped round the edges so the texture tiles
    const blob = (x: number, y: number, r: number, a: number) => {
      for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.6, `rgba(255,255,255,${a * 0.55})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    };
    for (let i = 0; i < 70; i++) blob(rnd() * 128, rnd() * 128, 8 + rnd() * 18, 0.25 + rnd() * 0.35);
    for (let i = 0; i < 90; i++) blob(rnd() * 128, rnd() * 128, 2 + rnd() * 5, 0.5 + rnd() * 0.4);
    // lacy holes
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 128, y = rnd() * 128, r = 3 + rnd() * 7;
      for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }),
  /** A ghostly bubble (the ghost shield). */
  bubble: () => canvasTex('bubble', 128, 128, radial([[0, 'rgba(255,255,255,0.05)'], [0.7, 'rgba(255,255,255,0.12)'], [0.88, 'rgba(255,255,255,0.75)'], [0.95, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']])),
};

// ------------------------------------------------------------------ billboards

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const zAxis = new THREE.Vector3(0, 0, 1);
const flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** Many textured quads in one draw call: camera-facing, or flat on the ground. */
export class Billboards {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private rq = new THREE.Quaternion();
  private flat: boolean;

  constructor(scene: THREE.Object3D, tex: THREE.Texture, readonly capacity: number, o: { blend?: 'add' | 'normal'; flat?: boolean; order?: number; depthTest?: boolean } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true,
      blending: o.blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.order ?? 10;
    this.mesh.count = 0;
    this.flat = !!o.flat;
    scene.add(this.mesh);
  }

  begin(cam: THREE.Quaternion): void {
    this.n = 0;
    this.rq.copy(this.flat ? flatQ : cam);
  }

  /** A quad at (x, y, z), sx × sy, turned by `rot` in its own plane, tinted (times `k`). */
  add(x: number, y: number, z: number, sx: number, sy: number, rot: number, color: number | THREE.Color, k = 1): void {
    if (this.n >= this.capacity) return;
    tmpQ.setFromAxisAngle(zAxis, rot).premultiply(this.rq);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, 1));
    this.mesh.setMatrixAt(this.n, tmpM);
    if (typeof color === 'number') tmpC.setHex(color); else tmpC.copy(color);
    if (k !== 1) tmpC.multiplyScalar(k);
    this.mesh.setColorAt(this.n, tmpC);
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ particles

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  s0: number; s1: number;
  c: THREE.Color;
  drag: number;
  grav: number;
  spin: number;
}

/** A pool of particles drawn as soft billboards (additive glows, or normal-blended dust). */
export class Particles {
  private pool: P[] = [];
  private live: P[] = [];
  readonly bb: Billboards;

  constructor(scene: THREE.Object3D, tex: THREE.Texture, private cap = 1200, blend: 'add' | 'normal' = 'add', order = 12) {
    this.bb = new Billboards(scene, tex, cap, { order, blend });
  }

  get count(): number { return this.live.length; }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, color: number, drag = 2, grav = 0): void {
    if (this.live.length >= this.cap) return;
    const p = this.pool.pop() ?? { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0, s0: 0, s1: 0, c: new THREE.Color(), drag: 0, grav: 0, spin: 0 };
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s0 = s0; p.s1 = s1;
    p.c.setHex(color); p.drag = drag; p.grav = grav; p.spin = Math.random() * 6;
    this.live.push(p);
  }

  /** A round burst. */
  burst(x: number, y: number, z: number, n: number, speed: number, colors: number[], life = 0.6, size = 0.5, up = 0.6, grav = 0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random();
      const v = speed * (0.35 + Math.random() * 0.65);
      this.emit(x, y, z, Math.cos(a) * v, (u * up + 0.1) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.6), size * 0.1, colors[i % colors.length], 2.5, grav);
    }
  }

  update(dt: number, cam: THREE.Quaternion): void {
    const live = this.live;
    this.bb.begin(cam);
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) { live[i] = live[live.length - 1]; live.pop(); this.pool.push(p); continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy = Math.abs(p.vy) * 0.3; }
      const k = p.life / p.max;
      const s = p.s1 + (p.s0 - p.s1) * k;
      this.bb.add(p.x, p.y, p.z, s, s, p.spin + (1 - k) * 2, p.c, Math.min(1, k * 2.2));
    }
    this.bb.end();
  }

  clear(): void { for (const p of this.live) this.pool.push(p); this.live.length = 0; }
}

// ------------------------------------------------------------------ telegraphs

/** Shapes the telegraph shader draws. */
export const SHAPE = { circle: 0, cone: 1, line: 2 } as const;

/**
 * The warnings on the sand. One quad per telegraph, laid flat; the shader cuts it into a disc, a
 * cone or a lane, fills it from the centre (or along the lane) as the blow comes, and rims it.
 */
export class Telegraphs {
  readonly mesh: THREE.InstancedMesh;
  private aShape: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor(scene: THREE.Object3D, private cap = 48) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    // x: shape, y: arc (cone), z: fill 0–1, w: pulse 0–1
    this.aShape = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aShape.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aShape', this.aShape);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec4 aShape;
        varying vec2 vUv;
        varying vec4 vS;
        varying vec3 vCol;
        void main() {
          vUv = uv;
          vS = aShape;
          #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
          #else
          vCol = vec3(1.0, 0.2, 0.15);
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        varying vec4 vS;
        varying vec3 vCol;
        void main() {
          float shape = vS.x;
          vec2 p = vUv * 2.0 - 1.0;
          float a = 0.0, prog = 0.0, edge = 0.0;
          if (shape < 1.5) {
            float d = length(p);
            if (d > 1.0) discard;
            if (shape > 0.5) {
              // a cone opening towards +v (the quad's far side)
              float ang = abs(atan(p.x, p.y));
              float hw = vS.y * 0.5;
              if (ang > hw && d > 0.08) discard;
              edge = max(smoothstep(0.86, 0.98, d), smoothstep(hw - 0.12, hw, ang) * step(0.08, d));
            } else edge = smoothstep(0.86, 0.98, d);
            prog = d;
          } else {
            // a lane along +v from its base
            prog = vUv.y;
            edge = max(smoothstep(0.8, 0.97, abs(p.x)), smoothstep(0.96, 1.0, vUv.y));
          }
          float fill = step(prog, vS.z);
          a = 0.22 + fill * 0.32 + edge * 0.55;
          float front = smoothstep(0.06, 0.0, abs(prog - vS.z)) * (1.0 - step(0.999, vS.z));
          vec3 col = vCol * (0.75 + fill * 0.35) + front * 0.6 + vS.w * 0.2;
          gl_FragColor = vec4(col, clamp(a + front * 0.4, 0.0, 0.95));
          #include <colorspace_fragment>
        }`,
    });
    mat.customProgramCacheKey = () => 'si-tele';
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  begin(): void { this.n = 0; }

  /**
   * A telegraph: shape, centre (a lane's base), size (radius; a lane's width w and length len),
   * facing (radians, atan2(dx, dz)), cone arc, fill 0–1, colour.
   */
  add(shape: number, x: number, z: number, r: number, w: number, len: number, ang: number, arc: number, fill: number, color: number, pulse = 0): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    let sx: number, sz: number, cx = x, cz = z;
    if (shape === SHAPE.line) {
      sx = w; sz = len;
      cx = x + Math.sin(ang) * len / 2; cz = z + Math.cos(ang) * len / 2;
    } else { sx = sz = r * 2; }
    // the quad's +v (uv.y = 1) side faces −z before turning: turn so it faces the direction `ang`
    tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang + Math.PI);
    tmpM.compose(tmpP.set(cx, 0.06 + i * 0.0015, cz), tmpQ, tmpS.set(sx, 1, sz));
    this.mesh.setMatrixAt(i, tmpM);
    this.mesh.setColorAt(i, tmpC.setHex(color));
    this.aShape.setXYZW(i, shape, arc, fill, pulse);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
      this.aShape.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ water

export interface Coast { rx: number; rz: number; harm: [number, number, number][] }

/** The sea: shallows and deep water by distance to the coast, rolling foam lines, glints, a gentle swell. */
export function waterMaterial(): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCoast: { value: new THREE.Vector2(10, 14) },
      uHarm: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uDeep: { value: new THREE.Color(0x157fb5) },
      uShallow: { value: new THREE.Color(0x3fe0cf) },
      uFoam: { value: new THREE.Color(0xffffff) },
      uSky: { value: new THREE.Color(0xa9e2fb) },
      uFog: { value: new THREE.Vector2(30, 70) },
      uCam: { value: new THREE.Vector3() },
      uIslet: { value: new THREE.Vector3(0, 0, 0) },
      uSwell: { value: 1 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uSwell;
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += (sin(w.x * 0.55 + uTime * 1.3) * 0.05 + cos(w.z * 0.47 + uTime * 1.1) * 0.05) * uSwell;
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uCoast;
      uniform vec3 uHarm[3];
      uniform vec3 uDeep, uShallow, uFoam, uSky, uCam, uIslet;
      uniform vec2 uFog;
      varying vec3 vW;
      // a sine-free hash (stable far from the origin, where the sea legs are sailed)
      float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float th = atan(vW.z, vW.x);
        float c = cos(th) / uCoast.x, s = sin(th) / uCoast.y;
        float r = 1.0 / sqrt(c * c + s * s);
        float k = 1.0;
        for (int i = 0; i < 3; i++) k += uHarm[i].y * sin(uHarm[i].x * th + uHarm[i].z);
        float d = length(vW.xz) - r * k;
        // the hidden islet has its own ring of shallows and foam
        if (uIslet.z > 0.0) d = min(d, length(vW.xz - uIslet.xy) - uIslet.z);
        float fd = length(vW - uCam);
        // how much sea one pixel covers: thin details fade out before they shimmer into speckles
        float px = length(fwidth(vW.xz));
        float n = noise(vW.xz * 0.6 + uTime * 0.15) * 0.6 + noise(vW.xz * 1.7 - uTime * 0.2) * 0.4;
        vec3 col = mix(uShallow, uDeep, smoothstep(0.3, 6.5, d + (n - 0.5) * 1.2));
        // rolling foam: lines that move in towards the beach and fade out at sea
        float wave = fract(d * 0.42 - uTime * 0.32 + n * 0.25);
        float foam = smoothstep(0.9, 1.0, wave) * smoothstep(5.0, 0.6, d) * (1.0 - smoothstep(0.08, 0.2, px));
        foam += smoothstep(0.75, 0.0, d) * (0.65 + 0.35 * sin(uTime * 2.0 + th * 9.0));
        col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.85);
        // broad swells of light and shade on the open water (no thresholded noise out there)
        float sw = noise(vW.xz * 0.11 + vec2(uTime * 0.05, uTime * 0.03)) * 0.65 + noise(vW.xz * 0.27 - vec2(uTime * 0.04, 0.0)) * 0.35;
        col *= 0.93 + sw * 0.14 * smoothstep(1.5, 5.0, d);
        // soft glints near the camera only, a little larger than a pixel
        float g = smoothstep(0.7, 0.92, noise(vW.xz * 0.9 + vec2(uTime * 0.45, -uTime * 0.3)));
        col += g * 0.1 * smoothstep(1.5, 4.0, d) * smoothstep(30.0, 12.0, fd) * (1.0 - smoothstep(0.05, 0.12, px));
        col = mix(col, uSky, smoothstep(uFog.x, uFog.y, fd));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  mat.customProgramCacheKey = () => 'si-water';
  return mat;
}

export function setCoast(mat: THREE.ShaderMaterial, c: Coast & { islet?: { x: number; z: number; r: number } | null }): void {
  mat.uniforms.uCoast.value.set(c.rx, c.rz);
  (mat.uniforms.uIslet.value as THREE.Vector3).set(c.islet?.x ?? 0, c.islet?.z ?? 0, c.islet ? c.islet.r : 0);
  c.harm.forEach(([n, a, p], i) => (mat.uniforms.uHarm.value as THREE.Vector3[])[i].set(n, a, p));
}

/** The water's height at (x, z): the plane's level plus the shader's swell (keep in step with waterMaterial). */
export function swellY(x: number, z: number, t: number, swell: number): number {
  return WATER_Y + (Math.sin(x * 0.55 + t * 1.3) * 0.05 + Math.cos(z * 0.47 + t * 1.1) * 0.05) * swell;
}
export const WATER_Y = -0.22;

// ------------------------------------------------------------------ health bars

/**
 * Small health bars over foes: one instanced quad each, turned to the camera in the vertex shader,
 * drawn over the scene (no depth test) in one draw call. The fragment shader draws a dark rounded
 * frame, the bar's colour up to the health left, a pale "just lost" ghost behind it, quarter ticks
 * and a shine, antialiased.
 */
export class HealthBars {
  readonly mesh: THREE.InstancedMesh;
  private aBar: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor(scene: THREE.Object3D, private cap = 48) {
    const geo = new THREE.PlaneGeometry(1, 1);
    // x: health 0–1, y: ghost 0–1, z: alpha, w: aspect (width / height)
    this.aBar = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aBar.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBar', this.aBar);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      vertexShader: `
        attribute vec4 aBar;
        varying vec2 vUv;
        varying vec4 vB;
        varying vec3 vCol;
        void main() {
          vUv = uv;
          vB = aBar;
          #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
          #else
          vCol = vec3(1.0, 0.3, 0.2);
          #endif
          vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          c.xy += position.xy * size;
          gl_Position = projectionMatrix * c;
        }`,
      fragmentShader: `
        varying vec2 vUv;
        varying vec4 vB;
        varying vec3 vCol;
        float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
        void main() {
          float asp = vB.w;
          vec2 p = (vUv - 0.5) * vec2(asp, 1.0);
          float d = box(p, vec2(asp * 0.5, 0.5), 0.5);
          float aa = fwidth(d) + 1e-4;
          float outer = 1.0 - smoothstep(-aa, aa, d);
          if (outer <= 0.0) discard;
          // the inner bar, inset from the frame
          float di = box(p, vec2(asp * 0.5 - 0.2, 0.3), 0.3);
          float inner = 1.0 - smoothstep(-aa, aa, di);
          float u = clamp((p.x + asp * 0.5 - 0.2) / max(0.01, asp - 0.4), 0.0, 1.0);
          float au = fwidth(u) + 1e-4;
          float fill = 1.0 - smoothstep(vB.x - au, vB.x + au, u);
          float ghost = (1.0 - smoothstep(vB.y - au, vB.y + au, u)) * (1.0 - fill);
          vec3 bg = vec3(0.07, 0.05, 0.06);
          vec3 bar = vCol * (1.05 + 0.35 * smoothstep(0.0, 0.25, p.y));
          vec3 col = mix(bg, bar, fill);
          col = mix(col, vec3(1.0, 0.93, 0.8), ghost * 0.85);
          // quarter ticks
          float tick = 0.0;
          for (int i = 1; i < 4; i++) tick = max(tick, 1.0 - smoothstep(0.0, au * 1.5, abs(u - float(i) * 0.25)));
          col *= 1.0 - tick * 0.45 * inner;
          col = mix(vec3(0.02, 0.01, 0.02), col, inner);
          gl_FragColor = vec4(col, outer * vB.z);
          #include <colorspace_fragment>
        }`,
    });
    mat.customProgramCacheKey = () => 'si-hpbar';
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 40;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  begin(): void { this.n = 0; }

  /** A bar centred at (x, y, z), w × h world units, health and ghost 0–1, faded by `alpha`. */
  add(x: number, y: number, z: number, w: number, h: number, hp: number, ghost: number, alpha: number, color: number): void {
    if (this.n >= this.cap || alpha <= 0.01) return;
    const i = this.n++;
    tmpM.compose(tmpP.set(x, y, z), tmpQ.identity(), tmpS.set(w, h, 1));
    this.mesh.setMatrixAt(i, tmpM);
    this.mesh.setColorAt(i, tmpC.setHex(color));
    this.aBar.setXYZW(i, hp, Math.max(hp, ghost), alpha, w / h);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
      this.aBar.needsUpdate = true;
    }
  }
}

/** Each foe's bar between frames: shown once hurt, the ghost of lost health catching up, a fade out at death. */
export interface BarState { ghost: number; hold: number; a: number; last: number; seen: boolean }

/**
 * Steps a bar's state; returns its alpha (0 hides it). `hp` is 0–1; a dead foe's bar drains and fades.
 */
export function stepBar(b: BarState, hp: number, dead: boolean, dt: number): number {
  if (hp < b.last) b.hold = 0.35;
  b.last = hp;
  b.hold -= dt;
  if (b.hold <= 0) b.ghost = Math.max(hp, b.ghost - dt * 0.9);
  b.ghost = Math.max(b.ghost, hp);
  const want = dead ? 0 : hp < 0.999 ? 1 : 0;
  b.a += (want - b.a) * Math.min(1, dt * (want > b.a ? 14 : dead ? 3.5 : 6));
  return b.a;
}

// ------------------------------------------------------------------ wakes

interface WakePt { x: number; z: number; sx: number; sz: number; age: number; k: number; w: number; v: number }
interface WakeStrip { pts: WakePt[]; t: number; touched: boolean; spread: number; life: number; v: number; core: number }

const WAKE_PTS = 32;

/**
 * Foam on the water: ribbons laid behind whatever moves through it (a ship's bow wave and its
 * churned-up track, a shark's fin, a swimmer), all in one mesh and one draw call. The foam stays
 * where it was laid while the ribbon widens and fades; every vertex rides the swell (swellY), so
 * the waves never cut it into dots. Five vertices across: clear water at the edges, foam arms
 * inside them and a fainter churn in the middle.
 */
export class Wakes {
  readonly mesh: THREE.Mesh;
  private strips = new Map<string | number, WakeStrip>();
  private pos: Float32Array;
  private col: Float32Array;
  private uv: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor(scene: THREE.Object3D, tex: THREE.Texture, private cap = 10) {
    const nv = cap * WAKE_PTS * 5;
    this.pos = new Float32Array(nv * 3);
    this.col = new Float32Array(nv * 4);
    this.uv = new Float32Array(nv * 2);
    const idx: number[] = [];
    for (let s = 0; s < cap; s++) {
      for (let i = 0; i < WAKE_PTS - 1; i++) {
        const a = (s * WAKE_PTS + i) * 5, b = a + 5;
        for (let j = 0; j < 4; j++) idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
      }
    }
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /**
   * Lays foam behind a mover this frame: `key` names its ribbon, (x, z) is where the foam starts,
   * (fx, fz) the way it is heading, `w` the half width at the start, `spread` how fast it widens,
   * `k` its strength 0–1, `life` seconds the foam lasts, `core` the churn in the middle 0–1.
   */
  lay(key: string | number, x: number, z: number, fx: number, fz: number, w: number, spread: number, k: number, life = 3, core = 0.6): void {
    let s = this.strips.get(key);
    if (!s) {
      if (this.strips.size >= this.cap) return;
      s = { pts: [], t: 0, touched: true, spread, life, v: 0, core };
      this.strips.set(key, s);
    }
    s.touched = true; s.spread = spread; s.life = life; s.core = core;
    // a mover that jumped (a new leg, a test) starts a fresh ribbon
    if (s.pts.length && Math.hypot(s.pts[0].x - x, s.pts[0].z - z) > 12) s.pts.length = 0;
    const last = s.pts[0];
    const fl = Math.hypot(fx, fz) || 1;
    const sx = -fz / fl, sz = fx / fl;
    const step = life / (WAKE_PTS - 1);
    if (!last || s.t >= step) {
      if (last) s.v += Math.hypot(last.x - x, last.z - z) * 0.12;
      s.t = 0;
      s.pts.unshift({ x, z, sx, sz, age: 0, k, w, v: s.v });
      if (s.pts.length > WAKE_PTS) s.pts.pop();
    } else {
      // the newest point follows the mover until the next one is laid
      Object.assign(s.pts[0], { x, z, sx, sz, k, w });
    }
  }

  /** Ages the foam and rebuilds the mesh (call once a frame, after every lay()). */
  update(dt: number, time: number, swell: number): void {
    let any = false, si = 0;
    const P = this.pos, C = this.col, U = this.uv;
    for (const [key, s] of this.strips) {
      s.t += dt;
      for (const p of s.pts) p.age += dt;
      while (s.pts.length && s.pts[s.pts.length - 1].age > s.life) s.pts.pop();
      if (!s.touched && !s.pts.length) { this.strips.delete(key); continue; }
      s.touched = false;
      const n = s.pts.length;
      for (let i = 0; i < WAKE_PTS; i++) {
        const p = s.pts[Math.min(i, n - 1)];
        const o = (si * WAKE_PTS + i) * 5;
        if (!p) { for (let j = 0; j < 5; j++) C[(o + j) * 4 + 3] = 0; continue; }
        const w = p.w + p.age * s.spread;
        const y = swellY(p.x, p.z, time, swell) + 0.07;
        const fade = i >= n ? 0 : Math.max(0, 1 - p.age / s.life) * p.k * Math.min(1, i / 1.5);
        const across = [-1, -0.62, 0, 0.62, 1];
        const alpha = [0, 0.95, s.core * Math.max(0, 1 - p.age / (s.life * 0.55)), 0.95, 0];
        for (let j = 0; j < 5; j++) {
          const q = o + j;
          const a = across[j] * w;
          P[q * 3] = p.x + p.sx * a; P[q * 3 + 1] = y; P[q * 3 + 2] = p.z + p.sz * a;
          C[q * 4] = 1; C[q * 4 + 1] = 1; C[q * 4 + 2] = 1; C[q * 4 + 3] = alpha[j] * fade;
          U[q * 2] = (across[j] * 0.5 + 0.5) * Math.max(0.6, w * 0.45); U[q * 2 + 1] = p.v;
        }
      }
      any = true;
      si++;
    }
    // unused ribbons stay transparent
    for (let s = si; s < this.cap; s++) for (let i = 0; i < WAKE_PTS * 5; i++) C[((s * WAKE_PTS) * 5 + i) * 4 + 3] = 0;
    this.mesh.visible = any;
    if (any) {
      (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true;
      this.geo.setDrawRange(0, si * (WAKE_PTS - 1) * 24);
    }
  }

  clear(): void { this.strips.clear(); this.mesh.visible = false; }
}
