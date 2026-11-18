// Golden Podium's words in play: the start calls, the big callouts (FINISH!, FOUL!, CHAMPION!),
// the words and marks popping over the athletes, the swim's stroke judgements, the long jump's
// angle and the one-line hint, all painted in the theme's Russo One with the cup's gold gradient
// (the event card's title, panels.ts) and the navy ink. The fixed ones are painted ahead under the
// intro (the theme's prebake); marks and times are painted once per value (labels cache by string)
// and the angle that changes every frame is set from a glyph atlas.
import { Phaser, t, labelTexture, glyphAtlas, shadeColor, NUMERIC_GLYPHS, type LabelStyle } from '@core';
import { EVENTS } from './scoring';
import { ordinal } from './strings';

/** The theme's ink (theme.ts / panels.ts). */
const INK = '#151a38';
const hex6 = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/**
 * A callout in the theme's face: the colour as a gradient from pale to its shade, navy ink. Gold
 * is the cup's own gradient; white turns the stadium's cool blue at the bottom.
 */
export function calloutStyle(color: string, size: number): LabelStyle {
  const sw = Math.max(5, Math.round(size * 0.15));
  if (color === '#ffd23f') return { size, fill: ['#fffbe0', '#ffd23f', '#c27a10'], stroke: INK, strokeWidth: sw };
  if (color === '#ffffff') return { size, fill: ['#ffffff', '#f2f6ff', '#b4c6f0'], stroke: INK, strokeWidth: sw };
  const c = parseInt(color.slice(1), 16);
  return { size, fill: [hex6(shadeColor(c, 0.75)), color, hex6(shadeColor(c, -0.35))], stroke: INK, strokeWidth: sw };
}

/** The one-line hint at the bottom: a sentence, in the body font, white on navy ink. */
export const S_HINT: LabelStyle = { size: 21, color: '#ffffff', stroke: INK, strokeWidth: 5, body: true };
/** The long jump's angle: a white atlas the gauge tints (green inside the good zone). */
export const S_ANGLE: LabelStyle = { size: 30, fill: ['#ffffff', '#ffffff', '#d6e0f6'], stroke: INK, strokeWidth: 5 };
export const angleChars = (): string => NUMERIC_GLYPHS + '°' + t('angle', { a: '' });
/** The swim's stroke judgements and their colours. */
export const JUDGE_COLOR = { perfect: '#7dff9a', good: '#3ee6ff', ok: '#ffd23f', miss: '#ff9a7a' } as const;
export const judgeStyle = (j: keyof typeof JUDGE_COLOR): LabelStyle => calloutStyle(JUDGE_COLOR[j], 30);

/** Every fixed callout with its colour and size, as the events call them. */
const CALLS: [string, string, number][] = [
  ['bullseye', '#ffd23f', 56], ['missed', '#ff9a7a', 50], ['marks', '#ffffff', 50], ['dq', '#ff6b4a', 60],
  ['falseStart', '#ff6b4a', 56], ['falseWarn', '#ffffff', 28], ['set', '#ffffff', 50], ['go', '#7dff9a', 70],
  ['foul', '#ff6b4a', 64], ['finish', '#ffd23f', 64], ['noAir', '#ff6b4a', 34], ['record', '#ffd23f', 34],
  ['clear', '#7dff9a', 20], ['hit', '#ff9a7a', 22], ['perfect', '#7dff9a', 22], ['stumble', '#ff9a7a', 24],
  ['champion', '#ffd23f', 66],
];

/** Paints the events' fixed words ahead (under the intro). */
export function prebakeCallouts(scene: Phaser.Scene): void {
  for (const [k, c, size] of CALLS) labelTexture(scene, t(k), calloutStyle(c, size));
  for (let n = 1; n <= 3; n++) labelTexture(scene, t('attempt', { n }), calloutStyle('#ffffff', 48));
  for (let n = 2; n <= 4; n++) labelTexture(scene, t('placeTitle', { n: ordinal(n) }), calloutStyle('#ffffff', 66));
  for (let n = 0; n <= 10; n++) labelTexture(scene, String(n), calloutStyle(n >= 9 ? '#ffd23f' : '#ffffff', 46));
  for (const j of Object.keys(JUDGE_COLOR) as (keyof typeof JUDGE_COLOR)[]) labelTexture(scene, t(j), judgeStyle(j));
  for (const id of EVENTS) for (const k of ['t', 'k']) labelTexture(scene, t(`h_${id}_${k}`), S_HINT);
  glyphAtlas(scene, S_ANGLE, angleChars());
}
