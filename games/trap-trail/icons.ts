// Trap Trail: the HUD's and screens' icons are the pack's own pickups (coin, gems, stars, hearts, key,
// Thunder …), rendered once offline into one sprite sheet (public/assets/quaternius/
// ultimate-platformer-pack/icons.png, 128 px frames in ICON_KEYS order) by make-icons.mjs, which
// calls `renderIconSheet()` in the running game (dev server) and saves what it returns. A few flat
// icons (dash, clock, padlock, the buttons' arrows) are drawn on canvases at boot (art.ts).
import Phaser from 'phaser';
import { THREE } from '@core/three';
import { asset } from '@core';
import { geo, Merger, partRest } from './kit';

export const ICON = 128;
export const ICON_COLS = 4;
export const ICON_KEYS = [
  'coin', 'gem-green', 'gem-blue', 'gem-pink',
  'star', 'star-empty', 'heart', 'heart-half',
  'heart-empty', 'key', 'thunder', 'shield',
  'magnet', 'spring', 'chest', 'flag',
] as const;
export type IconKey = (typeof ICON_KEYS)[number];
export const ICON_SHEET = 'tt-icons';
export const iconFrame = (k: string): number => Math.max(0, (ICON_KEYS as readonly string[]).indexOf(k));

export function loadIcons(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(ICON_SHEET, asset('quaternius/ultimate-platformer-pack/icons.png'), { frameWidth: ICON, frameHeight: ICON });
}

/** An icon image at a size. */
export function icon(scene: Phaser.Scene, x: number, y: number, key: string, size: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, ICON_SHEET, iconFrame(key)).setDisplaySize(size, size);
}

/** What each icon shows: pack models (key, scale, x offset, turn) on one stage. */
function iconScene(k: IconKey): THREE.Group {
  const g = new THREE.Group();
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const add = (key: string, s = 1, x = 0, y = 0, ry = 0, rx = 0, m?: THREE.Matrix4) => {
    const mesh = new THREE.Mesh(geo(key), lit);
    if (m) { mesh.matrixAutoUpdate = false; mesh.matrix.copy(m); } else { mesh.scale.setScalar(s); mesh.position.set(x, y, 0); mesh.rotation.set(rx, ry, 0); }
    g.add(mesh);
  };
  // an empty slot: the outline over a dim copy of the full shape (reads on the dark HUD chips)
  const ghost = (key: string) => { const m = new THREE.Mesh(geo(key), new THREE.MeshLambertMaterial({ color: 0x6a7494 })); m.scale.set(0.97, 0.97, 0.5); m.position.z = -0.2; g.add(m); };
  switch (k) {
    case 'heart-half': ghost('qp:heart'); add('qp:heart-outline'); add('qp:heart-half', 1.3 / 1.4, -0.25, 0.02); break;
    case 'heart-empty': ghost('qp:heart'); add('qp:heart-outline'); break;
    case 'star-empty': ghost('qp:star'); add('qp:star-outline'); break;
    case 'shield': {
      add('qp:gem-blue', 0.62);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), new THREE.MeshLambertMaterial({ color: 0x8ad8ff, emissive: 0x2a6a9a, transparent: true, opacity: 0.38 }));
      g.add(b);
      break;
    }
    case 'magnet': {
      const m = new Merger();
      const arc = new THREE.TorusGeometry(0.7, 0.24, 8, 16, Math.PI);
      m.add(arc, new THREE.Matrix4(), 0xe0303a, true);
      for (const x of [-0.7, 0.7]) { m.add(new THREE.CylinderGeometry(0.24, 0.24, 0.6, 8), new THREE.Matrix4().makeTranslation(x, -0.3, 0), 0xe0303a, true); m.add(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 8), new THREE.Matrix4().makeTranslation(x, -0.75, 0), 0xdde4ec, true); }
      const mesh = new THREE.Mesh(m.build(), lit);
      mesh.scale.setScalar(0.48); mesh.position.y = 0.1;
      g.add(mesh);
      break;
    }
    case 'spring': {
      const s = 0.42;
      const base = new THREE.Matrix4().makeScale(s, s, s).premultiply(new THREE.Matrix4().makeTranslation(0, -0.42, 0));
      add('qp:bouncer#spring', 1, 0, 0, 0, 0, base.clone().multiply(partRest('bouncer', 'spring')));
      add('qp:bouncer#top', 1, 0, 0, 0, 0, base.clone().multiply(partRest('bouncer', 'top')));
      g.rotation.x = 0.35;
      break;
    }
    case 'chest': {
      const s = 0.42;
      const base = new THREE.Matrix4().makeScale(s, s, s).premultiply(new THREE.Matrix4().makeTranslation(0, -0.38, 0));
      add('qp:chest#base', 1, 0, 0, 0, 0, base.clone().multiply(partRest('chest', 'base')));
      add('qp:chest#lid', 1, 0, 0, 0, 0, base.clone().multiply(partRest('chest', 'lid')));
      g.rotation.set(0.35, -0.5, 0);
      break;
    }
    case 'flag': add('qp:flag', 0.4, -0.1, -0.47, -0.4); break;
    case 'key': add('qp:key', 1, 0, 0, 0, 0); g.rotation.z = 0.5; break;
    case 'coin': add('qp:coin', 1, 0, 0, 0.35); break;
    case 'thunder': add('qp:thunder', 1, 0, 0, 0.3); break;
    default: add('qp:' + k, 1, 0, 0, 0.3);
  }
  return g;
}

/** Renders every icon with the game's renderer into one canvas and returns it as a PNG data URL. */
export function renderIconSheet(renderer: THREE.WebGLRenderer): string {
  const keys = ICON_KEYS as readonly IconKey[];
  const rows = Math.ceil(keys.length / ICON_COLS);
  const sheet = document.createElement('canvas');
  sheet.width = ICON * ICON_COLS;
  sheet.height = ICON * rows;
  const ctx = sheet.getContext('2d')!;
  const S2 = ICON * 2;
  const rt = new THREE.WebGLRenderTarget(S2, S2, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.OrthographicCamera(-0.62, 0.62, 0.62, -0.62, 0.1, 20);
  cam.position.set(0, 0, 5);
  const px = new Uint8Array(S2 * S2 * 4);
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = S2;
  const tctx = tmp.getContext('2d')!;
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  keys.forEach((k, i) => {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-1.5, 2.5, 3);
    scene.add(sun);
    scene.add(iconScene(k));
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S2, S2, px);
    const img = tctx.createImageData(S2, S2);
    for (let y = 0; y < S2; y++) img.data.set(px.subarray((S2 - 1 - y) * S2 * 4, (S2 - y) * S2 * 4), y * S2 * 4);
    tctx.putImageData(img, 0, 0);
    ctx.drawImage(tmp, (i % ICON_COLS) * ICON, Math.floor(i / ICON_COLS) * ICON, ICON, ICON);
  });
  renderer.setRenderTarget(prevTarget);
  renderer.setClearAlpha(prevClear);
  rt.dispose();
  return sheet.toDataURL('image/png');
}
