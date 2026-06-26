// ============================================================================
//  tools.js — the things Anima can actually DO (Tiers 1–3).
//
//  Tier 1  self    : control her own expression + gestures (runs in renderer)
//  Tier 2  memory  : remember / recall durable facts (localStorage)
//  Tier 3  web     : search + read pages (runs in the main process, no CORS)
//
//  Each tool is a neutral JSON-schema definition (OpenAI function shape) plus an
//  implementation in runTool(). llm.js translates the schema per provider, and
//  calls back into runTool() when the model asks to use one. The model can only
//  *request* a tool; this file decides what actually happens.
// ============================================================================

const SELF_TOOLS = [
  { name: 'set_expression',
    description: "Set your facial expression to reflect how you genuinely feel right now.",
    parameters: { type: 'object', properties: {
      mood: { type: 'string', enum: ['happy','sad','angry','surprised','relaxed','neutral'] }
    }, required: ['mood'] } },
  { name: 'play_gesture',
    description: "Play a short body gesture/animation to express yourself.",
    parameters: { type: 'object', properties: {
      gesture: { type: 'string', enum: ['wave','cheer','think','nod','recoil'] }
    }, required: ['gesture'] } },
];

const MEMORY_TOOLS = [
  { name: 'remember',
    description: "Save a durable fact about the user or your relationship, so you still know it in future sessions. Use a short, descriptive key.",
    parameters: { type: 'object', properties: {
      key: { type: 'string', description: 'short label, e.g. "user_name" or "favorite_color"' },
      value: { type: 'string' }
    }, required: ['key','value'] } },
  { name: 'recall',
    description: "Look up something you previously remembered. Omit key to list everything you know.",
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: [] } },
  { name: 'forget',
    description: "Delete a fact you previously remembered.",
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
];

const WEB_TOOLS = [
  { name: 'search_web',
    description: "Search the web for current/factual information. Returns top results with titles, links, and snippets.",
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'fetch_page',
    description: "Fetch the readable text of a specific web page by URL (e.g. a result from search_web).",
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
];

export function toolDefs({ self = true, memory = true, web = true } = {}) {
  return [
    ...(self ? SELF_TOOLS : []),
    ...(memory ? MEMORY_TOOLS : []),
    ...(web ? WEB_TOOLS : [])
  ];
}

// ----------------------------------------------------------------- memory store
const MEM_KEY = 'anima:memory';
export function memoryAll() {
  try { return JSON.parse(localStorage.getItem(MEM_KEY) || '{}'); } catch { return {}; }
}
function memoryWrite(m) { localStorage.setItem(MEM_KEY, JSON.stringify(m)); }

// Compact view injected into her system prompt so she's aware of what she knows
// without having to call recall() every turn.
export function memoryText() {
  const m = memoryAll();
  const keys = Object.keys(m);
  if (!keys.length) return '';
  return keys.map(k => `- ${k}: ${m[k]}`).join('\n');
}

// ----------------------------------------------------------------- dispatcher
export function makeRunTool(ctx) {
  const { avatar } = ctx;
  return async function runTool(name, args = {}) {
    switch (name) {
      // Tier 1 — self
      case 'set_expression':
        avatar.setExpression(args.mood || 'neutral');
        return `(expression set to ${args.mood})`;
      case 'play_gesture':
        avatar.playGesture(args.gesture || 'nod');
        return `(played ${args.gesture})`;

      // Tier 2 — memory
      case 'remember': {
        const m = memoryAll(); m[String(args.key)] = String(args.value); memoryWrite(m);
        return `Saved "${args.key}".`;
      }
      case 'recall': {
        const m = memoryAll();
        if (args.key) return m[args.key] != null ? `${args.key}: ${m[args.key]}`
                                                  : `Nothing saved under "${args.key}".`;
        const keys = Object.keys(m);
        return keys.length ? keys.map(k => `${k}: ${m[k]}`).join('\n') : 'No memories saved yet.';
      }
      case 'forget': {
        const m = memoryAll();
        if (m[args.key] != null) { delete m[args.key]; memoryWrite(m); return `Forgot "${args.key}".`; }
        return `Nothing saved under "${args.key}".`;
      }

      // Tier 3 — web (delegated to main process)
      case 'search_web':
        if (!window.anima?.searchWeb) return 'Web search is unavailable.';
        return await window.anima.searchWeb(String(args.query || ''));
      case 'fetch_page':
        if (!window.anima?.fetchPage) return 'Web fetch is unavailable.';
        return await window.anima.fetchPage(String(args.url || ''));

      default:
        return `Unknown tool: ${name}`;
    }
  };
}
