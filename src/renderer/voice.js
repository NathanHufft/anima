// ============================================================================
//  voice.js — speech with a lip-sync signal.
//  speak(text, opts) returns a controller. Both engines emit `onLevel(0..1)`
//  every frame so the avatar can move its mouth, plus onStart / onEnd.
//
//  - 'browser'    : offline SpeechSynthesis. Level is approximated from word
//                   boundaries + a jaw oscillation (no raw audio access).
//  - 'azure'      : Azure AI Speech neural voices via REST (SSML + emotion),
//                   real audio analysed through WebAudio for accurate lip-sync.
//  - 'elevenlabs' : real audio analysed through WebAudio for accurate lip-sync.
// ============================================================================

let audioCtx = null;
const ac = () => (audioCtx ||= new (window.AudioContext || window.webkitAudioContext)());

export function listBrowserVoices() {
  return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}

export function speak(text, opts = {}) {
  const { engine = 'browser', onLevel = () => {}, onStart = () => {}, onEnd = () => {},
          voiceName, elevenKey, elevenVoice,
          azureKey, azureRegion, azureVoice, mood = 'neutral', muted = false } = opts;

  if (muted || !text) { onStart(); onEnd(); return { stop() {} }; }
  if (engine === 'azure' && azureKey) {
    return speakAzure(text, { onLevel, onStart, onEnd, azureKey, azureRegion, azureVoice, mood });
  }
  if (engine === 'elevenlabs' && elevenKey) {
    return speakEleven(text, { onLevel, onStart, onEnd, elevenKey, elevenVoice });
  }
  return speakBrowser(text, { onLevel, onStart, onEnd, voiceName });
}

// --------------------------------------------------------------- browser TTS
function speakBrowser(text, { onLevel, onStart, onEnd, voiceName }) {
  const synth = window.speechSynthesis;
  if (!synth) { onStart(); onEnd(); return { stop() {} }; }
  synth.cancel();

  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const v = voices.find(x => x.name === voiceName)
         || voices.find(x => /ja-JP/i.test(x.lang))
         || voices.find(x => /female|zira|samantha|aria/i.test(x.name))
         || voices[0];
  if (v) u.voice = v;
  u.rate = 1.0; u.pitch = 1.15;

  let speaking = false, pulse = 0, raf;
  const tick = () => {
    if (!speaking) return;
    pulse *= 0.86;
    // base oscillation so the mouth keeps moving between word boundaries
    const osc = (Math.sin(performance.now() / 70) * 0.5 + 0.5) * 0.35;
    onLevel(Math.min(1, pulse + osc));
    raf = requestAnimationFrame(tick);
  };
  u.onstart = () => { speaking = true; onStart(); tick(); };
  u.onboundary = () => { pulse = 0.8; };
  u.onend = () => { speaking = false; cancelAnimationFrame(raf); onLevel(0); onEnd(); };
  u.onerror = () => { speaking = false; cancelAnimationFrame(raf); onLevel(0); onEnd(); };

  synth.speak(u);
  return { stop() { speaking = false; cancelAnimationFrame(raf); synth.cancel(); onLevel(0); } };
}

// --------------------------------------------------------------- shared audio
// Decode an audio buffer and play it, emitting a per-frame amplitude (0..1)
// for accurate lip-sync. Used by every engine that returns real audio.
async function playArrayBuffer(buf, { onLevel, onStart, onEnd }) {
  const ctx = ac();
  if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }
  const audioBuffer = await ctx.decodeAudioData(buf);
  const src = ctx.createBufferSource(); src.buffer = audioBuffer;
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
  src.connect(analyser); analyser.connect(ctx.destination);
  const data = new Uint8Array(analyser.frequencyBinCount);

  let running = true;
  const tick = () => {
    if (!running) return;
    analyser.getByteFrequencyData(data);
    let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i];
    onLevel(Math.min(1, (sum / data.length) / 90));
    requestAnimationFrame(tick);
  };
  const ctrl = { stop() { running = false; try { src.stop(); } catch {} onLevel(0); } };
  src.onended = () => { if (!running) return; running = false; onLevel(0); onEnd(); };
  onStart(); src.start(0); tick();
  return ctrl;
}

// --------------------------------------------------------------- ElevenLabs
function speakEleven(text, { onLevel, onStart, onEnd, elevenKey, elevenVoice }) {
  const ctrl = { stop() {} };
  const voiceId = elevenVoice || '21m00Tcm4TlvDq8ikWAM'; // "Rachel" default

  (async () => {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey, 'content-type': 'application/json', 'accept': 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.4, similarity_boost: 0.8 } })
      });
      if (!res.ok) throw new Error('ElevenLabs ' + res.status);
      const c = await playArrayBuffer(await res.arrayBuffer(), { onLevel, onStart, onEnd });
      ctrl.stop = c.stop;
    } catch (e) {
      console.warn('ElevenLabs failed, falling back to browser TTS:', e.message);
      const fb = speakBrowser(text, { onLevel, onStart, onEnd });
      ctrl.stop = fb.stop;
    }
  })();

  return ctrl;
}

// --------------------------------------------------------------- Azure Speech
// Maps her current mood to an Azure express-as speaking style. Unsupported
// styles are retried without styling, so any valid voice name works.
const MOOD_STYLE = { happy:'cheerful', sad:'sad', angry:'angry',
                     surprised:'excited', relaxed:'gentle', neutral:null };

function escXml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function buildSSML(text, voice, style){
  const locale = voice.slice(0, 5);
  const body = style
    ? `<mstts:express-as style="${style}" styledegree="1.4">${escXml(text)}</mstts:express-as>`
    : escXml(text);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" `
    + `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${locale}">`
    + `<voice name="${voice}">${body}</voice></speak>`;
}

function azureFetch(region, key, ssml){
  return fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'Anima'
    },
    body: ssml
  });
}

function speakAzure(text, { onLevel, onStart, onEnd, azureKey, azureRegion, azureVoice, mood }) {
  const ctrl = { stop() {} };
  const voice = (azureVoice || 'en-US-JennyNeural').trim();
  const region = (azureRegion || 'eastus').trim();
  const style = MOOD_STYLE[mood];

  (async () => {
    try {
      let res = await azureFetch(region, azureKey, buildSSML(text, voice, style));
      if (!res.ok && style) {                       // voice may not support the style
        res = await azureFetch(region, azureKey, buildSSML(text, voice, null));
      }
      if (!res.ok) throw new Error('Azure TTS ' + res.status + ' ' + (await res.text().catch(()=> '')));
      const c = await playArrayBuffer(await res.arrayBuffer(), { onLevel, onStart, onEnd });
      ctrl.stop = c.stop;
    } catch (e) {
      console.warn('Azure TTS failed, falling back to browser TTS:', e.message);
      const fb = speakBrowser(text, { onLevel, onStart, onEnd });
      ctrl.stop = fb.stop;
    }
  })();

  return ctrl;
}
