// ============================================================================
//  llm.js — one chat() function, five brains.
//  Anthropic (Claude), OpenAI (GPT), xAI (Grok), Azure AI Foundry, Ollama.
//  Returns the assistant's text. Throws Error with a readable message on failure.
// ============================================================================

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  grok: 'grok-2-latest',
  azure: '',
  ollama: 'llama3.1'
};

export function defaultModel(provider) {
  return DEFAULT_MODELS[provider] || '';
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GROK_URL = 'https://api.x.ai/v1/chat/completions';

// history: [{role:'user'|'assistant', content:'…'}]
// Pass `tools` (neutral OpenAI-function schema) + `onToolCall(name,args)->string`
// to enable agentic tool use. Without them, behaves exactly as before.
export async function chat({ provider, model, apiKey, ollamaUrl,
                             azureEndpoint, azureApiVersion, system, history,
                             tools, onToolCall }) {
  model = model || DEFAULT_MODELS[provider];
  const agentic = tools && tools.length && typeof onToolCall === 'function';

  if (!agentic) {
    if (provider === 'anthropic') return anthropic({ model, apiKey, system, history });
    if (provider === 'openai')    return openaiCompatible({ url: OPENAI_URL, model, apiKey, system, history });
    if (provider === 'grok')      return openaiCompatible({ url: GROK_URL, model, apiKey, system, history });
    if (provider === 'azure')     return azure({ endpoint: azureEndpoint, apiVersion: azureApiVersion, model, apiKey, system, history });
    if (provider === 'ollama')    return ollama({ url: (ollamaUrl || 'http://localhost:11434'), model, system, history });
    throw new Error(`Unknown provider: ${provider}`);
  }

  // ---- agentic (tool-calling) loop ----
  if (provider === 'anthropic')
    return anthropicToolLoop({ apiKey, model, system, history, tools, onToolCall });

  if (provider === 'openai' || provider === 'grok') {
    const url = provider === 'openai' ? OPENAI_URL : GROK_URL;
    const who = provider === 'openai' ? 'OpenAI' : 'Grok';
    if (!apiKey) throw new Error('Add your API key in settings.');
    const post = async (body) => {
      const res = await fetch(url, { method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await errText(res, who));
      return res.json();
    };
    return openaiToolLoop({ post, model, system, history, tools, onToolCall });
  }

  if (provider === 'azure') {
    if (!apiKey) throw new Error('Add your Azure API key in settings.');
    if (!azureEndpoint) throw new Error('Add your Azure endpoint in settings.');
    const { url, modelInBody } = buildAzureRequest(azureEndpoint, azureApiVersion, model);
    const post = async (body) => {
      const b = { ...body }; if (!modelInBody) delete b.model;
      const res = await fetch(url, { method: 'POST',
        headers: { 'content-type': 'application/json', 'api-key': apiKey, 'authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(b) });
      if (!res.ok) throw new Error(await errText(res, 'Azure'));
      return res.json();
    };
    return openaiToolLoop({ post, model, system, history, tools, onToolCall });
  }

  if (provider === 'ollama') {
    const base = (ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
    const post = async (body) => {
      const res = await fetch(`${base}/api/chat`, { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, stream: false }) });
      if (!res.ok) throw new Error(await errText(res, 'Ollama'));
      return res.json();
    };
    return openaiToolLoop({ post, model, system, history, tools, onToolCall, extract: (d) => d.message });
  }

  throw new Error(`Unknown provider: ${provider}`);
}

async function anthropic({ model, apiKey, system, history }) {
  if (!apiKey) throw new Error('Add your Anthropic API key in settings.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // allows direct calls from a browser/Electron renderer
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages: history })
  });
  if (!res.ok) throw new Error(await errText(res, 'Anthropic'));
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

async function openaiCompatible({ url, model, apiKey, system, history }) {
  if (!apiKey) throw new Error('Add your API key in settings.');
  const messages = [{ role: 'system', content: system }, ...history];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 1024 })
  });
  if (!res.ok) throw new Error(await errText(res, 'Provider'));
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

// Azure AI Foundry / Azure OpenAI (Grok, GPT, DeepSeek, etc.).
// Accepts either a full chat-completions Target URI or just the resource host;
// normalises both the classic deployment path and the newer /openai/v1 route.
function buildAzureRequest(endpoint, apiVersion, model) {
  const ver = (apiVersion || '2025-01-01-preview').trim();
  let url = endpoint.trim().replace(/\/+$/, '');
  let modelInBody = true;
  if (/\/chat\/completions/i.test(url)) {
    // full URL pasted — deployment-path URLs already name the model
    modelInBody = !/\/openai\/deployments\//i.test(url);
  } else if (/openai\.azure\.com$/i.test(url) || /\/openai$/i.test(url)) {
    if (!model) throw new Error('Set the Model field to your Azure deployment name.');
    const base = url.replace(/\/openai$/i, '');
    url = `${base}/openai/deployments/${encodeURIComponent(model)}/chat/completions`;
    modelInBody = false;
  } else {
    // resource host (e.g. services.ai.azure.com) → use the v1 route
    url = `${url}/openai/v1/chat/completions`;
  }
  if (!/\/openai\/v1\//i.test(url) && !/[?&]api-version=/i.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'api-version=' + ver;
  }
  return { url, modelInBody };
}

async function azure({ endpoint, apiVersion, model, apiKey, system, history }) {
  if (!apiKey) throw new Error('Add your Azure API key in settings.');
  if (!endpoint) throw new Error('Add your Azure endpoint in settings.');
  const { url, modelInBody } = buildAzureRequest(endpoint, apiVersion, model);
  const messages = [{ role: 'system', content: system }, ...history];
  const body = { messages, max_tokens: 1024 };
  if (modelInBody) {
    if (!model) throw new Error('Set the Model field to your Azure deployment name.');
    body.model = model;
  }
  const res = await fetch(url, {
    method: 'POST',
    // api-key works for classic routes; Bearer covers the v1 route
    headers: { 'content-type': 'application/json', 'api-key': apiKey, 'authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await errText(res, 'Azure'));
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function ollama({ url, model, system, history }) {
  const messages = [{ role: 'system', content: system }, ...history];
  const res = await fetch(`${url.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false })
  });
  if (!res.ok) throw new Error(await errText(res, 'Ollama'));
  const data = await res.json();
  return (data.message?.content || '').trim();
}

// ---------------------------------------------------------------------------
// Agentic tool loops. The model may request tools; we run them via onToolCall
// and feed results back until it produces a final spoken reply (capped rounds).
// ---------------------------------------------------------------------------
const MAX_TOOL_ROUNDS = 8;

function toOpenAITools(defs) {
  return defs.map(d => ({ type: 'function',
    function: { name: d.name, description: d.description, parameters: d.parameters } }));
}
function toAnthropicTools(defs) {
  return defs.map(d => ({ name: d.name, description: d.description, input_schema: d.parameters }));
}

// OpenAI-style loop (openai / grok / azure / ollama).
// post(body) -> parsed JSON; extract(data) -> assistant message object.
async function openaiToolLoop({ post, model, system, history, tools, onToolCall,
                                extract = (d) => d.choices?.[0]?.message }) {
  const messages = [{ role: 'system', content: system }, ...history];
  const otools = toOpenAITools(tools);
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await post({ model, messages, max_tokens: 1024, tools: otools, tool_choice: 'auto' });
    const msg = extract(data) || {};
    const calls = msg.tool_calls || [];
    if (!calls.length) return (msg.content || '').trim();
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
    for (const tc of calls) {
      const fn = tc.function || {};
      let args = {};
      try { args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments || '{}') : (fn.arguments || {}); }
      catch {}
      let result = '';
      try { result = await onToolCall(fn.name, args); } catch (e) { result = 'Error: ' + e.message; }
      messages.push({ role: 'tool', tool_call_id: tc.id, name: fn.name, content: String(result ?? '') });
    }
  }
  const data = await post({ model, messages, max_tokens: 1024 }); // final pass, no tools
  return ((extract(data) || {}).content || '').trim();
}

// Anthropic loop (different wire format: tool_use / tool_result blocks).
async function anthropicToolLoop({ apiKey, model, system, history, tools, onToolCall }) {
  if (!apiKey) throw new Error('Add your Anthropic API key in settings.');
  const headers = { 'content-type': 'application/json', 'x-api-key': apiKey,
    'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  const messages = history.map(m => ({ role: m.role, content: m.content }));
  const atools = toAnthropicTools(tools);
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers,
      body: JSON.stringify({ model, max_tokens: 1024, system, messages, tools: atools }) });
    if (!res.ok) throw new Error(await errText(res, 'Anthropic'));
    const data = await res.json();
    const content = data.content || [];
    const toolUses = content.filter(b => b.type === 'tool_use');
    if (!toolUses.length) return content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    messages.push({ role: 'assistant', content });
    const results = [];
    for (const tu of toolUses) {
      let result = '';
      try { result = await onToolCall(tu.name, tu.input || {}); } catch (e) { result = 'Error: ' + e.message; }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: String(result ?? '') });
    }
    messages.push({ role: 'user', content: results });
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers,
    body: JSON.stringify({ model, max_tokens: 1024, system, messages }) });
  if (!res.ok) throw new Error(await errText(res, 'Anthropic'));
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

async function errText(res, who) {
  let detail = '';
  try { const j = await res.json(); detail = j.error?.message || j.error || JSON.stringify(j); }
  catch { detail = await res.text().catch(() => ''); }
  return `${who} error ${res.status}: ${detail || res.statusText}`;
}
