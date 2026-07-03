/**
 * vrm-poses.js
 * ─────────────────────────────────────────────────────────────
 * VRM Humanoid Pose Reference Library
 *
 * All rotations are Euler angles in RADIANS ({ x, y, z }, XYZ order),
 * applied to NORMALIZED humanoid bones via @pixiv/three-vrm:
 *
 *   const node = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
 *   node.rotation.set(pose.leftUpperArm.x, pose.leftUpperArm.y, pose.leftUpperArm.z);
 *
 * CONVENTIONS (three-vrm normalized rig, VRM faces +Z toward camera):
 *   • T-pose is the zero state: all bones at {0,0,0}
 *   • Left arm points +X, right arm points -X
 *   • Lowering LEFT arm to the side  → negative Z on leftUpperArm
 *   • Lowering RIGHT arm to the side → positive Z on rightUpperArm
 *   • Elbow bend: leftLowerArm bends with +Y / rightLowerArm with -Y
 *     (forearm swings forward/inward)
 *   • Head: +X = look down, -X = look up, +Y = turn left, +Z = tilt left
 *
 * ⚠ VRM 0.x models are authored facing -Z and three-vrm rotates them
 *   180° — if a pose appears mirrored on a VRM0 model, flip the sign
 *   of Y and Z rotations (or use normalized bones, which handle this).
 *   Treat every value here as a tuned starting point; feed them into
 *   your live arm-tuner panel and adjust per-model.
 */

// ─────────────────────────────────────────────────────────────
// Bone name reference (VRM 1.0 humanoid spec)
// ─────────────────────────────────────────────────────────────

export const VRM_BONES = {
  // Required bones
  core: [
    'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  ],
  leftArm: [
    'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  ],
  rightArm: [
    'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  ],
  leftLeg: [
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  ],
  rightLeg: [
    'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
  ],
  eyes: [
    'leftEye', 'rightEye',
  ],
  // Optional finger bones (proximal → intermediate → distal)
  leftFingers: [
    'leftThumbMetacarpal', 'leftThumbProximal', 'leftThumbDistal',
    'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
    'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
    'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
    'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
  ],
  rightFingers: [
    'rightThumbMetacarpal', 'rightThumbProximal', 'rightThumbDistal',
    'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
    'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
    'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
    'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal',
  ],
};

// Flat list of every bone name
export const ALL_BONES = Object.values(VRM_BONES).flat();

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Degrees → radians shorthand used throughout this file */
export const deg = (d) => (d * Math.PI) / 180;

/** Build a rotation object from degrees */
const r = (x = 0, y = 0, z = 0) => ({ x: deg(x), y: deg(y), z: deg(z) });

// ─────────────────────────────────────────────────────────────
// POSES
// Every pose only lists the bones it moves. Unlisted bones should
// be reset to {0,0,0} (or blended from the current pose).
// ─────────────────────────────────────────────────────────────

export const POSES = {

  /** Raw rig zero state — arms straight out */
  tPose: {},

  /** Arms angled ~45° down — standard authoring/reference pose */
  aPose: {
    leftUpperArm:  r(0, 0, -45),
    rightUpperArm: r(0, 0, 45),
  },

  /** Natural standing idle — arms relaxed at sides, slight elbow bend */
  idle: {
    leftShoulder:  r(0, 0, -5),
    rightShoulder: r(0, 0, 5),
    leftUpperArm:  r(0, 0, -72),
    rightUpperArm: r(0, 0, 72),
    leftLowerArm:  r(0, 12, -5),
    rightLowerArm: r(0, -12, 5),
    leftHand:      r(0, 0, -5),
    rightHand:     r(0, 0, 5),
    spine:         r(2, 0, 0),
    head:          r(-2, 0, 0),
  },

  /** Right hand raised waving hello */
  wave: {
    leftUpperArm:  r(0, 0, -72),
    leftLowerArm:  r(0, 12, -5),
    rightShoulder: r(0, 0, 10),
    rightUpperArm: r(0, -10, -20),   // raised up & slightly forward
    rightLowerArm: r(0, -25, -60),   // forearm up, ready to wave
    rightHand:     r(0, 0, 10),      // animate z between ±25° for the wave
    head:          r(0, -8, 5),      // slight friendly tilt toward the wave
  },

  /** Hand on chin, pondering */
  thinking: {
    leftUpperArm:  r(0, 0, -72),
    leftLowerArm:  r(0, 12, -5),
    rightShoulder: r(0, 0, 8),
    rightUpperArm: r(10, 0, 55),
    rightLowerArm: r(0, -125, 10),   // forearm folded up toward chin
    rightHand:     r(-20, 0, 0),
    head:          r(8, 10, -6),     // looking down-left, tilted
    spine:         r(3, 0, 0),
  },

  /** Pointing forward with right index finger */
  pointForward: {
    leftUpperArm:  r(0, 0, -72),
    leftLowerArm:  r(0, 12, -5),
    rightUpperArm: r(0, -75, 20),    // arm forward
    rightLowerArm: r(0, -10, 0),
    rightHand:     r(0, 0, 0),
    // curl all fingers except index
    rightMiddleProximal: r(0, 0, -80),
    rightMiddleIntermediate: r(0, 0, -90),
    rightRingProximal: r(0, 0, -80),
    rightRingIntermediate: r(0, 0, -90),
    rightLittleProximal: r(0, 0, -80),
    rightLittleIntermediate: r(0, 0, -90),
    rightThumbProximal: r(0, -30, 0),
    head:          r(0, 0, 0),
  },

  /** Arms crossed over chest */
  armsCrossed: {
    leftShoulder:  r(0, 0, -8),
    rightShoulder: r(0, 0, 8),
    leftUpperArm:  r(15, 15, -65),
    rightUpperArm: r(15, -15, 65),
    leftLowerArm:  r(-10, 95, -10),
    rightLowerArm: r(-10, -95, 10),
    leftHand:      r(0, 20, 0),
    rightHand:     r(0, -20, 0),
    spine:         r(-3, 0, 0),      // slight lean back, confident
    head:          r(-3, 0, 0),
  },

  /** Hands on hips, confident stance */
  handsOnHips: {
    leftShoulder:  r(0, 0, -5),
    rightShoulder: r(0, 0, 5),
    leftUpperArm:  r(0, 25, -55),
    rightUpperArm: r(0, -25, 55),
    leftLowerArm:  r(0, 75, -20),
    rightLowerArm: r(0, -75, 20),
    leftHand:      r(0, -30, -20),
    rightHand:     r(0, 30, 20),
    chest:         r(-4, 0, 0),
    head:          r(-4, 0, 0),
  },

  /** Shrug — palms up, shoulders raised, head tilt */
  shrug: {
    leftShoulder:  r(0, 0, -18),     // shoulders up
    rightShoulder: r(0, 0, 18),
    leftUpperArm:  r(0, 0, -55),
    rightUpperArm: r(0, 0, 55),
    leftLowerArm:  r(0, 70, -30),    // forearms out, palms up
    rightLowerArm: r(0, -70, 30),
    leftHand:      r(0, 0, 90),      // rotate palms upward
    rightHand:     r(0, 0, -90),
    head:          r(0, 0, 10),      // quizzical tilt
  },

  /** Both hands clasped in front (polite / listening) */
  handsClasped: {
    leftUpperArm:  r(5, 10, -68),
    rightUpperArm: r(5, -10, 68),
    leftLowerArm:  r(0, 55, -10),
    rightLowerArm: r(0, -55, 10),
    leftHand:      r(0, -15, -10),
    rightHand:     r(0, 15, 10),
    head:          r(3, 0, 0),
  },

  /** Cheering — both arms up in a V */
  cheer: {
    leftShoulder:  r(0, 0, -12),
    rightShoulder: r(0, 0, 12),
    leftUpperArm:  r(0, 10, 40),     // above horizontal
    rightUpperArm: r(0, -10, -40),
    leftLowerArm:  r(0, 20, 15),
    rightLowerArm: r(0, -20, -15),
    head:          r(-10, 0, 0),     // looking up
    spine:         r(-4, 0, 0),
  },

  /** Peace sign near face with right hand (classic VTuber) */
  peaceSign: {
    leftUpperArm:  r(0, 0, -72),
    leftLowerArm:  r(0, 12, -5),
    rightShoulder: r(0, 0, 10),
    rightUpperArm: r(10, -15, 45),
    rightLowerArm: r(0, -130, 0),    // hand up near cheek
    rightHand:     r(0, -20, 0),
    // curl ring + little + thumb, extend index + middle
    rightRingProximal: r(0, 0, -85),
    rightRingIntermediate: r(0, 0, -90),
    rightLittleProximal: r(0, 0, -85),
    rightLittleIntermediate: r(0, 0, -90),
    rightThumbProximal: r(0, -40, 0),
    head:          r(0, -6, 8),      // playful tilt toward the hand
  },

  /** Slight bow (greeting / thanks) */
  bow: {
    hips:          r(5, 0, 0),
    spine:         r(20, 0, 0),
    chest:         r(10, 0, 0),
    head:          r(10, 0, 0),
    leftUpperArm:  r(0, 0, -72),
    rightUpperArm: r(0, 0, 72),
    leftLowerArm:  r(0, 8, 0),
    rightLowerArm: r(0, -8, 0),
  },

  /** Facepalm — right hand to forehead */
  facepalm: {
    leftUpperArm:  r(0, 0, -72),
    leftLowerArm:  r(0, 12, -5),
    rightShoulder: r(0, 0, 10),
    rightUpperArm: r(20, -20, 40),
    rightLowerArm: r(0, -140, 0),
    rightHand:     r(-30, 0, 0),
    head:          r(15, 0, 0),      // head dropped into hand
    spine:         r(5, 0, 0),
  },

  /** Leaning in, curious */
  leanIn: {
    hips:          r(3, 0, 0),
    spine:         r(8, 0, 0),
    head:          r(-5, 0, 6),
    leftUpperArm:  r(0, 0, -70),
    rightUpperArm: r(0, 0, 70),
    leftLowerArm:  r(0, 15, 0),
    rightLowerArm: r(0, -15, 0),
  },
};

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Apply a pose to a VRM instantly.
 * Resets any humanoid bone not present in the pose back to zero.
 *
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {Record<string, {x:number,y:number,z:number}>} pose
 * @param {{ resetOthers?: boolean }} [opts]
 */
export function applyPose(vrm, pose, { resetOthers = true } = {}) {
  for (const bone of ALL_BONES) {
    const node = vrm.humanoid?.getNormalizedBoneNode(bone);
    if (!node) continue;
    const rot = pose[bone];
    if (rot) {
      node.rotation.set(rot.x, rot.y, rot.z);
    } else if (resetOthers) {
      node.rotation.set(0, 0, 0);
    }
  }
}

/**
 * Linearly blend between two poses (for smooth transitions).
 * Returns a new pose object at interpolation factor t ∈ [0, 1].
 * Note: lerping Euler angles is fine for these small, same-order
 * rotations; for large/compound rotations convert to quaternion slerp.
 */
export function blendPoses(poseA, poseB, t) {
  const out = {};
  const bones = new Set([...Object.keys(poseA), ...Object.keys(poseB)]);
  for (const bone of bones) {
    const a = poseA[bone] ?? { x: 0, y: 0, z: 0 };
    const b = poseB[bone] ?? { x: 0, y: 0, z: 0 };
    out[bone] = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    };
  }
  return out;
}

/**
 * Animate a transition from the VRM's current rotations to a target pose.
 * Call once; it drives itself with requestAnimationFrame.
 *
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {Record<string, {x:number,y:number,z:number}>} targetPose
 * @param {number} [duration=400] ms
 * @param {(t:number)=>number} [ease] easing fn, default easeInOutQuad
 * @returns {Promise<void>} resolves when the transition finishes
 */
export function transitionToPose(vrm, targetPose, duration = 400, ease = easeInOutQuad) {
  // Snapshot current rotations as the "from" pose
  const fromPose = {};
  for (const bone of ALL_BONES) {
    const node = vrm.humanoid?.getNormalizedBoneNode(bone);
    if (node) fromPose[bone] = { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z };
  }

  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      applyPose(vrm, blendPoses(fromPose, targetPose, ease(t)), { resetOthers: false });
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Simple looping wave animation for the `wave` pose's right hand */
export function animateWave(vrm, { speed = 6, amplitude = deg(25) } = {}) {
  let raf;
  const hand = vrm.humanoid?.getNormalizedBoneNode('rightHand');
  const base = POSES.wave.rightHand?.z ?? 0;
  const start = performance.now();
  const tick = (now) => {
    if (hand) hand.rotation.z = base + Math.sin(((now - start) / 1000) * speed) * amplitude;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf); // call to stop
}

export default POSES;
