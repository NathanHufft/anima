# Anima Curated VRM Set

Official starter avatars for Anima Companion. Each designed in VRoid Studio for performance (<2.5 MB target) while delivering distinct personality vibes. All are VRM 1.0 compatible with full expression, look-at, and spring-bone support.

## Quick Load
1. Open Settings → Avatar
2. Click "Load .vrm" and pick one of the files below
3. Or drag & drop onto the avatar canvas

## The Collection

| # | Theme / Vibe          | Suggested Style                          | Size Target | File (example)     | Personality Fit                  |
|---|-----------------------|------------------------------------------|-------------|--------------------|----------------------------------|
| 1 | Cute everyday girl    | Simple VRoid with soft colors            | ~1.5 MB     | anima-cute.vrm     | Friendly, approachable, warm     |
| 2 | Cool/tech anime girl  | Short hair, jacket, glasses              | ~2 MB       | anima-tech.vrm     | Witty, modern, slightly tsundere |
| 3 | Soft cozy / pastel    | Long hair, sweater, gentle look          | ~1.8 MB     | anima-cozy.vrm     | Calm, empathetic, comforting     |
| 4 | Energetic / sporty    | Ponytail, athletic wear                  | ~2 MB       | anima-sporty.vrm   | Bubbly, motivational, active     |
| 5 | Mysterious / elegant  | Darker tones, long flowing hair          | ~2.5 MB     | anima-elegant.vrm  | Poetic, deep, intriguing         |

## VRoid Studio Creation Guide (Exact Steps)

**General Export Settings (apply to all):**
- Texture Size: 1024×1024 (or 512 for #1 to hit 1.5 MB)
- Remove unused blendshapes & accessories before export
- Enable "Optimize Mesh" + "Compress Textures"
- Post-export (optional): Use `gltf-transform` or `vrm-optimizer` to trim to target size
- Test in three-vrm viewer: ensure <3s load on mid-range hardware

### 1. Cute Everyday Girl (~1.5 MB)
**Base:** Female, youthful face (rounder cheeks, big eyes)
- Hair: Medium bob or twin-tails, soft pastel pink or light brown
- Outfit: Simple white blouse + pleated skirt or casual dress, soft pastel palette (mint, blush, cream)
- Accessories: Small hair clip or ribbon only (minimal)
- Colors: High saturation soft pastels, warm lighting
- Expression defaults: Happy + Relaxed bias
- Export tip: 512px textures + no extra physics bones

### 2. Cool/Tech Anime Girl (~2 MB)
**Base:** Female, sharp eyes, slight smirk possible
- Hair: Short layered bob or wolf-cut, cool silver/blue-black
- Outfit: Tech jacket (denim or futuristic), turtleneck, slim pants or skirt + boots
- Accessories: Glasses (rectangular or tech visor style), earbuds or choker
- Colors: Cool tones — navy, electric cyan, matte black, silver accents
- Expression defaults: Smug + Neutral bias
- Export tip: 1024px but limit to 2–3 materials

### 3. Soft Cozy / Pastel (~1.8 MB)
**Base:** Female, gentle droopy eyes, soft smile
- Hair: Long straight or slight waves, warm ash brown or lavender
- Outfit: Oversized knit sweater, long skirt or wide pants, fluffy socks
- Accessories: Scarf or headband, maybe tiny star earrings
- Colors: Muted pastels — dusty rose, sage, cream, soft beige
- Expression defaults: Relaxed + Happy bias
- Export tip: Flowing hair with light spring bones only

### 4. Energetic / Sporty (~2 MB)
**Base:** Female, bright eyes, energetic pose
- Hair: High ponytail with bangs, vibrant orange or teal
- Outfit: Cropped hoodie or athletic tank + shorts/leggings, sneakers
- Accessories: Sweatband, sports watch, or water bottle prop (optional)
- Colors: Energetic — coral, lime, white, navy
- Expression defaults: Happy + Surprised bias
- Export tip: Athletic proportions, minimal skirt physics

### 5. Mysterious / Elegant (~2.5 MB)
**Base:** Female, elegant almond eyes, subtle smile
- Hair: Very long flowing hair with side part or hime-cut, deep violet/black with highlights
- Outfit: Dark elegant dress or blouse + long skirt, capelet or bolero
- Accessories: Subtle choker, hair ornament, maybe glasses (thin frame)
- Colors: Deep palette — midnight blue, burgundy, charcoal, gold accents
- Expression defaults: Relaxed + Smug bias
- Export tip: Richer textures allowed (2.5 MB budget), dramatic hair physics

## Integration Notes for Developers
- Place final `.vrm` files in `assets/avatars/`
- Update `src/renderer/app.js` or settings to offer theme switcher (future)
- Avatar.js already supports hot-swapping via `loadVRM(buffer)`
- Recommended: Ship 1–2 smallest as embedded base64 or downloadable on first run (see PRELAUNCH_IMPROVEMENTS.md)

## Size Optimization Checklist
- [ ] Delete all unused clothing layers
- [ ] Bake lighting where possible
- [ ] Use toon shader only
- [ ] Limit facial blendshapes to VRM standard set
- [ ] Run `npx gltf-pipeline -i input.vrm -o output.vrm --draco` (experimental for VRM)

Created for Anima Companion pre-launch polish.
