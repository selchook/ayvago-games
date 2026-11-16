// Hex Realm: the effects layer, all instanced so a busy fight stays at a few draw calls (adapted
// from Skull Isle's):
//   - Billboards: camera-facing or flat quads with a canvas-drawn texture, one InstancedMesh each
//     (blob shadows, glows, rings, flares, streaks, slash arcs, scorch marks).
//   - Particles: sparks, embers, dust, smoke and coin glints on one billboard set per blend mode.
//   - Telegraphs: the red warnings on the ground (circles, cones, lanes and rings that fill up as
//     the blow comes; gold for the hero's own areas), one instanced quad with a small shader.
//   - Health bars: one instanced quad per hurt foe, billboarded in the shader (one draw call).
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
  /** A splat on the ground (scorch marks, frost, blood of the arena). */
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
  /** A bubble (the shield power-up). */
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
  /** Per-quad opacity (only with `fade`): normal-blended quads must fade by alpha, not by colour. */
  private alpha: THREE.InstancedBufferAttribute | null = null;

  constructor(scene: THREE.Object3D, tex: THREE.Texture, readonly capacity: number, o: { blend?: 'add' | 'normal'; flat?: boolean; order?: number; depthTest?: boolean; fade?: boolean } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true,
      blending: o.blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    if (o.fade) {
      this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1);
      this.alpha.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFade', this.alpha);
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float aFade;\nvarying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
        sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vFade;');
      };
      mat.customProgramCacheKey = () => 'hr-bb-fade';
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
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

  /**
   * A quad at (x, y, z), sx × sy, turned by `rot` in its own plane, tinted (times `k`). With `fade`
   * the quad keeps its colour and `k` is its opacity instead: darkening a normal-blended quad to
   * fade it draws a black smudge.
   */
  add(x: number, y: number, z: number, sx: number, sy: number, rot: number, color: number | THREE.Color, k = 1): void {
    if (this.n >= this.capacity) return;
    tmpQ.setFromAxisAngle(zAxis, rot).premultiply(this.rq);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, 1));
    this.mesh.setMatrixAt(this.n, tmpM);
    if (typeof color === 'number') tmpC.setHex(color); else tmpC.copy(color);
    if (this.alpha) this.alpha.setX(this.n, k);
    else if (k !== 1) tmpC.multiplyScalar(k);
    this.mesh.setColorAt(this.n, tmpC);
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
      if (this.alpha) this.alpha.needsUpdate = true;
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
    // normal-blended pools (dust, smoke) fade out by opacity; additive ones by colour
    this.bb = new Billboards(scene, tex, cap, { order, blend, fade: blend === 'normal' });
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
export const SHAPE = { circle: 0, cone: 1, line: 2, ring: 3 } as const;

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
          if (shape > 2.5) {
            // a ring: the inner part (radius vS.y of the outer) is safe
            float d = length(p);
            if (d > 1.0 || d < vS.y) discard;
            edge = max(smoothstep(0.86, 0.98, d), smoothstep(vS.y + 0.1, vS.y, d));
            prog = (d - vS.y) / max(0.01, 1.0 - vS.y);
          } else if (shape < 1.5) {
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
          a = 0.3 + fill * 0.4 + edge * 0.55;
          float front = smoothstep(0.06, 0.0, abs(prog - vS.z)) * (1.0 - step(0.999, vS.z));
          vec3 col = vCol * (0.7 + fill * 0.3) + front * 0.5 + vS.w * 0.15;
          gl_FragColor = vec4(col, clamp(a + front * 0.4, 0.0, 0.95));
          #include <colorspace_fragment>
        }`,
    });
    mat.customProgramCacheKey = () => 'hr-tele';
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
    mat.customProgramCacheKey = () => 'hr-hpbar';
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

