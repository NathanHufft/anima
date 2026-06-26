// ============================================================================
//  avatar.js — brings the companion's face to life.
//  Exposes one Avatar object with: loadVRM(buffer), setMouth(0..1),
//  setExpression(name), setFollowCursor(bool), pointer(x,y), start().
//  Falls back to an animated SVG face until a .vrm is loaded.
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { Gesturizer } from './poses.js';

// Each mood is a recipe of base VRM expressions (plus optional eyelid control:
// `blink` half-closes both eyes, `blinkRight` winks one), so we can express
// composite feelings well beyond the six standard VRM presets.
const EXPR_DEFS = {
  neutral: {},
  happy: { happy: 1 },
  angry: { angry: 1 },
  sad: { sad: 1 },
  relaxed: { relaxed: 1 },
  surprised: { surprised: 1 },
  joy: { happy: 1, surprised: 0.35 },
  smug: { happy: 0.45, relaxed: 0.5 },
  shy: { happy: 0.4, sad: 0.22, relaxed: 0.4 },
  love: { happy: 0.9, relaxed: 0.35 },
  sleepy: { relaxed: 0.8, sad: 0.12, blink: 0.5 },
  wink: { happy: 0.7, blinkRight: 1 },
};
const BASE_EXPR = ['happy', 'angry', 'sad', 'relaxed', 'surprised'];

export class Avatar {
  constructor({ canvas, fallbackEl }) {
    this.canvas = canvas;
    this.fallbackEl = fallbackEl;
    this.vrm = null;
    this.mouth = 0;            // current lip-sync level
    this.targetExpr = 'neutral';
    this.exprWeights = {};     // smoothed expression weights
    this.follow = true;
    this.ptr = { x: 0, y: 0 }; // normalised cursor (-1..1)
    this._blinkAt = 0;
    this._blink = 0;
    this.viewDist = 1.7;   // camera distance (scroll on her to zoom live)
    this.viewY = -0.22;    // camera height offset from head
    this.lookY = -0.28;    // look-at height offset from head
    this._headY = 1.3;
    this.fallback = new FallbackAvatar(fallbackEl);
    this.gestures = new Gesturizer();
    this._setupThree();
    this._fallbackMode = true;
    fallbackEl.hidden = false;
    canvas.style.opacity = '0';
  }

  _setupThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    this.camera.position.set(0, 1.1, this.viewDist);
    // scroll on the avatar to zoom in / out
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.viewDist = Math.min(4, Math.max(0.6, this.viewDist + e.deltaY * 0.0015));
      this.reframe();
    }, { passive: false });

    const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(1, 2, 2);
    const rim = new THREE.DirectionalLight(0x9ec0ff, 1.1); rim.position.set(-2, 1, -1.5);
    const amb = new THREE.AmbientLight(0xb9a0ff, 1.0);
    this.scene.add(key, rim, amb);

    this.lookTarget = new THREE.Object3D();
    this.lookTarget.position.set(0, 1.32, 2);
    this.scene.add(this.lookTarget);

    this.clock = new THREE.Clock();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async loadVRM(arrayBuffer) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(arrayBuffer, '');
    const vrm = gltf.userData.vrm;
    try { VRMUtils.removeUnnecessaryVertices(gltf.scene); } catch { }
    try { VRMUtils.removeUnnecessaryJoints(gltf.scene); } catch { }

    if (this.vrm) this.scene.remove(this.vrm.scene);
    this.vrm = vrm;
    this.scene.add(vrm.scene);

    // VRM 0.x faces -Z; rotate to face the camera.
    try { VRMUtils.rotateVRM0(vrm); } catch { }
    vrm.scene.rotation.y = vrm.meta?.metaVersion === '0' ? Math.PI : 0;

    if (vrm.lookAt) { vrm.lookAt.target = this.lookTarget; vrm.lookAt.autoUpdate = true; }

    this.gestures.attach(vrm);
    this._frameUpperBody();
    this._fallbackMode = false;
    this.fallbackEl.hidden = true;
    this.canvas.style.opacity = '1';
    return vrm;
  }

  _frameUpperBody() {
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      const p = new THREE.Vector3(); head.getWorldPosition(p);
      this._headY = p.y;
    }
    this.reframe();
  }

  reframe() {
    const y = this._headY;
    this.camera.position.set(0, y + this.viewY, this.viewDist);
    this.camera.lookAt(0, y + this.lookY, 0);
    this.lookTarget.position.set(0, y, 2);
  }

  setMouth(v) { this.mouth = Math.max(0, Math.min(1, v)); }
  setExpression(name) {
    this.targetExpr = EXPR_DEFS[name] ? name : 'neutral';
    this.gestures.setMood(this.targetExpr);
    this.fallback.setExpression(this.targetExpr);
  }
  setFollowCursor(on) { this.follow = on; }
  pointer(nx, ny) { this.ptr.x = nx; this.ptr.y = ny; }

  // gesture / body controls
  playGesture(name) { this.gestures.play(name); }
  setTalking(on) { this._talking = on; this.gestures.setTalking(on); }
  setRelaxArms(on) { this.gestures.setRelaxArms(on); }
  setIdleMotion(on) { this.gestures.setIdle(on); }

  start() {
    const loop = () => {
      const dt = this.clock.getDelta();
      this._animate(dt);
      requestAnimationFrame(loop);
    };
    loop();
  }

  _animate(dt) {
    const t = performance.now() / 1000;

    // auto-blink
    if (t > this._blinkAt) { this._blink = 1; this._blinkAt = t + 2.4 + Math.random() * 3.2; }
    this._blink *= 0.62; // quick decay → eyes reopen

    if (this._fallbackMode || !this.vrm) {
      this.fallback.frame({ mouth: this.mouth, blink: this._blink, ptr: this.ptr, follow: this.follow, t });
      return;
    }

    const em = this.vrm.expressionManager;
    if (em) {
      // expression cross-fade — blend toward the target mood's recipe of base
      // VRM expressions, so composite moods (joy, shy, love…) are possible.
      const recipe = EXPR_DEFS[this.targetExpr] || EXPR_DEFS.neutral;
      // VRoid's happy/relaxed presets close the eyes into arcs; while she's
      // talking, ease them back so she keeps her eyes open and looks engaged.
      for (const name of BASE_EXPR) {
        let tgt = recipe[name] || 0;
        if (this._talking && (name === 'happy' || name === 'relaxed')) tgt *= 0.45;
        this.exprWeights[name] = lerp(this.exprWeights[name] || 0, tgt, 0.12);
        try { em.setValue(name, this.exprWeights[name]); } catch { }
      }
      // some moods hold the eyes (half-)closed (sleepy) or wink one eye
      this._exprBlink = lerp(this._exprBlink || 0, recipe.blink || 0, 0.12);
      this._exprWink = lerp(this._exprWink || 0, recipe.blinkRight || 0, 0.12);

      // lip-sync: drive the open-mouth viseme
      try { em.setValue('aa', this.mouth * 0.9); } catch { }
      try { em.setValue('ih', this.mouth * 0.2); } catch { }
      // blink: max of the auto-blink and any mood-held lid; optional one-eye wink
      try { em.setValue('blink', Math.min(1, Math.max(this._blink, this._exprBlink))); } catch { }
      if (this._exprWink > 0.01) { try { em.setValue('blinkRight', this._exprWink); } catch { } }
    }

    // gentle breathing, weight-shift, mood posture, gestures, talk movement.
    // This moves the body so VRM spring bones (hair/skirt) swing naturally.
    this.gestures.update(dt, { t, mouth: this.mouth });

    // eyes/head follow cursor (applied after gestures so the head stays free)
    if (this.follow) {
      this.lookTarget.position.x = lerp(this.lookTarget.position.x, this.ptr.x * 1.4, 0.1);
      this.lookTarget.position.y = lerp(this.lookTarget.position.y, 1.32 + this.ptr.y * 0.6, 0.1);
      const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
      if (head) {
        head.rotation.y = lerp(head.rotation.y, this.ptr.x * 0.28, 0.08);
        head.rotation.x = lerp(head.rotation.x, -this.ptr.y * 0.18, 0.08);
      }
    }

    this.vrm.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ----------------------------------------------------------------------------
// Animated SVG fallback (used until a .vrm is supplied). Same surface API.
// ----------------------------------------------------------------------------
class FallbackAvatar {
  constructor(el) {
    this.el = el;
    this.svg = el.querySelector('#face-svg');
    this.mouth = el.querySelector('#mouth');
    this.eyesG = el.querySelector('#eyes');
    this.expr = 'neutral';
  }
  setExpression(name) { this.expr = name; }
  frame({ mouth, blink, ptr, follow, t }) {
    if (this.el.hidden) return;
    this.svg.classList.toggle('blink', blink > 0.4);

    // mouth open amount → reshape the path
    const open = 4 + mouth * 16;
    const curve = this.expr === 'happy' ? -8 : this.expr === 'sad' ? 8 : 0;
    this.mouth.setAttribute('d',
      `M96 168 Q110 ${168 + open + curve} 124 168 Q110 ${168 - 2} 96 168`);

    // eyes drift toward cursor
    if (follow && this.eyesG) {
      const dx = ptr.x * 4, dy = ptr.y * 3;
      this.eyesG.setAttribute('transform', `translate(${dx},${dy})`);
    }
  }
}
