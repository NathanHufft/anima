// ============================================================================
//  listen.js — speech-to-text so you can talk to her.
//  Captures the microphone as 16 kHz mono WAV (universally accepted) and
//  transcribes it through whichever provider key is available:
//    OpenAI (Whisper) · Azure AI Speech · ElevenLabs (Scribe)
//
//  Usage:
//    const listener = new Listener();
//    listener.start({ cfg, onState, onLevel, onText, onError });
//    listener.stop();   // finish now and transcribe
//    listener.cancel(); // abort without transcribing
//  It auto-stops after a short pause once you've started speaking.
// ============================================================================

function pickEngine(cfg) {
  const pref = cfg.sttEngine || 'auto';
  const has = {
    openai: !!cfg.openaiKey,
    azure: !!(cfg.azureSpeechKey && cfg.azureRegion),
    elevenlabs: !!cfg.elevenLabsKey,
  };
  if (pref !== 'auto') return has[pref] ? pref : null;
  if (has.openai) return 'openai';
  if (has.azure) return 'azure';
  if (has.elevenlabs) return 'elevenlabs';
  return null;
}

export function sttAvailable(cfg) { return !!pickEngine(cfg); }

// --------------------------------------------------------------- WAV encoding
function mergeChunks(chunks) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function downsample(buffer, srcRate, dstRate) {
  if (dstRate >= srcRate) return buffer;
  const ratio = srcRate / dstRate;
  const newLen = Math.round(buffer.length / ratio);
  const out = new Float32Array(newLen);
  let oPos = 0, iPos = 0;
  while (oPos < newLen) {
    const next = Math.round((oPos + 1) * ratio);
    let sum = 0, count = 0;
    for (let i = iPos; i < next && i < buffer.length; i++) { sum += buffer[i]; count++; }
    out[oPos] = sum / (count || 1);
    oPos++; iPos = next;
  }
  return out;
}

function encodeWav(float32, srcRate, dstRate = 16000) {
  const data = downsample(float32, srcRate, dstRate);
  const buffer = new ArrayBuffer(44 + data.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + data.length * 2, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, dstRate, true); view.setUint32(28, dstRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, data.length * 2, true);
  let p = 44;
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    p += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}

// --------------------------------------------------------------- transcription
async function transcribeOpenAI(wav, key) {
  const fd = new FormData();
  fd.append('file', wav, 'audio.wav');
  fd.append('model', 'whisper-1');
  fd.append('response_format', 'json');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd
  });
  if (!res.ok) throw new Error('OpenAI STT ' + res.status + ' ' + (await res.text().catch(() => '')));
  return (await res.json()).text || '';
}

async function transcribeAzure(wav, key, region) {
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Accept': 'application/json'
    },
    body: await wav.arrayBuffer()
  });
  if (!res.ok) throw new Error('Azure STT ' + res.status + ' ' + (await res.text().catch(() => '')));
  const j = await res.json();
  return j.DisplayText || (j.NBest && j.NBest[0] && (j.NBest[0].Display || j.NBest[0].Lexical)) || '';
}

async function transcribeEleven(wav, key) {
  const fd = new FormData();
  fd.append('file', wav, 'audio.wav');
  fd.append('model_id', 'scribe_v1');
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': key }, body: fd
  });
  if (!res.ok) throw new Error('ElevenLabs STT ' + res.status + ' ' + (await res.text().catch(() => '')));
  return (await res.json()).text || '';
}

export async function transcribe(wav, cfg, engine) {
  engine = engine || pickEngine(cfg);
  if (engine === 'openai') return transcribeOpenAI(wav, cfg.openaiKey);
  if (engine === 'azure') return transcribeAzure(wav, cfg.azureSpeechKey, (cfg.azureRegion || 'eastus').trim());
  if (engine === 'elevenlabs') return transcribeEleven(wav, cfg.elevenLabsKey);
  throw new Error('No speech-to-text key. Add an OpenAI, Azure Speech, or ElevenLabs key in settings.');
}

// --------------------------------------------------------------- the Listener
export class Listener {
  constructor() {
    this._active = false;
    this._teardown = null;
    this._finishing = false;
  }
  get active() { return this._active; }

  async start({ cfg, onState = () => {}, onLevel = () => {}, onText = () => {}, onError = () => {} }) {
    if (this._active) return;
    const engine = pickEngine(cfg);
    if (!engine) { onError(new Error('No speech-to-text key. Add an OpenAI, Azure Speech, or ElevenLabs key in settings.')); return; }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (e) { onError(new Error('Microphone unavailable: ' + e.message)); return; }

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    let speechStarted = false, silenceMs = 0, totalMs = 0, last = performance.now();

    this._active = true;
    this._finishing = false;
    onState('listening');

    const teardown = () => {
      try { proc.disconnect(); source.disconnect(); } catch {}
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
      const sr = ctx.sampleRate;
      try { ctx.close(); } catch {}
      this._active = false;
      this._teardown = null;
      return sr;
    };

    const finish = async () => {
      if (this._finishing) return;
      this._finishing = true;
      const sr = teardown();
      const wav = encodeWav(mergeChunks(chunks), sr, 16000);
      if (!chunks.length || wav.size < 2000) { onState('idle'); return; } // too short / silent
      onState('transcribing');
      try {
        const text = (await transcribe(wav, cfg, engine)).trim();
        onState('idle');
        if (text) onText(text);
      } catch (e) { onState('idle'); onError(e); }
    };

    const cancel = () => { if (this._finishing) return; this._finishing = true; teardown(); onState('idle'); };

    proc.onaudioprocess = (e) => {
      if (!this._active) return;
      const input = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));

      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      onLevel(Math.min(1, rms * 8));

      const now = performance.now(), dt = now - last; last = now; totalMs += dt;
      if (rms > 0.014) { speechStarted = true; silenceMs = 0; }
      else if (speechStarted) silenceMs += dt;

      // auto-stop after ~0.9s pause once speech began, or a 20s hard cap
      if ((speechStarted && silenceMs > 900) || totalMs > 20000) finish();
    };

    source.connect(proc);
    proc.connect(ctx.destination); // required to pump; output stays silent

    this._teardown = { finish, cancel };
  }

  stop() { if (this._active && this._teardown) this._teardown.finish(); }
  cancel() { if (this._active && this._teardown) this._teardown.cancel(); }
}
