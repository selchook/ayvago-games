import { THREE, model, grounded } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const done = new WeakSet<THREE.Material>();

/** Natural colours for the nature kit (its own greens turn teal under this light). */
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
 * environment map: make them matte (in place, so every copy shares the fix).
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
        if (RECOLOR[s.name] !== undefined) s.color.setHex(RECOLOR[s.name]);
        else s.color.convertSRGBToLinear();
        s.metalness = 0;
        s.roughness = Math.max(0.6, s.roughness);
      }
    }
  });
  return obj;
}

/** A grounded, matte copy of a kit model at a size and place. */
export function prop(key: string, scale: number, x: number, z: number, rotY = 0, shadows = true): THREE.Group {
  const g = grounded(matte(model(key, { shadows })));
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

/** A mesh with its own material (freed when the world closes). */
export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadows: 'cast' | 'receive' | 'both' | 'none' = 'both'): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.userData.ownMaterial = true;
  m.castShadow = shadows === 'cast' || shadows === 'both';
  m.receiveShadow = shadows === 'receive' || shadows === 'both';
  return m;
}

export const lambert = (color: number, o: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color, ...o });

export function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, shadows: 'cast' | 'receive' | 'both' | 'none' = 'both'): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), lambert(color), shadows);
  m.position.set(x, y, z);
  m.userData.batch = true;
  return m;
}

/**
 * Merges the plain coloured boxes directly under a group into one mesh with vertex colours:
 * a stand of several hundred boxes becomes a single draw call.
 */
export function batchBoxes(group: THREE.Group): void {
  const parts: THREE.BufferGeometry[] = [];
  const gone: THREE.Mesh[] = [];
  for (const o of group.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.userData.batch) continue;
    m.updateMatrix();
    const geo = (m.geometry as THREE.BufferGeometry).clone().applyMatrix4(m.matrix);
    const c = (m.material as THREE.MeshLambertMaterial).color;
    const n = geo.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(cols, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(geo);
    gone.push(m);
  }
  if (!parts.length) return;
  const merged = mergeGeometries(parts, false);
  if (!merged) return;
  for (const m of gone) {
    group.remove(m);
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
  parts.forEach((p) => p.dispose());
  group.add(mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }), 'both'));
}
