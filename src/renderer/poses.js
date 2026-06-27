// ============================================================================
//  poses.js — procedural body & arm motion for a VRM humanoid.
//
//  Why this exists: three-vrm's spring bones (hair, skirt, accessories) only
//  swing when their parent bones MOVE. So to get lively hair/cloth, we give the
//  body constant, natural motion — idle weight-shifts, breathing, mood posture,
//  one-shot gestures (wave, recoil…), and talk movement — then call vrm.update()
//  so the spring bones react. We also push a gentle ambient "breeze" straight
//  into the spring-bone gravity direction so things drift even while she's still.
//
//  Everything here is additive rotation on the NORMALIZED humanoid rig (canonical
//  T-pose), applied before vrm.update(). Head/neck are intentionally left to the
//  cursor-follow code so the two systems never fight.
// ============================================================================

// Arms hang down at the sides. ARM_DOWN is this model's "down" angle for the
// LEFT upper arm (right is mirrored). Raises are expressed relative to it, so
// flipping ARM_DOWN's sign keeps gestures consistent on a differently-rigged model.
const ARM_DOWN = -1.22;
const D = ARM_DOWN;

const REST = {
  spine: { x: 0.02 },
  leftUpperArm: { z: D },
  rightUpperArm: { z: -D },
  leftLowerArm: { y: 0.12 },
  rightLowerArm: { y: -0.12 },
};

// Sustained posture per mood — torso only, so arms never swing oddly.
const MOOD = {
  happy: { spine: { x: -0.03 }, chest: { x: -0.02 } },
  relaxed: {},
  neutral: {},
  surprised: { spine: { x: -0.05 } },
  sad: { spine: { x: 0.11 }, chest: { x: 0.05 } },
  angry: { spine: { x: 0.05 } },
  joy: { spine: { x: -0.06 }, chest: { x: -0.03 } },
  smug: { spine: { x: -0.02 }, chest: { x: -0.02 } },
  shy: { spine: { x: 0.05 }, chest: { x: 0.04 } },
  love: { spine: { x: -0.03 }, chest: { x: -0.02 } },
  sleepy: { spine: { x: 0.07 }, chest: { x: 0.04 } },
  wink: { spine: { x: -0.02 } },
};

const BONES = ['hips', 'spine', 'chest', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand'];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const damp = (x, y, lambda, dt) => x + (y - x) * (1 - Math.exp(-lambda * dt));
const add = (acc, name, off) => {
  if (!off) return; const a = (acc[name] ||= { x: 0, y: 0, z: 0 });
  a.x += off.x || 0; a.y += off.y || 0; a.z += off.z || 0;
};

const scalePose = (pose, amount) => {
  const out = {};
  for (const bone in pose) {
    const p = pose[bone];
    out[bone] = { x: (p.x || 0) * amount, y: (p.y || 0) * amount, z: (p.z || 0) * amount };
  }
  return out;
};

const POSES = {
  think: {
    rightUpperArm: { z: D * 0.95, x: -0.45, y: -0.25 },
    rightLowerArm: { x: -1.0, y: 1.45 },
    rightHand: { x: -0.25 },
    chest: { y: 0.05 },
  },
  shrug: {
    rightUpperArm: { z: D * 0.65, x: 0.45, y: -0.25 },
    leftUpperArm: { z: -D * 0.65, x: 0.45, y: 0.25 },
    rightLowerArm: { x: -0.8, y: -0.65 },
    leftLowerArm: { x: -0.8, y: 0.65 },
    chest: { y: 0.06 },
  },
  point: {
    rightUpperArm: { z: D * 0.95, x: -0.95, y: -0.12 },
    rightLowerArm: { x: -0.28 },
    rightHand: { x: -0.18 },
    chest: { y: -0.05 },
  },
  clap: {
    rightUpperArm: { z: -D * 0.25, x: -1.06 },
    leftUpperArm: { z: D * 0.25, x: -1.06 },
    rightLowerArm: { x: -0.23, z: 0.39 },
    leftLowerArm: { x: -0.23, z: -0.39 },
    chest: { x: -0.025 },
  },
  facepalm: {
    rightUpperArm: { z: D * 1.15, x: -0.55, y: -0.35 },
    rightLowerArm: { x: -1.45, y: 1.55 },
    rightHand: { x: -0.35 },
    chest: { x: 0.10 },
    spine: { x: 0.06 },
  },
};

// ---- one-shot gesture timelines: gen(p 0..1) -> { bone:{x,y,z} } -------------
// Arm raises are written as multiples of D so they track ARM_DOWN's sign:
// right raise delta = +k*D, left raise delta = -k*D  (both lift the arm up).
const GESTURES = {
  wave(p) {                                     // raise right arm out, wave the forearm
    const up = clamp(p / 0.18), down = 1 - clamp((p - 0.78) / 0.22), amp = up * down;
    const osc = Math.sin(p * Math.PI * 6);
    return {
      rightUpperArm: { z: amp * D * 1.3 },
      rightLowerArm: { x: amp * osc * 0.5 },
      rightHand: { z: amp * osc * 0.3 },
    };
  },
  recoil(p) {                                   // quick surprised lean back (no arm swing)
    const a = (1 - p) * (1 - p) * clamp(p / 0.08);
    return { spine: { x: -a * 0.14 }, chest: { x: -a * 0.06 } };
  },
  cheer(p) {                                    // both arms up briefly
    const a = Math.sin(p * Math.PI);
    return {
      rightUpperArm: { z: a * D * 1.8 },
      leftUpperArm: { z: -a * D * 1.8 },
    };
  },
  think(p) {                                    // bring right forearm up toward chin
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(POSES.think, a);
  },
  nod(p) {                                      // gentle torso bob
    const a = Math.sin(p * Math.PI) * Math.sin(p * Math.PI * 3);
    return { spine: { x: a * 0.05 } };
  },
  bow(p) {                                      // polite forward bow from the waist
    const a = Math.sin(clamp(p) * Math.PI);
    return { spine: { x: a * 0.4 }, chest: { x: a * 0.18 }, hips: { x: a * 0.05 } };
  },
  shrug(p) {                                    // both shoulders up, palms turned out
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(POSES.shrug, a);
  },
  point(p) {                                    // raise right arm forward to point
    const up = clamp(p / 0.2), down = 1 - clamp((p - 0.7) / 0.3), a = up * down;
    return scalePose(POSES.point, a);
  },
  clap(p) {                                     // bring forearms together, repeat
    const env = Math.sin(clamp(p) * Math.PI);
    const forward = Math.min(1, env * 1.35);
    const close = Math.max(0, env - 0.18) / 0.82;
    const tap = Math.sin(p * Math.PI * 8) * close;
    return {
      rightUpperArm: { x: POSES.clap.rightUpperArm.x * forward, z: POSES.clap.rightUpperArm.z * close },
      leftUpperArm: { x: POSES.clap.leftUpperArm.x * forward, z: POSES.clap.leftUpperArm.z * close },
      rightLowerArm: { x: -0.23 * forward - tap * 0.03, z: 0.39 * close + tap * 0.035 },
      leftLowerArm: { x: -0.23 * forward - tap * 0.03, z: -0.39 * close - tap * 0.035 },
      chest: { x: -0.025 * env - Math.max(0, tap) * 0.006 },
    };
  },
  clapTryFoldPos(p) {                           // calibration: front + converge + positive forearm fold
    const a = Math.sin(clamp(p) * Math.PI);
    return {
      rightUpperArm: { z: -a * D * 0.32, x: -a * 0.55 },
      leftUpperArm: { z: a * D * 0.32, x: -a * 0.55 },
      rightLowerArm: { x: a * 1.15 },
      leftLowerArm: { x: a * 1.15 },
      rightHand: { z: a * 0.04 },
      leftHand: { z: -a * 0.04 },
    };
  },
  clapTryFoldNeg(p) {                           // calibration: front + converge + negative forearm fold
    const a = Math.sin(clamp(p) * Math.PI);
    return {
      rightUpperArm: { z: -a * D * 0.32, x: -a * 0.55 },
      leftUpperArm: { z: a * D * 0.32, x: -a * 0.55 },
      rightLowerArm: { x: -a * 1.15 },
      leftLowerArm: { x: -a * 1.15 },
      rightHand: { z: a * 0.04 },
      leftHand: { z: -a * 0.04 },
    };
  },
  clapTryForearmZPos(p) {                       // calibration: front + converge + positive forearm roll
    const a = Math.sin(clamp(p) * Math.PI);
    return {
      rightUpperArm: { z: -a * D * 0.32, x: -a * 0.55 },
      leftUpperArm: { z: a * D * 0.32, x: -a * 0.55 },
      rightLowerArm: { z: a * 1.15 },
      leftLowerArm: { z: -a * 1.15 },
      rightHand: { z: a * 0.04 },
      leftHand: { z: -a * 0.04 },
    };
  },
  clapTryForearmZNeg(p) {                       // calibration: front + converge + negative forearm roll
    const a = Math.sin(clamp(p) * Math.PI);
    return {
      rightUpperArm: { z: -a * D * 0.32, x: -a * 0.55 },
      leftUpperArm: { z: a * D * 0.32, x: -a * 0.55 },
      rightLowerArm: { z: -a * 1.15 },
      leftLowerArm: { z: a * 1.15 },
      rightHand: { z: a * 0.04 },
      leftHand: { z: -a * 0.04 },
    };
  },
  clapAxisElbowYPos(p) {                         // calibration: does this close or open elbows?
    const a = Math.sin(clamp(p) * Math.PI);
    return { rightLowerArm: { y: a * 1.1 }, leftLowerArm: { y: -a * 1.1 } };
  },
  clapAxisElbowYNeg(p) {                         // calibration: opposite elbow twist
    const a = Math.sin(clamp(p) * Math.PI);
    return { rightLowerArm: { y: -a * 1.1 }, leftLowerArm: { y: a * 1.1 } };
  },
  clapAxisElbowXPos(p) {                         // calibration: forearms front/back bend
    const a = Math.sin(clamp(p) * Math.PI);
    return { rightLowerArm: { x: a * 1.1 }, leftLowerArm: { x: a * 1.1 } };
  },
  clapAxisElbowXNeg(p) {                         // calibration: opposite forearm bend
    const a = Math.sin(clamp(p) * Math.PI);
    return { rightLowerArm: { x: -a * 1.1 }, leftLowerArm: { x: -a * 1.1 } };
  },
  clapAxisShoulderZ(p) {                         // calibration: light symmetric shoulder raise
    const a = Math.sin(clamp(p) * Math.PI);
    return { rightUpperArm: { z: a * D * 0.35 }, leftUpperArm: { z: -a * D * 0.35 } };
  },
  clapAxisShoulderZFlip(p) {                     // calibration: opposite symmetric shoulder raise
    const a = Math.sin(clamp(p) * Math.PI);
    return { rightUpperArm: { z: -a * D * 0.35 }, leftUpperArm: { z: a * D * 0.35 } };
  },
  clapAxisShoulderXPos(p) {                      // calibration: shoulder forward/back bend
    const a = Math.sin(clamp(p) * Math.PI);
    return { rightUpperArm: { x: a * 0.55 }, leftUpperArm: { x: a * 0.55 } };
  },
  clapAxisShoulderXNeg(p) {                      // calibration: opposite shoulder bend
    const a = Math.sin(clamp(p) * Math.PI);
    return { rightUpperArm: { x: -a * 0.55 }, leftUpperArm: { x: -a * 0.55 } };
  },
  clapAxisShoulderYForward(p) {                  // calibration: mirrored shoulder yaw from point()
    const a = Math.sin(clamp(p) * Math.PI);
    return { rightUpperArm: { y: -a * 0.55 }, leftUpperArm: { y: a * 0.55 } };
  },
  clapAxisShoulderYBack(p) {                     // calibration: opposite shoulder yaw
    const a = Math.sin(clamp(p) * Math.PI);
    return { rightUpperArm: { y: a * 0.55 }, leftUpperArm: { y: -a * 0.55 } };
  },
  peace(p) {                                    // right hand up by the head (✌ pose)
    const up = clamp(p / 0.2), down = 1 - clamp((p - 0.7) / 0.3), a = up * down;
    return { rightUpperArm: { z: a * D * 1.5 }, rightLowerArm: { x: -a * 1.4 } };
  },
  dance(p) {                                    // sway hips + alternate arms
    const s = Math.sin(p * Math.PI * 6);
    const c = Math.cos(p * Math.PI * 6);
    const env = Math.sin(p * Math.PI);
    return {
      hips: { y: s * 0.16 * env, z: s * 0.10 * env },
      spine: { y: -s * 0.10 * env },
      chest: { y: c * 0.08 * env },
      rightUpperArm: { z: env * D * 0.9 + s * 0.45, x: c * 0.22 },
      leftUpperArm: { z: -env * D * 0.9 - s * 0.45, x: -c * 0.22 },
      rightLowerArm: { x: -0.5 * Math.abs(s) },
      leftLowerArm: { x: -0.5 * Math.abs(c) },
    };
  },
  facepalm(p) {                                 // right hand up to the face, small slump
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(POSES.facepalm, a);
  },
  stretch(p) {                                  // both arms overhead, lean back
    const a = Math.sin(clamp(p) * Math.PI);
    return {
      rightUpperArm: { z: a * D * 1.9 },
      leftUpperArm: { z: -a * D * 1.9 },
      spine: { x: -a * 0.08 },
    };
  },
};
const GESTURE_DUR = {
  wave: 2.2, recoil: 0.7, cheer: 1.4, think: 1.8, nod: 0.9,
  bow: 1.8, shrug: 1.2, point: 1.6, clap: 1.6, peace: 1.6,
  dance: 3.0, facepalm: 1.8, stretch: 2.0,
  clapAxisElbowYPos: 1.2, clapAxisElbowYNeg: 1.2,
  clapAxisElbowXPos: 1.2, clapAxisElbowXNeg: 1.2,
  clapAxisShoulderZ: 1.2, clapAxisShoulderZFlip: 1.2,
  clapAxisShoulderXPos: 1.2, clapAxisShoulderXNeg: 1.2,
  clapAxisShoulderYForward: 1.2, clapAxisShoulderYBack: 1.2,
  clapTryFoldPos: 1.2, clapTryFoldNeg: 1.2,
  clapTryForearmZPos: 1.2, clapTryForearmZNeg: 1.2,
};

export class Gesturizer {
  constructor() {
    this.vrm = null;
    this.relaxArms = true;
    this.idle = true;
    this.mood = 'relaxed';
    this.moodCur = {};      // smoothed mood offsets
    this.gesture = null;    // { name, t, dur }
    this.talking = false;
    this._windPhase = Math.random() * 10;
  }

  attach(vrm) {
    this.vrm = vrm;
    this.moodCur = {};
    // snapshot original spring-bone gravity so we can modulate it as "breeze"
    this._joints = [];
    try {
      const mgr = vrm.springBoneManager;
      const joints = mgr && (mgr.joints || mgr.springs);
      if (joints) for (const j of joints) {
        if (j.settings && j.settings.gravityDir) {
          this._joints.push({ j, base: j.settings.gravityDir.clone(), power: j.settings.gravityPower });
        }
      }
    } catch { }
  }

  setRelaxArms(v) { this.relaxArms = v; }
  setIdle(v) { this.idle = v; }
  setMood(m) { this.mood = MOOD[m] ? m : 'relaxed'; }
  setTalking(v) { this.talking = v; }
  play(name) { if (GESTURES[name]) this.gesture = { name, t: 0, dur: GESTURE_DUR[name] || 1.5 }; }

  get(name) { return this.vrm?.humanoid?.getNormalizedBoneNode(name); }

  update(dt, { t, mouth = 0 }) {
    if (!this.vrm) return;
    const acc = {};

    // 1) rest pose (arms to sides)
    if (this.relaxArms) for (const b in REST) add(acc, b, REST[b]);

    // 2) idle: weight shift + breathing (torso only). Arms stay at rest; the
    //    spring bones still swing from the torso/breathing motion below.
    if (this.idle) {
      add(acc, 'hips', { y: Math.sin(t * 0.5) * 0.045, z: Math.sin(t * 0.4) * 0.018 });
      add(acc, 'spine', { x: Math.sin(t * 1.1) * 0.022, y: Math.sin(t * 0.37) * 0.02 });
      add(acc, 'chest', { x: Math.sin(t * 1.1 + 0.5) * 0.013 });
    }

    // 3) mood posture (smoothed)
    const target = MOOD[this.mood] || {};
    for (const b of BONES) {
      const tgt = target[b] || {};
      const cur = (this.moodCur[b] ||= { x: 0, y: 0, z: 0 });
      cur.x = damp(cur.x, tgt.x || 0, 4, dt);
      cur.y = damp(cur.y, tgt.y || 0, 4, dt);
      cur.z = damp(cur.z, tgt.z || 0, 4, dt);
      add(acc, b, cur);
    }

    // 4) talk movement (forearms/hands) scaled by current mouth level
    if (this.talking) {
      const L = clamp(mouth + 0.15);
      add(acc, 'spine', { y: Math.sin(t * 3) * 0.02 * L });
      add(acc, 'rightLowerArm', { x: Math.sin(t * 7) * 0.06 * L, y: Math.sin(t * 5) * 0.05 * L });
      add(acc, 'leftLowerArm', { x: Math.sin(t * 7 + 1) * 0.05 * L });
      add(acc, 'rightHand', { z: Math.sin(t * 9) * 0.10 * L });
      add(acc, 'leftHand', { z: Math.sin(t * 9 + 1) * 0.08 * L });
    }

    // 5) one-shot gesture
    if (this.gesture) {
      this.gesture.t += dt;
      const p = this.gesture.t / this.gesture.dur;
      if (p >= 1) this.gesture = null;
      else { const off = GESTURES[this.gesture.name](p); for (const b in off) add(acc, b, off[b]); }
    }

    // apply: damp each controlled bone toward its accumulated target
    for (const b of BONES) {
      const node = this.get(b); if (!node) continue;
      const a = acc[b] || { x: 0, y: 0, z: 0 };
      node.rotation.x = damp(node.rotation.x, a.x, 12, dt);
      node.rotation.y = damp(node.rotation.y, a.y, 12, dt);
      node.rotation.z = damp(node.rotation.z, a.z, 12, dt);
    }

    // 6) ambient breeze: nudge spring-bone gravity so hair/skirt drift at rest
    if (this._joints && this._joints.length) {
      this._windPhase += dt;
      const wx = Math.sin(this._windPhase * 0.8) * 0.18 + Math.sin(this._windPhase * 1.9) * 0.06;
      const wz = Math.cos(this._windPhase * 0.6) * 0.12;
      const gust = 1 + Math.sin(this._windPhase * 0.5) * 0.15;
      for (const e of this._joints) {
        try {
          e.j.settings.gravityDir.set(e.base.x + wx, e.base.y, e.base.z + wz).normalize();
          e.j.settings.gravityPower = e.power * gust;
        } catch { }
      }
    }
  }
}
