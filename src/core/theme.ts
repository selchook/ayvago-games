import Phaser from 'phaser';

export const FONT_TITLE = '"Press Start 2P", monospace';
export const FONT_BODY = '"Pixelify Sans", "Press Start 2P", monospace';

/** Ayvago retro palette. Brand red/ink/paper come from the boot intro. */
export const COLORS = {
  ink: 0x201e1d, red: 0xec3013, paper: 0xf3f2f2,
  yellow: 0xffd23f, cyan: 0x3ee6ff, magenta: 0xff4fa3, green: 0x5dff7a, purple: 0x8b5cff,
  dark: 0x0e0d12, panel: 0x16141c, shadow: 0x000000,
};
export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export interface TextStyle {
  size?: number;
  color?: string;
  title?: boolean;        // Press Start 2P instead of Pixelify Sans
  align?: 'left' | 'center' | 'right';
  stroke?: string;
  strokeThickness?: number;
  wrap?: number;
  shadow?: boolean;
}

/** Retro text with the platform fonts. Origin defaults to centre. */
export function txt(scene: Phaser.Scene, x: number, y: number, s: string, st: TextStyle = {}): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, s, {
    fontFamily: st.title ? FONT_TITLE : FONT_BODY,
    fontSize: `${st.size ?? 32}px`,
    color: st.color ?? '#f3f2f2',
    align: st.align ?? 'center',
    stroke: st.stroke ?? '#000000',
    strokeThickness: st.strokeThickness ?? (st.title ? 6 : 4),
    wordWrap: st.wrap ? { width: st.wrap, useAdvancedWrap: true } : undefined,
    lineSpacing: st.title ? 12 : 4,
  });
  t.setOrigin(0.5);
  if (st.shadow !== false) t.setShadow(0, st.title ? 6 : 3, '#000000', 0, true, true);
  return t;
}
