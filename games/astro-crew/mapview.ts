// Astro Crew: the star map and the base, the two 3D inner screens, in the Play scene's World3D
// (view.ts shows one group at a time).
//   - The star map: the twelve planets of the campaign (the kit's Planet models) on a winding
//     dotted route against the stars; cleared ones bright, the next one pulsing, locked ones dark.
//     The crew's spaceship hovers by the current planet and flies to the chosen one.
//   - The base: a little plateau where the bought modules stand (dome, armory, lab, landing pad,
//     solar panels, radar, antenna: every rank adds a piece), the crew member waving in front.
import { THREE } from '@core/three';
import { MISSIONS, type HeroId } from './defs';
import { soloGeometry, litMaterial, mergeModels, modelBox, type Placed } from './kit';
import { Figure } from './figure';
import { discMesh, THEME } from './arena';
import type { Ranks } from './powers';
import type { View } from './view';

/** The planets' places on the map: two rows, a winding route from the left. */
export const MAP_POS: [number, number, number][] = [
  [-10.4, 0.4, -4.6], [-6.4, -0.2, -5.6], [-2.4, 0.4, -4.4], [1.6, -0.1, -5.4], [5.6, 0.4, -4.4], [9.6, 0.0, -5.2],
  [10.4, -0.3, 1.4], [6.4, 0.2, 2.2], [2.4, -0.3, 1.2], [-1.6, 0.2, 2.2], [-5.6, -0.3, 1.2], [-9.8, 0.3, 2.0],
];
const MAP_CAM = { pos: new THREE.Vector3(0, 21, 15), look: new THREE.Vector3(0, -1, -0.4) };
/** Every planet drawn the same size across (bosses a little bigger). */
const planetScale = (key: string, d: number): number => { const b = modelBox(key); return d / Math.max(b.max.x - b.min.x, b.max.z - b.min.z); };

export class MapView {
  readonly group: THREE.Group;
  private planets: { mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; base: number }[] = [];
  private ship: THREE.Mesh;
  private sel: THREE.Mesh;
  private next: THREE.Mesh;
  private route: THREE.Line;
  private t = 0;
  private at = 0;
  private trip: { from: THREE.Vector3; to: THREE.Vector3; t: number; done: () => void } | null = null;
  private v = new THREE.Vector3();

  constructor(private view: View) {
    this.group = view.mapGroup;
    MISSIONS.forEach((m, i) => {
      const mat = litMaterial();
      const big = m.kind === 'boss' ? 1.25 : 1;
      const mesh = new THREE.Mesh(soloGeometry(m.planet, 1, 'centre'), mat);
      mesh.scale.setScalar(planetScale(m.planet, 2.7 * big));
      const [x, y, z] = MAP_POS[i];
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      this.planets.push({ mesh, mat, base: i * 0.7 });
    });
    // the route: a dotted line through the planets
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < MAP_POS.length - 1; i++) {
      const a = new THREE.Vector3(...MAP_POS[i]), b = new THREE.Vector3(...MAP_POS[i + 1]);
      for (let k = 0; k < 12; k++) pts.push(a.clone().lerp(b, k / 12).add(new THREE.Vector3(0, Math.sin((k / 12) * Math.PI) * 0.5 - 0.9, 0)));
    }
    pts.push(new THREE.Vector3(...MAP_POS[MAP_POS.length - 1]).add(new THREE.Vector3(0, -0.9, 0)));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    this.route = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x8ae8ff, dashSize: 0.25, gapSize: 0.22, transparent: true, opacity: 0.55 }));
    this.route.computeLineDistances();
    this.group.add(this.route);
    this.ship = new THREE.Mesh(soloGeometry('ship-' + view.heroId, 0.16, 'centre'), litMaterial());
    this.group.add(this.ship);
    this.sel = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: 0x8ae8ff, transparent: true, opacity: 0.9 }));
    this.sel.rotation.x = Math.PI / 2;
    this.group.add(this.sel);
    this.next = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.7 }));
    this.next.rotation.x = Math.PI / 2;
    this.group.add(this.next);
  }

  setHero(id: HeroId): void { this.ship.geometry = soloGeometry('ship-' + id, 0.16, 'centre'); }

  /** Shows the campaign: cleared and open planets lit, locked ones dark; the selection ring. */
  show(unlocked: number, selected: number, at: number): void {
    this.planets.forEach((p, i) => {
      const open = i + 1 <= unlocked;
      p.mat.color.setScalar(open ? 1 : 0.28);
      p.mat.emissive.setHex(i + 1 === unlocked && unlocked <= MISSIONS.length ? 0x1a1206 : 0);
    });
    this.select(selected);
    const n = Math.min(MISSIONS.length, unlocked) - 1;
    this.next.visible = unlocked <= MISSIONS.length;
    this.next.position.set(...MAP_POS[n]);
    this.at = at;
    if (!this.trip) this.parkShip();
  }

  select(i: number): void {
    const [x, y, z] = MAP_POS[i];
    this.sel.position.set(x, y, z);
    this.sel.scale.setScalar(MISSIONS[i].kind === 'boss' ? 1.25 : 1);
  }

  private parkShip(): void {
    const [x, y, z] = MAP_POS[this.at];
    this.ship.position.set(x - 1.4, y + 1.3, z + 0.8);
  }

  /** The ship flies to planet i; `done` when it arrives. */
  travel(i: number, done: () => void): void {
    const [x, y, z] = MAP_POS[i];
    if (i === this.at) { done(); return; }
    this.trip = { from: this.ship.position.clone(), to: new THREE.Vector3(x - 1.4, y + 1.3, z + 0.8), t: 0, done };
    this.at = i;
  }

  update(dt: number): void {
    this.t += dt;
    this.planets.forEach((p, i) => { p.mesh.rotation.y = this.t * 0.25 + p.base; p.mesh.position.y = MAP_POS[i][1] + Math.sin(this.t * 0.8 + i) * 0.08; });
    this.sel.rotation.z += dt * 0.8;
    (this.sel.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(this.t * 5) * 0.25;
    this.next.scale.setScalar(1 + Math.sin(this.t * 3) * 0.06);
    if (this.trip) {
      const tr = this.trip;
      tr.t += dt / 1.1;
      const k = Math.min(1, tr.t), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.v.copy(tr.from).lerp(tr.to, e);
      this.v.y += Math.sin(k * Math.PI) * 1.4;
      const dx = tr.to.x - tr.from.x, dz = tr.to.z - tr.from.z;
      this.ship.rotation.set(0, Math.atan2(dx, dz), -Math.sign(dx) * Math.sin(k * Math.PI) * 0.4);
      this.ship.position.copy(this.v);
      if (Math.random() < 0.8) this.view.glow.dot(this.v.x, this.v.y, this.v.z, 0, 0, 0, 0xffb06a, 0.45, 0.8);
      if (k >= 1) { this.trip = null; tr.done(); }
    } else {
      const [x, y, z] = MAP_POS[this.at];
      this.ship.position.set(x - 1.4, y + 1.3 + Math.sin(this.t * 2) * 0.1, z + 0.8);
      this.ship.rotation.set(0, Math.PI / 2 + Math.sin(this.t) * 0.2, 0);
    }
  }

  /** Points the camera at the map. */
  camera(cam: THREE.PerspectiveCamera): void { cam.position.copy(MAP_CAM.pos); cam.lookAt(MAP_CAM.look); }

  planetAt(i: number): THREE.Vector3 { return this.planets[i].mesh.position; }
}

// ------------------------------------------------------------------ the base

const BASE_CAM = { pos: new THREE.Vector3(4.6, 7.4, 13.5), look: new THREE.Vector3(4.6, 0.6, -1.6) };

/** The modules of every rank: [model, x, z, rotation, scale, height of what it stands on]. */
type Mod = [string, number, number, number, number, number?];
const MODULES: Record<keyof Ranks, Mod[][]> = {
  hull: [[['dome', -4.6, -2.4, 0, 0.42]], [['connector', -2.5, -2.6, 0, 0.42]], [['base-large', -4.8, -6.6, 0.3, 0.42]]],
  armory: [[['building-l', 3.6, -3.2, -0.4, 0.42]], [['roof-vent', 3.0, -3.4, -0.4, 0.42, 1.78]], [['crate', 5.6, -1.2, 0.4, 0.7], ['crate', 6.2, -0.6, 1.1, 0.6]]],
  lab: [[['house-long', 0.6, -6.2, Math.PI / 2, 0.42]], [['roof-vent', 0.6, -6.2, 0, 0.42, 1.78]], [['house-support', -1.8, -5.6, 0, 0.42]]],
  thrusters: [[['ramp', 5.8, 2.0, -0.5, 0.5]], [['metal-support', 7.4, 1.2, 0.2, 0.5]], [['rover-round', -6.0, 1.6, 0.6, 0.38]]],
  solar: [[['solar-ground', -6.6, 0.2, 0.5, 0.42]], [['solar-ground', -7.4, -2.0, 0.6, 0.42], ['solar-ground', -5.6, 2.4, 0.4, 0.42]], [['solar-structure', -8.2, -4.6, 0.6, 0.42]]],
  radar: [[['house-cylinder', 5.6, -6.2, 0, 0.36]], [['roof-radar', 5.6, -6.2, 0.5, 0.42, 1.5]], [['roof-radar', 2.6, -3.0, -0.8, 0.32, 1.78]]],
  drone: [[['roof-antenna', 0, -2.4, 0, 0.42, 1.92]], [['metal-support', -2.4, 2.6, 0, 0.42]], [['roof-antenna', -2.4, 2.6, 0, 0.36, 0.3]]],
};

export class BaseView {
  readonly group: THREE.Group;
  readonly crew: Figure;
  private ground: THREE.Mesh;
  private modules: THREE.Mesh;
  private ship: THREE.Mesh;
  private t = 0;
  private heroId: HeroId;

  constructor(private view: View, hero: HeroId) {
    this.group = view.baseGroup;
    this.heroId = hero;
    const g = discMesh('desert', 16);
    g.translate(0, 0.0, 0);
    this.ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.ground.receiveShadow = true;
    this.ground.scale.set(1, 0.25, 1);
    this.modules = new THREE.Mesh(new THREE.BufferGeometry(), litMaterial());
    this.modules.castShadow = true;
    this.modules.receiveShadow = true;
    this.ship = new THREE.Mesh(soloGeometry('ship-' + hero, 0.42, 'stand'), litMaterial());
    this.ship.castShadow = true;
    this.crew = new Figure('astronauts', 0.7, ['a-' + hero, 'pistol']);
    this.group.add(this.ground, this.modules, this.ship, this.crew.root);
    void THEME;
  }

  setHero(id: HeroId): void {
    this.heroId = id;
    this.crew.show(['a-' + id, 'pistol']);
    this.ship.geometry = soloGeometry('ship-' + id, 0.42, 'stand');
    this.crew.play('Wave', { once: true, restart: true, then: 'Idle_Gun' });
  }

  /** The base with what the ranks have bought (every rank adds a piece). */
  build(ranks: Ranks): void {
    // the plan is squeezed across into the room left of the base board
    const X = (x: number): number => x * 0.68 - 0.55;
    const at = (key: string, x: number, z: number, rot: number, s: number): Placed => ({ key, x: X(x), y: -modelBox(key).min.y * s, z, rot, s });
    const list: Placed[] = [at('house-single', 0, -2.6, 0, 0.5), at('stairs', 1.3, -0.6, Math.PI, 0.4), at('metal-support', 2.2, 2.6, 0.3, 0.36)];
    for (const [u, ranksList] of Object.entries(MODULES) as [keyof Ranks, Mod[][]][]) {
      // every piece stands on the plateau (or on a roof): its lowest point there
      for (let r = 0; r < ranks[u]; r++) for (const [key, x, z, rot, s, on] of ranksList[r]) list.push({ key, x: X(x), y: (on ?? 0) - modelBox(key).min.y * s, z, rot, s });
    }
    this.modules.geometry.dispose();
    this.modules.geometry = mergeModels(list);
    this.ship.position.set(3.3, ranks.thrusters >= 1 ? 0.7 : 0, 2.6);
    this.ship.rotation.y = -0.9;
  }

  update(dt: number): void {
    this.t += dt;
    this.crew.root.position.set(0.3, 0, 3.0);
    this.crew.root.rotation.y = 0.25;
    if (!this.crew.name) this.crew.play('Idle_Gun');
    this.crew.update(dt);
    this.ship.position.y += Math.sin(this.t * 1.5) * 0.002;
  }

  camera(cam: THREE.PerspectiveCamera, centre = false): void {
    if (centre) { cam.position.set(1.2, 5.6, 11); cam.lookAt(1.2, 1.4, -1); return; }
    cam.position.copy(BASE_CAM.pos);
    cam.lookAt(BASE_CAM.look);
  }

  dispose(): void { this.crew.dispose(); }
}
