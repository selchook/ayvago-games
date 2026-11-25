// The menu theme on the pause overlay and the result screen (src/core/menu-theme.ts): the vignette
// and rope over the frozen round, a card (the how-to's parchment, the skin's board or the game's
// painter) with the emblem on its top edge, headings and labels in the display face, the skin's
// buttons, the score counting up in painted digits and NEW BEST on a ribbon.
// Cost: every texture here is painted in Boot under the Ayvago intro (`prebakeOverlays`), so
// opening the pause or the result screen only places images: no text is rasterised, no canvas
// is painted or uploaded, no masks or tile sprites. The pause answers at once (its buttons take
// taps from the first frame, the entrance is cosmetic) and resume never waits for a tween.
import Phaser from 'phaser';
import { currentGame, isLandscape } from './registry';
import { net } from './net';
import { t } from './i18n';
import { burst } from './fx';
import {
  bake, canvas2d, css, hash, labelTexture, menuTheme, notesTexture, placeLabel, frameBorder, ropeBorder, shadeColor, skinTexture, themeLabel, themeShade,
  SkinButton, ThemeNumber, SKIN_PAD, type LabelStyle, type MenuTheme, type OverlayStyle, type SkinState,
} from './menu-theme';

/** The theme the pause and result screens wear, or null (plain screens; online results stay plain). */
export function overlayTheme(): MenuTheme | null {
  const theme = menuTheme();
  if (!theme || theme.overlays === false || net.active) return null;
  return theme;
}

const style = (theme: MenuTheme): OverlayStyle => (theme.overlays || {});
const ink = (theme: MenuTheme): string => style(theme).ink ?? theme.palette.body;
const AD_COLOR = 0x2f6b4a;

// ------------------------------------------------------------------ the layouts

interface Box { x: number; y: number; w: number; h: number }

/** Where everything goes, per orientation (game units; the game is 720 x 1280 or 1280 x 720). */
function layout(land: boolean) {
  return land ? {
    pause: { card: { x: 640, y: 360, w: 520, h: 660 } as Box, emblem: null as null | { y: number; size: number }, head: 150, headSize: 64, buttons: [270, 385, 500], sound: null as null | number },
    result: {
      card: { x: 640, y: 362, w: 940, h: 640 } as Box, emblem: null as null | { y: number; size: number },
      head: 118, headSize: 72, easy: 172, scoreLabel: 212, score: 274, scoreSize: 84, best: 344, ribbon: 412,
      buttons: 568, side: 420, offerY: 556, offerSide: 300, offerW: 270, adW: 300,
    },
  } : {
    pause: { card: { x: 360, y: 640, w: 540, h: 760 }, emblem: { y: 268, size: 170 }, head: 410, headSize: 76, buttons: [540, 664, 784], sound: 904 },
    result: {
      card: { x: 360, y: 610, w: 640, h: 880 }, emblem: { y: 176, size: 150 },
      head: 306, headSize: 84, easy: 366, scoreLabel: 412, score: 490, scoreSize: 100, best: 574, ribbon: 648,
      buttons: 772, side: 0, offerY: 772, offerSide: 150, offerW: 280, adW: 460,
    },
  };
}

// label styles (shared by the screens and the prebake, so the keys match)
/** The style of a result heading (loss or win) as the result screen paints it: a game's own panel can reuse the painted texture. */
export function overlayHeadingStyle(win: boolean): LabelStyle {
  const theme = menuTheme()!;
  const size = layout(isLandscape()).result.headSize;
  return win ? winStyle(theme, size) : headStyle(theme, size);
}
const headStyle = (theme: MenuTheme, size: number): LabelStyle => ({ size, color: style(theme).lose ?? theme.palette.heading, stroke: null, shadow: false });
const winStyle = (theme: MenuTheme, size: number): LabelStyle => ({
  size, fill: ['#fff7c8', style(theme).win ?? theme.palette.accent, '#c07a10'], stroke: theme.palette.labelStroke,
});
const inkStyle = (theme: MenuTheme, size: number): LabelStyle => ({ size, color: ink(theme), stroke: null, shadow: false });
const scoreStyle = (theme: MenuTheme): LabelStyle => ({ size: 100, fill: ['#fff7c8', theme.palette.accent, '#d08a18'], stroke: theme.palette.labelStroke, strokeWidth: 12 });
const noteStyle = (theme: MenuTheme): LabelStyle => ({ size: 24, color: ink(theme), stroke: null, shadow: false, body: true });
const easyStyle = (theme: MenuTheme): LabelStyle => ({ size: 30, color: '#7dff96', stroke: theme.palette.labelStroke });
const BTN = { big: 48, pause: 50, small: 42, row: 38, ad: 40 };

// ------------------------------------------------------------------ painted pieces

/** The card behind the content (cached): the theme's choice, falling back to the skin's board. */
function cardTexture(scene: Phaser.Scene, w: number, h: number): string {
  const theme = menuTheme()!;
  const card = style(theme).card ?? (theme.frame?.notes ? 'notes' : 'board');
  if (card === 'notes') return notesTexture(scene, w, h) ?? skinTexture(scene, 'board', w, h);
  if (card === 'board') return skinTexture(scene, 'board', w, h);
  w = Math.round(w); h = Math.round(h);
  return bake(scene, `mt-card-${w}x${h}`, w + SKIN_PAD * 2, h + SKIN_PAD * 3, (c) => {
    c.translate(SKIN_PAD, SKIN_PAD);
    card(c, w, h);
  });
}

/** The theme's card (the overlays' panel) as an image centred on (x, y); declare its size in `cards`. */
export function themeCard(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y + SKIN_PAD / 2, cardTexture(scene, w, h));
}

/** The emblem with a soft drop shadow (cached), or null when the theme has none. */
function emblemTexture(scene: Phaser.Scene, size: number): string | null {
  const theme = menuTheme()!;
  const o = style(theme);
  const draw = o.emblem === null ? null : o.emblem ?? theme.logo.emblem?.draw ?? null;
  if (!draw) return null;
  const pad = 16;
  return bake(scene, `mt-emblem-${size}-${hash(String(draw))}`, size + pad * 2, size + pad * 2, (c) => {
    const em = canvas2d(size, size);
    draw(em, size);
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 12; c.shadowOffsetY = 5;
    c.drawImage(em.canvas, pad, pad);
  });
}

/**
 * The NEW BEST ribbon (cached per text): a band in the primary colour with gold edges, its two
 * swallow-tailed ends folded behind, the text in gold on it.
 */
function ribbonTexture(scene: Phaser.Scene, text: string): string {
  const theme = menuTheme()!;
  const P = theme.palette;
  const lbl: LabelStyle = { size: 44, fill: ['#fff7c8', P.accent, '#d08a18'], stroke: P.labelStroke };
  const ready = typeof document.fonts?.check !== 'function' || document.fonts.check(`32px "${theme.font}"`, text);
  const probe = canvas2d(1, 1);
  probe.font = `${Math.round(44 * (theme.fontScale ?? 1))}px "${theme.font}", serif`;
  const tw = Math.ceil(probe.measureText(text).width);
  const bandW = Math.max(300, tw + 120), bandH = 76, tailW = 74, drop = 18, pad = 14;
  const W = bandW + (tailW - 26) * 2 + pad * 2, H = bandH + drop + pad * 2 + 6;
  const key = `mt-ribbon-${hash(text)}${ready ? '' : '-fallback'}`;
  return bake(scene, key, W, H, (c) => {
    const bx = pad + tailW - 26, by = pad, red = P.primary;
    const th = bandH * 0.84, ty = by + drop + bandH - th;
    // the tails, behind: darker, notched at the outer ends
    for (const s of [1, -1]) {
      c.save();
      if (s < 0) { c.translate(W, 0); c.scale(-1, 1); }
      c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 8; c.shadowOffsetY = 4;
      const g = c.createLinearGradient(0, ty, 0, ty + th);
      g.addColorStop(0, css(shadeColor(red, -0.25))); g.addColorStop(1, css(shadeColor(red, -0.5)));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(pad, ty); c.lineTo(pad + tailW, ty); c.lineTo(pad + tailW, ty + th); c.lineTo(pad, ty + th); c.lineTo(pad + 22, ty + th / 2);
      c.closePath(); c.fill();
      c.shadowColor = 'transparent';
      c.strokeStyle = css(shadeColor(red, -0.75)); c.lineWidth = 2.5; c.stroke();
      c.strokeStyle = css(P.trim, 0.8); c.lineWidth = 2;
      c.beginPath(); c.moveTo(pad + 8, ty + 7); c.lineTo(pad + tailW, ty + 7); c.moveTo(pad + 8, ty + th - 7); c.lineTo(pad + tailW, ty + th - 7); c.stroke();
      // the fold where the tail turns under the band
      c.fillStyle = css(shadeColor(red, -0.7));
      c.beginPath(); c.moveTo(bx, by + bandH); c.lineTo(bx + 26, by + bandH); c.lineTo(bx + 26, ty + th); c.closePath(); c.fill();
      c.restore();
    }
    // the band
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
    const g = c.createLinearGradient(0, by, 0, by + bandH);
    g.addColorStop(0, css(shadeColor(red, 0.22))); g.addColorStop(0.5, css(red)); g.addColorStop(1, css(shadeColor(red, -0.35)));
    c.fillStyle = g;
    c.fillRect(bx, by, bandW, bandH);
    c.restore();
    c.fillStyle = 'rgba(255,240,210,0.18)'; c.fillRect(bx, by + 3, bandW, 4);
    c.strokeStyle = css(P.trim); c.lineWidth = 3;
    c.beginPath(); c.moveTo(bx, by + 9); c.lineTo(bx + bandW, by + 9); c.moveTo(bx, by + bandH - 9); c.lineTo(bx + bandW, by + bandH - 9); c.stroke();
    c.strokeStyle = css(shadeColor(red, -0.75)); c.lineWidth = 2.5; c.strokeRect(bx, by, bandW, bandH);
    // the words: painted through a label texture's painter, centred on the band
    const lk = labelTexture(scene, text, lbl);
    const src = scene.textures.get(lk).getSourceImage() as HTMLCanvasElement;
    const oy = (scene.textures.get(lk).customData as { originY: number }).originY;
    c.drawImage(src, W / 2 - src.width / 2, by + bandH / 2 - src.height * oy);
  });
}

/** The small "AD" tag for the rewarded button: a brass plate with a play mark (cached per text). */
function adTagTexture(scene: Phaser.Scene, text: string): string {
  const theme = menuTheme()!;
  const lk = labelTexture(scene, text, { size: 24, color: theme.palette.labelStroke, stroke: null, shadow: false });
  const src = scene.textures.get(lk).getSourceImage() as HTMLCanvasElement;
  const oy = (scene.textures.get(lk).customData as { originY: number }).originY;
  const w = src.width + 34, h = 36, pad = 6;
  return bake(scene, `mt-adtag-${hash(text)}-${src.width}`, w + pad * 2, h + pad * 2 + 3, (c) => {
    const trim = theme.palette.trim;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 5; c.shadowOffsetY = 3;
    const g = c.createLinearGradient(0, pad, 0, pad + h);
    g.addColorStop(0, css(shadeColor(trim, 0.45))); g.addColorStop(0.5, css(trim)); g.addColorStop(1, css(shadeColor(trim, -0.35)));
    c.fillStyle = g;
    c.beginPath(); c.roundRect(pad, pad, w, h, 8); c.fill();
    c.restore();
    c.strokeStyle = css(shadeColor(trim, -0.7)); c.lineWidth = 2;
    c.beginPath(); c.roundRect(pad, pad, w, h, 8); c.stroke();
    c.fillStyle = theme.palette.labelStroke;
    c.beginPath(); c.moveTo(pad + 10, pad + h / 2 - 7); c.lineTo(pad + 10, pad + h / 2 + 7); c.lineTo(pad + 22, pad + h / 2); c.closePath(); c.fill();
    c.drawImage(src, pad + 26, pad + h / 2 - src.height * oy);
  });
}

/** Paints the textures for the rewarded-ad button and its tag and notes. */
function prebakeAds(scene: Phaser.Scene, theme: MenuTheme, land: boolean): void {
  const R = layout(land).result;
  const adColor = style(theme).adColor ?? AD_COLOR;
  for (const st of ['up', 'over', 'down'] as SkinState[]) {
    skinTexture(scene, 'button', R.adW, 110, st, adColor);
    skinTexture(scene, 'button', R.offerW, 96, st, theme.palette.primary);
    skinTexture(scene, 'button', R.offerW, 96, st);
  }
  for (const k of ['adContinue', 'adDouble']) labelTexture(scene, t(k), { size: BTN.ad });
  for (const k of ['retry', 'menu']) labelTexture(scene, t(k), { size: BTN.row });
  adTagTexture(scene, t('adBadge'));
  for (const k of ['adContinueNote', 'adDoubleNote', 'adFailed']) labelTexture(scene, t(k), noteStyle(theme));
  labelTexture(scene, t('adDoubled'), { ...winStyle(theme, 34) });
}

/**
 * Paints, under the Ayvago intro, every texture the themed pause and result screens use (in the
 * current language): the shade, the cards, the emblem, the buttons, the labels, the digits and the
 * ribbon. Opening them then only places images.
 */
export function prebakeOverlays(scene: Phaser.Scene): void {
  const theme = overlayTheme();
  if (!theme) return;
  const def = currentGame();
  const land = isLandscape();
  const L = layout(land), o = style(theme), P = theme.palette;
  themeShadeKey(scene, theme);
  for (const box of [L.pause.card, L.result.card]) cardTexture(scene, box.w, box.h);
  for (const c of theme.cards ?? []) cardTexture(scene, c.w, c.h);
  if (L.pause.emblem) emblemTexture(scene, L.pause.emblem.size);
  if (L.result.emblem) emblemTexture(scene, L.result.emblem.size);
  for (const st of ['up', 'over', 'down'] as SkinState[]) {
    skinTexture(scene, 'button', 380, 104, st, P.primary);
    skinTexture(scene, 'button', 360, 96, st);
  }
  // the pause
  labelTexture(scene, t('paused'), headStyle(theme, L.pause.headSize));
  labelTexture(scene, t('resume'), { size: BTN.pause });
  for (const k of ['retry', 'menu']) labelTexture(scene, t(k), { size: BTN.small });
  // the result
  labelTexture(scene, t('retry'), { size: BTN.big });
  labelTexture(scene, t('gameOver'), headStyle(theme, L.result.headSize));
  labelTexture(scene, t('youWin'), winStyle(theme, L.result.headSize));
  for (const k of o.titles ?? []) {
    labelTexture(scene, t(k), headStyle(theme, L.result.headSize));
    labelTexture(scene, t(k), winStyle(theme, L.result.headSize));
  }
  labelTexture(scene, t('score'), inkStyle(theme, 38));
  labelTexture(scene, t('best') + ':', inkStyle(theme, 34));
  labelTexture(scene, t('diffEasy'), easyStyle(theme));
  digitTextureFor(scene, scoreStyle(theme));
  digitTextureFor(scene, inkStyle(theme, 34));
  ribbonTexture(scene, t('newBest'));
  if (def.ads) prebakeAds(scene, theme, land);
}

function themeShadeKey(scene: Phaser.Scene, theme: MenuTheme): Phaser.GameObjects.Image {
  // painted once through the menu's shade (the image is thrown away; the texture stays)
  const img = themeShade(scene, style(theme).vignette ?? theme.frame?.vignette ?? 0.6, style(theme).dim ?? 0.6);
  img.destroy();
  return img;
}

function digitTextureFor(scene: Phaser.Scene, o: LabelStyle): void {
  // a throwaway number paints the digits' texture
  new ThemeNumber(scene, 0, 0, 0, o).destroy();
}

// ------------------------------------------------------------------ the screens

/** The shade, the rope and the card: the frame both screens share. */
function frame(scene: Phaser.Scene, theme: MenuTheme, card: Box, quick: boolean): { card: Phaser.GameObjects.Image; items: Phaser.GameObjects.GameObject[] } {
  const { width, height } = scene.scale;
  const o = style(theme);
  // the shade also takes the taps meant for the round underneath
  const shade = themeShade(scene, o.vignette ?? theme.frame?.vignette ?? 0.6, o.dim ?? 0.6).setDepth(0);
  scene.add.zone(0, 0, width, height).setOrigin(0).setInteractive();
  shade.setAlpha(quick ? 0.55 : 0);
  scene.tweens.add({ targets: shade, alpha: 1, duration: quick ? 100 : 220, ease: 'Quad.easeOut' });
  const items: Phaser.GameObjects.GameObject[] = [];
  if (o.border ?? !!theme.frame?.border) for (const r of (theme.frame?.border ? frameBorder(scene) : ropeBorder(scene)) as Phaser.GameObjects.Image[]) { r.setDepth(1); items.push(r); }
  const img = themeCard(scene, card.x, card.y, card.w, card.h).setDepth(2);
  return { card: img, items };
}

/**
 * Pops objects in (scale, and alpha unless `shown`), staying tappable throughout: Phaser skips taps
 * on alpha 0. `shown` keeps them fully drawn from the first frame (the pause: on a slow device
 * the first frame already shows every button).
 */
function pop(scene: Phaser.Scene, targets: Phaser.GameObjects.GameObject[], delay: number, duration: number, from = 0.82, ease = 'Back.easeOut', shown = false): void {
  for (const o of targets) {
    const t = o as Phaser.GameObjects.Image;
    const s = t.scale, a = t.alpha;
    t.setScale(s * from);
    if (!shown) t.setAlpha(0.002);
    scene.tweens.add({ targets: t, scale: s, alpha: a, duration, delay, ease });
  }
}

export interface PauseActions {
  resume: () => void;
  retry: () => void;
  menu: () => void;
  /** Draws the sound button (the core's, in the theme's skin). */
  sound: (x: number, y: number) => Phaser.GameObjects.GameObject;
}

/**
 * The themed pause: everything placed from painted textures and interactive from the first frame;
 * the card drops in and the buttons pop within ~150 ms.
 */
export function themedPause(scene: Phaser.Scene, theme: MenuTheme, a: PauseActions): SkinButton[] {
  const { width, height } = scene.scale;
  const land = isLandscape();
  const L = layout(land).pause;
  const { card } = frame(scene, theme, L.card, true);
  // everything is drawn from the first frame; the entrance only moves and scales it
  const y0 = card.y;
  card.y = y0 - 24;
  scene.tweens.add({ targets: card, y: y0, duration: 140, ease: 'Cubic.easeOut' });
  const ek = L.emblem ? emblemTexture(scene, L.emblem.size) : null;
  if (ek && L.emblem) {
    const em = scene.add.image(width / 2, L.emblem.y, ek).setDepth(3);
    pop(scene, [em], 0, 200, 0.6, 'Back.easeOut', true);
  }
  const head = themeLabel(scene, width / 2, L.head, t('paused'), headStyle(theme, L.headSize)).setDepth(3);
  if (head.width > L.card.w - 80) head.setScale((L.card.w - 80) / head.width);
  pop(scene, [head], 0, 140, 1.2, 'Cubic.easeOut', true);
  const opts = { baked: true } as const;
  const buttons = [
    new SkinButton(scene, width / 2, L.buttons[0], t('resume'), a.resume, { ...opts, width: 380, height: 104, size: BTN.pause, variant: 'primary' }),
    new SkinButton(scene, width / 2, L.buttons[1], t('retry'), a.retry, { ...opts, width: 360, height: 96, size: BTN.small }),
    new SkinButton(scene, width / 2, L.buttons[2], t('menu'), a.menu, { ...opts, width: 360, height: 96, size: BTN.small }),
  ];
  const snd = a.sound(L.sound === null ? width - 70 : width / 2, L.sound ?? height - 70);
  for (const b of [...buttons, snd]) (b as Phaser.GameObjects.Container).setDepth(4);
  buttons.forEach((b, i) => pop(scene, [b], i * 20, 110, 0.88, 'Back.easeOut', true));
  pop(scene, [snd], 60, 110, 0.88, 'Back.easeOut', true);
  return buttons;
}

export interface ResultView {
  score: number;
  best: number;
  win: boolean;
  heading: string;
  newBest: boolean;
  easy: boolean;
  offer: 'continue' | 'double' | null;
  retry: () => void;
  menu: () => void;
  /** The rewarded button was pressed: shows the ad; 'gone' when the screen closed (the run continues). */
  watch: () => Promise<'gone' | 'rewarded' | 'failed'>;
  /** True while the offer cannot be taken (an ad break running). */
  busy: () => boolean;
  /** Where the buttons went, for the test harnesses. */
  placed: (hits: { menu: { x: number; y: number }; ad: { x: number; y: number } | null }) => void;
  playJingle: (key: string) => void;
}

/**
 * The themed result: the card drops in with the emblem, the heading is stamped on, the score
 * counts up in painted digits, NEW BEST unfurls as a ribbon with a burst, the buttons pop row by
 * row (tappable at once). Same buttons, keys and ad flow as the plain screen.
 */
export function themedResult(scene: Phaser.Scene, theme: MenuTheme, v: ResultView): void {
  const { width } = scene.scale;
  const land = isLandscape();
  const L = layout(land).result;
  const P = theme.palette;
  const { card, items } = frame(scene, theme, L.card, false);
  const y0 = card.y;
  card.y = y0 - 60;
  card.setAlpha(0.002);
  scene.tweens.add({ targets: card, y: y0, alpha: 1, duration: 300, ease: 'Back.easeOut' });
  for (const r of items) { (r as Phaser.GameObjects.Image).setAlpha(0.002); scene.tweens.add({ targets: r, alpha: 1, duration: 200 }); }
  const ek = L.emblem ? emblemTexture(scene, L.emblem.size) : null;
  if (ek && L.emblem) pop(scene, [scene.add.image(width / 2, L.emblem.y, ek).setDepth(3)], 140, 320, 0.4);

  // the heading: stamped onto the card
  const head = themeLabel(scene, width / 2, L.head, v.heading, v.win ? winStyle(theme, L.headSize) : headStyle(theme, L.headSize)).setDepth(3);
  if (head.width > L.card.w - 70) head.setScale((L.card.w - 70) / head.width);
  const hs = head.scale;
  // stamped on from a little larger, but never wider than the card at any point of the entrance
  const from = Math.max(hs, Math.min(hs * 1.8, (L.card.w - 40) / head.width));
  head.setScale(from).setAlpha(0);
  scene.tweens.add({
    targets: head, scale: hs, alpha: 1, duration: 260, delay: 160, ease: 'Cubic.easeIn',
    onComplete: () => { if (scene.scene.isActive()) scene.cameras.main.shake(120, 0.004); },
  });
  if (v.easy) pop(scene, [themeLabel(scene, width / 2, L.easy, t('diffEasy'), easyStyle(theme)).setDepth(3)], 380, 260, 0);

  // the score
  themeLabel(scene, width / 2, L.scoreLabel, t('score'), inkStyle(theme, 38)).setDepth(3);
  const score = new ThemeNumber(scene, width / 2, L.score, 0, scoreStyle(theme)).setDepth(3).setScale(L.scoreSize / 100);
  scene.tweens.addCounter({
    from: 0, to: v.score, duration: Math.min(1200, 200 + v.score * 4), delay: 250,
    onUpdate: (tw) => score.setValue(tw.getValue() ?? 0),
    onComplete: () => { score.setValue(v.score); scene.tweens.add({ targets: score, scale: score.scale * 1.12, duration: 110, yoyo: true }); },
  });
  // the best: "BEST:" and the number, in ink, centred together
  const bl = themeLabel(scene, 0, L.best, t('best') + ':', inkStyle(theme, 34)).setDepth(3);
  const bn = new ThemeNumber(scene, 0, L.best, v.best, inkStyle(theme, 34)).setDepth(3);
  const gap = 10, total = bl.width + gap + bn.textWidth;
  bl.setX(width / 2 - total / 2 + bl.width / 2);
  bn.setX(width / 2 + total / 2 - bn.textWidth / 2);

  if (v.newBest && v.score > 0) {
    const rib = scene.add.image(width / 2, L.ribbon, ribbonTexture(scene, t('newBest'))).setDepth(5);
    rib.setScale(0.1, 0.1).setAngle(-8).setAlpha(0);
    scene.tweens.add({ targets: rib, scaleX: 1, scaleY: 1, angle: 0, alpha: 1, duration: 420, delay: 300, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: rib, scale: 1.05, duration: 520, delay: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.time.delayedCall(300, () => burst(scene, width / 2, L.score, [shadeColor(P.trim, 0.3), P.primary, 0xffffff], 44, 440));
    scene.time.delayedCall(560, () => burst(scene, width / 2, L.ribbon, [P.trim, 0xfff0b0], 24, 300));
    v.playJingle('jingle-best');
  } else {
    v.playJingle(v.win ? 'jingle-win' : 'jingle-over');
  }

  // the buttons
  const opts = { baked: true } as const;
  if (!v.offer) {
    const rx = land ? width / 2 - L.side / 2 : width / 2, mx = land ? width / 2 + L.side / 2 : width / 2;
    const by = L.buttons - (v.newBest && v.score > 0 ? 0 : land ? 30 : 40);
    const my = land ? by : by + 125;
    const retry = new SkinButton(scene, rx, by, t('retry'), v.retry, { ...opts, width: 380, height: 104, size: BTN.big, variant: 'primary' }).setDepth(4);
    const menu = new SkinButton(scene, mx, my, t('menu'), v.menu, { ...opts, width: 360, height: 96, size: BTN.small }).setDepth(4);
    pop(scene, [retry], 420, 260);
    pop(scene, [menu], 490, 260);
    v.placed({ menu: { x: mx, y: my }, ad: null });
    return;
  }
  // with a rewarded offer: portrait puts it under the score, RETRY and MENU side by side below;
  // landscape has the three in one row, the offer in the middle
  const ry = land ? L.offerY : L.offerY + 180;
  const retry = new SkinButton(scene, width / 2 - L.offerSide, ry, t('retry'), v.retry, { ...opts, width: L.offerW, height: 96, size: BTN.row, variant: 'primary' }).setDepth(4);
  const menu = new SkinButton(scene, width / 2 + L.offerSide, ry, t('menu'), v.menu, { ...opts, width: L.offerW, height: 96, size: BTN.row }).setDepth(4);
  pop(scene, [retry, menu], 520, 260);
  const ax = width / 2, ay = L.offerY;
  const label = v.offer === 'continue' ? t('adContinue') : t('adDouble');
  const note = themeLabel(scene, ax, ay + 78, v.offer === 'continue' ? t('adContinueNote') : t('adDoubleNote'), noteStyle(theme)).setDepth(4);
  let used = false;
  const press = async () => {
    if (used || v.busy() || !scene.scene.isActive()) return;
    used = true;
    scene.tweens.killTweensOf(btn);
    const r = await v.watch();
    if (r === 'gone' || !scene.scene.isActive()) return;
    btn.destroy();
    if (r === 'rewarded') {
      placeLabel(note, labelTexture(scene, t('adDoubled'), winStyle(theme, 34)));
      burst(scene, ax, ay, [0x5dff7a, P.trim, 0xffffff], 40, 420);
    } else {
      placeLabel(note, labelTexture(scene, t('adFailed'), noteStyle(theme)));
    }
    scene.tweens.add({ targets: note, y: ay, duration: 260, ease: 'Back.easeOut' });
  };
  const btn = new SkinButton(scene, ax, ay, label, () => void press(), { ...opts, width: L.adW, height: 110, size: BTN.ad, color: style(theme).adColor ?? AD_COLOR }).setDepth(4);
  btn.fitLabel(L.adW - 60);
  const tag = scene.add.image(-L.adW / 2 + 8, -52, adTagTexture(scene, t('adBadge'))).setOrigin(0, 0.5).setAngle(-6);
  btn.add(tag);
  pop(scene, [btn, note], 400, 300);
  scene.time.delayedCall(720, () => {
    if (btn.active) scene.tweens.add({ targets: btn, scale: 1.04, duration: 560, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  });
  scene.time.delayedCall(400, () => scene.input.keyboard?.once('keydown-C', () => void press()));
  v.placed({ menu: { x: width / 2 + L.offerSide, y: ry }, ad: { x: ax, y: ay } });
}
