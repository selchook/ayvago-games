// Hex Realm: the 3D world of a scene (the Play scene, or the menu's live backdrop). One World3D
// holds the overworld (mapview.ts) and the battle stage (battleview.ts); only one of them shows.
// The party on the map is the hero's own model at map scale, walking hex to hex with its Walk and
// Run clips; the camera hangs over it and can be dragged around. The menu builds both halves, so
// every shader the round uses is compiled behind the menu (keepPrograms).
import Phaser from 'phaser';
import { THREE, World3D } from '@core/three';
import { BattleView, ARENA_LOOK } from './battleview';
import { MapView, groundY, SCENERY, FAR_NORTH_Z } from './mapview';
import { Figure } from './figure';
import { heroKey, keepPrograms } from './kit';
import { keepRackProgram } from './weaponview';
import { hexPos, type HexMap } from './hexmap';
import { CLASS, type ClassId, type ArenaKind } from './defs';
import type { Battle } from './battle';
import type { Campaign } from './campaign';

export type ViewMode = 'map' | 'battle';

const MAP_SKY = 0x9ad4f0;
const PARTY_SCALE = 0.17;

// 1.2.1: the map camera zooms. Zoom 1 is the 1.2 view (13.2 units from the look point, 50° down).
// Farther out it also looks more steeply down, so the whole realm fits without seeing past the
// scenery round it; closer in it tilts towards the horizon to show the hero's model.
/** The farthest (whole map) and the closest (the hero up close) zoom. */
export const ZOOM_MIN = 0.78, ZOOM_MAX = 3;
const CAM_DIST = 13.16;
const PITCH = 50, PITCH_FAR = 64, PITCH_NEAR = 40;
const MAP_FOG = { near: 14, far: 34 };
/** Where the look point may go so the view stays over the map (the hexes' centres, a little slack). */
const LOOK_X = 5.2, LOOK_Z0 = -7.8, LOOK_Z1 = 7.2;

/** Distance and pitch (radians) of the map camera at a zoom. */
function rig(zoom: number): { d: number; p: number } {
  const p = zoom <= 1
    ? PITCH_FAR + (PITCH - PITCH_FAR) * (zoom - ZOOM_MIN) / (1 - ZOOM_MIN)
    : PITCH + (PITCH_NEAR - PITCH) * Math.min(1, (zoom - 1) / (ZOOM_MAX - 1));
  return { d: CAM_DIST / zoom, p: p * Math.PI / 180 };
}

export class View {
  readonly world: World3D;
  readonly battle: BattleView;
  readonly mapView: MapView;
  mode: ViewMode = 'map';
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private party: Figure;
  private partyCls: ClassId;
  private partyFigs = new Map<ClassId, Figure>();
  readonly partyPos = new THREE.Vector3();
  private partyFrom = new THREE.Vector3();
  private partyTo = new THREE.Vector3();
  private partyT = 1;
  private partyDur = 0.3;
  private partyFace = 0;
  /** Map camera: where it looks (follows the party unless dragged), its zoom. */
  readonly camTarget = new THREE.Vector3();
  camFree = 0;
  zoom = 1;
  /** The zoom the camera eases towards (wheel, keys), and the screen point that stays put meanwhile. */
  zoomGoal = 1;
  private anchor: { sx: number; sy: number; w: THREE.Vector3 } | null = null;
  private camQ = new THREE.Quaternion();
  private time = 0;

  constructor(private scene: Phaser.Scene, private map: HexMap, cls: ClassId, o: { menu?: boolean } = {}) {
    this.world = new World3D(scene, { fov: 46, background: MAP_SKY, fog: { color: MAP_SKY, near: 14, far: 34 }, near: 0.2, far: 120 });
    this.sun = this.world.addLights({ sky: 0xe4f4ff, ground: 0x6a5a40, ambient: 1.5, intensity: 2.3, dir: [-0.45, 1, 0.55], extent: 14 });
    this.hemi = this.world.scene.children.find((c) => (c as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.mapView = new MapView(map);
    this.world.scene.add(this.mapView.root);
    this.battle = new BattleView(cls, !!o.menu);
    this.world.scene.add(this.battle.root);
    this.partyCls = cls;
    this.party = this.partyFig(cls);
    this.party.root.visible = true;
    this.setMode('map');
  }

  private partyFig(cls: ClassId): Figure {
    let f = this.partyFigs.get(cls);
    if (!f) {
      f = new Figure(heroKey(cls), PARTY_SCALE, { shadows: true, mid: 1.4 });
      f.root.visible = false;
      this.mapView.root.add(f.root);
      this.partyFigs.set(cls, f);
    }
    return f;
  }

  setClass(cls: ClassId): void {
    this.battle.setHero(cls);
    if (cls === this.partyCls) return;
    this.party.root.visible = false;
    this.partyCls = cls;
    this.party = this.partyFig(cls);
    this.party.reset();
    this.party.root.visible = true;
  }

  /** Compiles every shader program of the round now (the menu calls this once). */
  warm(): void {
    const s = this.world.scene;
    // the docks bring the water's material; build them hidden, then show the arena again
    const cur = this.battle.current;
    this.battle.showArena('docks', 1);
    if (cur) this.battle.showArena(cur.kind, cur.seed);
    const vis = [this.mapView.root.visible, this.battle.root.visible];
    this.mapView.root.visible = this.battle.root.visible = true;
    // the weapon batch is warmed as a batch (the core's keepPrograms would warm a plain mesh of it)
    const rack = this.battle.rack.batch, parent = rack.parent;
    parent?.remove(rack);
    keepPrograms(this.world.renderer, s, this.world.camera);
    parent?.add(rack);
    keepRackProgram(this.world.renderer, s, this.world.camera, this.battle.rack);
    [this.mapView.root.visible, this.battle.root.visible] = vis;
  }

  setMode(m: ViewMode, arena?: ArenaKind): void {
    this.mode = m;
    this.mapView.root.visible = m === 'map';
    this.battle.root.visible = m === 'battle';
    const fog = this.world.scene.fog as THREE.Fog;
    if (m === 'map') {
      (this.world.scene.background as THREE.Color).setHex(MAP_SKY);
      fog.color.setHex(MAP_SKY); fog.near = 14; fog.far = 34;
      this.sun.intensity = 2.3; this.hemi.intensity = 1.5;
      this.hemi.color.setHex(0xe4f4ff); this.hemi.groundColor.setHex(0x6a5a40);
      setExtent(this.sun, 9);
    } else {
      const look = ARENA_LOOK[arena ?? 'field'];
      (this.world.scene.background as THREE.Color).setHex(look.sky);
      fog.color.setHex(look.fog); fog.near = 18; fog.far = 40;
      this.sun.intensity = look.sun; this.hemi.intensity = look.amb;
      this.hemi.color.setHex(look.hemi[0]); this.hemi.groundColor.setHex(look.hemi[1]);
      setExtent(this.sun, 13);
    }
  }

  // ------------------------------------------------------------------ the map

  /** Puts the party on a hex at once. */
  placeParty(c: Campaign): void {
    const [pc, pr] = c.s.pos;
    const h = this.map.at(pc, pr);
    this.partyPos.set(h.x, groundY(h), h.z);
    this.partyTo.copy(this.partyPos);
    this.partyT = 1;
    this.camTarget.set(h.x, 0, h.z - 0.6);
    this.camFree = 0;
    this.anchor = null;
  }

  /** Walks the party onto the next hex over `dur` seconds. */
  walkTo(c: number, r: number, dur: number): void {
    const h = this.map.at(c, r);
    this.partyFrom.copy(this.partyPos);
    this.partyTo.set(h.x, groundY(h), h.z);
    this.partyT = 0;
    this.partyDur = dur;
    this.partyFace = Math.atan2(h.x - this.partyFrom.x, h.z - this.partyFrom.z);
  }

  get walking(): boolean { return this.partyT < 1; }

  /** Drags the map from one screen point to another: the ground under the finger stays under it. */
  pan(x0: number, y0: number, x1: number, y1: number): void {
    this.placeCam();
    const a = this.pick(x0, y0), b = this.pick(x1, y1);
    if (!a || !b) return;
    this.camTarget.x += a.x - b.x;
    this.camTarget.z += a.z - b.z;
    this.camFree = 4;
    this.anchor = null;
    this.zoomGoal = this.zoom;
    this.placeCam();
  }

  /**
   * Zooms by a factor round a screen point (the cursor, the pinch's middle; the screen's centre
   * without one): `smooth` eases there (wheel, keys), else at once (a pinch follows the fingers).
   */
  zoomBy(k: number, sx?: number, sy?: number, smooth = true): void {
    const goal = Phaser.Math.Clamp((smooth ? this.zoomGoal : this.zoom) * k, ZOOM_MIN, ZOOM_MAX);
    this.placeCam();
    const { width, height } = this.scene.scale;
    const px = sx ?? width / 2, py = sy ?? height / 2;
    const w = this.pick(px, py);
    this.anchor = w ? { sx: px, sy: py, w } : null;
    this.zoomGoal = goal;
    this.camFree = Math.max(this.camFree, 4);
    if (!smooth) { this.zoom = goal; this.holdAnchor(); }
  }

  /** A pinch: the zoom it started at times the fingers' spread, the ground under their middle kept under it. */
  pinch(zoom: number, sx: number, sy: number, w: THREE.Vector3): void {
    this.zoom = this.zoomGoal = Phaser.Math.Clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    this.anchor = { sx, sy, w };
    this.camFree = 4;
    this.holdAnchor();
    this.anchor = null;
  }

  /** Sets the zoom at once (a saved one, tests). */
  setZoom(z: number): void { this.zoom = this.zoomGoal = Phaser.Math.Clamp(z, ZOOM_MIN, ZOOM_MAX); this.anchor = null; }

  /** Moves the look point so the anchored ground point is under its screen point again. */
  private holdAnchor(): void {
    this.placeCam();
    const a = this.anchor;
    if (!a) return;
    const now = this.pick(a.sx, a.sy);
    if (!now) return;
    this.camTarget.x += a.w.x - now.x;
    this.camTarget.z += a.w.z - now.z;
    this.placeCam();
  }

  /**
   * Keeps the look point over the map and the view inside the scenery round it (SCENERY: a
   * trapezoid, wider in the north where the view widens), then places the camera.
   */
  placeCam(): void {
    const cam = this.world.camera;
    const { d, p } = rig(this.zoom);
    // the ground under the screen's top and bottom edges, relative to the look point
    const ty = Math.tan((cam.fov * Math.PI) / 360), tx = ty * cam.aspect;
    const edge = (sy: number) => {
      const dy = -Math.sin(p) + Math.cos(p) * sy * ty, dz = -Math.cos(p) - Math.sin(p) * sy * ty;
      const t = dy < -0.05 ? (d * Math.sin(p)) / -dy : 60;
      return { z: d * Math.cos(p) + dz * t, half: tx * t };
    };
    const top = edge(1), bot = edge(-1);
    const S = SCENERY;
    const width = (z: number) => S.wS + (S.wN - S.wS) * Phaser.Math.Clamp((S.zS - z) / (S.zS - S.zN), 0, 1);
    const fit = (v: number, lo: number, hi: number, lo2: number, hi2: number) => {
      // the scenery's range wins over the map's when they do not meet
      const a = Math.max(lo, lo2), b = Math.min(hi, hi2);
      return a <= b ? Phaser.Math.Clamp(v, a, b) : lo <= hi ? Phaser.Math.Clamp(v, lo, hi) : (lo + hi) / 2;
    };
    const t = this.camTarget;
    t.z = fit(t.z, S.zN - top.z, S.zS - bot.z, LOOK_Z0, LOOK_Z1);
    const xr = Math.max(0, Math.min(width(t.z + top.z) - top.half, width(t.z + bot.z) - bot.half));
    t.x = fit(t.x, S.x0 - xr, S.x0 + xr, -LOOK_X, LOOK_X);
    this.mapView.farNorth.visible = t.z + top.z < FAR_NORTH_Z + 0.3;
    cam.position.set(t.x, Math.sin(p) * d, t.z + Math.cos(p) * d);
    cam.lookAt(t.x, 0, t.z);
    cam.updateMatrixWorld();
    // the haze moves out with the camera, so the realm stays clear when zoomed out
    const fog = this.world.scene.fog as THREE.Fog;
    const k = Math.max(1, 1 / this.zoom);
    fog.near = MAP_FOG.near * k; fog.far = MAP_FOG.far * k;
  }

  /** The zoom's share between the closest (0) and the farthest (1), for the screen's labels. */
  get zoomOut(): number { return Phaser.Math.Clamp((1 / this.zoom - 1 / ZOOM_MAX) / (1 / ZOOM_MIN - 1 / ZOOM_MAX), 0, 1); }

  /** The hex under a screen point (game pixels), or null. */
  pick(px: number, py: number): THREE.Vector3 | null {
    const { width, height } = this.scene.scale;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((px / width) * 2 - 1, -(py / height) * 2 + 1), this.world.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }

  updateMap(dt: number): void {
    this.time += dt;
    // the party
    const p = this.party;
    if (this.partyT < 1) {
      this.partyT = Math.min(1, this.partyT + dt / this.partyDur);
      const k = this.partyT;
      this.partyPos.lerpVectors(this.partyFrom, this.partyTo, k);
      this.partyPos.y += Math.sin(k * Math.PI) * 0.05;
      p.play('Run', { speed: 1.3 });
      p.root.rotation.y += (wrap(this.partyFace - p.root.rotation.y)) * Math.min(1, dt * 14);
    } else p.play('Idle', { speed: 1 });
    p.root.position.copy(this.partyPos);
    p.update(dt);
    // the camera: follows the party unless the player dragged or zoomed the map a moment ago
    this.camFree = Math.max(0, this.camFree - dt);
    if (this.camFree <= 0) {
      const want = tmpV.set(this.partyPos.x, 0, this.partyPos.z - 0.8);
      this.camTarget.lerp(want, Math.min(1, dt * 4));
    }
    // the zoom eases to its goal (in steps of the same feel near and far), round its anchor
    if (this.zoom !== this.zoomGoal) {
      const k = 1 - Math.exp(-dt * 14);
      const z = Math.exp(Math.log(this.zoom) + (Math.log(this.zoomGoal) - Math.log(this.zoom)) * k);
      this.zoom = Math.abs(z - this.zoomGoal) < 0.002 ? this.zoomGoal : z;
      this.holdAnchor();
      if (this.zoom === this.zoomGoal) this.anchor = null;
    } else this.placeCam();
    this.world.followSun(tmpV.set(this.camTarget.x, 0, this.camTarget.z));
    this.mapView.update(dt);
  }

  // ------------------------------------------------------------------ battle

  syncBattle(b: Battle, dt: number): void {
    this.time += dt;
    const cam = this.world.camera;
    this.camQ.copy(cam.quaternion);
    this.battle.sync(b, dt, cam, this.camQ);
    this.world.followSun(tmpV.set(b.hero.x, 0, b.hero.z - 2));
  }

  /** Screen position of a world point (game pixels). */
  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const s = this.world.toScreen(tmpV.set(x, y, z));
    return { x: s.x, y: s.y };
  }

  /** A quaternion that faces the camera (the map's billboards). */
  camQuat(): THREE.Quaternion { return this.camQ.copy(this.world.camera.quaternion); }

  dispose(): void {
    // the fog texture lives in a shader uniform, where the world's cleanup does not look
    this.mapView.fog.dispose();
    this.battle.dispose();
    for (const f of this.partyFigs.values()) f.dispose();
  }
}

const tmpV = new THREE.Vector3();
const wrap = (a: number) => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

function setExtent(sun: THREE.DirectionalLight, e: number): void {
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e });
  sun.shadow.camera.updateProjectionMatrix();
}

export { hexPos, CLASS };
