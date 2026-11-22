// City preview: a dev page to look at generated cities (not a game, not shipped).
// Open with `npm run dev`, then /tools/city-preview/ (query: ?seed=7&style=coast&look=night&size=1600).
// Cameras: overview (orbit), free fly and street level (walk/drive), keyboard + mouse or touch.
// window.__city exposes hooks for scripts/city-shots.mjs and scripts/city-memory.mjs.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  generateCity, planStats, cityQuery, drawMinimap, CityView, STYLES, STYLE_IDS, LOOKS, LOOK_IDS, DISTRICTS,
  type CityPlan, type StyleId, type LookId, type DistrictKind, type CityOptions,
} from '../../src/core/three/city';

type Mode = 'orbit' | 'fly' | 'street';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

const canvas = $<HTMLCanvasElement>('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, params.has('dpr') ? Number(params.get('dpr')) : 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 9000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

let plan: CityPlan;
let view: CityView | null = null;
let mode: Mode = 'orbit';
let look: LookId = (params.get('look') as LookId) || 'day';
const mix: Partial<Record<DistrictKind, number>> = {};
const show = { props: true, lod: true, wireframe: false, lanes: false, colliders: false, walk: false, minimap: !params.has('nominimap'), shadows: true, ui: !params.has('noui') };
let yaw = 0, pitch = 0;
const keys = new Set<string>();
let frameMs = 16;
let paused = false;

// ------------------------------------------------------------------ UI

const styleSel = $<HTMLSelectElement>('style');
for (const s of STYLE_IDS) styleSel.add(new Option(`${STYLES[s].name.en} · ${STYLES[s].name.tr}`, s));
styleSel.value = params.get('style') || 'metropolis';
const lookSel = $<HTMLSelectElement>('look');
for (const l of LOOK_IDS) lookSel.add(new Option(`${LOOKS[l].name.en} · ${LOOKS[l].name.tr}`, l));
const seedIn = $<HTMLInputElement>('seed');
seedIn.value = params.get('seed') || '1';
const sizeIn = $<HTMLInputElement>('size');
sizeIn.value = params.get('size') || String(STYLES[styleSel.value as StyleId].size);
const nearIn = $<HTMLInputElement>('near');
const mixBox = $('mix');
for (const d of DISTRICTS) {
  const l = document.createElement('label');
  l.innerHTML = `${d} <input type="range" min="0" max="3" step="0.1" value="1" data-d="${d}" /> <span>1.0</span>`;
  const inp = l.querySelector('input')!;
  inp.oninput = () => { mix[d] = Number(inp.value); l.querySelector('span')!.textContent = Number(inp.value).toFixed(1); };
  mixBox.appendChild(l);
}
$('resetMix').onclick = () => { for (const i of mixBox.querySelectorAll('input')) { i.value = '1'; i.dispatchEvent(new Event('input')); } };
styleSel.onchange = () => { sizeIn.value = String(STYLES[styleSel.value as StyleId].size); look = STYLES[styleSel.value as StyleId].look; regenerate(); };
lookSel.onchange = () => { look = lookSel.value as LookId; view?.setLook(look); };
sizeIn.oninput = () => { $('sizeV').textContent = sizeIn.value; };
nearIn.oninput = () => { $('nearV').textContent = nearIn.value; view?.setNear(Number(nearIn.value)); };
$('gen').onclick = () => regenerate();
$('rnd').onclick = () => { seedIn.value = String(Math.floor(Math.random() * 1e6)); regenerate(); };
$('toggle').onclick = () => $('panel').classList.toggle('hidden');
const camBox = $('cams');
for (const m of ['orbit', 'fly', 'street'] as Mode[]) {
  const b = document.createElement('button');
  b.textContent = m === 'orbit' ? 'Overview' : m === 'fly' ? 'Fly' : 'Street';
  b.dataset.m = m;
  b.onclick = () => setMode(m);
  camBox.appendChild(b);
}
const toggleBox = $('toggles');
for (const k of Object.keys(show) as (keyof typeof show)[]) {
  if (k === 'ui') continue;
  const b = document.createElement('button');
  b.textContent = k;
  b.dataset.k = k;
  b.onclick = () => { show[k] = !show[k]; applyShow(); };
  toggleBox.appendChild(b);
}
$('shots').onclick = () => void downloadShots();
if (!show.ui) { $('panel').style.display = 'none'; $('help').style.display = 'none'; $('stats').style.display = 'none'; }

function applyShow(): void {
  for (const b of toggleBox.querySelectorAll('button')) b.classList.toggle('on', !!show[b.dataset.k as keyof typeof show]);
  for (const b of camBox.querySelectorAll('button')) b.classList.toggle('on', b.dataset.m === mode);
  if (!view) return;
  view.setProps(show.props);
  view.setLod(show.lod);
  view.setWireframe(show.wireframe);
  view.overlay('lanes', show.lanes);
  view.overlay('colliders', show.colliders);
  view.overlay('walk', show.walk);
  view.setShadows(show.shadows && LOOKS[look].shadows);
  $('mini').style.display = show.minimap ? '' : 'none';
}

// ------------------------------------------------------------------ city

const miniBase = document.createElement('canvas');
miniBase.width = miniBase.height = 480;

function regenerate(opts: Partial<CityOptions> & { look?: LookId } = {}): Record<string, number> {
  const o: CityOptions = {
    seed: opts.seed ?? Number(seedIn.value),
    style: opts.style ?? (styleSel.value as StyleId),
    size: opts.size ?? Number(sizeIn.value),
    districts: opts.districts ?? { ...mix },
  };
  seedIn.value = String(o.seed); styleSel.value = o.style!; sizeIn.value = String(o.size);
  if (opts.look) look = opts.look;
  lookSel.value = look;
  view?.dispose();
  plan = generateCity(o);
  const t0 = performance.now();
  view = new CityView(plan, scene, { look, near: Number(nearIn.value) });
  const viewMs = performance.now() - t0;
  drawMinimap(miniBase.getContext('2d')!, plan, 480 / plan.size);
  setMode(mode, true);
  applyShow();
  $('sizeV').textContent = sizeIn.value; $('nearV').textContent = nearIn.value;
  const url = new URL(location.href);
  url.searchParams.set('seed', String(o.seed)); url.searchParams.set('style', o.style!); url.searchParams.set('size', String(o.size)); url.searchParams.set('look', look);
  history.replaceState(null, '', url);
  return { ...planStats(plan), viewMs: Math.round(viewMs) };
}

// ------------------------------------------------------------------ cameras

function setMode(m: Mode, reset = false): void {
  const prev = mode;
  mode = m;
  controls.enabled = m === 'orbit';
  const S = plan.size;
  if (m === 'orbit' && (reset || prev !== 'orbit')) {
    controls.target.set(plan.centre.x, 0, plan.centre.z);
    camera.position.set(plan.centre.x - S * 0.32, S * 0.42, plan.centre.z + S * 0.55);
    controls.update();
  } else if (m !== 'orbit' && (reset || prev === 'orbit')) {
    const st = plan.spawns.find((s) => s.kind === 'start') ?? plan.spawns[0];
    camera.position.set(st.x, m === 'street' ? 1.7 : 60, st.z);
    yaw = st.h; pitch = m === 'street' ? 0.02 : -0.35;
  }
  $('help').innerHTML = m === 'orbit' ? 'Overview: drag to orbit, right-drag / two fingers to pan, wheel / pinch to zoom.'
    : m === 'fly' ? 'Fly: WASD move, Q/E down/up, Shift fast, drag to look (touch: left half moves, right half looks).'
      : 'Street: WASD walk, Shift run, drag to look, buildings block you (touch: left half moves, right half looks).';
  applyShow();
}

/** Places the camera: position and where it looks. */
function pose(x: number, y: number, z: number, tx: number, ty: number, tz: number): void {
  camera.position.set(x, y, z);
  if (mode === 'orbit') { controls.target.set(tx, ty, tz); controls.update(); }
  const d = new THREE.Vector3(tx - x, ty - y, tz - z).normalize();
  yaw = Math.atan2(d.x, d.z);
  pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
}

// pointer: drag to look (fly / street); touch: left half is a stick, right half looks
const drag = new Map<number, { x: number; y: number; stick: boolean; sx: number; sy: number }>();
const stick = { x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => {
  if (mode === 'orbit') return;
  canvas.setPointerCapture(e.pointerId);
  const isStick = e.pointerType === 'touch' && e.clientX < innerWidth / 2;
  drag.set(e.pointerId, { x: e.clientX, y: e.clientY, stick: isStick, sx: e.clientX, sy: e.clientY });
});
canvas.addEventListener('pointermove', (e) => {
  const d = drag.get(e.pointerId);
  if (!d || mode === 'orbit') return;
  if (d.stick) {
    stick.x = THREE.MathUtils.clamp((e.clientX - d.sx) / 60, -1, 1);
    stick.y = THREE.MathUtils.clamp((e.clientY - d.sy) / 60, -1, 1);
  } else {
    yaw -= (e.clientX - d.x) * 0.004;
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - d.y) * 0.004, -1.45, 1.45);
  }
  d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e: PointerEvent) => { const d = drag.get(e.pointerId); if (d?.stick) { stick.x = 0; stick.y = 0; } drag.delete(e.pointerId); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
addEventListener('keydown', (e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') keys.add(e.code); });
addEventListener('keyup', (e) => keys.delete(e.code));

function moveCamera(dt: number): void {
  if (mode === 'orbit') { controls.update(); return; }
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - stick.y;
  const side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x;
  const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  if (mode === 'fly') {
    const sp = (fast ? 160 : 40) * dt;
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    camera.position.addScaledVector(dir, fwd * sp).addScaledVector(right, side * sp);
    camera.position.y += ((keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0)) * sp;
    camera.position.y = Math.max(1, camera.position.y);
  } else {
    const sp = (fast ? 16 : 5) * dt;
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), r = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const next = camera.position.clone().addScaledVector(f, fwd * sp).addScaledVector(r, side * sp);
    const q = cityQuery(plan);
    if (!q.collides(next.x, next.z, 0.35)) camera.position.copy(next);
    else if (!q.collides(next.x, camera.position.z, 0.35)) camera.position.x = next.x;
    else if (!q.collides(camera.position.x, next.z, 0.35)) camera.position.z = next.z;
    const ground = q.surfaceAt(camera.position.x, camera.position.z);
    camera.position.y = (ground === 'road' || ground === 'junction' || ground === 'bridge' ? 0 : 0.15) + 1.7;
  }
  camera.lookAt(camera.position.clone().add(dir));
}

// ------------------------------------------------------------------ frame

function resize(): void {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const focus = new THREE.Vector3();
function focusPoint(): THREE.Vector3 {
  if (mode === 'orbit') return focus.copy(controls.target);
  // a little ahead of the camera, on the ground
  return focus.set(camera.position.x + Math.sin(yaw) * 40, 0, camera.position.z + Math.cos(yaw) * 40);
}

function adaptCamera(): void {
  const h = Math.max(1, camera.position.y);
  camera.near = THREE.MathUtils.clamp(h * 0.012, 0.25, 12);
  camera.far = mode === 'street' ? 3000 : 12000;
  camera.updateProjectionMatrix();
  if (view) {
    const lk = LOOKS[look];
    // high cameras see further: push the fog out with the height
    const k = THREE.MathUtils.clamp(h / 120, 1, 6);
    view.setFog(lk.fogNear * k, lk.fogFar * k);
  }
}

function renderOnce(dt: number): void {
  moveCamera(dt);
  adaptCamera();
  view?.update(focusPoint(), camera, dt);
  renderer.render(scene, camera);
}

let last = performance.now();
let statT = 0;
function loop(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  frameMs = frameMs * 0.9 + (now - last) * 0.1;
  last = now;
  if (!paused) {
    renderOnce(dt);
    if ((statT += dt) > 0.25) { statT = 0; drawStats(); drawMini(); }
  }
  requestAnimationFrame(loop);
}

function drawStats(): void {
  if (!view) return;
  const s = view.stats(), i = renderer.info;
  $('stats').textContent = `${plan.style} seed ${plan.seed} ${plan.size} m · plan ${plan.ms} ms · chunks ${s.chunks} (+${s.queued} queued, ${s.cached} cached) · build ${s.lastBuildMs} / avg ${s.avgBuildMs} ms`
    + ` · draw calls ${i.render.calls} · tris ${(i.render.triangles / 1000).toFixed(0)}k · geo ${i.memory.geometries} tex ${i.memory.textures} · ${frameMs.toFixed(1)} ms/frame · ${mode} ${look}`;
}

function drawMini(): void {
  if (!show.minimap) return;
  const g = $<HTMLCanvasElement>('mini').getContext('2d')!;
  g.drawImage(miniBase, 0, 0);
  const k = 480 / plan.size;
  g.save();
  g.translate(camera.position.x * k, camera.position.z * k);
  g.rotate(-yaw);
  g.fillStyle = '#ff3b3b';
  g.beginPath(); g.moveTo(0, 10); g.lineTo(-6, -6); g.lineTo(6, -6); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = '#ffffffaa';
  g.beginPath(); g.arc(focus.x * k, focus.z * k, (view?.near ?? 300) * k, 0, Math.PI * 2); g.stroke();
}

// ------------------------------------------------------------------ hooks for scripts

/** Street-level camera spots chosen from the plan: downtown, a residential street, the water … */
function streetSpots(): { name: string; x: number; z: number; tx: number; tz: number }[] {
  const out: { name: string; x: number; z: number; tx: number; tz: number }[] = [];
  const lanes = plan.lanes.filter((l) => l.len > 50);
  const district = (l: (typeof lanes)[0]) => {
    const E = plan.edges[l.edge];
    const f = l.dir === 1 ? E.faceN : E.faceS;
    return f >= 0 ? plan.blocks[f] : null;
  };
  const byDist = (a: { pts: { x: number; z: number }[] }, b: { pts: { x: number; z: number }[] }) =>
    Math.hypot(a.pts[0].x - plan.centre.x, a.pts[0].z - plan.centre.z) - Math.hypot(b.pts[0].x - plan.centre.x, b.pts[0].z - plan.centre.z);
  const add = (name: string, l: (typeof lanes)[0] | undefined, at = 0.15) => {
    if (!l) return;
    const i = Math.max(0, Math.floor((l.pts.length - 1) * at));
    const a = l.pts[i], b = l.pts[Math.min(l.pts.length - 1, i + 1)];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out.push({ name, x: a.x, z: a.z, tx: a.x + ((b.x - a.x) / L) * 50, tz: a.z + ((b.z - a.z) / L) * 50 });
  };
  const sorted = [...lanes].sort(byDist);
  add('downtown', sorted.find((l) => district(l)?.district === 'downtown' && plan.edges[l.edge].cls !== 'alley'));
  add('residential', sorted.find((l) => ['residential', 'suburban'].includes(district(l)?.district ?? '') && plan.edges[l.edge].cls === 'street' && l.len > 90), 0.3);
  add('waterfront', sorted.find((l) => plan.edges[l.edge].bridge) ?? sorted.find((l) => district(l)?.kind === 'water'), 0.05);
  add('industrial', sorted.find((l) => ['industrial', 'docks'].includes(district(l)?.district ?? '')), 0.3);
  add('park', sorted.find((l) => district(l)?.kind === 'park'), 0.3);
  add('commercial', sorted.find((l) => district(l)?.district === 'commercial' && plan.edges[l.edge].cls !== 'street'), 0.3);
  return out;
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const api = {
  generate: (o: Partial<CityOptions> & { look?: LookId }) => regenerate(o),
  setLook: (l: LookId) => { look = l; lookSel.value = l; view?.setLook(l); applyShow(); },
  setMode: (m: Mode) => setMode(m, true),
  pose,
  setNear: (r: number) => { nearIn.value = String(r); view?.setNear(r); },
  setShow: (k: keyof typeof show, v: boolean) => { show[k] = v; applyShow(); },
  spots: () => streetSpots(),
  /** Aerial overview pose: from a corner, the whole city in view. */
  aerial: (k = 1) => {
    setMode('orbit', true);
    const S = plan.size;
    pose(plan.centre.x - S * 0.3 * k, S * 0.27 * k, plan.centre.z + S * 0.42 * k, plan.centre.x, 0, plan.centre.z - S * 0.08);
  },
  street: (i: number) => {
    const s = streetSpots()[i];
    if (!s) return null;
    setMode('street', true);
    pose(s.x, 1.7, s.z, s.tx, 3.2, s.tz);
    return s.name;
  },
  /** Streams everything round the camera, then renders a few frames. */
  settle: async (frames = 4) => {
    for (let i = 0; i < 400 && view && view.stats().queued + (i < 2 ? 1 : 0) > 0; i++) { renderOnce(1 / 60); await frame(); }
    view?.loadAll(focusPoint());
    for (let i = 0; i < frames; i++) { renderOnce(1 / 60); await frame(); }
  },
  /** Renders `n` frames and returns the mean ms per frame and the renderer's counters. */
  measure: async (n = 10) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { renderOnce(1 / 60); renderer.getContext().finish(); }
    const ms = (performance.now() - t0) / n;
    const i = renderer.info;
    return { ms, calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, ...view!.stats() };
  },
  memory: () => ({ ...renderer.info.memory }),
  stats: () => view?.stats(),
  planStats: () => planStats(plan),
  minimap: (opts: { lanes?: boolean; colliders?: boolean; spawns?: boolean; walk?: boolean } = {}, px = 1600) => {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    drawMinimap(c.getContext('2d')!, plan, px / plan.size, opts);
    return c.toDataURL('image/png');
  },
  /** A crop of the plan with the lane graph (x, z, size in metres). */
  laneCrop: (x: number, z: number, size: number, px = 1400) => {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d')!;
    const k = px / size;
    g.translate(-x * k, -z * k);
    drawMinimap(g, plan, k, { lanes: true, walk: true });
    return c.toDataURL('image/png');
  },
  frame: () => renderOnce(1 / 60),
  /** Stops the render loop (scripts render frames themselves). */
  pause: (on = true) => { paused = on; },
  /** The current frame as a PNG data URL (renders one first). */
  capture: () => { renderOnce(1 / 60); return renderer.domElement.toDataURL('image/png'); },
  plan: () => plan,
  renderer,
};
(window as unknown as { __city: typeof api }).__city = api;

async function downloadShots(): Promise<void> {
  const save = (name: string) => {
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = `${plan.style}-${plan.seed}-${name}.png`;
    a.click();
  };
  const was = look;
  api.aerial(); await api.settle(); save('aerial');
  for (let i = 0; i < 3; i++) {
    for (const l of ['day', 'night'] as LookId[]) {
      api.setLook(l);
      if (!api.street(i)) break;
      await api.settle();
      save(`street${i}-${l}`);
    }
  }
  api.setLook(was);
}

// ------------------------------------------------------------------ go

resize();
regenerate();
if (params.get('mode')) setMode(params.get('mode') as Mode, true);
loop();
