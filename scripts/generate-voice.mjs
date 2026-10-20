#!/usr/bin/env node
// Pre-records every voice cue with ElevenLabs and writes them to audio/voice/.
//
//   ELEVENLABS_API_KEY=... node scripts/generate-voice.mjs
//
// Optional: ELEVENLABS_VOICE (voice name, default "Jessica"),
//           ELEVENLABS_VOICE_ID (skip the name lookup),
//           ELEVENLABS_MODEL (default "eleven_multilingual_v2").
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICE_PHRASES, phraseFile } from '../js/voice-phrases.js';

const API = 'https://api.elevenlabs.io';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('Set ELEVENLABS_API_KEY first.');
  process.exit(1);
}
const voiceName = process.env.ELEVENLABS_VOICE || 'Jessica';
const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'audio', 'voice');

async function api(path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { 'xi-api-key': key, ...init.headers } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res;
}

async function findVoice() {
  if (process.env.ELEVENLABS_VOICE_ID) return { voice_id: process.env.ELEVENLABS_VOICE_ID, name: voiceName };
  const { voices } = await (await api('/v1/voices')).json();
  const want = voiceName.toLowerCase();
  const match = voices.find((v) => v.name.toLowerCase() === want) ||
    voices.find((v) => v.name.toLowerCase().startsWith(want));
  if (!match) {
    throw new Error(`No voice named "${voiceName}". Available: ${voices.map((v) => v.name).join(', ')}`);
  }
  return match;
}

const voice = await findVoice();
console.log(`Voice: ${voice.name} (${voice.voice_id}), model: ${model}`);
await mkdir(outDir, { recursive: true });

const clips = {};
for (const text of VOICE_PHRASES) {
  const file = phraseFile(text);
  const res = await api(`/v1/text-to-speech/${voice.voice_id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    }),
  });
  await writeFile(join(outDir, file), Buffer.from(await res.arrayBuffer()));
  clips[text] = file;
  console.log(`  ${file}  "${text}"`);
}

await writeFile(
  join(outDir, 'manifest.json'),
  JSON.stringify({ voice: voice.name, voiceId: voice.voice_id, model, clips }, null, 2) + '\n'
);
console.log(`Wrote ${VOICE_PHRASES.length} clips to audio/voice/. Bump CACHE in sw.js before deploying.`);
