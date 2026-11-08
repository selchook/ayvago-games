import Phaser from 'phaser';
import { net } from './net';
import { getLang } from './i18n';
import { txt } from './theme';
import { playSfx } from './audio';
import { loadSfx } from './assets';
import { pushModal } from './modal';

// Quick chat for online games: a fixed list of phrases. Only the phrase id goes over the wire
// (`__qc` { id }), so there is no free text and nothing to moderate; every player reads the phrase
// in their own language. The sender's seat comes from the platform (`from`), never the payload.
// Solo, the player's own bubble shows and bots answer now and then.
//
//   preload:     loadQuickChat(scene.load)
//   createGame:  this.chat = quickChat(this, { seatAnchor: (seat) => ({ x, y, dir }), button: { x, y } })
//   bots (solo): this.chat.botSay(seat, 'welldone')   // rare by design: chance + shared cooldown

export interface QuickPhrase {
  id: string;
  tr: string;
  en: string;
  emoji?: string;
}

export const QUICK_PHRASES: readonly QuickPhrase[] = [
  { id: 'hello', tr: 'Merhaba', en: 'Hello', emoji: '👋' },
  { id: 'gg', tr: 'İyi oyunlar', en: 'Good game', emoji: '🤝' },
  { id: 'hurry', tr: 'Hızlı lütfen', en: 'Hurry up please', emoji: '⏳' },
  { id: 'welldone', tr: 'Tebrikler', en: 'Well done', emoji: '👏' },
  { id: 'thanks', tr: 'Teşekkürler', en: 'Thanks', emoji: '🙏' },
  { id: 'lucky', tr: 'Şanslısın', en: 'Lucky you', emoji: '🍀' },
  { id: 'ohno', tr: 'Ah be!', en: 'Oh no!', emoji: '😩' },
  { id: 'moment', tr: 'Bir dakika', en: 'One moment', emoji: '✋' },
  { id: 'nice', tr: 'Güzel hamle', en: 'Nice move', emoji: '👌' },
  { id: 'rematch', tr: 'Rövanş?', en: 'Rematch?', emoji: '🔁' },
  { id: 'haha', tr: 'Haha', en: 'Haha', emoji: '😄' },
  { id: 'thumbs', tr: '', en: '', emoji: '👍' },
];

export type QuickPhraseId = (typeof QUICK_PHRASES)[number]['id'];

/** One message per this many ms from a player. */
export const QUICK_CHAT_COOLDOWN = 1500;
/** Received messages closer than this from one seat are dropped (some slack for latency jitter). */
const RECEIVE_GAP = 1100;
/** Bots speak at most this often (solo). */
const BOT_GAP = 9000;
const BUBBLE_MS = 2500;
const MSG = '__qc';

/** Solo: what a bot may answer to the player's phrase. */
const REPLIES: Record<string, string[]> = {
  hello: ['hello', 'hello', 'gg'],
  gg: ['gg', 'thanks'],
  hurry: ['moment', 'moment', 'ohno'],
  welldone: ['thanks', 'thanks', 'thumbs'],
  thanks: ['thumbs', 'haha'],
  lucky: ['haha', 'thanks'],
  ohno: ['haha', 'lucky'],
  moment: ['thumbs'],
  nice: ['thanks', 'thumbs'],
  rematch: ['thumbs', 'gg'],
  haha: ['haha', 'thumbs'],
  thumbs: ['thumbs', 'haha'],
};

const UI: Record<'tr' | 'en', Record<string, string>> = {
  tr: { title: 'HIZLI SOHBET', wait: 'Biraz bekle…' },
  en: { title: 'QUICK CHAT', wait: 'Wait a moment…' },
};

export function phraseOf(id: string): QuickPhrase | undefined {
  return QUICK_PHRASES.find((p) => p.id === id);
}

/** The phrase in the current language, with its emoji ("👋 Merhaba"). */
export function phraseText(id: string): string {
  const p = phraseOf(id);
  if (!p) return '';
  const words = p[getLang()] || p.en;
  return [p.emoji, words].filter(Boolean).join(' ');
}

/** Loads the bubble's pop sound (call in preload; without it the core click plays). */
export function loadQuickChat(load: Phaser.Loader.LoaderPlugin): void {
  loadSfx(load, 'qc-pop', 'sfx-interface/audio/pluck_001');
}

export interface SeatAnchor {
  x: number;
  y: number;
  /** Where the bubble opens from the anchor; default: below near the top of the screen, else above. */
  dir?: 'up' | 'down' | 'left' | 'right';
}

export interface QuickChatOptions {
  /** Screen point of a seat (the seat numbering of `net.playerIndex`; solo: the game's seats). */
  seatAnchor: (seat: number) => SeatAnchor | null | undefined;
  /** The chat button. */
  button: { x: number; y: number; size?: number };
  /** This player's seat; default `net.playerIndex` (0 solo). */
  mySeat?: number | (() => number);
  /** Solo: seats played by bots, which may answer the player's phrases. */
  bots?: number[] | (() => number[]);
  /** Depth of the button and bubbles (the panel sits above). Default 9300. */
  depth?: number;
  /** Key that opens the panel; default 'C' (false: none). */
  key?: string | false;
  /** Called for every phrase shown (own, received or a bot's). */
  onPhrase?: (seat: number, id: string) => void;
}

export interface QuickChat {
  readonly isOpen: boolean;
  readonly button: Phaser.GameObjects.Container;
  open(): void;
  close(): void;
  /** Sends a phrase as this player (rate-limited); false when it was not sent. */
  send(id: string): boolean;
  /** Shows a bubble at a seat without sending anything. */
  say(seat: number, id: string): void;
  /**
   * Solo bots: shows a bot's phrase after a short, human-like pause, with probability `chance`,
   * at most once every few seconds across all bots. Ignored online. Returns true when it will speak.
   */
  botSay(seat: number, id: string, chance?: number): boolean;
  /** Seconds left before the player may send again (0 when ready). */
  cooldown(): number;
}

/** Adds quick chat to a play scene. Listeners and objects go away with the scene. */
export function quickChat(scene: Phaser.Scene, o: QuickChatOptions): QuickChat {
  const depth = o.depth ?? 9300;
  const size = o.button.size ?? 76;
  const mySeat = () => (typeof o.mySeat === 'function' ? o.mySeat() : o.mySeat ?? net.playerIndex);
  const bots = () => (typeof o.bots === 'function' ? o.bots() : o.bots ?? []);
  const bubbles = new Map<number, Phaser.GameObjects.Container>();
  const lastFrom = new Map<number, number>();
  let lastSent = -Infinity;
  let lastBot = -Infinity;
  let panel: Phaser.GameObjects.Container | null = null;
  let release: (() => void) | null = null;
  let focus = 0;
  let chips: Array<{ id: string; box: Phaser.GameObjects.Container; paint: (on: boolean) => void }> = [];
  let alive = true;

  // ---------- the button: a round glass button with a drawn speech bubble ----------
  const btn = scene.add.container(o.button.x, o.button.y).setDepth(depth).setScrollFactor(0);
  const bg = scene.add.graphics();
  const ring = scene.add.graphics();
  const drawButton = (hover: boolean) => {
    const r = size / 2;
    bg.clear();
    bg.fillStyle(0x000000, 0.3).fillCircle(0, 4, r);
    bg.fillStyle(hover ? 0x1d2a4a : 0x0b1020, 0.72).fillCircle(0, 0, r);
    bg.lineStyle(2, 0xffffff, 0.4).strokeCircle(0, 0, r);
    // speech bubble with three dots
    const w = r * 1.05, h = r * 0.78;
    bg.fillStyle(0xffffff, 1).fillRoundedRect(-w / 2, -h / 2 - 3, w, h, h * 0.42);
    bg.fillTriangle(-w * 0.22, h / 2 - 5, -w * 0.02, h / 2 - 5, -w * 0.3, h / 2 + 9);
    bg.fillStyle(0x0b1020, 1);
    for (let i = -1; i <= 1; i++) bg.fillCircle(i * w * 0.24, -3, Math.max(2.5, r * 0.08));
  };
  drawButton(false);
  btn.add([bg, ring]);
  btn.setSize(size, size).setInteractive({ useHandCursor: true });
  btn.on('pointerover', () => drawButton(true));
  btn.on('pointerout', () => drawButton(false));
  btn.on('pointerdown', () => scene.tweens.add({ targets: btn, scale: 0.92, duration: 70 }));
  btn.on('pointerup', () => {
    scene.tweens.add({ targets: btn, scale: 1, duration: 200, ease: 'Back.easeOut' });
    if (panel) close();
    else open();
  });

  const now = () => Date.now();
  const cooldown = () => Math.max(0, (lastSent + QUICK_CHAT_COOLDOWN - now()) / 1000);

  // cooldown ring around the button
  const tick = () => {
    if (!alive) return;
    ring.clear();
    const left = cooldown();
    if (left > 0) {
      const f = left / (QUICK_CHAT_COOLDOWN / 1000);
      ring.lineStyle(5, 0xffd23f, 0.95).beginPath()
        .arc(0, 0, size / 2 + 5, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2).strokePath();
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);

  // ---------- bubbles ----------
  function say(seat: number, id: string): void {
    if (!alive || !phraseOf(id)) return;
    const a = o.seatAnchor(seat);
    if (!a) return;
    const W = scene.scale.width, H = scene.scale.height;
    bubbles.get(seat)?.destroy();
    const label = txt(scene, 0, 0, phraseText(id), { size: 26, color: '#1b1d2e', strokeThickness: 0, shadow: false });
    const bw = Math.max(76, label.width + 40), bh = 56, tail = 14;
    const dir = a.dir ?? (a.y < H * 0.3 ? 'down' : 'up');
    // the bubble's centre, kept on screen; the tail points at the anchor
    let cx = a.x, cy = a.y;
    if (dir === 'up') cy = a.y - tail - bh / 2;
    else if (dir === 'down') cy = a.y + tail + bh / 2;
    else if (dir === 'left') cx = a.x - tail - bw / 2;
    else cx = a.x + tail + bw / 2;
    cx = Phaser.Math.Clamp(cx, bw / 2 + 8, W - bw / 2 - 8);
    cy = Phaser.Math.Clamp(cy, bh / 2 + 8, H - bh / 2 - 8);
    const g = scene.add.graphics();
    const draw = (fill: number, alpha: number, dy: number) => {
      g.fillStyle(fill, alpha).fillRoundedRect(-bw / 2, -bh / 2 + dy, bw, bh, bh / 2);
      const tx = Phaser.Math.Clamp(a.x - cx, -bw / 2 + 22, bw / 2 - 22), ty = Phaser.Math.Clamp(a.y - cy, -bh / 2 + 16, bh / 2 - 16);
      if (dir === 'up') g.fillTriangle(tx - 11, bh / 2 - 2 + dy, tx + 11, bh / 2 - 2 + dy, tx, bh / 2 + tail + dy);
      else if (dir === 'down') g.fillTriangle(tx - 11, -bh / 2 + 2 + dy, tx + 11, -bh / 2 + 2 + dy, tx, -bh / 2 - tail + dy);
      else if (dir === 'left') g.fillTriangle(bw / 2 - 2, ty - 11 + dy, bw / 2 - 2, ty + 11 + dy, bw / 2 + tail, ty + dy);
      else g.fillTriangle(-bw / 2 + 2, ty - 11 + dy, -bw / 2 + 2, ty + 11 + dy, -bw / 2 - tail, ty + dy);
    };
    draw(0x000000, 0.28, 5);
    draw(0xffffff, 1, 0);
    g.lineStyle(2, 0xffd23f, 0.9).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    const c = scene.add.container(cx, cy, [g, label]).setDepth(depth + 1).setScrollFactor(0).setScale(0.2).setAlpha(0);
    bubbles.set(seat, c);
    scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: c, y: cy - 4, duration: 900, yoyo: true, repeat: 1, ease: 'Sine.easeInOut', delay: 260 });
    scene.tweens.add({
      targets: c, alpha: 0, scale: 0.85, delay: BUBBLE_MS, duration: 260,
      onComplete: () => { if (bubbles.get(seat) === c) bubbles.delete(seat); c.destroy(); },
    });
    playSfx(scene, scene.cache.audio.exists('qc-pop') ? 'qc-pop' : 'ui-select', { volume: 0.55 });
    o.onPhrase?.(seat, id);
  }

  function botSay(seat: number, id: string, chance = 1): boolean {
    if (!alive || net.active || !phraseOf(id)) return false;
    if (now() - lastBot < BOT_GAP || Math.random() > chance) return false;
    lastBot = now();
    scene.time.delayedCall(Phaser.Math.Between(700, 1500), () => say(seat, id));
    return true;
  }

  function send(id: string): boolean {
    if (!alive || !phraseOf(id)) return false;
    if (cooldown() > 0) {
      scene.tweens.add({ targets: btn, x: btn.x + 6, duration: 50, yoyo: true, repeat: 2 });
      return false;
    }
    lastSent = now();
    if (net.active) net.send(MSG, { id });
    say(mySeat(), id);
    // solo: a bot may answer (rarely, and never two at once)
    if (!net.active) {
      const pool = bots();
      const answers = REPLIES[id];
      if (pool.length && answers && now() - lastBot >= BOT_GAP && Math.random() < 0.6) {
        lastBot = now();
        const seat = pool[Math.floor(Math.random() * pool.length)];
        const reply = answers[Math.floor(Math.random() * answers.length)];
        scene.time.delayedCall(Phaser.Math.Between(900, 1700), () => say(seat, reply));
      }
    }
    return true;
  }

  // ---------- receiving ----------
  net.onScene(scene, MSG, (data: unknown, from: number) => {
    const id = (data as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || !phraseOf(id)) return;
    if (!Number.isInteger(from) || from === mySeat()) return;
    const t = now();
    if (t - (lastFrom.get(from) ?? -Infinity) < RECEIVE_GAP) return;
    lastFrom.set(from, t);
    say(from, id);
  });

  // ---------- the phrase panel ----------
  function open(): void {
    if (panel || !alive) return;
    const W = scene.scale.width, H = scene.scale.height;
    const cols = W > H ? 3 : 2;
    const rows = Math.ceil(QUICK_PHRASES.length / cols);
    const cw = cols === 3 ? 268 : 300, ch = 84, gap = 14;
    const pw = cols * cw + (cols - 1) * gap + 48, ph = rows * ch + (rows - 1) * gap + 112;
    const back = scene.add.rectangle(0, 0, W, H, 0x0b1020, 0.5).setOrigin(0).setInteractive();
    let downOnBack = false;
    back.on('pointerdown', () => { downOnBack = true; });
    back.on('pointerup', () => { if (downOnBack) close(); });
    const card = scene.add.graphics();
    card.fillStyle(0x000000, 0.3).fillRoundedRect(-pw / 2, -ph / 2 + 10, pw, ph, 30);
    card.fillStyle(0x151b30, 0.97).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 30);
    card.lineStyle(2, 0xffffff, 0.14).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 30);
    const swallow = scene.add.zone(0, 0, pw, ph).setInteractive();
    const title = txt(scene, 0, -ph / 2 + 40, UI[getLang()].title, { title: true, size: 26, color: '#ffd23f' });
    const box = scene.add.container(W / 2, H / 2, [card, swallow, title]);
    chips = [];
    QUICK_PHRASES.forEach((p, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = -pw / 2 + 24 + cw / 2 + col * (cw + gap);
      const y = -ph / 2 + 84 + ch / 2 + row * (ch + gap);
      const g = scene.add.graphics();
      const paint = (on: boolean) => {
        g.clear();
        g.fillStyle(0x000000, 0.25).fillRoundedRect(-cw / 2, -ch / 2 + 4, cw, ch, ch / 2);
        g.fillStyle(on ? 0x2f6fd8 : 0x24304f, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, ch / 2);
        g.lineStyle(on ? 3 : 2, on ? 0xffd23f : 0xffffff, on ? 1 : 0.18).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, ch / 2);
      };
      paint(false);
      const label = txt(scene, 0, 0, phraseText(p.id), { size: p.tr ? 26 : 38, color: '#ffffff', strokeThickness: 0 });
      const chip = scene.add.container(x, y, [g, label]).setSize(cw, ch).setInteractive({ useHandCursor: true });
      chip.on('pointerover', () => { focus = i; paintAll(); });
      chip.on('pointerdown', () => scene.tweens.add({ targets: chip, scale: 0.95, duration: 60 }));
      chip.on('pointerout', () => scene.tweens.add({ targets: chip, scale: 1, duration: 120 }));
      chip.on('pointerup', () => pick(p.id));
      box.add(chip);
      chips.push({ id: p.id, box: chip, paint });
    });
    box.setDepth(depth + 10).setScrollFactor(0).setScale(0.9).setAlpha(0);
    back.setDepth(depth + 9).setScrollFactor(0);
    scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    panel = scene.add.container(0, 0, [back, box]).setDepth(depth + 9).setScrollFactor(0);
    release = pushModal(scene);
    focus = Math.min(focus, chips.length - 1);
    paintAll();
    playSfx(scene, 'ui-click');
  }

  function paintAll(): void {
    chips.forEach((c, i) => c.paint(i === focus));
  }

  function pick(id: string): void {
    if (cooldown() > 0) {
      const w = txt(scene, scene.scale.width / 2, scene.scale.height / 2, UI[getLang()].wait, { size: 28, color: '#ffd23f' }).setDepth(depth + 20);
      scene.tweens.add({ targets: w, alpha: 0, y: w.y - 30, delay: 500, duration: 400, onComplete: () => w.destroy() });
      return;
    }
    close();
    send(id);
  }

  function close(): void {
    if (!panel) return;
    const p = panel;
    panel = null;
    chips = [];
    release?.();
    release = null;
    scene.tweens.add({ targets: p, alpha: 0, duration: 140, onComplete: () => p.destroy() });
  }

  // ---------- keys ----------
  const key = o.key === false ? null : (o.key ?? 'C').toUpperCase();
  const onKey = (e: KeyboardEvent) => {
    if (!alive) return;
    if (!panel) {
      if (key && e.key.toUpperCase() === key && !e.repeat) open();
      return;
    }
    const cols = scene.scale.width > scene.scale.height ? 3 : 2;
    const n = QUICK_PHRASES.length;
    if (e.code === 'Escape' || (key && e.key.toUpperCase() === key)) close();
    else if (e.code === 'ArrowRight') focus = (focus + 1) % n;
    else if (e.code === 'ArrowLeft') focus = (focus - 1 + n) % n;
    else if (e.code === 'ArrowDown') focus = Math.min(n - 1, focus + cols);
    else if (e.code === 'ArrowUp') focus = Math.max(0, focus - cols);
    else if (e.code === 'Enter' || e.code === 'Space') { pick(QUICK_PHRASES[focus].id); return; }
    paintAll();
  };
  scene.input.keyboard?.on('keydown', onKey);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    alive = false;
    release?.();
    scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
    scene.input.keyboard?.off('keydown', onKey);
  });

  return {
    get isOpen() { return panel !== null; },
    button: btn,
    open,
    close,
    send,
    say,
    botSay,
    cooldown,
  };
}
