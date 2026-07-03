# Anima Companion — Pre-Launch Improvement Checklist

**Goal:** Ship a delightful, reliable, private-first desktop companion that earns trust on day one and scales without drama.

**How to use this doc:** Each area has a **Priority** (P0 = must-fix before launch, P1 = strong recommendation, P2 = nice-to-have), **Definition of Done**, and suggested **Owner**. Track status in your project board.

---

## 1. Product UX & First-Run Experience

### 1.1 First-Run Wizard (P0)
- [ ] Create a 3-step onboarding: Welcome → Choose brain (with “Start local with Ollama” prominent) → Load or skip avatar.
- [ ] Auto-detect Ollama at `http://localhost:11434` and pre-fill URL + model if running.
- [ ] One-click “Download a starter .vrm” that fetches a small, CC0 or self-hosted model and loads it.
- [ ] Definition of Done: 80% of new users complete wizard in <90 seconds and send first message.

### 1.2 Empty States & Guidance (P0)
- [ ] When no VRM is loaded, show a friendly empty state with “Load .vrm” and “Make one free in VRoid Studio” links.
- [ ] When no API key is set, show contextual prompts in the input bar (“Add a brain in Settings to chat”).
- [ ] Definition of Done: No dead-end screens; every empty state has a primary action.

### 1.3 Settings Clarity & Safety (P0)
- [ ] Group settings into clear sections: Brain, Voice, Avatar, Behaviour, Abilities, Advanced.
- [ ] Add inline “What does this do?” help text for every agent tool toggle (especially shell & files).
- [ ] Show a persistent “Sandbox: ~/AnimaWorkspace” notice when any Tier-4 tool is enabled.
- [ ] Definition of Done: User can explain every toggle in their own words after reading once.

### 1.4 Error & Recovery UX (P0)
- [ ] Replace raw error messages with friendly copy + “Retry” and “Open Settings” actions.
- [ ] Add a “Report this crash” button that opens a pre-filled GitHub issue with redacted config.
- [ ] Definition of Done: <5% of sessions end in an unhandled error state.

---

## 2. Voice & Avatar Quality

### 2.1 Lip-Sync & Expression Polish (P0)
- [ ] Tune mouth-open thresholds and smoothing so speech looks natural at normal volume.
- [ ] Add micro-expressions (subtle eye movement, breathing intensity) during idle and listening.
- [ ] Ensure fallback SVG face has matching mood colors and simple mouth shapes.
- [ ] Definition of Done: 10-second blind test — 80% of viewers correctly identify mood from visuals alone.

### 2.2 Voice Engine Reliability (P0)
- [ ] Add per-engine health checks in Settings → Test Voice (network + auth + quota).
- [ ] Graceful fallback chain: ElevenLabs → Azure → Browser with user-visible toast.
- [ ] Cache last successful voice settings so a bad key doesn’t break every launch.
- [ ] Definition of Done: 99% of voice tests succeed or show clear, actionable error.

### 2.3 Avatar Loading & Performance (P0)
- [ ] Vendor three.js + three-vrm into `src/renderer/lib/` for fully offline operation.
- [ ] Add progress bar + cancel for large .vrm loads (>10 MB).
- [ ] Cap spring-bone updates at 60 fps and add a “Low power mode” toggle.
- [ ] Definition of Done: First VRM renders in <3 s on mid-range laptop; no CDN dependency.

### 2.4 Accessibility & Motion (P1)
- [ ] Respect `prefers-reduced-motion` — disable idle sway and reduce gesture amplitude.
- [ ] Add high-contrast outline option for the avatar when on light desktop wallpapers.
- [ ] Definition of Done: Lighthouse a11y score ≥90 on settings window; motion toggle works.

---

## 3. Reliability, Performance & Stability

### 3.1 Crash & Error Reporting (P0)
- [ ] Integrate Sentry or equivalent (opt-in, privacy-first) with automatic environment redaction.
- [ ] Capture unhandled promise rejections and main-process crashes.
- [ ] Definition of Done: <1% crash rate in first 10k sessions; top 5 errors have owner + fix ETA.

### 3.2 Resource Usage (P0)
- [ ] Measure idle CPU/GPU/memory on Windows, macOS, Linux; target <3% CPU and <150 MB RAM.
- [ ] Add “Pause when idle” (stop animation loop after 5 min of no interaction).
- [ ] Definition of Done: Passes 8-hour overnight soak test with <5% battery impact on laptop.

### 3.3 Update & Auto-Update (P0)
- [ ] Enable `electron-updater` with code-signed builds for Windows and macOS.
- [ ] Show “What’s new” modal on first launch after update (pull from CHANGELOG).
- [ ] Definition of Done: 90% of users on latest version within 14 days of release.

### 3.4 Platform Packaging Polish (P0)
- [ ] Windows: sign installer, add AppUserModelID, verify SmartScreen pass.
- [ ] macOS: notarize DMG, hardened runtime, proper icon + category.
- [ ] Linux: AppImage with desktop entry and icon; test on Ubuntu 22.04/24.04 + Fedora.
- [ ] Definition of Done: Fresh install on each platform launches in <10 s with no warnings.

---

## 4. Privacy, Safety & Policy

### 4.1 Data Handling & Encryption (P0)
- [ ] Audit all persisted data: config.json (encrypted secrets), IndexedDB (VRM blobs), localStorage (memory).
- [ ] Add “Export my data” and “Delete all data” buttons in Settings → Advanced.
- [ ] Definition of Done: Privacy policy published and linked from app + website; user can wipe everything in two clicks.

### 4.2 Agent Tool Safety (P0)
- [ ] Default all Tier-4 tools (files, apps, shell) to OFF.
- [ ] Add second confirmation for `run_command` with dangerous pattern detection (rm, sudo, format, etc.).
- [ ] Log every approved tool execution (timestamp, tool, args summary) to `~/.anima/audit.log`.
- [ ] Definition of Done: Security review passes; no tool can escape the workspace sandbox.

### 4.3 Content Safety & Moderation (P1)
- [ ] Add optional on-device NSFW filter for incoming LLM text (simple keyword + ML model option).
- [ ] Provide “Block topics” list in settings that injects into system prompt.
- [ ] Definition of Done: <0.1% of sessions trigger user-reported harmful content.

### 4.4 Legal & Compliance (P0)
- [ ] Publish MIT license + third-party notices.
- [ ] Add “Made with ❤️ by M80AI” footer in settings; link to website and Discord.
- [ ] Definition of Done: Legal review complete; no GPL or copyleft surprises in dependencies.

---

## 5. Analytics, Telemetry & Feedback

### 5.1 Event Instrumentation (P0)
- [ ] Define minimal event taxonomy (see Appendix A) — only opt-in, no PII.
- [ ] Track: app_launched, first_message_sent, vrm_loaded, tool_used (name only), error_occurred (type).
- [ ] Definition of Done: Dashboard shows real-time DAU, activation funnel, top errors.

### 5.2 User Feedback Loop (P0)
- [ ] In-app “Send feedback” that opens GitHub issue or Discord thread with session ID.
- [ ] Post-interaction micro-survey (1–2 questions) after 10th message, then monthly.
- [ ] Definition of Done: ≥20% of active users have submitted at least one piece of feedback.

### 5.3 A/B Testing Harness (P1)
- [ ] Lightweight framework to toggle onboarding copy, default persona, first-tool prompt.
- [ ] Definition of Done: Can run and measure one experiment per week with <1 day setup.

---

## 6. Store / Listing Assets & Conversion

### 6.1 Visual Assets (P0)
- [ ] 1280×720 hero screenshot (clean desktop, happy expression, speech bubble visible).
- [ ] 5–7 in-app screenshots: onboarding, settings, ghost mode, tool approval, VRM load.
- [ ] 256×256 and 512×512 icons; tray icon 18×18 and 32×32.
- [ ] Definition of Done: All assets pass platform review (no text overflow, correct margins).

### 6.2 Copy & SEO (P0)
- [ ] Product Hunt / GitHub description: 150-char tagline + 3-bullet value prop.
- [ ] Landing page: headline, subhead, 3 proof points, 60-second demo video, FAQ.
- [ ] Definition of Done: Page converts ≥25% of visitors to “Download” or “Star”.

### 6.3 Video & Demo (P0)
- [ ] 60-second hero video: boot → load VRM → chat → tool use → ghost mode.
- [ ] 3× 15-second vertical clips for X/TikTok/Shorts (funny moment, useful moment, beautiful moment).
- [ ] Definition of Done: Videos hosted on YouTube + embedded on landing; total watch time >50% of length.

---

## 7. Support Operations & User Comms

### 7.1 Documentation (P0)
- [ ] README with 5-minute quick start + troubleshooting table.
- [ ] Dedicated docs site (GitHub Pages or Notion) with: installation, VRM guide, LLM setup, voice setup, agent tools, privacy, FAQ.
- [ ] Definition of Done: 90% of support questions answered in docs; <10% require human reply.

### 7.2 Community & Moderation (P0)
- [ ] Public Discord with channels: #announcements, #support, #showcase, #ideas, #off-topic.
- [ ] 3–5 volunteer moderators with clear escalation path to founder.
- [ ] Definition of Done: Median first response time <15 min during launch week.

### 7.3 Release Communication (P0)
- [ ] Changelog maintained in-repo and surfaced in-app.
- [ ] Pre-launch “What to expect” email / Discord post 48 h before launch.
- [ ] Definition of Done: 80% of waitlist opens launch announcement within 24 h.

---

## 8. QA Matrix & Release Criteria

### 8.1 Test Matrix (P0)
| Platform | Fresh Install | Update | VRM Load | Chat | Voice | Tool Use | Ghost Mode | 8h Soak |
|----------|---------------|--------|----------|------|-------|----------|------------|---------|
| Windows 11 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| macOS 14/15 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ubuntu 22.04/24.04 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Fedora 40 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### 8.2 Release Gate Checklist (must pass before ship)
- [ ] All P0 items marked Done.
- [ ] Zero open P0 bugs.
- [ ] Crash rate <1% in 1,000-session beta.
- [ ] Security review sign-off (sandbox + encryption).
- [ ] Legal & privacy policy published.
- [ ] Platform store / notarization approvals received.
- [ ] Support macros and moderator runbook ready.
- [ ] Rollback plan documented (previous build + data migration notes).

---

## 9. Ownership & Timeline (Suggested)

| Area | Owner | Start | Due | Status |
|------|-------|-------|-----|--------|
| Onboarding & UX | Designer + Founder | T-6 w | T-2 w | |
| Avatar & Voice Polish | Engineer A | T-5 w | T-1 w | |
| Reliability & Packaging | Engineer B | T-6 w | T-0 | |
| Privacy & Safety | Founder + Legal | T-4 w | T-1 w | |
| Analytics & Feedback | Growth | T-5 w | T-2 w | |
| Assets & Video | Marketing | T-4 w | T-1 w | |
| Docs & Community | Community | T-3 w | T-0 | |
| QA & Release | All | T-2 w | T-0 | |

---

## Appendix A — Minimal Event Taxonomy (Opt-In)

- `app_launched` — {version, platform, is_first_run}
- `onboarding_completed` — {steps_completed, time_seconds}
- `vrm_loaded` — {size_bytes, source: 'file'|'download'}
- `message_sent` — {provider, has_tools, mood_detected}
- `tool_used` — {name, approved: bool, duration_ms}
- `voice_tested` — {engine, success: bool}
- `error_occurred` — {type, code, context}
- `settings_changed` — {key, value_type}
- `feedback_submitted` — {channel: 'inapp'|'github'|'discord'}

All events carry a session_id and are stripped of any PII or API keys.

---

## Appendix B — Quick Reference Links

- Privacy policy template: https://www.privacypolicygenerator.info/
- Electron code signing guide: https://www.electronjs.org/docs/latest/tutorial/code-signing
- macOS notarization: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Sentry Electron: https://docs.sentry.io/platforms/javascript/guides/electron/

---

**Document owner:** Founder (initially).  
**Review cadence:** Weekly during pre-launch; retire after launch + 30 days.

*End of Pre-Launch Improvements Checklist.*