// Hex Realm: the 3D world of a scene (the Play scene, or the menu's live backdrop). One World3D
// holds the overworld (mapview.ts) and the battle stage (battleview.ts); only one of them shows.
// The party on the map is the hero's own model at map scale, walking hex to hex with its Walk and
// Run clips; the camera hangs over it and can be dragged around. The menu builds both halves, so
// every shader the round uses is compiled behind the menu (keepPrograms).
import Phaser from 'phaser';
import { THREE, World3D } from '@core/three';
import { BattleView, ARENA_LOOK } from './battleview';
import { MapView, groundY } from './mapview';
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
    this.camTarget.set(h.x, 0, h.z - 0.4);
    this.camFree = 0;
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

  /** Drags the map camera by screen pixels. */
  pan(dx: number, dy: number): void {
    const k = 0.012 / this.zoom;
    this.camTarget.x = Phaser.Math.Clamp(this.camTarget.x - dx * k, -6, 6);
    this.camTarget.z = Phaser.Math.Clamp(this.camTarget.z - dy * k * 1.3, -8, 8);
    this.camFree = 4;
  }

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
    const cam = this.world.camera;
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
    // the camera: follows the party unless the player dragged the map a moment ago
    this.camFree = Math.max(0, this.camFree - dt);
    if (this.camFree <= 0) {
      const want = tmpV.set(this.partyPos.x, 0, this.partyPos.z - 0.6);
      this.camTarget.lerp(want, Math.min(1, dt * 4));
    }
    const d = 9.6 / this.zoom;
    cam.position.set(this.camTarget.x, this.camTarget.y + d * 1.05, this.camTarget.z + d * 0.86);
    cam.lookAt(this.camTarget.x, 0, this.camTarget.z - 0.2);
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
