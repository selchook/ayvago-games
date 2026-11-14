// Zombie Grove: a hero as a 3D figure: their Mini Character holding their starting weapon in the
// fist (the Ranger's bow and the shields in the left hand), as the Play view, the menu backdrop,
// the camp's turntable and its portraits all draw them. The Worker's torch is built here (no
// model has one); the Scout's weapon is her little robot, which follows her on its own.
import { THREE, model, miniKey, playerCharacter3d } from '@core/three';
import { HEROES, type HeroId, type WeaponId } from './defs';
import { heroKey, fistMatrix, PERSON } from './kit';
import { Figure } from './figure';

interface Held { model: string | null; side: 'left' | 'right'; scale?: number; rot?: [number, number, number]; at?: [number, number, number] }
/** What each starting weapon looks like in the hand (null: nothing in hand). */
const HELD: Record<WeaponId, Held | null> = {
  blade: { model: 'weapon-sword', side: 'right' },
  bow: { model: 'weapon-bow', side: 'left' },
  spear: { model: 'weapon-spear', side: 'right' },
  blaster: { model: 'weapon-shooter', side: 'right', scale: 1.2 },
  wards: { model: 'shield-round', side: 'left', rot: [-Math.PI / 2, Math.PI / 2, 0], at: [0.07, -0.16, 0] },
  shield: { model: 'shield-rectangle', side: 'left', scale: 1.35, rot: [-Math.PI / 2, Math.PI / 2, 0], at: [0.08, -0.2, 0] },
  torch: { model: null, side: 'right', rot: [-Math.PI / 2, 0, 0], at: [0, 0, -0.04] },
  robot: null,
};

/** The clip the arms rest in while holding (the bow and the shields are carried in the left hand). */
export const holdClip = (h: HeroId): string | null => {
  const held = HELD[HEROES[h].start];
  return held ? (held.side === 'left' ? 'holding-left' : 'holding-right') : null;
};

/** A torch: a stick with a pitch head and an unlit (always bright) flame; its tip is `userData.tip`. */
function torchMesh(): THREE.Group {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.3, 6), new THREE.MeshLambertMaterial({ color: 0x7a4a24 }));
  stick.position.y = 0.12;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.026, 0.06, 8), new THREE.MeshLambertMaterial({ color: 0x3a2414 }));
  head.position.y = 0.29;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 8), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  flame.position.y = 0.38;
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 8), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
  core.position.y = 0.36;
  g.add(stick, head, flame, core);
  g.userData.tip = flame;
  g.userData.own = true;
  return g;
}

/** A hero's figure with their weapon in hand (`own`: the platform character's model key). */
export function heroFigure(h: HeroId, o: { scale?: number; ownMaterials?: boolean; shadows?: boolean } = {}, own = playerCharacter3d()): Figure {
  const fig = new Figure(heroKey(h, own), o.scale ?? PERSON, { ownMaterials: o.ownMaterials, shadows: o.shadows });
  const held = HELD[HEROES[h].start];
  if (held) {
    const obj = held.model ? model(miniKey(held.model), { shadows: o.shadows ?? true }) : torchMesh();
    const inner = new THREE.Group();
    inner.add(obj);
    if (held.rot) inner.rotation.set(...held.rot);
    if (held.at) inner.position.set(...held.at);
    const g = new THREE.Group();
    g.applyMatrix4(fistMatrix(held.side, held.scale ?? 1));
    g.add(inner);
    fig.hold(g, held.side);
    if (!held.model) fig.root.userData.torch = obj.userData.tip;
  }
  return fig;
}

/** Frees what heroFigure built itself (the torch); the models' own resources are shared. */
export function disposeHeroFigure(fig: Figure): void {
  fig.dispose();
  fig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose();
    if (!m.isMesh || !o.parent?.userData.own) return;
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  });
  for (const m of fig.mats) m.dispose();
}
