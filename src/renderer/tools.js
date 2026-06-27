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
  {
    name: 'set_expression',
    description: "Set your facial expression to reflect how you genuinely feel right now.",
    parameters: {
      type: 'object', properties: {
        mood: { type: 'string', enum: ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral', 'joy', 'smug', 'shy', 'love', 'sleepy', 'wink'] }
      }, required: ['mood']
    }
  },
  {
    name: 'play_gesture',
    description: "Play a short body gesture/animation to express yourself.",
    parameters: {
      type: 'object', properties: {
        gesture: { type: 'string', enum: ['wave', 'cheer', 'think', 'nod', 'recoil', 'bow', 'shrug', 'point', 'clap', 'peace', 'dance', 'facepalm', 'stretch'] }
      }, required: ['gesture']
    }
  },
];

const MEMORY_TOOLS = [
  {
    name: 'remember',
    description: "Save a durable fact about the user or your relationship, so you still know it in future sessions. Use a short, descriptive key.",
    parameters: {
      type: 'object', properties: {
        key: { type: 'string', description: 'short label, e.g. "user_name" or "favorite_color"' },
        value: { type: 'string' }
      }, required: ['key', 'value']
    }
  },
  {
    name: 'recall',
    description: "Look up something you previously remembered. Omit key to list everything you know.",
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: [] }
  },
  {
    name: 'forget',
    description: "Delete a fact you previously remembered.",
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] }
  },
];

const WEB_TOOLS = [
  {
    name: 'search_web',
    description: "Search the web for current/factual information. Returns top results with titles, links, and snippets.",
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  },
  {
    name: 'fetch_page',
    description: "Fetch the readable text of a specific web page by URL (e.g. a result from search_web).",
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }
  },
];

// Tier 4 — system. All sandboxed to her workspace folder; write/trash/open/run
// each require the user's approval (handled in the renderer before dispatch).
const FILES_TOOLS = [
  {
    name: 'list_files',
    description: "List files in your private workspace folder on the user's computer. Optionally pass a subfolder path.",
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'optional subfolder; defaults to the workspace root' } }, required: [] }
  },
  {
    name: 'read_file',
    description: "Read a UTF-8 text file from your workspace folder.",
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  {
    name: 'write_file',
    description: "Create or overwrite a text file in your workspace folder. The user is shown the path and a preview and must approve before anything is written.",
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }
  },
  {
    name: 'trash_file',
    description: "Move a file in your workspace to the Recycle Bin (recoverable). The user must approve.",
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
];
const APPS_TOOLS = [
  {
    name: 'open_path',
    description: "Open something on the user's computer: a file or folder in your workspace, an app, or a URL. The user must approve.",
    parameters: { type: 'object', properties: { target: { type: 'string', description: 'a workspace file/folder path, an app name, or an http(s) URL' } }, required: ['target'] }
  },
];
const SHELL_TOOLS = [
  {
    name: 'run_command',
    description: "Run a single shell command on the user's computer. The working directory is your workspace. The user must approve every command; never run anything destructive without explaining it first in your own words.",
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }
  },
];
const TIMER_TOOLS = [
  {
    name: 'set_timer',
    description: "Set a timer. When it elapses you'll be cued to tell the user out loud. Provide the duration in seconds and an optional label.",
    parameters: { type: 'object', properties: { seconds: { type: 'number' }, label: { type: 'string' } }, required: ['seconds'] }
  },
];

export function toolDefs({ self = true, memory = true, web = true,
  files = false, apps = false, shell = false, timers = false } = {}) {
  return [
    ...(self ? SELF_TOOLS : []),
    ...(memory ? MEMORY_TOOLS : []),
    ...(web ? WEB_TOOLS : []),
    ...(files ? FILES_TOOLS : []),
    ...(apps ? APPS_TOOLS : []),
    ...(shell ? SHELL_TOOLS : []),
    ...(timers ? TIMER_TOOLS : [])
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
  const confirm = ctx.confirm || (async () => false); // gated ops fail closed
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

      // Tier 4 — files (sandboxed to the workspace folder)
      case 'list_files':
        if (!window.anima?.fsList) return 'Filesystem access is unavailable.';
        return await window.anima.fsList(String(args.path || '.'));
      case 'read_file':
        if (!window.anima?.fsRead) return 'Filesystem access is unavailable.';
        return await window.anima.fsRead(String(args.path || ''));
      case 'write_file': {
        if (!window.anima?.fsWrite) return 'Filesystem access is unavailable.';
        const preview = String(args.content == null ? '' : args.content);
        const ok = await confirm({ title: 'Write file', body: String(args.path || ''),
          detail: preview.slice(0, 400) + (preview.length > 400 ? '…' : '') });
        if (!ok) return 'The user declined to write that file.';
        return await window.anima.fsWrite(String(args.path || ''), preview);
      }
      case 'trash_file': {
        if (!window.anima?.fsTrash) return 'Filesystem access is unavailable.';
        const ok = await confirm({ title: 'Move to Recycle Bin', body: String(args.path || ''), danger: true });
        if (!ok) return 'The user declined.';
        return await window.anima.fsTrash(String(args.path || ''));
      }

      // Tier 4 — apps / links
      case 'open_path': {
        if (!window.anima?.openPath) return 'Opening is unavailable.';
        const ok = await confirm({ title: 'Open this?', body: String(args.target || '') });
        if (!ok) return 'The user declined to open that.';
        return await window.anima.openPath(String(args.target || ''));
      }

      // Tier 4 — shell
      case 'run_command': {
        if (!window.anima?.runCommand) return 'Commands are unavailable.';
        const ok = await confirm({ title: 'Run this command?', body: String(args.command || ''), danger: true });
        if (!ok) return 'The user declined to run that command.';
        return await window.anima.runCommand(String(args.command || ''));
      }

      // Tier 4 — timers
      case 'set_timer':
        if (!window.anima?.setTimer) return 'Timers are unavailable.';
        return await window.anima.setTimer(Number(args.seconds) || 0, String(args.label || ''));

      default:
        return `Unknown tool: ${name}`;
    }
  };
}
