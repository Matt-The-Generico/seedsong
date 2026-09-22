# SEEDSONG

A small procedural music composer that runs entirely in your browser — no
server, no build step, no network connection needed.

## Run it

Just open `index.html` in a modern desktop browser (Chrome, Edge, or
Firefox recommended — Web Audio + offline rendering support required).

## What it does

Type a seed (or hit the dice for a random one) and SEEDSONG deterministically
generates a short piece of music: a key and scale, a diatonic chord
progression, a bassline, a repeating-and-varying melodic motif, drums, and a
full intro → A → B → A′ → outro structure — all playable in the browser and
exportable as **MIDI**, **WAV**, and **MP3**.

The same seed + settings always produces the same song. A different seed
produces a genuinely different one. Every musical decision (key, chords,
rhythm, melody) comes from a seeded PRNG — nothing is `Math.random()`
except the tiny bit of white-noise texture used for the hi-hat/snare timbre.

## Controls

- **Seed** — anything you type, or the dice button for a random one.
- **Length / Mood / Tempo / Density / Humanization** — shape the piece.
- **Generate** — full regeneration.
- **New melody / New harmony / New beat** — reroll just that layer while
  keeping the rest of the composition (key, other layers) intact.
- **Play / Stop** — scheduled on the Web Audio clock, so there's no drift.
- **Download MIDI / WAV / MP3** — WAV and MP3 are rendered offline (not a
  live recording), so they always contain the complete, correct song.

## Structure

```
index.html
css/style.css        UI styling
js/prng.js            seeded PRNG
js/theory.js          scales, keys, diatonic chords
js/composer.js        the procedural composer (the heart of the app)
js/synth.js           Web Audio instrument sound design
js/scheduler.js       live playback engine
js/visualizer.js      reactive visualizer + piano-roll timeline
js/midiExport.js      hand-rolled Standard MIDI File writer
js/wavExport.js       offline render + WAV encoder
js/mp3Export.js       MP3 encoder (uses the bundled lamejs)
lib/lame.min.js        bundled locally — MP3 export works fully offline
```

No external requests are made anywhere in the app.
