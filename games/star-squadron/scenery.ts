// Star Squadron: what the squadron flies over, one backdrop per sector, scrolling under the play
// plane (perspective gives the parallax: deeper layers move slower on screen).
//   ember   — a red moon's surface far below: craters, domes, rockets, dishes
//   belt    — a crystal asteroid belt: tumbling rocks at many depths, an ice planet
//   station — an orbital shipyard: deck plates, frames, gates, pipes
//   rift    — a nebula: glowing clouds, floating crystal rocks, a violet giant
// Every backdrop is built once per world (static parts merged), then shown or hidden.
import Phaser from 'phaser';
import { THREE } from '@core/three';
import { mergeModels, InstancedModel, Materials, SCENERY_PAL, PLANETS, type SpaceModel } from './kit';

export const SKY = [0x150c1c, 0x080d1f, 0x0a1220, 0x12081f];
export const GROUND_Y = -34;
const CHUNK = 30;
const CHUNKS = 4;

interface Layer { obj: THREE.Object3D; z0: number; k: number }

class Backdrop {
  readonly root = new THREE.Group();
  layers: Layer[] = [];
  rocks: { model: InstancedModel; list: { x: number; y: number; z: number; s: number; rx: number; ry: number; wx: number; wy: number }[] }[] = [];
  ground: THREE.Mesh | null = null;
  planet: THREE.Mesh | null = null;
  clouds: THREE.Mesh | null = null;
}

export class Scenery {
  private sets: Backdrop[] = [];
  private stars: THREE.Points;
  private dust: THREE.Points;
  private current = 0;
  scroll = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(private phaser: Phaser.Scene, private scene: THREE.Scene, private camQ: THREE.Quaternion, mats: Materials) {
    this.stars = this.starfield();
    this.dust = this.spaceDust();
    for (let i = 0; i < 4; i++) {
      const b = this.build(i, mats);
      b.root.visible = i === 0;
      scene.add(b.root);
      this.sets.push(b);
    }
  }

  get sector(): number { return this.current; }

  /** Shows the backdrop of a sector (index in the loop). */
  show(i: number): void {
    this.current = i % 4;
    this.sets.forEach((b, k) => (b.root.visible = k === this.current));
    (this.scene.background as THREE.Color).setHex(SKY[this.current]);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.setHex(SKY[this.current]);
  }

  /** Every backdrop visible at once (shader warm-up behind the menu). */
  showAll(on: boolean): void {
    this.sets.forEach((b, k) => (b.root.visible = on || k === this.current));
  }

  update(dt: number, speed: number, time: number): void {
    this.scroll += speed * dt;
    const b = this.sets[this.current];
    for (const l of b.layers) {
      let z = l.z0 + this.scroll * l.k;
      const span = CHUNK * CHUNKS;
      z = ((z + 95) % span + span) % span - 95;
      l.obj.position.z = z;
    }
    if (b.ground) {
      const t = (b.ground.material as THREE.MeshStandardMaterial).map!;
      t.offset.y = (this.scroll / 45) % 1;
    }
    if (b.clouds) {
      const t = (b.clouds.material as THREE.MeshBasicMaterial).map!;
      t.offset.y = (this.scroll / 260) % 1;
      t.offset.x = Math.sin(time * 0.05) * 0.05;
    }
    if (b.planet) b.planet.position.z = -70 + ((this.scroll * 0.04) % 60);
    for (const r of b.rocks) {
      r.model.begin();
      for (const k of r.list) {
        let z = k.z + this.scroll * 1;
        z = ((z + 70) % 100 + 100) % 100 - 70;
        k.rx += k.wx * dt; k.ry += k.wy * dt;
        this.q.setFromEuler(this.e.set(k.rx, k.ry, 0));
        this.m.compose(new THREE.Vector3(k.x, k.y, z), this.q, new THREE.Vector3(k.s, k.s, k.s));
        r.model.add(this.m);
      }
      r.model.end();
    }
    // stars drift slowly, dust streams past
    this.stars.position.z = (this.scroll * 0.05) % 40;
    const dz = (this.scroll * 1.6) % 60;
    this.dust.position.z = dz;
    (this.dust.material as THREE.PointsMaterial).size = 2 + Math.min(10, Math.max(0, speed - 6) * 0.25);
  }

  private starfield(): THREE.Points {
    const n = 1100;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 260;
      pos[i * 3 + 1] = -70 - Math.random() * 30;
      pos[i * 3 + 2] = -190 + Math.random() * 230;
      c.setHSL(0.55 + Math.random() * 0.2, 0.5, 0.65 + Math.random() * 0.35);
      c.toArray(col, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false }));
    p.frustumCulled = false;
    p.renderOrder = -5;
    this.scene.add(p);
    return p;
  }

  private spaceDust(): THREE.Points {
    const n = 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = -1.5 - Math.random() * 8;
      pos[i * 3 + 2] = -90 + Math.random() * 120;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: 0x9fb8ff, fog: false, transparent: true, opacity: 0.45, depthWrite: false }));
    p.frustumCulled = false;
    this.scene.add(p);
    return p;
  }

  private planetMesh(i: number, size: number, x: number, y: number): THREE.Mesh {
    // the planets are 1280 px images; a 512 px copy is plenty on screen and quick to upload
    const img = this.phaser.textures.get('ss-' + PLANETS[i]).getSourceImage() as HTMLImageElement;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    cv.getContext('2d')!.drawImage(img, 0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
    m.quaternion.copy(this.camQ);
    m.position.set(x, y, -70);
    m.renderOrder = -4;
    return m;
  }

  private build(i: number, mats: Materials): Backdrop {
    const b = new Backdrop();
    const pal = SCENERY_PAL[i];
    const rnd = Phaser.Math.RND;
    if (i === 0 || i === 2) {
      // a scrolling ground far below
      const tex = i === 0 ? moonTexture() : deckTexture();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(6, 8);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
      b.ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 360), mat);
      b.ground.rotation.x = -Math.PI / 2;
      b.ground.position.set(0, GROUND_Y - 0.2, -90);
      b.root.add(b.ground);
      for (let c = 0; c < CHUNKS; c++) {
        const items = i === 0 ? moonChunk(rnd) : stationChunk(rnd);
        const g = mergeModels(items, pal, mats);
        g.position.y = GROUND_Y;
        b.root.add(g);
        b.layers.push({ obj: g, z0: -95 + c * CHUNK, k: 1 });
      }
      if (i === 2) { b.planet = this.planetMesh(2, 70, 40, -60); b.root.add(b.planet); }
    }
    if (i === 1) {
      b.planet = this.planetMesh(1, 66, -34, -60);
      b.root.add(b.planet);
      const kinds: [SpaceModel, number][] = [['meteor', 26], ['meteor_detailed', 18], ['rock_largeA', 12]];
      for (const [key, n] of kinds) {
        const model = new InstancedModel(b.root, key, 1, pal, mats, n);
        const list = [];
        for (let k = 0; k < n; k++) {
          const deep = Math.random();
          list.push({
            x: (Math.random() - 0.5) * (50 + deep * 70), y: -22 - deep * 36, z: -70 + Math.random() * 100, s: 1.2 + Math.random() * 2.5 + deep * 3,
            rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 0.6, wy: (Math.random() - 0.5) * 0.6,
          });
        }
        b.rocks.push({ model, list });
      }
    }
    if (i === 3) {
      const tex = nebulaTexture();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 1.5);
      b.clouds = new THREE.Mesh(new THREE.PlaneGeometry(220, 300), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      b.clouds.rotation.x = -Math.PI / 2;
      b.clouds.position.set(0, -45, -70);
      b.clouds.renderOrder = -3;
      b.root.add(b.clouds);
      b.planet = this.planetMesh(3, 80, 35, -50);
      b.root.add(b.planet);
      const kinds: [SpaceModel, number][] = [['rock_crystalsLargeA', 16], ['rock_crystals', 14]];
      for (const [key, n] of kinds) {
        const model = new InstancedModel(b.root, key, 1, pal, mats, n);
        const list = [];
        for (let k = 0; k < n; k++) {
          const deep = Math.random();
          const x = (Math.random() - 0.5) * (50 + deep * 70);
          list.push({ x, y: -22 - deep * 32, z: -70 + Math.random() * 100, s: 1.2 + Math.random() * 2.5 + deep * 3, rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 0.5, wy: (Math.random() - 0.5) * 0.5 });
        }
        b.rocks.push({ model, list });
      }
    }
    if (i === 0) { b.planet = this.planetMesh(0, 60, -45, -40); b.root.add(b.planet); }
    return b;
  }
}

type Item = { key: SpaceModel; matrix: THREE.Matrix4; scale?: number };
const place = (key: SpaceModel, x: number, z: number, s: number, yaw = 0, y = 0): Item =>
  ({ key, scale: s, matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)) });

/** A strip of the moon: craters and a base or two. */
function moonChunk(rnd: Phaser.Math.RandomDataGenerator): Item[] {
  const out: Item[] = [];
  const side = () => (rnd.frac() < 0.5 ? -1 : 1) * rnd.realInRange(3, 30);
  for (let i = 0; i < 9; i++) out.push(place(rnd.frac() < 0.5 ? 'craterLarge' : 'crater', rnd.realInRange(-40, 40), rnd.realInRange(0, CHUNK), rnd.realInRange(2, 4.5), rnd.frac() * 6));
  for (let i = 0; i < 4; i++) out.push(place('rock_largeA', side(), rnd.realInRange(0, CHUNK), rnd.realInRange(1.2, 2.4), rnd.frac() * 6));
  // a base: domes, a hangar, a dish and a rocket on its pad
  const bx = side(), bz = rnd.realInRange(4, CHUNK - 4);
  out.push(place('hangar_roundA', bx, bz, 1.3, rnd.frac() * 6));
  out.push(place('hangar_largeA', bx + 4, bz + 1.5, 1.1, Math.PI / 2));
  out.push(place('satelliteDish_large', bx - 3.5, bz + 2, 1.8, rnd.frac() * 6));
  out.push(place('machine_wireless', bx + 2, bz - 3, 1.5, rnd.frac() * 6));
  const rx = side(), rz = rnd.realInRange(2, CHUNK - 2), s = 1.1;
  out.push(place('rocket_baseA', rx, rz, s));
  out.push(place('rocket_fuelA', rx, rz, s, 0, 1.6 * s * 0.55));
  out.push(place('rocket_sidesA', rx, rz, s, 0, 1.6 * s * 0.55 + 0.5 * s));
  out.push(place('rocket_finsA', rx, rz, s, 0, 0.2 * s));
  out.push(place('rocket_topA', rx, rz, s, 0, 1.6 * s * 0.55 + 1.5 * s));
  out.push(place('structure_detailed', rx + 1.6, rz, 1.2, 0));
  return out;
}

/** A strip of the shipyard: deck plates down the middle, frames, gates, pipes, dishes. */
function stationChunk(rnd: Phaser.Math.RandomDataGenerator): Item[] {
  const out: Item[] = [];
  const s = 1.9;
  for (let z = 0; z < CHUNK; z += 2 * s) for (const x of [-s, s]) out.push(place('platform_large', x, z + s, s));
  for (let z = 0; z < CHUNK; z += s * 1.2) {
    out.push(place('corridor', -2.6 * s, z, s * 1.2, 0));
    out.push(place('corridor', 2.6 * s, z, s * 1.2, 0));
  }
  out.push(place('gate_complex', 0, rnd.realInRange(4, CHUNK - 4), 5.5));
  for (let i = 0; i < 3; i++) out.push(place('structure_detailed', (rnd.frac() < 0.5 ? -1 : 1) * rnd.realInRange(10, 20), rnd.realInRange(0, CHUNK), 2.2));
  for (let i = 0; i < 4; i++) out.push(place('pipe_straight', (rnd.frac() < 0.5 ? -1 : 1) * rnd.realInRange(10, 24), rnd.realInRange(0, CHUNK), 2, Math.PI / 2));
  out.push(place('pipe_ring', (rnd.frac() < 0.5 ? -1 : 1) * rnd.realInRange(12, 22), rnd.realInRange(0, CHUNK), 2));
  out.push(place('satelliteDish_detailed', (rnd.frac() < 0.5 ? -1 : 1) * rnd.realInRange(12, 24), rnd.realInRange(0, CHUNK), 2.6, rnd.frac() * 6));
  out.push(place('hangar_largeA', (rnd.frac() < 0.5 ? -1 : 1) * rnd.realInRange(14, 26), rnd.realInRange(0, CHUNK), 2, Math.PI / 2));
  out.push(place('turret_double', (rnd.frac() < 0.5 ? -1 : 1) * 2.6 * s, rnd.realInRange(0, CHUNK), 1.6, Math.PI));
  return out;
}

// ------------------------------------------------------------------ ground textures

function tex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Red moon dust with darker plains and pocks (tiles seamlessly: everything wraps). */
function moonTexture(): THREE.CanvasTexture {
  return tex(256, (g, s) => {
    g.fillStyle = '#9a4f37';
    g.fillRect(0, 0, s, s);
    const blob = (x: number, y: number, r: number, c: string) => {
      for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
        g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fillStyle = c; g.fill();
      }
    };
    for (let i = 0; i < 26; i++) blob(Math.random() * s, Math.random() * s, 10 + Math.random() * 40, `rgba(${110 + Math.random() * 30},${50 + Math.random() * 20},${40},0.35)`);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 2 + Math.random() * 7;
      blob(x, y, r, 'rgba(60,25,20,0.45)');
      blob(x - r * 0.25, y - r * 0.25, r * 0.7, 'rgba(190,110,80,0.35)');
    }
  });
}

/** Dark hull plating with seams and a few lights. */
function deckTexture(): THREE.CanvasTexture {
  return tex(256, (g, s) => {
    g.fillStyle = '#161b26';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) for (let x = 0; x < s; x += 64) {
      const sh = 26 + Math.floor(Math.random() * 12);
      g.fillStyle = `rgb(${sh},${sh + 6},${sh + 18})`;
      g.fillRect(x + 2, y + 2, 60, 28);
    }
    g.fillStyle = 'rgba(255,200,80,0.8)';
    for (let i = 0; i < 10; i++) g.fillRect(Math.floor(Math.random() * 4) * 64 + 28, Math.floor(Math.random() * 8) * 32 + 14, 8, 4);
    g.fillStyle = 'rgba(90,220,255,0.7)';
    for (let i = 0; i < 6; i++) g.fillRect(Math.floor(Math.random() * 4) * 64 + 6, Math.floor(Math.random() * 8) * 32 + 6, 3, 3);
  });
}

/** Coloured nebula clouds (drawn additively over the dark sky). */
function nebulaTexture(): THREE.CanvasTexture {
  return tex(256, (g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    const cols = ['255,80,200', '120,80,255', '60,160,255', '255,120,120'];
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 20 + Math.random() * 70;
      const c = cols[i % cols.length];
      for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        gr.addColorStop(0, `rgba(${c},0.22)`);
        gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr;
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  });
}
