import Phaser from 'phaser';
import { getLang, upper } from './i18n';
import { txt } from './theme';
import { playSfx } from './audio';
import { storage, getBest } from './storage';
import { pushModal } from './modal';
import { isCharacterId, type CharacterId } from './characters';

// Player cards for table and board games: tap a seat or a nameplate to see who sits there and how
// their match goes; the local player also sees their lifetime record, kept in the core storage.
//
//   portraitKey(scene, 'ch-explorer-front', 0x3ec7e6)  -> a round portrait texture
//   openPlayerCard(scene, { name, color, portrait, bot, match: [...], lifetime: lifetimeRows(id) })
//   recordMatch(gameId, { won, score })                 -> once per finished match

export interface StatRow {
  label: string;
  value: string | number;
}

export interface PlayerCardInfo {
  name: string;
  /** Seat colour (ring, header). */
  color: number;
  /** Texture key of a round portrait (portraitKey); otherwise an initial avatar. */
  portrait?: string | null;
  /** The platform character id, when the player chose one. */
  character?: string | null;
  /** A bot seat: its difficulty name ('' for none). */
  bot?: string | false;
  you?: boolean;
  /** This match, as label/value rows. */
  match: StatRow[];
  /** All time (the local player only). */
  lifetime?: StatRow[];
}

export interface LifetimeStats {
  played: number;
  won: number;
  best: number;
}

const L: Record<'tr' | 'en', Record<string, string>> = {
  tr: {
    you: 'SEN', player: 'Oyuncu', bot: 'BOT', thisMatch: 'BU MAÇ', allTime: 'TÜM ZAMANLAR',
    played: 'Oynanan', won: 'Kazanılan', best: 'En iyi skor', close: 'Kapatmak için dışarı dokun · Esc', next: 'Tab: sıradaki oyuncu',
    adventurer: 'Maceracı', explorer: 'Kaşif', rookie: 'Çaylak', soldier: 'Asker', zombie: 'Zombi',
  },
  en: {
    you: 'YOU', player: 'Player', bot: 'BOT', thisMatch: 'THIS MATCH', allTime: 'ALL TIME',
    played: 'Played', won: 'Won', best: 'Best score', close: 'Tap outside to close · Esc', next: 'Tab: next player',
    adventurer: 'Adventurer', explorer: 'Explorer', rookie: 'Rookie', soldier: 'Soldier', zombie: 'Zombie',
  },
};
const s = (k: string) => L[getLang()][k] ?? L.en[k] ?? k;

/** A character's display name in the current language. */
export function characterName(id: CharacterId | string): string {
  return isCharacterId(id) ? s(id) : '';
}

// ---------- lifetime stats ----------
export function lifetimeStats(gameId: string): LifetimeStats {
  const v = storage.get<Partial<LifetimeStats>>(`stats:${gameId}`, {});
  return { played: v.played ?? 0, won: v.won ?? 0, best: Math.max(v.best ?? 0, getBest(gameId)) };
}

/** Records one finished match for the local player. */
export function recordMatch(gameId: string, r: { won: boolean; score: number }): LifetimeStats {
  const v = lifetimeStats(gameId);
  const next = { played: v.played + 1, won: v.won + (r.won ? 1 : 0), best: Math.max(v.best, r.score) };
  storage.set(`stats:${gameId}`, next);
  return next;
}

/** The lifetime rows for the card. */
export function lifetimeRows(gameId: string): StatRow[] {
  const v = lifetimeStats(gameId);
  return [
    { label: s('played'), value: v.played },
    { label: s('won'), value: v.won },
    { label: s('best'), value: v.best },
  ];
}

// ---------- portraits ----------
/**
 * A round portrait texture: the head and shoulders of a character pose (any 144x176 frame
 * from public/assets/characters) on a disc of the seat colour. Cached per source and colour.
 */
export function portraitKey(scene: Phaser.Scene, source: string, color: number, size = 128): string {
  const key = `portrait-${source}-${color.toString(16)}-${size}`;
  if (scene.textures.exists(key) || !scene.textures.exists(source)) return scene.textures.exists(key) ? key : '';
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return '';
  const c = tex.getContext();
  const r = size / 2;
  const col = Phaser.Display.Color.IntegerToColor(color);
  const g = c.createRadialGradient(r, r * 0.7, 4, r, r, r);
  g.addColorStop(0, `rgb(${Math.min(255, col.red + 70)},${Math.min(255, col.green + 70)},${Math.min(255, col.blue + 70)})`);
  g.addColorStop(1, `rgb(${col.red},${col.green},${col.blue})`);
  c.save();
  c.beginPath(); c.arc(r, r, r, 0, Math.PI * 2); c.closePath(); c.clip();
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  const img = scene.textures.get(source).getSourceImage() as HTMLImageElement;
  // the head and shoulders of the 144x176 frame
  const fw = img.width, fh = img.height;
  const sx = fw * 0.14, sy = fh * 0.03, sw = fw * 0.72, sh = sw;
  c.drawImage(img, sx, sy, sw, sh, size * 0.04, size * 0.1, size * 0.92, size * 0.92);
  c.restore();
  tex.refresh();
  return key;
}

/**
 * A round avatar: the portrait texture when there is one, else the name's initial on the seat
 * colour. Returns a container centred on (x, y).
 */
export function avatar(scene: Phaser.Scene, x: number, y: number, size: number, o: { portrait?: string | null; color: number; name: string; ring?: number }): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const r = size / 2;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillCircle(0, 4, r + 4);
  g.fillStyle(o.ring ?? o.color, 1).fillCircle(0, 0, r + 4);
  c.add(g);
  if (o.portrait && scene.textures.exists(o.portrait)) {
    c.add(scene.add.image(0, 0, o.portrait).setDisplaySize(size, size));
  } else {
    const d = scene.add.graphics();
    d.fillStyle(0x0b1020, 0.35).fillCircle(0, 0, r);
    d.fillStyle(o.color, 1).fillCircle(0, -2, r - 2);
    c.add(d);
    c.add(txt(scene, 0, 0, upper(o.name.trim()[0] ?? '?'), { title: true, size: Math.round(size * 0.48), strokeThickness: 0 }));
  }
  return c;
}

// ---------- the card ----------
const open = new WeakMap<Phaser.Scene, { close: () => void }>();

export function isPlayerCardOpen(scene: Phaser.Scene): boolean {
  return open.has(scene);
}

export function closePlayerCard(scene: Phaser.Scene): void {
  open.get(scene)?.close();
}

/**
 * Opens a player's card in the middle of the screen. It closes with a tap outside or Esc;
 * `onNext` (Tab or I) shows the next player's card instead.
 */
export function openPlayerCard(scene: Phaser.Scene, info: PlayerCardInfo, o: { onNext?: () => void; depth?: number } = {}): { close: () => void } {
  closePlayerCard(scene);
  const depth = o.depth ?? 9800;
  const W = scene.scale.width, H = scene.scale.height;
  const pw = Math.min(W - 40, 560);
  const rowsM = Math.ceil(info.match.length / 2);
  const rowsL = info.lifetime ? Math.ceil(info.lifetime.length / 3) : 0;
  const ph = 150 + 46 + rowsM * 58 + (rowsL ? 46 + rowsL * 64 : 0) + 56;
  const back = scene.add.rectangle(0, 0, W, H, 0x0b1020, 0.45).setOrigin(0).setInteractive().setDepth(depth).setScrollFactor(0);
  const box = scene.add.container(W / 2, H / 2).setDepth(depth + 1).setScrollFactor(0);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.32).fillRoundedRect(-pw / 2, -ph / 2 + 10, pw, ph, 30);
  g.fillStyle(0x151b30, 0.97).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 30);
  // a band of the seat colour behind the header
  g.fillStyle(info.color, 0.28).fillRoundedRect(-pw / 2, -ph / 2, pw, 128, { tl: 30, tr: 30, bl: 0, br: 0 });
  g.lineStyle(3, info.color, 0.9).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 30);
  box.add([g, scene.add.zone(0, 0, pw, ph).setInteractive()]);
  const top = -ph / 2;
  box.add(avatar(scene, -pw / 2 + 74, top + 68, 92, { portrait: info.portrait, color: info.color, name: info.name, ring: 0xffffff }));
  const nameX = -pw / 2 + 136;
  box.add(txt(scene, nameX, top + 48, info.name, { title: true, size: 32, color: '#ffffff' }).setOrigin(0, 0.5));
  const tags: string[] = [];
  if (info.you) tags.push(s('you'));
  if (info.bot !== undefined && info.bot !== false) tags.push(info.bot ? `${s('bot')} · ${info.bot}` : s('bot'));
  else if (!info.you) tags.push(s('player'));
  if (info.character && isCharacterId(info.character)) tags.push(characterName(info.character));
  box.add(txt(scene, nameX, top + 92, tags.join('  ·  '), { size: 22, color: info.bot !== undefined && info.bot !== false ? '#9fd0ff' : '#ffe08a' }).setOrigin(0, 0.5));

  // this match
  let y = top + 150;
  box.add(txt(scene, -pw / 2 + 28, y, s('thisMatch'), { title: true, size: 18, color: '#9aa4c4', strokeThickness: 0 }).setOrigin(0, 0.5));
  y += 34;
  const cell = (x: number, yy: number, w: number, r: StatRow) => {
    const cg = scene.add.graphics();
    cg.fillStyle(0xffffff, 0.06).fillRoundedRect(x, yy, w, 48, 16);
    box.add(cg);
    box.add(txt(scene, x + 16, yy + 24, r.label, { size: 20, color: '#c9d1ea', strokeThickness: 0 }).setOrigin(0, 0.5));
    box.add(txt(scene, x + w - 16, yy + 24, String(r.value), { title: true, size: 24, color: '#ffffff', strokeThickness: 0 }).setOrigin(1, 0.5));
  };
  const cw = (pw - 56 - 12) / 2;
  info.match.forEach((r, i) => cell(-pw / 2 + 28 + (i % 2) * (cw + 12), y + Math.floor(i / 2) * 58, cw, r));
  y += rowsM * 58;
  if (info.lifetime) {
    y += 12;
    box.add(txt(scene, -pw / 2 + 28, y, s('allTime'), { title: true, size: 18, color: '#9aa4c4', strokeThickness: 0 }).setOrigin(0, 0.5));
    y += 30;
    const lw = (pw - 56 - 24) / 3;
    info.lifetime.forEach((r, i) => {
      const x = -pw / 2 + 28 + (i % 3) * (lw + 12);
      const cg = scene.add.graphics();
      cg.fillStyle(0xffd23f, 0.1).fillRoundedRect(x, y, lw, 56, 16);
      box.add(cg);
      box.add(txt(scene, x + lw / 2, y + 18, r.label, { size: 17, color: '#e8d9a8', strokeThickness: 0 }));
      box.add(txt(scene, x + lw / 2, y + 40, String(r.value), { title: true, size: 22, color: '#ffd23f', strokeThickness: 0 }));
    });
    y += rowsL * 64;
  }
  box.add(txt(scene, 0, ph / 2 - 30, o.onNext ? `${s('close')}   ·   ${s('next')}` : s('close'), { size: 17, color: '#7f89a8', strokeThickness: 0 }));
  box.setScale(0.88).setAlpha(0);
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  back.setAlpha(0);
  scene.tweens.add({ targets: back, alpha: 1, duration: 160 });
  playSfx(scene, 'ui-click');

  const release = pushModal(scene);
  let closed = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') handle.close();
    else if ((e.code === 'Tab' || e.code === 'KeyI') && o.onNext) {
      // the next card replaces this one (openPlayerCard closes it)
      e.preventDefault?.();
      o.onNext();
    }
  };
  const handle = {
    close: () => {
      if (closed) return;
      closed = true;
      release();
      open.delete(scene);
      scene.input.keyboard?.off('keydown', onKey);
      scene.tweens.add({ targets: [box, back], alpha: 0, duration: 140, onComplete: () => { box.destroy(); back.destroy(); } });
    },
  };
  // on the next tick, so the key or tap that opened the card does not close it again
  setTimeout(() => { if (!closed) scene.input.keyboard?.on('keydown', onKey); }, 0);
  // a tap outside: down and up both on the backdrop (not the tap that opened the card)
  let downOnBack = false;
  back.on('pointerdown', () => { downOnBack = true; });
  back.on('pointerup', () => { if (downOnBack) handle.close(); });
  open.set(scene, handle);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { closed = true; open.delete(scene); release(); scene.input.keyboard?.off('keydown', onKey); });
  return handle;
}
