# Hoan Timer Plus

A workout timer Progressive Web App (PWA) for iPhone: **Tabata**, **Rounds** (boxing/MMA) and **Stopwatch**. Plain HTML/CSS/JS, no build step, works offline once installed.

## Features

- **Tabata / HIIT** – prepare, work, rest, rounds, cycles and rest between cycles, with presets (20:10, 30:20, 40:20, 45:15, 50:10, EMOM).
- **Rounds** – round time, rest, number of rounds and a warning before each round ends. Presets for boxing, MMA and Muay Thai.
- **Stopwatch** – laps, with the fastest and slowest lap highlighted.
- **Cool down** – between cycles and/or at the end of the workout.
- **Bell** – boxing bell at start & finish (or every interval), plus loud 3-2-1 countdown beeps with the voice counting along.
- **Background music** – quiet built-in beats (Energy / Chill) or your own music file; it dips under the voice cues.
- **Sounds** – boxing gong, beep, whistle and digital schemes (generated in the browser, no audio files), volume, 3-2-1 countdown, ticking.
- **Voice assist** – spoken phases ("Work", "Rest", "Round 3", "Halfway", "Last round") using the device's voices.
- Screen flash, keep screen on, pale colors, time format (00:00, 0:00, seconds), landscape layout.
- Timers are based on timestamps, so they stay accurate and survive the app being closed or reopened.

## ElevenLabs voices

The spoken cues are pre-recorded with ElevenLabs and picked in Settings → Voice:

- **Jessica (English)** — `audio/voice/`
- **Hoan DO (Tiếng Việt)** — `audio/voice-hoando/`

Each folder has 46 clips and a `manifest.json` that maps the app's phrase to a file; packs are listed in `VOICE_PACKS` in `js/audio.js`. Phrases without a clip (for example rounds above 30) use the device voice. To re-record them with the API:

```sh
ELEVENLABS_API_KEY=your-key node scripts/generate-voice.mjs
```

This records every phrase in `js/voice-phrases.js` into `audio/voice/` (set `ELEVENLABS_VOICE` to use another voice). Commit the files, bump `CACHE` in `sw.js`, and deploy.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to Vercel

No build step is needed; `vercel.json` sets the caching headers.

- **From the dashboard:** vercel.com → **Add New… → Project** → import this GitHub repo → keep Framework Preset **Other** with no build command → **Deploy**. Every push to `main` then redeploys automatically.
- **From the command line:** `npx vercel --prod` in this folder.

## Install on iPhone

The app has to be served over HTTPS (for example on Vercel), then:

1. Open the site in **Safari** on the iPhone → **Share** → **Add to Home Screen**.

## iPhone limits

- iOS pauses web apps in the background or when the screen locks. The timer catches up when you return, but sounds are skipped while paused. Turn on **Keep screen on** in Settings.
- Vibration and the camera flashlight aren't available to web apps on iPhone, so those options from the original app are left out.

## Updating

When you change files, bump `CACHE` in `sw.js` (for example `timerplus-v2`) so installed copies pick up the new version.

The Bebas Neue font is licensed under the SIL Open Font License (see `fonts/LICENSE.txt`).
