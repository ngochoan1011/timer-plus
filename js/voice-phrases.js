// Every phrase the app speaks. Used by the app and by scripts/generate-voice.mjs
// to pre-record them with an ElevenLabs voice.
const rounds = Array.from({ length: 30 }, (_, i) => `Round ${i + 1}`);
const warnings = [5, 10, 15, 20, 30].map((s) => `${s} seconds`);

export const VOICE_PHRASES = [
  'Get ready',
  'Work',
  'Rest',
  'Halfway',
  'Last round',
  'Last round. Work',
  'Cycle complete. Rest',
  'Cool down',
  'Cycle complete. Cool down',
  'Workout complete. Great job!',
  '1', '2', '3',
  ...rounds,
  ...warnings,
];

// File name for a phrase: "Last round. Work" -> "last-round-work.mp3"
export function phraseFile(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.mp3';
}
