// Astro Crew: the crew portraits, aliens, pickups, planets, ships and base modules shown in the 2D
// screens are the kit's own models, rendered once offline into one sprite sheet
// (public/assets/quaternius/space-kit/icons.png, 128 px frames in ICON_KEYS order) by
// make-icons.mjs, which calls `renderIconSheet()` in the running game (dev server) and saves what
// it returns. The game loads the sheet like any image, under the intro.
import Phaser from 'phaser';
import { THREE, model, modelClips } from '@core/three';
import { asset } from '@core';
import { sk } from './kit';

export const ICON = 128;
export const ICON_COLS = 8;
/** The sheet's frames, in order. */
export const ICON_KEYS = [
  'hero-bee', 'hero-flamingo', 'hero-frog', 'hero-panda', 'mech-bee', 'mech-flamingo', 'mech-frog', 'mech-panda',
  'e-xs', 'e-s', 'flyer', 'brute', 'body-bee', 'body-flamingo', 'body-frog', 'body-panda',
  'bullets', 'crate', 'health', 'jar', 'keycard', 'sphere', 'thunder', 'rover-1',
  'planet-1', 'planet-2', 'planet-3', 'planet-4', 'planet-5', 'planet-6', 'planet-7', 'planet-8',
  'planet-9', 'planet-10', 'planet-11', 'ship-bee', 'ship-flamingo', 'ship-frog', 'ship-panda', 'rover-round',
  'dome', 'solar-ground', 'roof-radar', 'roof-antenna', 'building-l', 'house-cylinder', 'house-long', 'connector',
  'solar-structure', 'base-large', 'house-single', 'tree-spiral-1', 'tree-lava-1', 'tree-blob-1', 'rock-large-1', 'tree-floating-1',
] as const;
export type IconKey = (typeof ICON_KEYS)[number];
export const ICON_SHEET = 'ac-icons';
export const iconFrame = (k: IconKey): number => ICON_KEYS.indexOf(k);

export function loadIcons(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(ICON_SHEET, asset('quaternius/space-kit/icons.png'), { frameWidth: ICON, frameHeight: ICON });
}

/** How each icon is posed (yaw, a zoom, the pitch of the view). */
const POSE: Partial<Record<IconKey, { yaw?: number; zoom?: number; pitch?: number }>> = {
  'ship-bee': { yaw: 0.7, pitch: 0.45 }, 'ship-flamingo': { yaw: 0.7, pitch: 0.45 }, 'ship-frog': { yaw: 0.7, pitch: 0.45 }, 'ship-panda': { yaw: 0.7, pitch: 0.45 },
  keycard: { yaw: 0.3, pitch: 0.2 }, thunder: { yaw: 0.2, pitch: 0.2 }, health: { yaw: 0.2, pitch: 0.2 }, bullets: { yaw: 0.25, pitch: 0.2 },
  'solar-ground': { pitch: 0.6 }, dome: { pitch: 0.35 }, 'roof-radar': { pitch: 0.3 },
};

/** Rigged icons: the file, the meshes to show, the clip and time, head and shoulders or the whole figure. */
const RIG: Partial<Record<IconKey, { file: string; show?: string[]; clip: string; t: number; head?: boolean }>> = {
  'hero-bee': { file: 'astronauts', show: ['a-bee', 'pistol'], clip: 'Idle_Gun', t: 0.3, head: true },
  'hero-flamingo': { file: 'astronauts', show: ['a-flamingo', 'pistol'], clip: 'Idle_Gun', t: 0.3, head: true },
  'hero-frog': { file: 'astronauts', show: ['a-frog', 'pistol'], clip: 'Idle_Gun', t: 0.3, head: true },
  'hero-panda': { file: 'astronauts', show: ['a-panda', 'pistol'], clip: 'Idle_Gun', t: 0.3, head: true },
  'body-bee': { file: 'astronauts', show: ['a-bee', 'pistol'], clip: 'Idle_Gun', t: 0.3 },
  'body-flamingo': { file: 'astronauts', show: ['a-flamingo', 'pistol'], clip: 'Idle_Gun', t: 0.3 },
  'body-frog': { file: 'astronauts', show: ['a-frog', 'pistol'], clip: 'Idle_Gun', t: 0.3 },
  'body-panda': { file: 'astronauts', show: ['a-panda', 'pistol'], clip: 'Idle_Gun', t: 0.3 },
  'mech-bee': { file: 'mech-bee', clip: 'Idle', t: 0.5 },
  'mech-flamingo': { file: 'mech-flamingo', clip: 'Idle', t: 0.5 },
  'mech-frog': { file: 'mech-frog', clip: 'Idle', t: 0.5 },
  'mech-panda': { file: 'mech-panda', clip: 'Idle', t: 0.5 },
  'e-xs': { file: 'blobs', show: ['e-xs'], clip: 'Flying_Idle', t: 0.3 },
  'e-s': { file: 'blobs', show: ['e-s'], clip: 'Flying_Idle', t: 0.3 },
  flyer: { file: 'flyer', clip: 'Flying_Idle', t: 0.3 },
  brute: { file: 'brute', clip: 'Idle', t: 0.3 },
};

/**
 * Renders every icon with the game's renderer into one canvas and returns it as a PNG data URL
 * (called by make-icons.mjs; never during play).
 */
export function renderIconSheet(renderer: THREE.WebGLRenderer, keys: readonly string[] = ICON_KEYS): string {
  const rows = Math.ceil(keys.length / ICON_COLS);
  const sheet = document.createElement('canvas');
  sheet.width = ICON * ICON_COLS;
  sheet.height = ICON * rows;
  const g = sheet.getContext('2d')!;
  const S = ICON * 2;
  const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const px = new Uint8Array(S * S * 4);
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = S;
  const tg = tmp.getContext('2d')!;
  const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 200);
  const old = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  (keys as readonly IconKey[]).forEach((key, i) => {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4f0ff, 0x6a5a7a, 2.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-1, 2, 2.5);
    scene.add(sun);
    const rig = RIG[key];
    const obj = model(sk(rig ? rig.file : key), { shadows: false });
    let mixer: THREE.AnimationMixer | null = null;
    if (rig) {
      if (rig.show) obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.visible = rig.show!.includes(o.name); });
      mixer = new THREE.AnimationMixer(obj);
      const clip = modelClips(sk(rig.file)).find((c) => c.name === rig.clip);
      if (clip) { mixer.clipAction(clip).play(); mixer.update(rig.t); }
      obj.updateMatrixWorld(true);
    }
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    });
    const pose = POSE[key] ?? {};
    obj.rotation.y = pose.yaw ?? 0.45;
    const wrap = new THREE.Group();
    wrap.add(obj);
    scene.add(wrap);
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3();
    obj.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o, true); });
    const c = box.getCenter(new THREE.Vector3());
    let size = box.getSize(new THREE.Vector3()).length();
    if (rig?.head) {
      const hgt = box.max.y - box.min.y;
      c.set(c.x, box.min.y + hgt * 0.74, c.z);
      size = hgt * 0.62;
      obj.rotation.y = 0.3;
    }
    const pitch = pose.pitch ?? 0.4;
    const dist = (size / 2) / Math.tan(THREE.MathUtils.degToRad(13)) * 0.98 / (pose.zoom ?? 1);
    cam.position.set(c.x, c.y + Math.sin(pitch) * dist, c.z + Math.cos(pitch) * dist);
    cam.lookAt(c);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
    const img = tg.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    tg.putImageData(img, 0, 0);
    const col = i % ICON_COLS, row = Math.floor(i / ICON_COLS);
    g.save();
    g.shadowColor = 'rgba(10,6,30,0.5)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 3;
    g.drawImage(tmp, col * ICON + 4, row * ICON + 2, ICON - 8, ICON - 8);
    g.restore();
    obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.Material).dispose(); if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose(); });
    mixer?.stopAllAction();
  });
  renderer.setRenderTarget(old.target);
  renderer.setClearColor(old.color, old.alpha);
  rt.dispose();
  return sheet.toDataURL('image/png');
}
