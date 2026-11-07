import { THREE } from '@core/three';

const done = new WeakSet<THREE.Material>();

/** Natural colours for the nature kit (its own greens are teal under this light). */
const RECOLOR: Record<string, number> = {
  leafsGreen: 0x4f9a3c,
  leafsDark: 0x2f7a45,
  woodBarkDark: 0x6a4029,
  grass: 0x63a843,
  stone: 0x9d978c,
  dirt: 0x9c6b45,
  woodBark: 0x7d5234,
};

/**
 * Kenney GLB materials come with metalness 1, which turns them nearly black without an
 * environment map: make them matte (in place, so every copy of the model shares the fix).
 */
export function matte<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (done.has(m)) continue;
      done.add(m);
      const s = m as THREE.MeshStandardMaterial;
      if (s.isMeshStandardMaterial) {
        // the kits store sRGB colours as linear factors: bring them back to their intended tone
        if (RECOLOR[s.name] !== undefined) s.color.setHex(RECOLOR[s.name]);
        else s.color.convertSRGBToLinear();
        s.metalness = 0;
        s.roughness = Math.max(0.6, s.roughness);
      }
    }
  });
  return obj;
}
