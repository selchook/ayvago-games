// The ballers' build, shared by the simulation (heights, reach, release points) and the view
// (players.ts reshapes every Mini Character to it). No three.js here: the headless bots load it.
//
// The Kenney Mini Characters share one 7-bone skeleton (root, leg-left/right, torso, arm-left/right,
// head), every vertex bound rigidly to one bone. Chibi by design: the head is half the height and
// the legs a quarter. For basketball they become tall and lean: each body part is stretched or
// narrowed about its own joint and the joints are moved to match (the legs above the shoes about
// twice as long, a taller and narrower torso, longer and thinner arms set higher, a smaller head),
// so the skinned mesh stays in one piece at every joint and the animation stays rotation-only.

/** The shared skeleton's bind pose (model units, the model faces +z). */
export const RIG0 = {
  hip: 0.17625,          // leg pivots and the torso pivot above the floor
  legX: 0.0835709646,    // leg pivots either side of the middle
  pivZ: -0.02875,
  armX: 0.09989677, armY: 0.1115, armZ: 0.0115,   // shoulders, in the torso
  headY: 0.167, headZ: 0.0263887774,              // neck, in the torso
  shoe: 0.09,            // the shoes: everything below this height keeps its shape
};

/** How each part is stretched (1 = Kenney's own). */
export const SHAPE = {
  leg: 2.15,       // leg length below the hip
  legW: 0.6,       // leg width and depth above the shoes
  legD: 0.68,
  shoeW: 0.8,      // shoes
  shoeD: 0.92,
  hipW: 0.78,      // the legs closer together
  torsoH: 1.32,
  torsoW: 0.74,
  torsoD: 0.78,
  shoulderY: 0.142, // the shoulder joint, higher up the torso than Kenney's 0.1115
  armL: 1.12,      // arm length
  armT: 0.6,       // arm thickness
  head: 0.62,
};

/** Metres per model unit. */
export const FIG = 2.5;

/** Leg length, hip to sole (m). */
export const LEG_M = RIG0.hip * SHAPE.leg * FIG;
/** Shoulder joint height when standing tall (m). */
export const SHOULDER_M = (RIG0.hip * SHAPE.leg + SHAPE.shoulderY * SHAPE.torsoH) * FIG;
/** Shoulder joint to the middle of the fist (m). */
export const ARM_M = (0.384 - 0.035 - RIG0.armX) * SHAPE.armL * FIG;
/** Neck height (m). */
export const NECK_M = (RIG0.hip * SHAPE.leg + RIG0.headY * SHAPE.torsoH) * FIG;
/** Top of the head (m), for the 0.328-unit Kenney head. */
export const HEIGHT_M = NECK_M + 0.328 * SHAPE.head * FIG;
/** Standing reach, a hand straight up (m). */
export const REACH_M = SHOULDER_M + ARM_M;
/** Half the distance between the shoulder joints (m). */
export const SHOULDER_HALF_M = RIG0.armX * SHAPE.torsoW * FIG;
