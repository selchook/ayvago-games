// Everything around the racing line: the ground, barriers on the berms, the arena fence,
// grandstands, tents, flags, lights, trees, rocks and puddle water. Repeated pieces are
// InstancedMeshes, so a whole arena costs a few dozen draw calls.
import { rng } from '@core';
import { THREE, model, grounded } from '@core/three';
import { ARENA, type Track } from './tracks';
import { Terrain } from './terrain';
import { matte } from './look';

type Place = { x: number; z: number; y?: number; yaw?: number; s?: number | [number, number, number] };

const tmp = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

function matrix(p: Place, y: number): THREE.Matrix4 {
  const s = p.s ?? 1;
  const sc = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
  q.setFromAxisAngle(up, p.yaw ?? 0);
  return new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y ?? y, p.z), q, sc);
}

/** One InstancedMesh per part of a model, all sharing the same placements. */
function instanced(key: string, places: Place[], terrain: Terrain, shadows = true): THREE.Group {
  const g = new THREE.Group();
  if (!places.length) return g;
  const src = grounded(matte(model(key, { shadows: false })));
  src.updateMatrixWorld(true);
  const mats = places.map((p) => matrix(p, terrain.heightAt(p.x, p.z) - 0.02));
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, places.length);
    mats.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, mesh.matrixWorld)));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadows;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  });
  return g;
}

function single(key: string, p: Place, terrain: Terrain): THREE.Object3D {
  const m = grounded(matte(model(key)));
  const s = p.s ?? 1;
  if (Array.isArray(s)) m.scale.set(...s); else m.scale.setScalar(s);
  m.position.set(p.x, p.y ?? terrain.heightAt(p.x, p.z) - 0.02, p.z);
  m.rotation.y = p.yaw ?? 0;
  return m;
}

let checkerTex: THREE.CanvasTexture | null = null;
function checkers(): THREE.CanvasTexture {
  if (checkerTex) return checkerTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
    x.fillStyle = (i + j) % 2 ? '#1c1c1c' : '#f4f4f4';
    x.fillRect(i * 8, j * 8, 8, 8);
  }
  checkerTex = new THREE.CanvasTexture(c);
  checkerTex.colorSpace = THREE.SRGBColorSpace;
  checkerTex.magFilter = THREE.NearestFilter;
  return checkerTex;
}

export interface Arena {
  group: THREE.Group;
  terrain: Terrain;
  dispose(): void;
}

/** Builds the arena for a track. Geometries made here are freed by dispose(). */
export function buildArena(track: Track, seed: number): Arena {
  const rand = rng.seeded(seed);
  const terrain = new Terrain(track, seed);
  const group = new THREE.Group();
  const own: { dispose(): void }[] = [];
  const ground = terrain.mesh();
  const outfield = Terrain.outfield(new THREE.Color(track.layout.grass).multiplyScalar(0.92).getHex(), seed);
  group.add(ground, outfield);
  own.push(ground.geometry, ground.material as THREE.Material, outfield.geometry, outfield.material as THREE.Material);

  const hw = track.half;
  const clear = (x: number, z: number, margin: number) => track.distance(x, z) > hw + margin;

  // barriers on the berm crests, both sides, spaced along each side's own length
  const barriers: Place[] = [];
  const pylons: Place[] = [];
  for (const side of [-1, 1]) {
    const off = side * (hw + 1.2);
    let acc = 1.1, px = 0, pz = 0;
    track.samples.forEach((p, i) => {
      const x = p.x + p.tz * off, z = p.z - p.tx * off;
      if (i > 0) acc += Math.hypot(x - px, z - pz);
      px = x; pz = z;
      if (acc < 2.25) return;
      acc = 0;
      if (!clear(x, z, 0.95)) return;
      barriers.push({ x, z, yaw: Math.atan2(-p.tz, p.tx), s: [2.3, 2.6, 2.6] });
    });
  }
  group.add(instanced('barrier', barriers, terrain, false));

  // pylons and banner towers mark the ramps
  for (const r of terrain.ramps) {
    for (const side of [-1, 1]) {
      const d = side * (hw + 0.45);
      pylons.push({ x: r.x + r.tz * d - r.tx * 1.2, z: r.z - r.tx * d - r.tz * 1.2, s: 4.2 });
      pylons.push({ x: r.x + r.tz * d - r.tx * 3, z: r.z - r.tx * d - r.tz * 3, s: 4.2 });
    }
  }
  group.add(instanced('pylon', pylons, terrain, false));

  // start / finish: a checkered strip across the track and chequered flags on both berms
  const st = track.pointAt(0);
  const lineGeo = new THREE.PlaneGeometry(track.width + 0.4, 1.1);
  const lineMat = new THREE.MeshLambertMaterial({ map: checkers() });
  own.push(lineGeo, lineMat);
  const line = new THREE.Mesh(lineGeo, lineMat);
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = Math.atan2(-st.tz, st.tx) + Math.PI / 2;
  line.position.set(st.x, terrain.heightAt(st.x, st.z) + 0.06, st.z);
  line.receiveShadow = true;
  group.add(line);
  for (const side of [-1, 1]) {
    const d = side * (hw + 1.0);
    group.add(single('flagCheckers', { x: st.x + st.tz * d, z: st.z - st.tx * d, s: 3.2, yaw: Math.atan2(-st.tz, st.tx) }, terrain));
  }

  // puddle water
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x79acd6, transparent: true, opacity: 0.75, roughness: 0.12, metalness: 0.2 });
  own.push(waterMat);
  for (const p of terrain.puddles) {
    const geo = new THREE.CircleGeometry(p.r + 0.35, 28);
    geo.rotateX(-Math.PI / 2);
    own.push(geo);
    const w = new THREE.Mesh(geo, waterMat);
    w.position.set(p.x, terrain.heightAt(p.x, p.z) + 0.06, p.z);
    w.scale.set(1, 1, 0.8);
    w.receiveShadow = true;
    group.add(w);
  }

  // the arena fence
  const fence: Place[] = [];
  const FL = 2.6;
  for (let x = -ARENA.hx + FL / 2; x < ARENA.hx; x += FL) {
    fence.push({ x, z: -ARENA.hz, s: [FL, 2.2, 2.2] });
    fence.push({ x, z: ARENA.hz, s: [FL, 1.6, 2.2] });
  }
  for (let z = -ARENA.hz + FL / 2; z < ARENA.hz; z += FL) {
    fence.push({ x: -ARENA.hx, z, yaw: Math.PI / 2, s: [FL, 2.2, 2.2] });
    fence.push({ x: ARENA.hx, z, yaw: Math.PI / 2, s: [FL, 2.2, 2.2] });
  }
  group.add(instanced('fence', fence, terrain, false));

  // grandstands behind the far fence, tents and lights on the sides
  const standXs = [-21, -11.5, -2, 7.5, 17];
  for (const x of standXs) group.add(single('stand', { x, z: -ARENA.hz - 3.2, s: 4.6 }, terrain));
  group.add(single('tent', { x: 25.5, z: -ARENA.hz - 2.6, s: 3.6 }, terrain));
  group.add(single('tent', { x: -ARENA.hx - 3, z: 6, s: 3.4, yaw: Math.PI / 2 }, terrain));
  group.add(single('tent', { x: ARENA.hx + 3, z: 8, s: 3.4, yaw: -Math.PI / 2 }, terrain));
  for (const [x, z] of [[-ARENA.hx - 1.2, -ARENA.hz - 1.2], [ARENA.hx + 1.2, -ARENA.hz - 1.2], [-ARENA.hx - 1.2, ARENA.hz + 1.2], [ARENA.hx + 1.2, ARENA.hz + 1.2]]) {
    group.add(single('light', { x, z, s: 6, yaw: Math.atan2(x, z) }, terrain));
  }

  // trees and bushes outside the fence, rocks, grass and cactus inside
  const trees: Record<string, Place[]> = { treeA: [], treeB: [], treeC: [] };
  const keys = Object.keys(trees);
  for (let k = 0; k < 70; k++) {
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * (ARENA.hx + 3 + rand() * 14), z = Math.sin(a) * (ARENA.hz + 3 + rand() * 10);
    if (z < -ARENA.hz - 1 && Math.abs(x) < 28) continue;   // keep the grandstands free
    trees[keys[k % 3]].push({ x, z, yaw: rand() * 6.3, s: 2.6 + rand() * 1.4 });
  }
  for (const key of keys) group.add(instanced(key, trees[key], terrain));

  const rocks: Place[] = [], tufts: Place[] = [], cactus: Place[] = [], bushes: Place[] = [];
  for (let k = 0; k < 260 && (rocks.length < 22 || tufts.length < 60); k++) {
    const x = (rand() * 2 - 1) * (ARENA.hx - 1.5), z = (rand() * 2 - 1) * (ARENA.hz - 1.5);
    if (!clear(x, z, 3.8)) continue;
    const r = rand();
    if (r < 0.2 && rocks.length < 22) rocks.push({ x, z, yaw: rand() * 6.3, s: 1.6 + rand() * 1.6 });
    else if (r < 0.3 && cactus.length < 6) cactus.push({ x, z, yaw: rand() * 6.3, s: 2.4 + rand() });
    else if (r < 0.42 && bushes.length < 14) bushes.push({ x, z, yaw: rand() * 6.3, s: 2.4 + rand() * 1.2 });
    else if (tufts.length < 60) tufts.push({ x, z, yaw: rand() * 6.3, s: 2.2 + rand() * 1.4 });
  }
  group.add(instanced('rock', rocks, terrain), instanced('cactus', cactus, terrain), instanced('bush', bushes, terrain), instanced('grass', tufts, terrain, false));

  return {
    group,
    terrain,
    dispose: () => {
      for (const o of own) o.dispose();
      group.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
    },
  };
}
