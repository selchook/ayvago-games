// Hex Realm: a battle in 3D. The arena (arena.ts) merges into one mesh per kit (the Retro Fantasy
// pieces on their runtime atlas, the Hexagon Kit tiles on their colour map); the hero and the foes
// are rigged Quaternius models from pools (recoloured per foe kind, animation LOD with distance);
// warnings, health bars, shots, drops, sparks, embers and slashes are instanced billboards. It reads
// the simulation (battle.ts) every frame and turns its events into effects.
import { THREE } from '@core/three';
import { FOE, CLASS, POWER_COLOR, type FoeKind, type ArenaKind, type ClassId } from './defs';
import { buildArena, type ArenaLayout } from './arena';
import type { Battle, BattleEvent, Foe } from './battle';
import { Figure, FigurePool } from './figure';
import { heroKey, modelKey, mergeModels, retroAtlas, retroMaterial, hexMap, hexMaterial, RETRO_CELLS, soloGeometry, retroKey } from './kit';
import { Billboards, Particles, Telegraphs, HealthBars, TEX, SHAPE, stepBar, type BarState } from './fx3d';

/** Model sizes: the RPG heroes are 2.9 units tall, the pirate skeletons 1.5. */
export const HERO_SCALE = 0.4;
export const modelScale = (model: string): number => (model === 'skeleton' || model === 'headless' ? 0.78 : HERO_SCALE);

/** Each arena's sky, fog and light. */
export const ARENA_LOOK: Record<ArenaKind, { sky: number; fog: number; ground: number; sun: number; amb: number; hemi: [number, number]; floor?: number }> = {
  field: { sky: 0x8ec8e8, fog: 0x9ccbe0, ground: 0x4f8a3a, sun: 2.3, amb: 1.5, hemi: [0xe4f4ff, 0x6a5a40] },
  forest: { sky: 0x7ab0a8, fog: 0x86b8a8, ground: 0x3f7a34, sun: 2.0, amb: 1.4, hemi: [0xdff0e0, 0x4a5a30] },
  farm: { sky: 0xf0c890, fog: 0xe8c898, ground: 0x6a8a3a, sun: 2.4, amb: 1.5, hemi: [0xfff0d8, 0x7a6040] },
  mine: { sky: 0x14100c, fog: 0x1a140e, ground: 0x2a241c, sun: 1.5, amb: 1.6, hemi: [0xffe0b8, 0x5a4a38], floor: 0x8a8290 },
  cavern: { sky: 0x120e10, fog: 0x18121a, ground: 0x2a2428, sun: 1.6, amb: 1.7, hemi: [0xffd8b0, 0x50465a], floor: 0x8e8694 },
  fort: { sky: 0xb8c8d8, fog: 0xb0c0cc, ground: 0x5a7a40, sun: 2.2, amb: 1.4, hemi: [0xe8f0ff, 0x5a5040] },
  tower: { sky: 0x2a1a3a, fog: 0x2a1c3a, ground: 0x3a2e48, sun: 1.3, amb: 1.4, hemi: [0xe0d0ff, 0x302040], floor: 0xffffff },
  spire: { sky: 0x3a1e5a, fog: 0x4a2a6a, ground: 0x2a1a3a, sun: 1.6, amb: 1.4, hemi: [0xe8d8ff, 0x382050], floor: 0x9a8aa8 },
  docks: { sky: 0x9ad0f0, fog: 0xa8d4ec, ground: 0x2a6a8a, sun: 2.3, amb: 1.5, hemi: [0xeaf6ff, 0x405a6a] },
  court: { sky: 0x4a3a4a, fog: 0x4a3c48, ground: 0x3a3438, sun: 1.6, amb: 1.35, hemi: [0xf0d8d8, 0x3a3030], floor: 0x9c949c },
  hall: { sky: 0x1a1218, fog: 0x1e141a, ground: 0x2a2024, sun: 1.2, amb: 1.35, hemi: [0xffd8c8, 0x302020], floor: 0x8a7f88 },
  throne: { sky: 0x200a10, fog: 0x2a0c14, ground: 0x2a1418, sun: 1.3, amb: 1.35, hemi: [0xffc8c8, 0x401818], floor: 0x847278 },
  rift: { sky: 0x160a24, fog: 0x24103a, ground: 0x1a1028, sun: 1.3, amb: 1.4, hemi: [0xd8c8ff, 0x281838], floor: 0x76688a },
};

interface ArenaBuilt { group: THREE.Group; layout: ArenaLayout; water: THREE.Mesh | null; shrine: THREE.Mesh }

export interface FoeView { fig: Figure; pool: FigurePool; bar: BarState; animN: number; spawnT: number }

const tmpV = new THREE.Vector3();

export class BattleView {
  readonly root = new THREE.Group();
  private arenas = new Map<string, ArenaBuilt>();
  private arena: ArenaBuilt | null = null;
  readonly heroPos = new THREE.Vector3(0, 0, 0);
  readonly camPos = new THREE.Vector3();
  private atlas: THREE.Texture;
  private retroMat: THREE.MeshLambertMaterial;
  private hexMat: THREE.MeshLambertMaterial;
  private waterMat: THREE.MeshLambertMaterial;
  hero: Figure;
  heroCls: ClassId;
  private heroFigs = new Map<ClassId, Figure>();
  private pools = new Map<string, FigurePool>();
  readonly foes = new Map<number, FoeView>();
  private heroAnimN = -1;
  // effects
  readonly sparks: Particles;
  readonly dust: Particles;
  readonly shadows: Billboards;
  readonly glows: Billboards;
  readonly flats: Billboards;
  readonly slashes: Billboards;
  readonly streaks: Billboards;
  readonly bubbles: Billboards;
  readonly marks: Billboards;
  readonly tele: Telegraphs;
  readonly bars: HealthBars;
  private fx: { kind: string; x: number; z: number; r: number; t: number; max: number; color: number; ang: number }[] = [];
  private time = 0;
  shakeT = 0;
  shakeK = 0;
  /** The menu's backdrop looks from a little further. */
  camDist = 1;
  lookAhead = 0;

  constructor(cls: ClassId, private menu = false) {
    this.atlas = retroAtlas();
    this.retroMat = retroMaterial(this.atlas, this.heroPos, this.camPos);
    this.hexMat = hexMaterial(hexMap(), null, 0);
    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x3a8ab8, transparent: true, opacity: 0.88, emissive: 0x0a2a3a });
    this.heroCls = cls;
    this.hero = this.heroFig(cls);
    this.hero.root.visible = true;
    this.sparks = new Particles(this.root, TEX.glow(), 600, 'add', 14);
    this.dust = new Particles(this.root, TEX.soft(), 300, 'normal', 13);
    this.shadows = new Billboards(this.root, TEX.shadow(), 48, { blend: 'normal', flat: true, order: 2, fade: true });
    this.glows = new Billboards(this.root, TEX.glow(), 160, { blend: 'add', order: 16 });
    this.flats = new Billboards(this.root, TEX.ring(), 64, { blend: 'add', flat: true, order: 5 });
    this.slashes = new Billboards(this.root, TEX.slash(), 24, { blend: 'add', flat: true, order: 15 });
    this.streaks = new Billboards(this.root, TEX.streak(), 64, { blend: 'add', flat: true, order: 15 });
    this.bubbles = new Billboards(this.root, TEX.bubble(), 4, { blend: 'add', order: 17 });
    this.marks = new Billboards(this.root, TEX.splat(), 40, { blend: 'normal', flat: true, order: 3, fade: true });
    this.tele = new Telegraphs(this.root, 64);
    this.bars = new HealthBars(this.root, 40);
    // every foe look, one figure each ahead (so the shaders and the first spawns are ready)
    for (const m of ['rogue', 'ranger', 'skeleton', 'headless', 'monk', 'cleric', 'warrior', 'wizard']) this.pool(modelKey(m), modelScale(m), menu ? 1 : 2);
  }

  private heroFig(cls: ClassId): Figure {
    let f = this.heroFigs.get(cls);
    if (!f) {
      f = new Figure(heroKey(cls), HERO_SCALE, { shadows: true, mid: 1.4 });
      f.root.visible = false;
      this.root.add(f.root);
      this.heroFigs.set(cls, f);
    }
    return f;
  }

  setHero(cls: ClassId): void {
    if (cls === this.heroCls) return;
    this.hero.root.visible = false;
    this.heroCls = cls;
    this.hero = this.heroFig(cls);
    this.hero.reset();
    this.hero.root.visible = true;
    this.heroAnimN = -1;
  }

  private pool(key: string, scale: number, prewarm = 0): FigurePool {
    let p = this.pools.get(key);
    if (!p) { p = new FigurePool(this.root, key, scale, { shadows: true, mid: 1.4 }, prewarm); this.pools.set(key, p); }
    return p;
  }

  // ------------------------------------------------------------------ the arena

  /** Shows the arena of a room (built once, kept for the round). */
  showArena(kind: ArenaKind, seed: number): ArenaLayout {
    const key = kind + ':' + seed;
    let a = this.arenas.get(key);
    if (!a) {
      const layout = buildArena(kind, seed);
      const group = new THREE.Group();
      if (layout.retro.length) {
        const m = new THREE.Mesh(mergeModels(layout.retro, { cells: RETRO_CELLS }), this.retroMat);
        m.receiveShadow = true; m.castShadow = true;
        group.add(m);
      }
      if (layout.hex.length) {
        const m = new THREE.Mesh(mergeModels(layout.hex, { hex: true }), this.hexMat);
        m.receiveShadow = true;
        m.castShadow = true;
        group.add(m);
      }
      const look = ARENA_LOOK[kind];
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshLambertMaterial({ color: look.ground }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = layout.water ? -0.9 : -0.45;
      ground.receiveShadow = true;
      group.add(ground);
      let water: THREE.Mesh | null = null;
      if (layout.water) {
        water = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 1, 1), this.waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = -0.5;
        group.add(water);
      }
      const shrine = new THREE.Mesh(soloGeometry(retroKey('column-paint'), { cells: RETRO_CELLS }), this.retroMat);
      shrine.scale.set(1.5, 0.75, 1.5);
      shrine.castShadow = true;
      shrine.visible = false;
      group.add(shrine);
      group.visible = false;
      this.root.add(group);
      a = { group, layout, water, shrine };
      this.arenas.set(key, a);
    }
    if (this.arena && this.arena !== a) this.arena.group.visible = false;
    this.arena = a;
    this.current = { kind, seed };
    this.hexMat.color.setHex(ARENA_LOOK[kind].floor ?? 0xffffff);
    a.group.visible = true;
    return a.layout;
  }

  get layout(): ArenaLayout | null { return this.arena?.layout ?? null; }

  /** The arena shown now (to come back to after building another ahead). */
  current: { kind: ArenaKind; seed: number } | null = null;

  /** Drops what the last battle used (foes back to their pools, effects cleared). */
  clear(): void {
    for (const fv of this.foes.values()) fv.pool.give(fv.fig);
    this.foes.clear();
    this.fx.length = 0;
    this.sparks.clear();
    this.dust.clear();
    this.heroAnimN = -1;
  }

  /** Frees the arenas built so far (they are rebuilt when needed). */
  dropArenas(): void {
    for (const a of this.arenas.values()) {
      if (a === this.arena) continue;
      this.root.remove(a.group);
      a.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        // the shrine's geometry is the shared solo geometry; the materials are this view's
        if (m !== a.shrine) m.geometry.dispose();
        if (m.material !== this.retroMat && m.material !== this.hexMat && m.material !== this.waterMat) (m.material as THREE.Material).dispose();
      });
    }
    for (const [k, a] of [...this.arenas]) if (a !== this.arena) this.arenas.delete(k);
  }

  // ------------------------------------------------------------------ events

  handle(ev: BattleEvent, b: Battle): void {
    const fx = (kind: string, x: number, z: number, r: number, max: number, color: number, ang = 0) => this.fx.push({ kind, x, z, r, t: 0, max, color, ang });
    switch (ev.type) {
      case 'swing': {
        const col = CLASS[b.st.cls].color;
        if (!CLASS[b.st.cls].ranged) fx('slash', ev.x + Math.sin(ev.face) * 0.8, ev.z + Math.cos(ev.face) * 0.8, ev.finisher ? 2.6 : 2.0, 0.22, ev.finisher ? 0xffe8a0 : col, ev.face);
        break;
      }
      case 'hit': {
        const y = 0.75;
        this.sparks.burst(ev.x, y, ev.z, ev.crit ? 18 : 9, ev.crit ? 7 : 5, ev.crit ? [0xffe27a, 0xffffff, 0xff9a3a] : [0xffffff, 0xffd8a0], 0.35, 0.32);
        const fv = this.foes.get(ev.id);
        if (fv) { fv.fig.flash(ev.crit ? 0.14 : 0.09); }
        if (ev.heavy) fx('ring', ev.x, ev.z, 1.0, 0.22, 0xffe8c0);
        if (ev.src === 'fireball' || ev.src === 'burn') this.sparks.burst(ev.x, 0.8, ev.z, 8, 4, [0xff7a2a, 0xffc04a], 0.5, 0.4, 1);
        break;
      }
      case 'kill': {
        this.sparks.burst(ev.x, 0.7, ev.z, ev.boss ? 60 : 22, ev.boss ? 9 : 6, [0xffffff, 0xffd27a, 0xff8a5a], 0.6, 0.45, 0.8);
        this.dust.burst(ev.x, 0.3, ev.z, ev.boss ? 30 : 10, 3, [0x8a7a6a, 0x6a5a4a], 0.9, 0.9, 0.3);
        fx('ring', ev.x, ev.z, ev.boss ? 4 : 1.3, 0.35, 0xffd27a);
        if (ev.boss) this.shake(0.5, 0.6);
        break;
      }
      case 'hurt': this.hero.flash(0.12); this.hero.hurtFlush(1); this.sparks.burst(ev.x, 0.8, ev.z, 10, 5, [0xff5a4a, 0xffffff], 0.35, 0.3); this.shake(0.18, 0.18); break;
      case 'shieldHit': fx('ring', ev.x, ev.z, 1.8, 0.3, POWER_COLOR.shield); this.sparks.burst(ev.x, 0.8, ev.z, 14, 5, [0x8ab8ff, 0xffffff], 0.4, 0.3); break;
      case 'block': this.sparks.burst(ev.x, 0.9, ev.z, ev.broke ? 24 : 8, ev.broke ? 6 : 4, [0xd8e8ff, 0xffffff], 0.3, 0.25); if (ev.broke) fx('ring', ev.x, ev.z, 2.2, 0.35, 0x9ad8ff); break;
      case 'dodge': this.dust.burst(ev.x, 0.15, ev.z, 8, 2.5, [0xc8b8a0, 0xa89880], 0.5, 0.6, 0.2); break;
      case 'skill': {
        const sd = CLASS[b.st.cls].skills.find((s) => s.id === ev.id);
        fx('ring', ev.x, ev.z, 1.8, 0.35, sd?.color ?? 0xffffff);
        this.sparks.burst(ev.x, 0.9, ev.z, 14, 4, [sd?.color ?? 0xffffff, 0xffffff], 0.5, 0.35, 1);
        if (ev.id === 'whirl') fx('whirl', ev.x, ev.z, 2.5, 1.6, sd?.color ?? 0xff6a4a);
        break;
      }
      case 'boom': {
        const col: Record<string, number> = {
          holy: 0xffe27a, smoke: 0x9aa4b8, heal: 0x7aff9a, nova: 0x8ae8ff, fire: 0xff7a2a, smite: 0xffe27a, bash: 0xffb04a, palm: 0x7ad8ff,
          whirl: 0xff6a4a, slam: 0xff9a5a, slamLand: 0xff9a5a, quake: 0xd8a070, rock: 0xb09070, frost: 0x8ae8ff, meteor: 0xff6a2a, blast: 0xff8a3a,
          cut: 0xffd0c0, blink: 0xc87aff, whirlBoss: 0xff5a4a,
        };
        const c = col[ev.kind] ?? 0xffffff;
        if (ev.kind === 'whirl') { this.sparks.burst(ev.x, 0.7, ev.z, 4, 4, [c], 0.25, 0.3); break; }
        fx('ring', ev.x, ev.z, ev.r, 0.4, c);
        if (ev.kind !== 'cut') fx('flash', ev.x, ev.z, ev.r * 0.9, 0.25, c);
        const n = Math.round(10 + ev.r * 6);
        if (ev.kind === 'smoke') this.dust.burst(ev.x, 0.6, ev.z, 40, 3.5, [0x8a90a0, 0xb8bcc8, 0x6a7080], 1.6, 1.6, 0.4);
        else if (ev.kind === 'nova' || ev.kind === 'frost') this.sparks.burst(ev.x, 0.5, ev.z, n, ev.r * 2, [0xbaf4ff, 0xffffff, 0x6ac8ff], 0.6, 0.4, 0.4);
        else if (ev.kind === 'fire' || ev.kind === 'meteor' || ev.kind === 'blast') { this.sparks.burst(ev.x, 0.5, ev.z, n, ev.r * 2.2, [0xff7a2a, 0xffc04a, 0xff3a1a], 0.7, 0.5, 1.2, 2); this.dust.burst(ev.x, 0.4, ev.z, 10, 2, [0x3a2a20], 1.2, 1.2, 0.5); this.mark(ev.x, ev.z, ev.r * 1.1, 0x1a1008); }
        else if (ev.kind === 'slam' || ev.kind === 'slamLand' || ev.kind === 'quake' || ev.kind === 'rock') { this.dust.burst(ev.x, 0.3, ev.z, n, ev.r * 1.6, [0x9a8a70, 0x7a6a58], 0.9, 1.0, 0.5); this.mark(ev.x, ev.z, ev.r * 0.9, 0x2a2018); if (ev.r > 2.2) this.shake(0.2, 0.2); }
        else this.sparks.burst(ev.x, 0.6, ev.z, n, ev.r * 1.8, [c, 0xffffff], 0.5, 0.4, 0.6);
        break;
      }
      case 'pickup': {
        const c = ev.kind === 'gold' ? 0xffd23f : ev.kind === 'potion' ? 0xff5a6a : POWER_COLOR[ev.power!];
        this.sparks.burst(ev.x, 0.6, ev.z, ev.kind === 'gold' ? 4 : 18, 3, [c, 0xffffff], 0.4, 0.25, 0.8);
        if (ev.kind === 'power') fx('ring', this.heroPos.x, this.heroPos.z, 2.2, 0.45, c);
        break;
      }
      case 'potion': case 'heal': this.sparks.burst(ev.x, 0.4, ev.z, 20, 2.2, [0x7aff9a, 0xd8ffd8], 0.9, 0.3, 1.4, -1.5); fx('ring', ev.x, ev.z, 1.6, 0.4, 0x7aff9a); break;
      case 'spawn': {
        fx('spawn', ev.x, ev.z, ev.boss ? 2.2 : 0.9, 0.8, ev.boss ? 0xc8203a : 0x6a3aa8);
        this.dust.burst(ev.x, 0.2, ev.z, ev.boss ? 24 : 8, 2, [0x4a3a5a, 0x2a2030], 0.8, 0.8, 0.5);
        break;
      }
      case 'trap': if (ev.sprung) { this.sparks.burst(ev.x, 0.3, ev.z, 16, 4, [0xd8b04a, 0xffffff], 0.4, 0.3); fx('ring', ev.x, ev.z, 2.2, 0.35, 0xd8b04a); } break;
      case 'freeze': break;
      case 'room': this.clear(); break;
    }
  }

  private mark(x: number, z: number, r: number, color: number): void { this.fx.push({ kind: 'mark', x, z, r, t: 0, max: 4, color, ang: Math.random() * 6 }); }

  shake(k: number, t: number): void { this.shakeK = Math.max(this.shakeK, k); this.shakeT = Math.max(this.shakeT, t); }

  // ------------------------------------------------------------------ each frame

  sync(b: Battle, dt: number, cam: THREE.PerspectiveCamera, camQ: THREE.Quaternion): void {
    this.time += dt;
    const h = b.hero;
    // the hero
    const hf = this.hero;
    hf.root.visible = true;
    hf.root.position.set(h.x, 0, h.z);
    hf.root.rotation.y = h.face;
    if (h.animN !== this.heroAnimN) {
      this.heroAnimN = h.animN;
      const once = h.state === 'attack' || h.state === 'skill' || h.state === 'dodge' || h.state === 'hit' || h.state === 'dead';
      hf.play(h.anim, { speed: h.animSpeed, once, restart: once, fade: once ? 0.06 : 0.15 });
    } else if (h.state === 'run' || h.state === 'idle') hf.play(h.anim, { speed: h.animSpeed });
    // the blessed step (the cleric's dodge) glides; the whirlwind spins
    const whirl = h.state === 'skill' && b.cls.skills[h.skill - 1]?.id === 'whirl';
    hf.root.rotation.y = whirl ? h.face + this.time * 16 : h.face;
    hf.setGlow(h.powers.rage > 0 ? 0x2a0400 : h.hidden > 0 ? 0x101828 : h.state === 'dodge' && b.cls.dodgeAnim === 'Run' ? 0x3a3418 : 0);
    hf.mat.transparent = h.hidden > 0;
    hf.mat.opacity = h.hidden > 0 ? 0.45 : 1;
    hf.update(dt);
    this.heroPos.set(h.x, 0.9, h.z);
    // the foes
    const live = new Set<number>();
    for (const f of b.foes) {
      live.add(f.id);
      let fv = this.foes.get(f.id);
      if (!fv) {
        const d = FOE[f.kind];
        const pool = this.pool(modelKey(d.model), modelScale(d.model));
        const fig = pool.take();
        fig.root.scale.setScalar(d.scale);
        fig.setLook(d.hue, d.sat, d.tint, d.glow);
        fv = { fig, pool, bar: { ghost: 1, hold: 0, a: 0, last: 1, seen: false }, animN: -1, spawnT: 0 };
        this.foes.set(f.id, fv);
      }
      this.syncFoe(f, fv, dt, cam);
    }
    for (const [id, fv] of this.foes) if (!live.has(id)) { fv.pool.give(fv.fig); this.foes.delete(id); }
    // the camera follows the hero, a little ahead
    const L = this.layout;
    const look = 1;
    const tx = L ? Math.max(-L.hx + 3.2, Math.min(L.hx - 3.2, h.x)) : h.x;
    const tz = h.z - 1.2 - this.lookAhead;
    const want = tmpV.set(tx, 10.6 * look * this.camDist, tz + 7.4 * look * this.camDist);
    if (this.camPos.lengthSq() === 0) this.camPos.copy(want); else this.camPos.lerp(want, Math.min(1, dt * 6));
    this.shakeT = Math.max(0, this.shakeT - dt);
    const sk = this.shakeT > 0 ? this.shakeK * (this.shakeT / 0.3) : 0;
    if (this.shakeT <= 0) this.shakeK = 0;
    cam.position.copy(this.camPos).add(tmpV.set((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk, 0));
    cam.lookAt(this.camPos.x, 0.4, this.camPos.z - 7.4 * look * this.camDist - 1.2);
    // the effects
    this.syncFx(b, dt, camQ);
  }

  private syncFoe(f: Foe, fv: FoeView, dt: number, cam: THREE.PerspectiveCamera): void {
    const fig = fv.fig;
    const d = FOE[f.kind];
    const spawning = f.state === 'spawn';
    fig.root.visible = !spawning || f.t > -0.05;
    const rise = spawning ? Math.min(1, Math.max(0, f.t / 0.7)) : 1;
    let y = (rise - 1) * 1.2;
    // the leap: up in an arc over the wind-up
    if (f.atk === 'leap' && f.state === 'wind') { const w = d.windup * 1.3; const k = Math.max(0, (f.t - w * 0.45) / (w * 0.55)); y += Math.sin(Math.min(1, k) * Math.PI) * 3.2; }
    fig.root.position.set(f.x, y, f.z);
    fig.root.rotation.y = f.face;
    if (f.state === 'dead') { fig.root.position.y = -Math.max(0, f.deadT - 1.4) * 0.8; }
    if (f.animN !== fv.animN) {
      fv.animN = f.animN;
      const once = f.anim === 'Death' || f.anim === 'Hit' || f.state === 'act' || f.state === 'wind';
      fig.play(f.anim, { speed: f.animSpeed, once, restart: true, fade: 0.1 });
    } else if (f.state === 'chase') fig.play(f.anim, { speed: f.animSpeed });
    // frozen: blue and still; stunned: grey glow; winding up: a warm glow
    const glow = f.freeze > 0 ? 0x0a2a4a : f.stun > 0 ? 0x1a1a1a : f.state === 'wind' && !f.boss ? 0x2a0800 : d.glow;
    fig.setGlow(glow);
    // animation LOD: far or off screen updates less often
    const dist = cam.position.distanceTo(fig.root.position);
    fig.update(f.freeze > 0 ? 0 : dt, dist > 22 ? 3 : dist > 15 ? 2 : 1);
  }

  private syncFx(b: Battle, dt: number, camQ: THREE.Quaternion): void {
    const h = b.hero;
    this.shadows.begin(camQ);
    this.glows.begin(camQ);
    this.flats.begin(camQ);
    this.slashes.begin(camQ);
    this.streaks.begin(camQ);
    this.bubbles.begin(camQ);
    this.marks.begin(camQ);
    this.tele.begin();
    this.bars.begin();
    // blob shadows
    this.shadows.add(h.x, 0.03, h.z, 1.3, 1.3, 0, 0xffffff, 0.8);
    for (const f of b.foes) if (f.state !== 'dead' || f.deadT < 1.4) this.shadows.add(f.x, 0.03, f.z, f.radius * 2.6, f.radius * 2.6, 0, 0xffffff, f.state === 'spawn' ? 0.3 : 0.75);
    // the warnings
    for (const z of b.zones) {
      if (z.done) continue;
      const fill = 1 - Math.max(0, z.delay) / Math.max(0.01, z.total);
      const col = z.side === 'hero' ? 0xffd23f : z.kind === 'frost' ? 0x6ac8ff : z.kind === 'fire' || z.kind === 'meteor' ? 0xff5a1a : 0xff2a1a;
      const pulse = fill > 0.75 ? (Math.sin(this.time * 30) * 0.5 + 0.5) : 0;
      if (z.shape === 'circle') this.tele.add(SHAPE.circle, z.x, z.z, z.r, 0, 0, 0, 0, fill, col, pulse);
      else if (z.shape === 'ring') this.tele.add(SHAPE.ring, z.x, z.z, z.r, 0, 0, 0, z.a / z.r, fill, col, pulse);
      else if (z.shape === 'cone') this.tele.add(SHAPE.cone, z.x, z.z, z.r, 0, 0, z.ang, z.a, fill, col, pulse);
      else this.tele.add(SHAPE.line, z.x, z.z, 0, z.a, z.len, z.ang, 0, fill, z.kind === 'aim' ? 0xff8a3a : col, pulse);
      if ((z.kind === 'meteor' || z.kind === 'rock') && fill > 0.4) {
        // the falling stone or fire, seen coming down
        const k = (fill - 0.4) / 0.6;
        this.glows.add(z.x, 9 * (1 - k) + 0.4, z.z, 1.2, 1.2, 0, z.kind === 'meteor' ? 0xff7a2a : 0xc8a888, 0.9);
      }
    }
    // the trap, the shrine
    for (const t of b.traps) this.flats.add(t.x, 0.06, t.z, 1.6, 1.6, this.time, t.sprung ? 0xffffff : 0xd8b04a, 0.8);
    const sh = this.arena?.shrine;
    if (sh) {
      sh.visible = !!b.shrine;
      if (b.shrine) {
        const col = POWER_COLOR[b.shrine.power];
        sh.position.set(b.shrine.x, 0, b.shrine.z);
        const bob = Math.sin(this.time * 2.4) * 0.12;
        this.glows.add(b.shrine.x, 2.0 + bob, b.shrine.z, 1.3, 1.3, 0, col, 1);
        this.glows.add(b.shrine.x, 2.0 + bob, b.shrine.z, 0.6, 0.6, 0, 0xffffff, 1);
        this.flats.add(b.shrine.x, 0.05, b.shrine.z, 2.6 + Math.sin(this.time * 3) * 0.2, 2.6 + Math.sin(this.time * 3) * 0.2, this.time * 0.5, col, 0.7);
        if (Math.random() < dt * 8) this.sparks.emit(b.shrine.x + (Math.random() - 0.5) * 0.8, 1.6, b.shrine.z + (Math.random() - 0.5) * 0.8, 0, 1.2, 0, 1, 0.2, 0.05, col, 1);
      }
    }
    // shots
    for (const s of b.shots) {
      const a = Math.atan2(s.vx, s.vz);
      const y = 0.85;
      if (s.kind === 'arrow' || s.kind === 'farrow' || s.kind === 'knife') this.streaks.add(s.x, y, s.z, 0.28, 1.4, -a, s.side === 'hero' ? 0xfff0c8 : 0xff8a6a, 1);
      else {
        const col = s.kind === 'bolt' ? 0x7ac8ff : s.kind === 'fireball' ? 0xff7a2a : s.kind === 'orb' ? 0xc87aff : 0xb05aff;
        const sz = s.kind === 'fireball' ? 1.4 : 0.9;
        this.glows.add(s.x, y, s.z, sz, sz, 0, col, 1);
        this.glows.add(s.x, y, s.z, sz * 0.45, sz * 0.45, 0, 0xffffff, 1);
        if (Math.random() < 0.5) this.sparks.emit(s.x, y, s.z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0.35, sz * 0.45, 0.05, col, 3);
      }
    }
    // drops
    for (const d of b.drops) {
      const bob = Math.sin(this.time * 6 + d.id) * 0.08 + 0.35;
      if (d.kind === 'gold') { this.glows.add(d.x, bob, d.z, 0.42, 0.42, 0, 0xffc83a, 1); this.glows.add(d.x, bob, d.z, 0.18, 0.18, 0, 0xffffff, 1); }
      else { const col = d.kind === 'potion' ? 0xff4a5a : POWER_COLOR[d.power!]; this.glows.add(d.x, bob + 0.25, d.z, 0.9, 0.9, 0, col, 1); this.glows.add(d.x, bob + 0.25, d.z, 0.35, 0.35, 0, 0xffffff, 1); this.flats.add(d.x, 0.05, d.z, 1.1, 1.1, this.time * 2, col, 0.7); }
    }
    // the hero's power-ups
    if (h.powers.shield > 0) this.bubbles.add(h.x, 0.75, h.z, 2.1, 2.1, 0, 0x8ab8ff, 0.9);
    if (h.powers.haste > 0 && Math.random() < dt * 20) this.sparks.emit(h.x, 0.3, h.z, 0, 0.6, 0, 0.4, 0.3, 0.05, 0x5ae8ff, 2);
    if (h.powers.rage > 0) this.glows.add(h.x, 0.9, h.z, 2.0, 2.0, 0, 0x5a1004, 1);
    if (h.powers.regen > 0 && Math.random() < dt * 10) this.sparks.emit(h.x + (Math.random() - 0.5) * 0.8, 0.2, h.z + (Math.random() - 0.5) * 0.8, 0, 1.4, 0, 0.7, 0.22, 0.05, 0x6aff8a, 0);
    if (h.powers.gold > 0 && Math.random() < dt * 8) this.sparks.emit(h.x, 1.2, h.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0.6, 0.18, 0.04, 0xffd23f, 3);
    // health bars over hurt foes
    for (const f of b.foes) {
      const fv = this.foes.get(f.id);
      if (!fv || f.boss) continue;
      const a = stepBar(fv.bar, f.hp / f.maxHp, f.state === 'dead', dt);
      const hgt = FOE[f.kind].scale * 1.15 + 0.45;
      this.bars.add(f.x, hgt, f.z, Math.max(0.9, f.radius * 2.2), 0.16, f.hp / f.maxHp, fv.bar.ghost, a, FOE[f.kind].ai === 'boss' ? 0xff7a3a : 0xff5a4a);
    }
    // timed effects
    for (const e of this.fx) {
      e.t += dt;
      const k = e.t / e.max;
      switch (e.kind) {
        case 'ring': this.flats.add(e.x, 0.07, e.z, e.r * 2 * (0.4 + k * 0.7), e.r * 2 * (0.4 + k * 0.7), 0, e.color, (1 - k) * 0.7); break;
        case 'flash': this.glows.add(e.x, 0.5, e.z, e.r * 1.7, e.r * 1.7, 0, e.color, (1 - k) * 0.55); break;
        case 'slash': this.slashes.add(e.x, 0.75, e.z, e.r * (0.8 + k * 0.4), e.r * (0.8 + k * 0.4), -e.ang + Math.PI, e.color, 1 - k * k); break;
        case 'whirl': this.slashes.add(this.heroPos.x, 0.7, this.heroPos.z, e.r * 2, e.r * 2, -this.time * 14, e.color, 0.8 * (1 - k)); this.slashes.add(this.heroPos.x, 0.7, this.heroPos.z, e.r * 2, e.r * 2, -this.time * 14 + Math.PI, e.color, 0.8 * (1 - k)); break;
        case 'spawn': this.flats.add(e.x, 0.06, e.z, e.r * 2 * (1.2 - k * 0.4), e.r * 2 * (1.2 - k * 0.4), this.time, e.color, Math.sin(k * Math.PI) * 0.7); break;
        case 'mark': this.marks.add(e.x, 0.04, e.z, e.r * 2, e.r * 2, e.ang, e.color, Math.min(1, (1 - k) * 2) * 0.6); break;
      }
    }
    this.fx = this.fx.filter((e) => e.t < e.max);
    this.sparks.update(dt, camQ);
    this.dust.update(dt, camQ);
    this.shadows.end(); this.glows.end(); this.flats.end(); this.slashes.end(); this.streaks.end(); this.bubbles.end(); this.marks.end();
    this.tele.end(); this.bars.end();
    if (this.arena?.water) { const w = this.arena.water; w.position.y = -0.5 + Math.sin(this.time * 1.2) * 0.05; }
  }

  /** A boss's bar is a HUD chip; this is where a foe stands on screen (the scene projects it). */
  foeTop(f: Foe): THREE.Vector3 { return tmpV.set(f.x, FOE[f.kind].scale * 1.2 + 0.6, f.z); }

  dispose(): void {
    for (const p of this.pools.values()) p.dispose();
    for (const f of this.heroFigs.values()) f.dispose();
  }
}

export type { FoeKind };
