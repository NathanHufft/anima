# Anima

<p align="center">
  <img src="https://img.shields.io/github/stars/NathanHufft/anima?style=social" alt="GitHub stars">
  <img src="https://img.shields.io/github/license/NathanHufft/anima" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platforms">
  <img src="https://img.shields.io/badge/Electron-42-blue" alt="Electron">
</p>

<p align="center">
  <strong>A floating 3D anime desktop companion powered by any LLM.</strong><br>
  Expressive VRM avatar • Mood-driven expressions & gestures • Lip-sync voice • Opt-in agent tools
</p>

<p align="center">
  <a href="https://github.com/NathanHufft/anima">GitHub</a> •
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-screenshots">Screenshots</a>
</p>

---

A frameless, transparent, always-on-top desktop companion. She renders a real
3D anime (VTuber-style) avatar, blinks and breathes, follows your cursor,
lip-syncs while she talks, and thinks with **any** LLM you plug in:
**Claude, GPT, Grok, Ollama, or Azure AI Foundry.** Voice is built-in (offline)
with **ElevenLabs** and **Azure Speech** ready to swap in.

> **About the avatar:** the polished anime look in your reference (Keeki's
> Coloso course) is a hand-built Blender → Substance → Unity model. That kind of
> character exports to the **`.vrm`** format — the VTuber industry standard.
> Anima is the *engine* that loads any `.vrm` and brings it fully to life.
> You supply the body; Anima supplies the brain, voice, animation, and the
> floating desktop window.

---

## ✨ Features

- **Living 3D Avatar** — Load any `.vrm` (VRoid, VRChat, custom). Real-time expressions, gestures, breathing, cursor following, and spring-bone physics.
- **Any Brain** — Claude, GPT-4o, Grok, Ollama (local), or Azure AI Foundry. Switch anytime.
- **Natural Voice** — Offline system TTS, ElevenLabs, or Azure Speech with accurate lip-sync.
- **Agent Tools (opt-in)** — Let her read/write files in a sandbox, open apps, run commands, set timers — always with your approval.
- **Ghost Mode** — Click-through floating window that lives on your desktop.
- **First-Run Wizard** — Beautiful 3-step onboarding to get you up and running in under a minute.
- **Privacy First** — API keys encrypted at rest. Full local mode with Ollama.

---

## 📸 Screenshots

<p align="center">
  <img src="https://via.placeholder.com/800x450/0d0b1a/b9a0ff?text=Anima+Floating+on+Desktop" alt="Anima floating on desktop" width="800">
  <br><em>Anima floating over your desktop in Ghost Mode</em>
</p>

<p align="center">
  <img src="https://via.placeholder.com/800x450/0d0b1a/b9a0ff?text=First-Run+Wizard" alt="First-Run Wizard" width="800">
  <br><em>Beautiful 3-step First-Run Wizard</em>
</p>

<p align="center">
  <img src="https://via.placeholder.com/800x450/0d0b1a/b9a0ff?text=Settings+Window" alt="Settings" width="800">
  <br><em>Detached Settings window with live expression & gesture testing</em>
</p>

---

## 1. Run it

You need [Node.js](https://nodejs.org) 18+ installed.

```bash
cd anima-companion
npm install
npm start
```

She'll appear bottom-right, floating over your desktop, on the fallback face.
Open **⚙ Settings** to add a brain, a voice, and her body.

## 2. Give her a body (the .vrm)

You have three routes, cheapest first:

- **Free, ~30 min:** download [**VRoid Studio**](https://vroid.com/en/studio)
  (free), design an anime character with sliders, and **Export → VRM**.
- **Commission / course:** a model built in the Keeki workflow exports straight
  to `.vrm` (for VRChat/Warudo) — load that same file here.
- **Marketplaces:** grab a `.vrm` from Booth, VRoid Hub, etc.

Then in Settings → **Avatar → Load .vrm model…**. She remembers it next launch.

## 3. Give her a brain

Settings → **Brain** → pick a provider and paste that provider's API key:

| Provider | Where the key comes from | Default model |
|----------|--------------------------|---------------|
| Claude   | console.anthropic.com    | `claude-sonnet-4-6` |
| GPT      | platform.openai.com      | `gpt-4o` |
| Grok     | console.x.ai             | `grok-2-latest` |
| Ollama   | runs locally, no key     | `llama3.1` |

You can override the model string per provider. Keys are stored **encrypted on
your machine** (Electron `safeStorage`) and only ever sent to the provider you
chose. Switch brains anytime — your keys stay saved.

> Ollama is fully local: install Ollama, run `ollama pull llama3.1`, set the
> provider to **Local — Ollama**, and she runs with no cloud and no key.

## 4. Give her a voice

- **Built-in (offline):** uses your OS voices. Pick one in Settings.
- **ElevenLabs:** choose the ElevenLabs engine, paste your key + a voice ID.
  This path analyses the real audio, so the lip-sync is tighter.

## 5. Ghost mode (true desktop pet)

Settings → **Ghost mode** (or the tray menu) makes the window click-through:
she floats on your desktop and your clicks pass through to whatever's behind
her — until your cursor is over her or a panel, when she becomes interactive
again. Toggle it off to move/configure her easily.

The **system tray icon** gives you Show/Hide, Ghost mode, Settings, and Quit.

---

## Build a real installer

```bash
npm run dist:win     # Windows .exe (NSIS)
npm run dist:mac     # macOS .dmg
npm run dist:linux   # Linux AppImage
```

Output lands in `release/`.

## What's under the hood

```
src/
  main.js                Electron: transparent always-on-top window, tray,
                         ghost-mode click-through, encrypted config
  preload.js             secure IPC bridge
  renderer/
    index.html           UI shell + three.js / three-vrm import map
    styles.css           twilight-glass visual system
    avatar.js            three-vrm rendering: blink, breathe, cursor-follow,
                         lip-sync, expressions (+ animated SVG fallback)
    poses.js             procedural body/arm gestures + spring-bone breeze
    llm.js               Claude / GPT / Grok / Ollama in one chat()
    voice.js             browser TTS + ElevenLabs, both emit lip-sync level
    app.js               orchestration, mood parsing, persistence
```

**Expressions & body:** Anima asks the model to prefix each reply with a hidden
mood tag (`[happy]`, `[sad]`, …). The tag drives her face *and* her posture, then
it's stripped before she speaks.

**Hair / skirt physics & gestures:** her body is always subtly in motion —
breathing, weight-shifts, mood posture, talk movement, and one-shot gestures
(wave, cheer, think, nod, recoil). VRM **spring bones** react to that motion, so
hair, skirt, and accessories swing on their own. An ambient "breeze" nudges the
spring-bone gravity so they drift even while she's still. Toggle it under
Settings → Behaviour, and try the gesture buttons there. This all activates the
moment you load a rigged `.vrm`; arms relax to her sides automatically (if a
model's arms point the wrong way, flip `ARM_DOWN` at the top of
`src/renderer/poses.js`).

## Notes & limits

- three.js + three-vrm load from a CDN at runtime (no build step). For a fully
  offline app, vendor them into `src/renderer/lib/` and update the import map.
- Spring-bone sway needs a model that actually has spring bones defined (VRoid
  models do, for hair and skirts). The gesture system drives standard VRM
  humanoid bones, so it works with any compliant `.vrm`.
- The fallback SVG face is intentionally simple — a placeholder until a `.vrm`
  is loaded.
- Next natural additions: full walk/sit body animations and finger-level hand
  poses.

MIT licensed. Have fun. — built with M80AI
