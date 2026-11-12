// Crystal Keep: icons for the UI rendered from the real 3D models (towers per tier, enemies, maps)
// with the shared three.js renderer, once per game, into Phaser canvas textures.
import Phaser from 'phaser';
import { THREE, model, miniKey } from '@core/three';
import { buildTower, Board } from './board';
import { kitMat, kitModel, ZOMBIE, SOLDIER } from './kit';
import { LOOKS } from './enemies';
import { MAPS, parseMap, TOWER_KINDS, type EnemyKind } from './sim';

export const towerThumb = (kind: string, tier: number) => `ck-tw-${kind}-${tier}`;
export const enemyThumb = (kind: string) => `ck-en-${kind}`;
export const mapThumb = (i: number) => `ck-map-${i}`;
export const meteorThumb = () => 'ck-meteor';

const ENEMY_KINDS: EnemyKind[] = ['zombie', 'runner', 'brute', 'ufo', 'gunship', 'giant', 'mothership'];

/**
 * The icons as a queue of render jobs (each one draws one icon), so a scene can spread them over
 * frames instead of stalling its start: `step()` runs the next job, `flush()` all that are left.
 */
export class Thumbs {
  private jobs: (() => void)[] = [];
  constructor(scene: Phaser.Scene, renderer: THREE.WebGLRenderer) {
    this.jobs = thumbJobs(scene, renderer);
  }
  get done(): boolean { return this.jobs.length === 0; }
  step(n = 1): void { for (let i = 0; i < n && this.jobs.length; i++) this.jobs.shift()!(); }
  flush(): void { while (this.jobs.length) this.jobs.shift()!(); }
}

function thumbJobs(scene: Phaser.Scene, renderer: THREE.WebGLRenderer): (() => void)[] {
  const jobs: (() => void)[] = [];
  const ts = new THREE.Scene();
  ts.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-2, 4, 3);
  ts.add(sun);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 200);
  const canvas = renderer.domElement;
  /** Runs one render with the renderer set up for icons, then puts it back. */
  const guarded = (key: string, fn: () => void) => () => {
    if (scene.textures.exists(key)) return;
    const prevVp = renderer.getViewport(new THREE.Vector4());
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevShadow = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setScissorTest(true);
    fn();
    renderer.setScissorTest(false);
    renderer.setViewport(prevVp);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.enabled = prevShadow;
  };

  const shoot = (key: string, obj: THREE.Object3D, size: number, dir: THREE.Vector3, fill = 1) => {
    ts.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dist = (r / Math.sin(THREE.MathUtils.degToRad(14))) / fill;
    cam.position.copy(c).addScaledVector(dir.clone().normalize(), dist);
    cam.lookAt(c);
    cam.near = dist / 20; cam.far = dist * 4;
    cam.updateProjectionMatrix();
    renderer.setViewport(0, 0, size, size);
    renderer.setScissor(0, 0, size, size);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(ts, cam);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    cv.getContext('2d')!.drawImage(canvas, 0, canvas.height - size, size, size, 0, 0, size, size);
    scene.textures.addCanvas(key, cv);
    ts.remove(obj);
  };

  const mat = kitMat(scene);
  const view = new THREE.Vector3(1.1, 1.05, 1.6);
  for (const kind of TOWER_KINDS) for (let tier = 0; tier < 3; tier++) {
    jobs.push(guarded(towerThumb(kind, tier), () => {
      const v = buildTower(kind, tier, mat);
      v.weapon.rotation.y = 0.5;
      shoot(towerThumb(kind, tier), v.root, 160, view, 1.12);
    }));
  }
  for (const kind of ENEMY_KINDS) jobs.push(guarded(enemyThumb(kind), () => {
    const tmpMats: THREE.Material[] = [];
    const L = LOOKS[kind];
    let obj: THREE.Object3D;
    if (L.rig) {
      obj = model(miniKey(L.rig === 'zombie' ? ZOMBIE : SOLDIER), { shadows: false });
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = m.material as THREE.MeshStandardMaterial;
        const tinted = new THREE.MeshLambertMaterial({ map: src.map, color: new THREE.Color(L.tint[0], L.tint[1], L.tint[2]) });
        tmpMats.push(tinted);
        m.material = tinted;
      });
      obj.rotation.y = 0.5;
    } else {
      obj = kitModel(L.ufo === 'ufo' ? 'enemy-ufo-a' : L.ufo === 'gunship' ? 'enemy-ufo-b-weapon' : 'enemy-ufo-d-weapon', mat, false);
    }
    shoot(enemyThumb(kind), obj, 112, new THREE.Vector3(0.6, 0.55, 1.6), 1.1);
    for (const m of tmpMats) m.dispose();
  }));
  // the meteor: a glowing boulder with a tail of fire
  jobs.push(guarded(meteorThumb(), () => {
    const g = new THREE.Group();
    const hot = new THREE.MeshLambertMaterial({ map: mat.map, emissive: 0xff5a1a, emissiveIntensity: 0.55 });
    const rock = kitModel('weapon-ammo-boulder', hot, false);
    rock.scale.setScalar(6);
    g.add(rock);
    const flameGeo = new THREE.IcosahedronGeometry(1, 0);
    const flames: THREE.Material[] = [];
    [[0.35, 0.42, 0.34, 0xffb347], [0.62, 0.72, 0.26, 0xff7a2a], [0.86, 0.98, 0.18, 0xffe08a], [0.2, 0.62, 0.2, 0xff7a2a]].forEach(([x, y, r, c]) => {
      const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 });
      flames.push(m);
      const f = new THREE.Mesh(flameGeo, m);
      f.position.set(x, y, -0.1);
      f.scale.setScalar(r);
      g.add(f);
    });
    shoot(meteorThumb(), g, 112, new THREE.Vector3(0.2, 0.25, 1.6), 1.05);
    hot.dispose();
    flameGeo.dispose();
    for (const m of flames) m.dispose();
  }));
  // the maps first: the select cards show them at once
  const mapJobs: (() => void)[] = [];
  MAPS.forEach((def, i) => mapJobs.push(guarded(mapThumb(i), () => {
    const holder = new THREE.Group();
    const board = new Board(scene, holder, parseMap(def));
    board.update(0, 0, 1);
    // frame the field only, not the scenery ring and ground slab
    const g = new THREE.Group();
    const p = board.map;
    const box = new THREE.Mesh(new THREE.BoxGeometry(p.W, 0.4, p.H));
    box.visible = false;
    g.add(holder, box);
    ts.add(g);
    cam.fov = 28;
    const dist = Math.max(p.W, p.H) * 2.3;
    cam.position.set(0, dist * 0.82, dist * 0.57);
    cam.lookAt(0, 0, 0.3);
    cam.near = 1; cam.far = dist * 3;
    cam.updateProjectionMatrix();
    const size = 220;
    renderer.setViewport(0, 0, size, size);
    renderer.setScissor(0, 0, size, size);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(ts, cam);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    cv.getContext('2d')!.drawImage(canvas, 0, canvas.height - size, size, size, 0, 0, size, size);
    scene.textures.addCanvas(mapThumb(i), cv);
    ts.remove(g);
    board.dispose();
    box.geometry.dispose();
  })));
  return [...mapJobs, ...jobs];
}
