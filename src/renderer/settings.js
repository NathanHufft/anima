// ============================================================================
//  settings.js — renderer for the DETACHED settings window.
//  Reads/writes the same on-disk config as before, but lives in its own window
//  so you can test expressions, gestures, and voices live while watching her.
//  It never touches the avatar directly — it sends commands to the companion
//  window through the main process (window.anima.sendCommand / broadcastConfig).
// ============================================================================

import { defaultModel } from './llm.js';
import { listBrowserVoices } from './voice.js';

const $ = (s) => document.querySelector(s);
let cfg = {};

// ----------------------------------------------------------------- load
async function loadConfig() {
    cfg = (await window.anima.getConfig()) || {};
    const c = cfg;
    $('#cfg-name').value = c.name || 'Cici';
    $('#cfg-provider').value = c.provider || 'anthropic';
    $('#cfg-model').value = c.model || '';
    $('#cfg-model').placeholder = defaultModel($('#cfg-provider').value);
    $('#cfg-anthropicKey').value = c.anthropicKey || '';
    $('#cfg-openaiKey').value = c.openaiKey || '';
    $('#cfg-grokKey').value = c.grokKey || '';
    $('#cfg-ollamaUrl').value = c.ollamaUrl || 'http://localhost:11434';
    $('#cfg-azureEndpoint').value = c.azureEndpoint || '';
    $('#cfg-azureApiKey').value = c.azureApiKey || '';
    $('#cfg-azureApiVersion').value = c.azureApiVersion || '';
    $('#cfg-persona').value = c.persona ||
        `You are ${c.name || 'Cici'}, a warm, playful anime companion living on the user's desktop. You are curious, a little teasing, and genuinely supportive.`;
    $('#cfg-voice-engine').value = c.voiceEngine || 'browser';
    $('#cfg-elevenLabsKey').value = c.elevenLabsKey || '';
    $('#cfg-elevenVoice').value = c.elevenVoice || '';
    $('#cfg-azureSpeechKey').value = c.azureSpeechKey || '';
    $('#cfg-azureRegion').value = c.azureRegion || '';
    $('#cfg-azureVoice').value = c.azureVoice || '';
    $('#cfg-ghost').checked = !!c.ghost;
    $('#cfg-follow').checked = c.follow !== false;
    $('#cfg-relax').checked = c.relaxArms !== false;
    $('#cfg-idle').checked = c.idle !== false;
    $('#cfg-tools-self').checked = c.toolsSelf !== false;
    $('#cfg-tools-memory').checked = c.toolsMemory !== false;
    $('#cfg-tools-web').checked = c.toolsWeb !== false;
    $('#cfg-stt-engine').value = c.sttEngine || 'auto';
    $('#cfg-handsfree').checked = !!c.handsFree;
    if (c.vrmName) $('#vrm-name').textContent = c.vrmName;
    reflectVoiceEngine();
    populateVoices();
}

// ----------------------------------------------------------------- save
async function saveConfig() {
    const c = cfg;
    c.name = $('#cfg-name').value.trim() || 'Cici';
    c.provider = $('#cfg-provider').value;
    c.model = $('#cfg-model').value.trim();
    c.anthropicKey = $('#cfg-anthropicKey').value.trim();
    c.openaiKey = $('#cfg-openaiKey').value.trim();
    c.grokKey = $('#cfg-grokKey').value.trim();
    c.ollamaUrl = $('#cfg-ollamaUrl').value.trim();
    c.azureEndpoint = $('#cfg-azureEndpoint').value.trim();
    c.azureApiKey = $('#cfg-azureApiKey').value.trim();
    c.azureApiVersion = $('#cfg-azureApiVersion').value.trim();
    c.persona = $('#cfg-persona').value.trim();
    c.voiceEngine = $('#cfg-voice-engine').value;
    c.browserVoice = $('#cfg-browser-voice').value;
    c.elevenLabsKey = $('#cfg-elevenLabsKey').value.trim();
    c.elevenVoice = $('#cfg-elevenVoice').value.trim();
    c.azureSpeechKey = $('#cfg-azureSpeechKey').value.trim();
    c.azureRegion = $('#cfg-azureRegion').value.trim();
    c.azureVoice = $('#cfg-azureVoice').value.trim();
    c.ghost = $('#cfg-ghost').checked;
    c.follow = $('#cfg-follow').checked;
    c.relaxArms = $('#cfg-relax').checked;
    c.idle = $('#cfg-idle').checked;
    c.toolsSelf = $('#cfg-tools-self').checked;
    c.toolsMemory = $('#cfg-tools-memory').checked;
    c.toolsWeb = $('#cfg-tools-web').checked;
    c.sttEngine = $('#cfg-stt-engine').value;
    c.handsFree = $('#cfg-handsfree').checked;
    await window.anima.setConfig(c);
    window.anima.setGhost(c.ghost);
    window.anima.broadcastConfig(); // tell the companion to re-apply live
}

// ----------------------------------------------------------------- voice UI
function reflectVoiceEngine() {
    const eng = $('#cfg-voice-engine').value;
    $('#rows-eleven').hidden = eng !== 'elevenlabs';
    $('#rows-azure').hidden = eng !== 'azure';
    $('#row-browser-voice').style.display = eng === 'browser' ? '' : 'none';
}

function populateVoices() {
    const sel = $('#cfg-browser-voice');
    const voices = listBrowserVoices();
    if (!voices.length) return;
    sel.innerHTML = '';
    voices.forEach(v => {
        const o = document.createElement('option');
        o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
        if (v.name === cfg.browserVoice) o.selected = true;
        sel.appendChild(o);
    });
}

// current (possibly unsaved) voice options, so "Test voice" reflects edits
function currentVoiceOpts() {
    return {
        engine: $('#cfg-voice-engine').value,
        voiceName: $('#cfg-browser-voice').value,
        elevenKey: $('#cfg-elevenLabsKey').value.trim(),
        elevenVoice: $('#cfg-elevenVoice').value.trim(),
        azureKey: $('#cfg-azureSpeechKey').value.trim(),
        azureRegion: $('#cfg-azureRegion').value.trim(),
        azureVoice: $('#cfg-azureVoice').value.trim()
    };
}

// ----------------------------------------------------------------- wiring
$('#cfg-provider').addEventListener('change', (e) => {
    if (!$('#cfg-model').value.trim()) $('#cfg-model').placeholder = defaultModel(e.target.value);
});
$('#cfg-voice-engine').addEventListener('change', reflectVoiceEngine);

$('#btn-test-voice').addEventListener('click', () =>
    window.anima.sendCommand({ type: 'testVoice', opts: currentVoiceOpts() }));

$('#btn-load-vrm').addEventListener('click', () => $('#vrm-file').click());
$('#vrm-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $('#vrm-name').textContent = 'loading…';
    const buffer = await file.arrayBuffer();
    // persist the name with the rest of the config so it survives restarts
    cfg.vrmName = file.name;
    window.anima.sendCommand({ type: 'loadVRM', buffer, name: file.name });
    $('#vrm-name').textContent = file.name;
});

document.querySelectorAll('.exprs button[data-expr]').forEach(b =>
    b.addEventListener('click', () => window.anima.sendCommand({ type: 'expression', value: b.dataset.expr })));
document.querySelectorAll('.exprs button[data-gesture]').forEach(b =>
    b.addEventListener('click', () => window.anima.sendCommand({ type: 'gesture', value: b.dataset.gesture })));

$('#btn-save').addEventListener('click', async () => {
    const btn = $('#btn-save');
    await saveConfig();
    const prev = btn.textContent;
    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = prev; }, 1200);
});
$('#btn-close-settings').addEventListener('click', () => window.anima.closeSettings());
$('#btn-quit').addEventListener('click', () => window.anima.quit());

if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoices;

// ----------------------------------------------------------------- boot
loadConfig();
