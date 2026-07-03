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
//  T-pose), applied before vrm.update(). Head/neck ARE posed here now; the
//  cursor-follow in avatar.js adds its offset ON TOP afterwards, so the two
//  systems stack instead of fighting.
// ============================================================================

// Arms hang down at the sides. ARM_DOWN is this model's "down" angle for the
// LEFT upper arm (right is mirrored). Raises are expressed relative to it, so
// flipping ARM_DOWN's sign keeps gestures consistent on a differently-rigged model.
const ARM_DOWN = -1.22;
const D = ARM_DOWN;

// Finger curl sign convention (normalized rig): curling toward the palm is
// negative z on the LEFT hand and positive z on the RIGHT — the same signs as
// lowering the arms. If a model's fingers bend backwards, flip these.
export const CURL_L = -1;
export const CURL_R = 1;

// Soft natural curl for a relaxed hand (thumbs are left alone).
const curlFingers = (side, sign, amt) => {
  const out = {};
  for (const f of ['Index', 'Middle', 'Ring', 'Little']) {
    out[`${side}${f}Proximal`] = { z: sign * amt };
    out[`${side}${f}Intermediate`] = { z: sign * amt * 1.2 };
  }
  return out;
};

const REST = {
  spine: { x: 0.02 },
  leftUpperArm: { z: D },
  rightUpperArm: { z: -D },
  leftLowerArm: { y: 0.12 },
  rightLowerArm: { y: -0.12 },
  ...curlFingers('left', CURL_L, 0.18),
  ...curlFingers('right', CURL_R, 0.18),
};

// Sustained posture per mood. Torso sets the stance; head/neck/shoulders add
// the body language. Everything is additive — cursor-follow stacks on top of
// the head, so she keeps eye contact while holding the mood.
// Shoulder signs: raise = left +z / right -z; roll forward = left -y / right +y.
const MOOD = {
  happy: { spine: { x: -0.03 }, chest: { x: -0.02 }, head: { x: -0.03 } },
  relaxed: {},
  neutral: {},
  surprised: {
    spine: { x: -0.05 }, head: { x: -0.06 },
    leftShoulder: { z: 0.08 }, rightShoulder: { z: -0.08 },
  },
  sad: {
    spine: { x: 0.11 }, chest: { x: 0.05 }, neck: { x: 0.08 }, head: { x: 0.12 },
    leftShoulder: { y: -0.1, z: 0.05 }, rightShoulder: { y: 0.1, z: -0.05 },
  },
  angry: {
    spine: { x: 0.05 }, head: { x: 0.06 },
    leftShoulder: { z: 0.1 }, rightShoulder: { z: -0.1 },
  },
  joy: { spine: { x: -0.06 }, chest: { x: -0.03 }, head: { x: -0.05 } },
  smug: { spine: { x: -0.02 }, chest: { x: -0.02 }, head: { x: -0.04, z: 0.06 } },
  shy: {
    spine: { x: 0.05 }, chest: { x: 0.04 }, head: { x: 0.1, z: 0.08 },
    leftShoulder: { y: -0.12, z: 0.08 }, rightShoulder: { y: 0.12, z: -0.08 },
  },
  love: { spine: { x: -0.03 }, chest: { x: -0.02 }, head: { x: -0.02, z: 0.08 } },
  sleepy: { spine: { x: 0.07 }, chest: { x: 0.04 }, neck: { x: 0.06 }, head: { x: 0.1, z: 0.12 } },
  wink: { spine: { x: -0.02 }, head: { z: 0.1 } },
};

const CORE_BONES = ['hips', 'spine', 'chest', 'neck', 'head'];
const ARM_BONES = ['leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand'];
const fingerBonesFor = (side) => ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].flatMap(f =>
  f === 'Thumb'
    ? [`${side}ThumbMetacarpal`, `${side}ThumbProximal`, `${side}ThumbDistal`]
    : [`${side}${f}Proximal`, `${side}${f}Intermediate`, `${side}${f}Distal`]);
export const FINGER_BONES_LEFT = fingerBonesFor('left');
export const FINGER_BONES_RIGHT = fingerBonesFor('right');

// Grouped bone list — the Gesturizer drives all of these, and the Pose Lab in
// settings.js renders its sliders from these groups (single source of truth).
export const BONE_GROUPS = {
  'Core & head': CORE_BONES,
  'Shoulders & arms': ARM_BONES,
  'Left fingers': FINGER_BONES_LEFT,
  'Right fingers': FINGER_BONES_RIGHT,
};
const BONES = [...CORE_BONES, ...ARM_BONES, ...FINGER_BONES_LEFT, ...FINGER_BONES_RIGHT];

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

export const POSES = {
  wave: {
    rightUpperArm: { z: D * 1.3 },
    rightLowerArm: { x: 0.5 },
    rightHand: { z: 0.3 },
    rightShoulder: { z: -0.12 },
    neck: { z: -0.04 },
    head: { y: -0.1, z: -0.08 },              // friendly tilt toward the wave
    ...curlFingers('right', CURL_R, -0.18),   // open the hand
  },
  recoil: {
    spine: { x: -0.14 },
    chest: { x: -0.06 },
    neck: { x: -0.08 },
    head: { x: -0.12 },                       // head snaps back too
    leftShoulder: { z: 0.12 }, rightShoulder: { z: -0.12 },
  },
  cheer: {
    rightUpperArm: { z: D * 1.8 },
    leftUpperArm: { z: -D * 1.8 },
    leftShoulder: { z: 0.1 }, rightShoulder: { z: -0.1 },
    head: { x: -0.12 },                       // looking up
    ...curlFingers('left', CURL_L, -0.18),    // open both hands
    ...curlFingers('right', CURL_R, -0.18),
  },
  think: {
    rightUpperArm: { z: D * 0.95, x: -0.45, y: -0.25 },
    rightLowerArm: { x: -1.0, y: 1.45 },
    rightHand: { x: -0.25 },
    chest: { y: 0.05 },
    neck: { x: 0.04 },
    head: { x: 0.08, y: 0.15, z: -0.08 },     // pondering, gaze down-left
    ...curlFingers('right', CURL_R, 0.2),     // loose fist against the chin
  },
  nod: {
    spine: { x: 0.03 },
    neck: { x: 0.1 },
    head: { x: 0.16 },                        // an actual head nod now
  },
  bow: {
    spine: { x: 0.4 },
    chest: { x: 0.18 },
    hips: { x: 0.05 },
    neck: { x: 0.12 },
    head: { x: 0.15 },                        // head follows the bow
  },
  shrug: {
    rightUpperArm: { z: D * 0.65, x: 0.45, y: -0.25 },
    leftUpperArm: { z: -D * 0.65, x: 0.45, y: 0.25 },
    rightLowerArm: { x: -0.8, y: -0.65 },
    leftLowerArm: { x: -0.8, y: 0.65 },
    chest: { y: 0.06 },
    leftShoulder: { z: 0.25 }, rightShoulder: { z: -0.25 },  // real shoulder raise
    head: { z: 0.1 },                         // quizzical tilt
    ...curlFingers('left', CURL_L, -0.18),    // palms open
    ...curlFingers('right', CURL_R, -0.18),
  },
  point: {
    rightUpperArm: { z: D * 0.95, x: -0.95, y: -0.12 },
    rightLowerArm: { x: -0.28 },
    rightHand: { x: -0.18 },
    chest: { y: -0.05 },
    // curl everything but the index (index delta cancels the rest-pose curl)
    rightIndexProximal: { z: -CURL_R * 0.18 }, rightIndexIntermediate: { z: -CURL_R * 0.22 },
    rightMiddleProximal: { z: CURL_R * 1.2 }, rightMiddleIntermediate: { z: CURL_R * 1.3 },
    rightRingProximal: { z: CURL_R * 1.2 }, rightRingIntermediate: { z: CURL_R * 1.3 },
    rightLittleProximal: { z: CURL_R * 1.2 }, rightLittleIntermediate: { z: CURL_R * 1.3 },
  },
  clap: {
    rightUpperArm: { z: -D * 0.25, x: -1.06 },
    leftUpperArm: { z: D * 0.25, x: -1.06 },
    rightLowerArm: { x: -0.23, z: 0.39 },
    leftLowerArm: { x: -0.23, z: -0.39 },
    chest: { x: -0.025 },
    head: { x: 0.03 },
    ...curlFingers('left', CURL_L, -0.15),    // flatten the hands to clap
    ...curlFingers('right', CURL_R, -0.15),
  },
  peace: {
    rightUpperArm: { z: D * 1.5 },
    rightLowerArm: { x: -1.4 },
    // ✌ — index + middle straight, ring + little curled, thumb tucked
    rightIndexProximal: { z: -CURL_R * 0.18 }, rightIndexIntermediate: { z: -CURL_R * 0.22 },
    rightMiddleProximal: { z: -CURL_R * 0.18 }, rightMiddleIntermediate: { z: -CURL_R * 0.22 },
    rightRingProximal: { z: CURL_R * 1.2 }, rightRingIntermediate: { z: CURL_R * 1.3 },
    rightLittleProximal: { z: CURL_R * 1.2 }, rightLittleIntermediate: { z: CURL_R * 1.3 },
    rightThumbProximal: { y: -0.5 },
  },
  dance: {
    hips: { y: 0.16, z: 0.10 },
    spine: { y: -0.10 },
    chest: { y: 0.08 },
    rightUpperArm: { z: D * 0.9, x: 0.22 },
    leftUpperArm: { z: -D * 0.9, x: -0.22 },
    rightLowerArm: { x: -0.5 },
    leftLowerArm: { x: -0.5 },
  },
  facepalm: {
    rightUpperArm: { z: D * 1.15, x: -0.55, y: -0.35 },
    rightLowerArm: { x: -1.45, y: 1.55 },
    rightHand: { x: -0.35 },
    chest: { x: 0.10 },
    spine: { x: 0.06 },
    neck: { x: 0.08 },
    head: { x: 0.22 },                        // head drops into the hand
  },
  stretch: {
    rightUpperArm: { z: D * 1.9 },
    leftUpperArm: { z: -D * 1.9 },
    spine: { x: -0.08 },
    leftShoulder: { z: 0.15 }, rightShoulder: { z: -0.15 },
    head: { x: -0.15 },                       // face up mid-stretch
    ...curlFingers('left', CURL_L, -0.18),    // fingers splayed
    ...curlFingers('right', CURL_R, -0.18),
  },
  armsCrossed: {
    // fold both forearms inward across the chest (frontal-plane z fold, like
    // clap's close-in). Right arm sits slightly more forward so it lies on top.
    rightUpperArm: { x: -0.55, z: D * 0.1 },
    leftUpperArm: { x: -0.35, z: -D * 0.1 },
    rightLowerArm: { z: 2.0 },
    leftLowerArm: { z: -2.0 },
    rightHand: { y: 0.25 },
    leftHand: { y: -0.25 },
    chest: { x: -0.03 },
    spine: { x: -0.02 },
  },
  handsOnHips: {
    // elbows flare out, forearms fold inward so the hands land at the hips
    rightUpperArm: { z: D * 0.35 },
    leftUpperArm: { z: -D * 0.35 },
    rightLowerArm: { z: 1.75 },
    leftLowerArm: { z: -1.75 },
    rightHand: { z: 0.35, y: 0.25 },
    leftHand: { z: -0.35, y: -0.25 },
    chest: { x: -0.04 },
  },
  handsClasped: {
    // arms slightly forward, forearms fold in until the hands meet in front
    rightUpperArm: { x: -0.3, z: D * 0.05 },
    leftUpperArm: { x: -0.3, z: -D * 0.05 },
    rightLowerArm: { z: 1.15 },
    leftLowerArm: { z: -1.15 },
    rightHand: { z: 0.2, y: 0.25 },
    leftHand: { z: -0.2, y: -0.25 },
    head: { x: 0.04 },
    ...curlFingers('left', CURL_L, 0.15),     // fingers wrap together gently
    ...curlFingers('right', CURL_R, 0.15),
  },
  leanIn: {
    hips: { x: 0.05 },
    spine: { x: 0.1 },
    chest: { x: 0.07 },
    neck: { x: -0.08 },
    head: { z: 0.08 },
  },
};

let poseOverrides = {};
// Overrides MERGE over the base pose per-bone. (Whole-pose replacement meant
// overrides saved before head/shoulders/fingers existed would erase those
// bones from every tuned gesture.)
const poseFor = (name) => {
  const base = POSES[name] || {};
  const over = poseOverrides[name];
  return over ? { ...base, ...over } : base;
};

// ---- one-shot gesture timelines: gen(p 0..1) -> { bone:{x,y,z} } -------------
// Arm raises are written as multiples of D so they track ARM_DOWN's sign:
// right raise delta = +k*D, left raise delta = -k*D  (both lift the arm up).
const GESTURES = {
  wave(p) {                                     // raise right arm out, wave the forearm
    const up = clamp(p / 0.18), down = 1 - clamp((p - 0.78) / 0.22), amp = up * down;
    const osc = Math.sin(p * Math.PI * 6);
    const wave = poseFor('wave');
    const out = scalePose(wave, amp);           // shoulder/head/fingers ride the envelope
    out.rightLowerArm = { x: (wave.rightLowerArm?.x || 0) * amp * osc };
    out.rightHand = { z: (wave.rightHand?.z || 0) * amp * osc };
    return out;
  },
  recoil(p) {                                   // quick surprised lean back (no arm swing)
    const a = (1 - p) * (1 - p) * clamp(p / 0.08);
    return scalePose(poseFor('recoil'), a);
  },
  cheer(p) {                                    // both arms up briefly
    const a = Math.sin(p * Math.PI);
    return scalePose(poseFor('cheer'), a);
  },
  think(p) {                                    // bring right forearm up toward chin
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(poseFor('think'), a);
  },
  nod(p) {                                      // gentle torso bob
    const a = Math.sin(p * Math.PI) * Math.sin(p * Math.PI * 3);
    return scalePose(poseFor('nod'), a);
  },
  bow(p) {                                      // polite forward bow from the waist
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(poseFor('bow'), a);
  },
  shrug(p) {                                    // both shoulders up, palms turned out
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(poseFor('shrug'), a);
  },
  point(p) {                                    // raise right arm forward to point
    const up = clamp(p / 0.2), down = 1 - clamp((p - 0.7) / 0.3), a = up * down;
    return scalePose(poseFor('point'), a);
  },
  clap(p) {                                     // bring forearms together, repeat
    const env = Math.sin(clamp(p) * Math.PI);
    const forward = Math.min(1, env * 1.35);
    const close = Math.max(0, env - 0.18) / 0.82;
    const tap = Math.sin(p * Math.PI * 8) * close;
    const clap = poseFor('clap');
    const out = scalePose(clap, close);         // head/fingers ride the close-in
    out.rightUpperArm = { x: (clap.rightUpperArm?.x || 0) * forward, z: (clap.rightUpperArm?.z || 0) * close };
    out.leftUpperArm = { x: (clap.leftUpperArm?.x || 0) * forward, z: (clap.leftUpperArm?.z || 0) * close };
    out.rightLowerArm = { x: (clap.rightLowerArm?.x || 0) * forward - tap * 0.03, z: (clap.rightLowerArm?.z || 0) * close + tap * 0.035 };
    out.leftLowerArm = { x: (clap.leftLowerArm?.x || 0) * forward - tap * 0.03, z: (clap.leftLowerArm?.z || 0) * close - tap * 0.035 };
    out.chest = { x: -0.025 * env - Math.max(0, tap) * 0.006 };
    return out;
  },
  peace(p) {                                    // right hand up by the head (✌ pose)
    const up = clamp(p / 0.2), down = 1 - clamp((p - 0.7) / 0.3), a = up * down;
    return scalePose(poseFor('peace'), a);
  },
  dance(p) {                                    // sway hips + alternate arms
    const s = Math.sin(p * Math.PI * 6);
    const c = Math.cos(p * Math.PI * 6);
    const env = Math.sin(p * Math.PI);
    const dance = poseFor('dance');
    return {
      hips: { y: (dance.hips?.y || 0) * s * env, z: (dance.hips?.z || 0) * s * env },
      spine: { y: (dance.spine?.y || 0) * s * env },
      chest: { y: (dance.chest?.y || 0) * c * env },
      neck: { z: s * 0.06 * env },
      head: { z: s * 0.12 * env, y: c * 0.1 * env },   // head sways with the beat
      rightUpperArm: { z: (dance.rightUpperArm?.z || 0) * env + s * 0.45, x: (dance.rightUpperArm?.x || 0) * c },
      leftUpperArm: { z: (dance.leftUpperArm?.z || 0) * env - s * 0.45, x: (dance.leftUpperArm?.x || 0) * c },
      rightLowerArm: { x: (dance.rightLowerArm?.x || 0) * Math.abs(s) },
      leftLowerArm: { x: (dance.leftLowerArm?.x || 0) * Math.abs(c) },
    };
  },
  facepalm(p) {                                 // right hand up to the face, small slump
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(poseFor('facepalm'), a);
  },
  stretch(p) {                                  // both arms overhead, lean back
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(poseFor('stretch'), a);
  },
  armsCrossed(p) {                              // fold arms over the chest, hold, release
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(poseFor('armsCrossed'), a);
  },
  handsOnHips(p) {                              // confident hands-on-hips stance
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(poseFor('handsOnHips'), a);
  },
  handsClasped(p) {                             // hands together in front, polite/listening
    const a = Math.sin(clamp(p) * Math.PI);
    return scalePose(poseFor('handsClasped'), a);
  },
  leanIn(p) {                                   // curious lean toward the screen
    const up = clamp(p / 0.25), down = 1 - clamp((p - 0.7) / 0.3);
    return scalePose(poseFor('leanIn'), up * down);
  },
};
const GESTURE_DUR = {
  wave: 2.2, recoil: 0.7, cheer: 1.4, think: 1.8, nod: 0.9,
  bow: 1.8, shrug: 1.2, point: 1.6, clap: 1.6, peace: 1.6,
  dance: 3.0, facepalm: 1.8, stretch: 2.0,
  armsCrossed: 3.0, handsOnHips: 2.6, handsClasped: 2.6, leanIn: 1.8,
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
    this._cur = {};         // our own smoothed per-bone state (see update())
    this._windPhase = Math.random() * 10;
  }

  attach(vrm) {
    this.vrm = vrm;
    this.moodCur = {};
    this._cur = {};
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
  setPoseOverrides(overrides) { poseOverrides = overrides || {}; }
  setPoseOverride(name, pose) {
    if (!name) return;
    poseOverrides = { ...poseOverrides, [name]: pose };
  }
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

    // apply: damp each controlled bone toward its accumulated target.
    // We damp OUR OWN state (not node.rotation) so additive effects layered on
    // afterwards — like the cursor-follow head offset in avatar.js — never
    // pollute the damping.
    for (const b of BONES) {
      const node = this.get(b); if (!node) continue;
      const a = acc[b] || { x: 0, y: 0, z: 0 };
      const cur = (this._cur[b] ||= { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z });
      cur.x = damp(cur.x, a.x, 12, dt);
      cur.y = damp(cur.y, a.y, 12, dt);
      cur.z = damp(cur.z, a.z, 12, dt);
      node.rotation.set(cur.x, cur.y, cur.z);
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
