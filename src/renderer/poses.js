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
  leftUpperArm:  { z: D },
  rightUpperArm: { z: -D },
  leftLowerArm:  { y: 0.12 },
  rightLowerArm: { y: -0.12 },
};

// Sustained posture per mood — torso only, so arms never swing oddly.
const MOOD = {
  happy:     { spine: { x: -0.03 }, chest: { x: -0.02 } },
  relaxed:   {},
  neutral:   {},
  surprised: { spine: { x: -0.05 } },
  sad:       { spine: { x: 0.11 }, chest: { x: 0.05 } },
  angry:     { spine: { x: 0.05 } },
};

const BONES = ['hips', 'spine', 'chest', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand'];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const damp = (x, y, lambda, dt) => x + (y - x) * (1 - Math.exp(-lambda * dt));
const add = (acc, name, off) => {
  if (!off) return; const a = (acc[name] ||= { x: 0, y: 0, z: 0 });
  a.x += off.x || 0; a.y += off.y || 0; a.z += off.z || 0;
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
      rightHand:     { z: amp * osc * 0.3 },
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
      leftUpperArm:  { z: -a * D * 1.8 },
    };
  },
  think(p) {                                    // bring right forearm up toward chin
    const a = Math.sin(clamp(p) * Math.PI);
    return {
      rightUpperArm: { z: a * D * 0.4 },
      rightLowerArm: { y: -a * 1.0 },
    };
  },
  nod(p) {                                      // gentle torso bob
    const a = Math.sin(p * Math.PI) * Math.sin(p * Math.PI * 3);
    return { spine: { x: a * 0.05 } };
  },
};
const GESTURE_DUR = { wave: 2.2, recoil: 0.7, cheer: 1.4, think: 1.8, nod: 0.9 };

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
