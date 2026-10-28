import Phaser from 'phaser';
import { ArcadeScene, Button, COLORS, burst, shake, t, rng } from '@core';
import { ftxt, fpopup, freshTextCanvases, softFlash } from './fasttext';

// Grid: 11 x 15 tiles of 8 px art scaled x8 = 64 px
const COLS = 11, ROWS = 15, TS = 64, SC = 8;
const OX = (720 - COLS * TS) / 2, OY = 140;
const VIEW = 4.5;                       // light radius in tiles

// micro-roguelike frames
const F = {
  wall: 58, wallTop: 0, floor: 15, floor2: 60, stairs: 47,
  hero: 4, heroArmor: 6, heroKnight: 5,
  potion: 119, chest: 82, coin: 78, ring: 79, sword: 62, shield: 94, heart: 90, fire: 120,
};

type Behaviour = 'chase' | 'erratic' | 'slow';
interface MonsterDef { frame: number; hp: number; atk: number; def: number; score: number; beh: Behaviour; minFloor: number }
const MONSTERS: MonsterDef[] = [
  { frame: 23, hp: 2, atk: 1, def: 0, score: 10, beh: 'erratic', minFloor: 1 },   // bat
  { frame: 19, hp: 3, atk: 1, def: 0, score: 10, beh: 'chase', minFloor: 1 },     // rat
  { frame: 22, hp: 5, atk: 2, def: 0, score: 15, beh: 'slow', minFloor: 2 },      // slime
  { frame: 18, hp: 4, atk: 2, def: 0, score: 20, beh: 'chase', minFloor: 2 },     // snake
  { frame: 21, hp: 5, atk: 3, def: 0, score: 25, beh: 'erratic', minFloor: 3 },   // spider
  { frame: 10, hp: 7, atk: 3, def: 1, score: 35, beh: 'chase', minFloor: 4 },     // skeleton
  { frame: 11, hp: 7, atk: 4, def: 0, score: 35, beh: 'chase', minFloor: 4 },     // goblin
  { frame: 12, hp: 10, atk: 4, def: 2, score: 45, beh: 'slow', minFloor: 5 },     // crab
  { frame: 9, hp: 13, atk: 5, def: 1, score: 60, beh: 'chase', minFloor: 6 },     // orc
  { frame: 26, hp: 18, atk: 5, def: 2, score: 70, beh: 'slow', minFloor: 7 },     // treant
  { frame: 25, hp: 14, atk: 6, def: 1, score: 80, beh: 'chase', minFloor: 8 },    // demon
];
const BOSS: MonsterDef = { frame: 13, hp: 20, atk: 4, def: 1, score: 300, beh: 'chase', minFloor: 5 };

type ItemKind = 'potion' | 'chest' | 'coin' | 'heart' | 'fire';
interface Item { kind: ItemKind; c: number; r: number; img: Phaser.GameObjects.Image }
interface Monster { def: MonsterDef; c: number; r: number; hp: number; maxHp: number; atk: number; img: Phaser.GameObjects.Image; awake: boolean; boss: boolean; tick: number }
interface Room { x: number; y: number; w: number; h: number }

const DIRS: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export class PlayScene extends ArcadeScene {
  protected useHud = true;
  private grid: number[][] = [];            // 1 wall, 0 floor
  private seen: boolean[][] = [];
  private vis: boolean[][] = [];
  private tiles: Phaser.GameObjects.Image[][] = [];
  private items: Item[] = [];
  private monsters: Monster[] = [];
  private hero!: Phaser.GameObjects.Image;
  private stairsImg!: Phaser.GameObjects.Image;
  private uiG!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private atkText!: Phaser.GameObjects.Text;
  private defText!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private potionBtn!: Button;
  private pc = 0; private pr = 0;
  private sc = 0; private sr = 0;
  private hp = 12; private maxHp = 12; private atk = 3; private def = 0;
  private potions = 1;
  private floor = 1;
  private busyUntil = 0;
  private bossAlive = false;
  private dead = false;
  private turn = 0;
  private holdDir: string | null = null;
  private holdT = 0;

  createGame(): void {
    freshTextCanvases(this);
    this.grid = []; this.seen = []; this.vis = []; this.tiles = []; this.items = []; this.monsters = [];
    this.hp = 12; this.maxHp = 12; this.atk = 3; this.def = 0; this.potions = 1; this.floor = 1;
    this.busyUntil = 0; this.bossAlive = false; this.dead = false; this.turn = 0; this.holdDir = null; this.holdT = 0;

    this.add.rectangle(OX - 6, OY - 6, COLS * TS + 12, ROWS * TS + 12, 0x000000).setOrigin(0).setStrokeStyle(4, 0x3a3450);
    for (let r = 0; r < ROWS; r++) {
      this.tiles.push([]);
      for (let c = 0; c < COLS; c++) {
        this.tiles[r].push(this.add.image(OX + c * TS + TS / 2, OY + r * TS + TS / 2, 'mr', F.floor).setScale(SC).setDepth(1));
      }
    }
    this.stairsImg = this.add.image(0, 0, 'mr', F.stairs).setScale(SC).setDepth(2);
    this.hero = this.add.image(0, 0, 'mr', F.hero).setScale(SC).setDepth(5);
    this.uiG = this.add.graphics().setDepth(20);
    this.hpText = ftxt(this, 154, 100, '', { title: true, size: 18 }).setDepth(21);
    this.add.image(330, 100, 'mr', F.sword).setScale(5).setDepth(21);
    this.atkText = ftxt(this, 372, 100, '', { title: true, size: 22 }).setDepth(21);
    this.add.image(440, 100, 'mr', F.shield).setScale(5).setDepth(21);
    this.defText = ftxt(this, 482, 100, '', { title: true, size: 22 }).setDepth(21);
    this.msg = ftxt(this, 360, 1124, '', { size: 26, color: '#ffd23f' }).setDepth(21);

    new Button(this, 190, 1206, t('wait'), () => this.act('wait'), { width: 300, height: 92, size: 24, color: 0x333344 });
    this.potionBtn = new Button(this, 530, 1206, '', () => this.act('potion'), { width: 300, height: 92, size: 24, color: COLORS.red });

    // keyboard
    const kb = this.input.keyboard!;
    const map: Record<string, string> = { UP: 'up', W: 'up', DOWN: 'down', S: 'down', LEFT: 'left', A: 'left', RIGHT: 'right', D: 'right' };
    for (const [k, d] of Object.entries(map)) {
      kb.on(`keydown-${k}`, (e: KeyboardEvent) => { if (!e.repeat) { this.holdDir = d; this.holdT = 0.28; this.act(d); } });
      kb.on(`keyup-${k}`, () => { if (this.holdDir === d) this.holdDir = null; });
    }
    kb.on('keydown-SPACE', () => this.act('wait'));
    kb.on('keydown-X', () => this.act('potion'));
    kb.on('keydown-Q', () => this.act('potion'));

    // touch: tap a spot on the map to step towards it
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < OY || p.y > OY + ROWS * TS) return;
      const c = Math.floor((p.x - OX) / TS), r = Math.floor((p.y - OY) / TS);
      const dx = c - this.pc, dy = r - this.pr;
      if (dx === 0 && dy === 0) { this.act('wait'); return; }
      if (Math.abs(dx) >= Math.abs(dy)) this.act(dx < 0 ? 'left' : 'right');
      else this.act(dy < 0 ? 'up' : 'down');
    });

    this.buildFloor();
  }

  // ---------------------------------------------------------------- level generation
  private buildFloor(): void {
    for (const it of this.items) it.img.destroy();
    for (const m of this.monsters) m.img.destroy();
    this.items = []; this.monsters = [];
    let rooms: Room[] = [];
    // retry until we get a decent layout
    for (let attempt = 0; attempt < 30; attempt++) {
      this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
      rooms = [];
      for (let k = 0; k < 60 && rooms.length < 7; k++) {
        const w = rng.int(3, 5), h = rng.int(3, 5);
        const x = rng.int(1, COLS - 1 - w), y = rng.int(1, ROWS - 1 - h);
        if (rooms.some((o) => x <= o.x + o.w && x + w >= o.x && y <= o.y + o.h && y + h >= o.y)) continue;
        rooms.push({ x, y, w, h });
      }
      if (rooms.length >= 4) break;
    }
    for (const rm of rooms) for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) this.grid[y][x] = 0;
    const centre = (rm: Room): [number, number] => [rm.x + Math.floor(rm.w / 2), rm.y + Math.floor(rm.h / 2)];
    const dig = (a: [number, number], b: [number, number]) => {
      let [x, y] = a;
      const horizFirst = rng.chance(0.5);
      const stepX = () => { while (x !== b[0]) { x += Math.sign(b[0] - x); this.grid[y][x] = 0; } };
      const stepY = () => { while (y !== b[1]) { y += Math.sign(b[1] - y); this.grid[y][x] = 0; } };
      if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    };
    // connect rooms in order of position (a rough path) plus one extra loop
    rooms.sort((a, b) => (a.y + a.x * 0.3) - (b.y + b.x * 0.3));
    for (let i = 1; i < rooms.length; i++) dig(centre(rooms[i - 1]), centre(rooms[i]));
    if (rooms.length > 3) dig(centre(rooms[0]), centre(rooms[rng.int(2, rooms.length - 1)]));

    // hero in the first room, stairs at the farthest reachable floor tile
    [this.pc, this.pr] = centre(rooms[0]);
    const dist = this.bfs(this.pc, this.pr);
    let best: [number, number] = [this.pc, this.pr], bd = -1;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (dist[r][c] > bd && this.isRoomTile(rooms, c, r)) { bd = dist[r][c]; best = [c, r]; }
    [this.sc, this.sr] = best;

    const free = (): [number, number] | null => {
      for (let k = 0; k < 200; k++) {
        const rm = rng.pick(rooms);
        const c = rng.int(rm.x, rm.x + rm.w - 1), r = rng.int(rm.y, rm.y + rm.h - 1);
        if (this.occupied(c, r) || (c === this.sc && r === this.sr)) continue;
        if (Math.abs(c - this.pc) + Math.abs(r - this.pr) < 3) continue;
        return [c, r];
      }
      return null;
    };

    // monsters
    const f = this.floor;
    const pool = MONSTERS.filter((m) => m.minFloor <= f && m.minFloor >= f - 4);
    const count = Math.min(10, 2 + Math.floor(f * 0.9));
    for (let i = 0; i < count; i++) {
      const spot = free();
      if (!spot) break;
      if (Math.abs(spot[0] - this.pc) + Math.abs(spot[1] - this.pr) < 4) continue;
      // later floors favour the tougher end of the pool
      const def = pool[Math.min(pool.length - 1, Math.floor(Math.pow(Math.random(), 0.7) * pool.length))];
      this.spawnMonster(def, spot[0], spot[1], false);
    }
    this.bossAlive = false;
    if (f % 5 === 0) {
      // the floor guardian waits next to the stairs
      const around = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dy]) => [this.sc + dx, this.sr + dy]).filter(([c, r]) => this.grid[r]?.[c] === 0 && !this.occupied(c, r));
      const [bc, br] = around.length ? around[0] : [this.sc, this.sr];
      this.spawnMonster(BOSS, bc, br, true);
      this.bossAlive = true;
    }
    // items
    const place = (kind: ItemKind, frame: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const spot = free();
        if (!spot) return;
        const img = this.add.image(OX + spot[0] * TS + TS / 2, OY + spot[1] * TS + TS / 2, 'mr', frame).setScale(SC).setDepth(3).setVisible(false);
        this.items.push({ kind, c: spot[0], r: spot[1], img });
      }
    };
    place('coin', F.coin, rng.int(2, 4));
    place('potion', F.potion, rng.chance(0.65) ? 1 : 0);
    place('chest', F.chest, 1 + (rng.chance(0.3) ? 1 : 0));
    place('heart', F.heart, rng.chance(0.4) ? 1 : 0);
    if (f >= 3) place('fire', F.fire, Math.min(4, f - 2));

    // paint tiles
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const img = this.tiles[r][c];
      if (this.grid[r][c] === 1) img.setFrame(this.grid[r + 1]?.[c] === 0 ? F.wall : F.wallTop);
      else img.setFrame(rng.chance(0.18) ? F.floor2 : F.floor);
      img.setAlpha(0).setTint(0xffffff);
    }
    this.seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    this.vis = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    this.stairsImg.setPosition(OX + this.sc * TS + TS / 2, OY + this.sr * TS + TS / 2).setAlpha(0);
    this.hero.setPosition(OX + this.pc * TS + TS / 2, OY + this.pr * TS + TS / 2).setFrame(this.heroFrame());
    this.hud.setRight(`${t('floor')} ${f}`);
    this.updateVision();
    this.updateUi();
    this.cameras.main.fadeIn(350, 0, 0, 0);
    if (this.bossAlive) {
      this.say(t('boss'), '#ec3013');
      this.sfx('boss', { volume: 0.6 });
    } else this.say(`${t('floor')} ${f}`, '#ffd23f');
  }

  private isRoomTile(rooms: Room[], c: number, r: number): boolean {
    return rooms.some((rm) => c >= rm.x && c < rm.x + rm.w && r >= rm.y && r < rm.y + rm.h);
  }

  private bfs(sc: number, sr: number): number[][] {
    const d = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    const q: Array<[number, number]> = [[sc, sr]];
    d[sr][sc] = 0;
    while (q.length) {
      const [c, r] = q.shift()!;
      for (const [dx, dy] of Object.values(DIRS)) {
        const nc = c + dx, nr = r + dy;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || this.grid[nr][nc] === 1 || d[nr][nc] >= 0) continue;
        d[nr][nc] = d[r][c] + 1;
        q.push([nc, nr]);
      }
    }
    return d;
  }

  private spawnMonster(def: MonsterDef, c: number, r: number, boss: boolean): void {
    const scaleHp = 1 + (this.floor - 1) * 0.1;
    const hp = boss ? def.hp + this.floor * 3 : Math.round(def.hp * scaleHp);
    const atk = boss ? def.atk + Math.floor(this.floor / 2) : def.atk + Math.floor((this.floor - def.minFloor) / 4);
    const img = this.add.image(OX + c * TS + TS / 2, OY + r * TS + TS / 2, 'mr', def.frame).setScale(SC).setDepth(4).setVisible(false);
    if (boss) img.setTint(0xff9090);
    this.monsters.push({ def, c, r, hp, maxHp: hp, atk, img, awake: boss, boss, tick: 0 });
  }

  private occupied(c: number, r: number): boolean {
    return (c === this.pc && r === this.pr) || this.monsters.some((m) => m.c === c && m.r === r) || this.items.some((i) => i.c === c && i.r === r);
  }

  private monsterAt(c: number, r: number): Monster | undefined {
    return this.monsters.find((m) => m.c === c && m.r === r);
  }

  private walkable(c: number, r: number): boolean {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS && this.grid[r][c] === 0;
  }

  // ---------------------------------------------------------------- vision
  private los(c0: number, r0: number, c1: number, r1: number): boolean {
    let x = c0, y = r0;
    const dx = Math.abs(c1 - c0), dy = Math.abs(r1 - r0), sx = c0 < c1 ? 1 : -1, sy = r0 < r1 ? 1 : -1;
    let err = dx - dy;
    while (!(x === c1 && y === r1)) {
      if (!(x === c0 && y === r0) && this.grid[y][x] === 1) return false;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return true;
  }

  private updateVision(): void {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const d = Math.hypot(c - this.pc, r - this.pr);
      const v = d <= VIEW && this.los(this.pc, this.pr, c, r);
      this.vis[r][c] = v;
      if (v) this.seen[r][c] = true;
      const img = this.tiles[r][c];
      const a = v ? 1 - Math.max(0, d - 2) * 0.12 : this.seen[r][c] ? 0.28 : 0;
      if (Math.abs(img.alpha - a) > 0.01) this.tweens.add({ targets: img, alpha: a, duration: 120 });
    }
    const sv = this.vis[this.sr][this.sc] ? 1 : this.seen[this.sr][this.sc] ? 0.4 : 0;
    this.stairsImg.setAlpha(sv).setTint(this.bossAlive ? 0x777777 : 0xffffff);
    for (const it of this.items) it.img.setVisible(this.vis[it.r][it.c] || (this.seen[it.r][it.c] && it.kind !== 'fire')).setAlpha(this.vis[it.r][it.c] ? 1 : 0.4);
    for (const m of this.monsters) {
      const v = this.vis[m.r][m.c];
      m.img.setVisible(v);
      if (v && !m.awake) m.awake = true;
    }
  }

  // ---------------------------------------------------------------- turns
  private heroFrame(): number {
    return this.def >= 3 ? F.heroKnight : this.def >= 1 ? F.heroArmor : F.hero;
  }

  private act(a: string): void {
    if (this.isOver || this.dead || this.time.now < this.busyUntil) return;
    if (a === 'wait') {
      this.sfx('step', { volume: 0.2, rate: 0.7 });
      this.endTurn(120);
      return;
    }
    if (a === 'potion') {
      if (this.potions <= 0 || this.hp >= this.maxHp) { this.sfx('bump', { volume: 0.4 }); return; }
      this.potions--;
      const heal = Math.max(6, Math.round(this.maxHp * 0.6));
      this.hp = Math.min(this.maxHp, this.hp + heal);
      this.sfx('potion', { volume: 0.6 });
      burst(this, this.hero.x, this.hero.y, [0xec3013, 0xff8fa3, 0xffffff], 18, 200);
      fpopup(this, this.hero.x, this.hero.y - 40, `+${heal}`, '#5dff7a', 24);
      softFlash(this, 0x5dff7a, 160, 0.18);
      this.endTurn(160);
      return;
    }
    const [dx, dy] = DIRS[a];
    const nc = this.pc + dx, nr = this.pr + dy;
    const m = this.monsterAt(nc, nr);
    if (m) { this.heroAttack(m, dx, dy); this.endTurn(170); return; }
    if (!this.walkable(nc, nr)) {
      this.sfx('bump', { volume: 0.3 });
      this.tweens.add({ targets: this.hero, x: this.hero.x + dx * 8, y: this.hero.y + dy * 8, duration: 50, yoyo: true });
      this.busyUntil = this.time.now + 110;
      return;
    }
    this.pc = nc; this.pr = nr;
    if (dx) this.hero.setFlipX(dx < 0);
    this.tweens.add({ targets: this.hero, x: OX + nc * TS + TS / 2, y: OY + nr * TS + TS / 2, duration: 100, ease: 'Quad.easeOut' });
    this.sfx('step', { volume: 0.25, rate: 0.9 + Math.random() * 0.3 });
    this.pickup();
    if (this.dead) return;
    if (nc === this.sc && nr === this.sr) {
      if (this.bossAlive) this.say(t('locked'), '#ec3013');
      else { this.descend(); return; }
    }
    this.endTurn(130);
  }

  private pickup(): void {
    const i = this.items.findIndex((it) => it.c === this.pc && it.r === this.pr);
    if (i < 0) return;
    const it = this.items[i];
    const x = it.img.x, y = it.img.y;
    if (it.kind === 'fire') {
      // traps stay put
      const dmg = 2 + Math.floor(this.floor / 4);
      this.hurt(dmg, 0xff8c00);
      burst(this, x, y, [0xff8c00, 0xffd23f], 14, 200);
      fpopup(this, x, y - 70, t('trap'), '#ff8c00', 18);
      return;
    }
    this.items.splice(i, 1);
    this.tweens.add({ targets: it.img, y: y - 30, alpha: 0, duration: 250, onComplete: () => it.img.destroy() });
    if (it.kind === 'coin') {
      const v = 10 + this.floor * 5;
      this.addScore(v);
      this.sfx('coin', { volume: 0.5 });
      fpopup(this, x, y - 30, `+${v}`, '#ffd23f', 22);
      burst(this, x, y, [0xffd23f, 0xffffff], 10, 160);
    } else if (it.kind === 'potion') {
      if (this.potions >= 3) {
        // bag full: drink it on the spot
        const heal = Math.min(this.maxHp - this.hp, 5);
        this.hp += heal;
        fpopup(this, x, y - 30, t('full'), '#ff8fa3', 18);
      } else {
        this.potions++;
        fpopup(this, x, y - 30, `+1 ${t('potion')}`, '#ff8fa3', 20);
      }
      this.sfx('item', { volume: 0.5 });
    } else if (it.kind === 'heart') {
      const heal = Math.min(this.maxHp - this.hp, 4);
      this.hp += heal;
      this.sfx('potion', { volume: 0.5 });
      fpopup(this, x, y - 30, `+${heal} ${t('heal')}`, '#5dff7a', 20);
    } else if (it.kind === 'chest') {
      this.sfx('chest', { volume: 0.6 });
      burst(this, x, y, [0xffd23f, 0xb5651d, 0xffffff], 22, 260);
      shake(this, 0.004, 100);
      const roll = Math.random();
      let label: string, frame: number;
      if (roll < 0.3) { this.atk++; label = `+1 ${t('atk')}`; frame = F.sword; }
      else if (roll < 0.55) { this.def++; label = `+1 ${t('armor')}`; frame = F.shield; this.hero.setFrame(this.heroFrame()); }
      else if (roll < 0.78) { this.maxHp += 3; this.hp += 3; label = `+3 ${t('maxhp')}`; frame = F.ring; }
      else if (roll < 0.9 && this.potions < 3) { this.potions++; label = `+1 ${t('potion')}`; frame = F.potion; }
      else { const v = 50 + this.floor * 15; this.addScore(v); label = `+${v}`; frame = F.coin; }
      const icon = this.add.image(x, y, 'mr', frame).setScale(SC).setDepth(30);
      this.tweens.add({ targets: icon, y: y - 90, scale: SC * 1.3, duration: 450, ease: 'Back.easeOut', onComplete: () => this.tweens.add({ targets: icon, alpha: 0, duration: 250, onComplete: () => icon.destroy() }) });
      fpopup(this, x, y - 110, label, '#3ee6ff', 22);
      this.sfx('item', { volume: 0.5, delay: 0.15 });
    }
    this.updateUi();
  }

  private damage(atk: number, def: number): { dmg: number; crit: boolean } {
    const crit = rng.chance(0.1);
    const dmg = Math.max(1, atk + rng.int(-1, 1) - def) * (crit ? 2 : 1);
    return { dmg, crit };
  }

  private heroAttack(m: Monster, dx: number, dy: number): void {
    const { dmg, crit } = this.damage(this.atk, m.def.def);
    m.hp -= dmg;
    this.tweens.add({ targets: this.hero, x: this.hero.x + dx * 22, y: this.hero.y + dy * 22, duration: 60, yoyo: true });
    m.img.setTintFill(0xffffff);
    this.time.delayedCall(80, () => { if (m.img.active) { m.img.clearTint(); if (m.boss) m.img.setTint(0xff9090); } });
    fpopup(this, m.img.x, m.img.y - 30, crit ? `${dmg}!` : String(dmg), crit ? '#ffd23f' : '#ffffff', crit ? 28 : 22);
    burst(this, m.img.x, m.img.y, [0xec3013, 0xffffff], crit ? 16 : 8, 180);
    this.sfx('hit', { volume: 0.5 });
    if (crit) shake(this, 0.006, 100);
    if (m.hp <= 0) {
      this.monsters.splice(this.monsters.indexOf(m), 1);
      const pts = m.def.score * (m.boss ? 1 : 1 + Math.floor(this.floor / 3));
      this.addScore(pts);
      this.sfx('kill', { volume: 0.5 });
      burst(this, m.img.x, m.img.y, [0xec3013, 0xffd23f, 0x5dff7a], m.boss ? 60 : 22, m.boss ? 420 : 260);
      fpopup(this, m.img.x, m.img.y - 70, `+${pts}`, '#ffd23f', 22);
      this.tweens.add({ targets: m.img, alpha: 0, scale: SC * 1.4, angle: 90, duration: 250, onComplete: () => m.img.destroy() });
      if (m.boss) {
        this.bossAlive = false;
        shake(this, 0.02, 400);
        softFlash(this, 0xffd23f, 300, 0.35);
        this.say(t('down'), '#5dff7a');
        this.sfx('stairs', { volume: 0.5 });
        // the guardian always drops a chest
        const img = this.add.image(m.img.x, m.img.y, 'mr', F.chest).setScale(SC).setDepth(3);
        this.items.push({ kind: 'chest', c: m.c, r: m.r, img });
      }
    } else if (!m.awake) m.awake = true;
  }

  private hurt(dmg: number, color = 0xec3013): void {
    this.hp -= dmg;
    this.sfx('hurt', { volume: 0.5 });
    shake(this, 0.012, 160);
    softFlash(this, color, 160, 0.25);
    this.hero.setTintFill(0xffffff);
    this.time.delayedCall(90, () => this.hero.active && this.hero.clearTint());
    fpopup(this, this.hero.x, this.hero.y - 30, `-${dmg}`, '#ec3013', 24);
    this.updateUi();
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.updateUi();
    burst(this, this.hero.x, this.hero.y, [0xec3013, 0x888888], 50, 360);
    this.tweens.add({ targets: this.hero, angle: 90, alpha: 0.3, duration: 400 });
    this.endGame({ delay: 1200 });
  }

  private endTurn(lock: number): void {
    this.turn++;
    this.busyUntil = this.time.now + lock;
    this.monstersAct();
    this.updateVision();
    this.updateUi();
  }

  private monstersAct(): void {
    for (const m of [...this.monsters]) {
      if (this.dead) return;
      if (!m.awake) continue;
      m.tick++;
      if (m.def.beh === 'slow' && m.tick % 2 === 0) continue;
      const dx = this.pc - m.c, dy = this.pr - m.r;
      const adjacent = Math.abs(dx) + Math.abs(dy) === 1;
      if (adjacent && !(m.def.beh === 'erratic' && rng.chance(0.25))) {
        // attack
        const { dmg, crit } = this.damage(m.atk, this.def);
        this.tweens.add({ targets: m.img, x: m.img.x + dx * 20, y: m.img.y + dy * 20, duration: 60, yoyo: true });
        this.sfx('hit', { volume: 0.35, rate: 0.8 });
        this.hurt(dmg);
        if (crit) shake(this, 0.02, 200);
        continue;
      }
      // pick a step: erratic monsters wander, others chase when they can see the hero
      let options: Array<[number, number]> = [];
      const far = Math.abs(dx) + Math.abs(dy) > 9;
      if (m.def.beh === 'erratic' && rng.chance(0.5) || far) options = rng.shuffle(Object.values(DIRS).map((d) => [d[0], d[1]] as [number, number]));
      else {
        const prim: Array<[number, number]> = [];
        if (dx) prim.push([Math.sign(dx), 0]);
        if (dy) prim.push([0, Math.sign(dy)]);
        if (Math.abs(dy) > Math.abs(dx)) prim.reverse();
        options = [...prim, ...rng.shuffle([[0, 1], [0, -1], [1, 0], [-1, 0]] as Array<[number, number]>).filter((o) => !prim.some((p) => p[0] === o[0] && p[1] === o[1]))].slice(0, prim.length + 1);
      }
      for (const [sx, sy] of options) {
        const nc = m.c + sx, nr = m.r + sy;
        if (!this.walkable(nc, nr) || this.monsterAt(nc, nr) || (nc === this.pc && nr === this.pr)) continue;
        if (m.boss && Math.hypot(nc - this.sc, nr - this.sr) > 3) continue;   // the guardian stays near the stairs
        m.c = nc; m.r = nr;
        if (sx) m.img.setFlipX(sx < 0);
        this.tweens.add({ targets: m.img, x: OX + nc * TS + TS / 2, y: OY + nr * TS + TS / 2, duration: 100 });
        break;
      }
    }
  }

  private descend(): void {
    this.busyUntil = this.time.now + 900;
    const bonus = 50 * this.floor;
    this.addScore(bonus);
    this.sfx('stairs', { volume: 0.6 });
    fpopup(this, this.hero.x, this.hero.y - 40, `+${bonus}`, '#5dff7a', 24);
    this.tweens.add({ targets: this.hero, scale: SC * 0.3, angle: 360, duration: 380 });
    this.cameras.main.fadeOut(380, 0, 0, 0);
    this.time.delayedCall(420, () => {
      if (this.isOver) return;
      this.floor++;
      this.hp = Math.min(this.maxHp, this.hp + 2);
      this.hero.setScale(SC).setAngle(0);
      this.buildFloor();
    });
  }

  private say(s: string, color: string): void {
    this.msg.setText(s).setColor(color).setAlpha(1).setScale(1.3);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({ targets: this.msg, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.msg, alpha: 0, delay: 2200, duration: 400 });
  }

  private updateUi(): void {
    const g = this.uiG;
    g.clear();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(24, 84, 262, 32, 8);
    const k = Math.max(0, this.hp) / this.maxHp;
    g.fillStyle(k > 0.5 ? 0x5dff7a : k > 0.25 ? 0xffd23f : 0xec3013, 1).fillRoundedRect(28, 88, 254 * k, 24, 6);
    this.hpText.setText(`${Math.max(0, this.hp)}/${this.maxHp}`);
    this.atkText.setText(String(this.atk));
    this.defText.setText(String(this.def));
    this.potionBtn.setText(`${t('potion')} ${this.potions}`);
    // health bars over wounded visible monsters
    for (const m of this.monsters) {
      if (m.hp >= m.maxHp || !this.vis[m.r]?.[m.c]) continue;
      const x = OX + m.c * TS + 8, y = OY + m.r * TS + 2;
      g.fillStyle(0x000000, 0.7).fillRect(x, y, TS - 16, 7);
      g.fillStyle(0xec3013, 1).fillRect(x + 1, y + 1, (TS - 18) * (m.hp / m.maxHp), 5);
    }
  }

  updateGame(_time: number, delta: number): void {
    // held direction keys repeat steps
    if (this.holdDir) {
      this.holdT -= delta / 1000;
      if (this.holdT <= 0) { this.holdT = 0.16; this.act(this.holdDir); }
    }
    // keep monster health bars glued to tweening sprites
    if (this.monsters.some((m) => m.hp < m.maxHp)) this.updateUi();
  }
}
