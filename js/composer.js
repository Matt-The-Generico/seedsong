// SEEDSONG — Procedural Composer
// Turns a seed + parameters into a deterministic, structured song:
// key/scale -> chord progression -> sections -> bass/melody/drums/pad events.

const STEPS_PER_BAR = 16;
const BEATS_PER_BAR = 4;
const STEP_BEATS = BEATS_PER_BAR / STEPS_PER_BAR; // 0.25

const MOODS = {
  bright:     { label: "Bright",     scaleWeights: { major: 5, dorian: 2, minor: 1, pentatonic: 3 }, tempo: [96, 132], densityBias: 0.1,  velBias: 8,  arp: 0.35, octave: 5 },
  melancholy: { label: "Melancholy", scaleWeights: { minor: 5, dorian: 2, major: 1, pentatonic: 1 }, tempo: [62, 86],  densityBias: -0.1, velBias: -6, arp: 0.15, octave: 4 },
  dreamy:     { label: "Dreamy",     scaleWeights: { dorian: 4, major: 3, pentatonic: 3, minor: 1 }, tempo: [66, 92],  densityBias: -0.05,velBias: -4, arp: 0.55, octave: 5 },
  driving:    { label: "Driving",    scaleWeights: { minor: 3, dorian: 3, major: 3, pentatonic: 1 }, tempo: [120, 146],densityBias: 0.25, velBias: 10, arp: 0.2,  octave: 4 },
  mysterious: { label: "Mysterious", scaleWeights: { dorian: 4, minor: 3, pentatonic: 2, major: 1 }, tempo: [70, 100], densityBias: 0.0,  velBias: -2, arp: 0.4,  octave: 4 },
};

const LENGTH_PRESETS = {
  short:  { sectionBars: { intro: 2, A: 4, B: 0,  Ap: 4, outro: 2 }, order: ["intro", "A", "Ap", "outro"] },
  medium: { sectionBars: { intro: 4, A: 8, B: 8,  Ap: 8, outro: 4 }, order: ["intro", "A", "B", "Ap", "outro"] },
  long:   { sectionBars: { intro: 4, A: 8, B: 16, Ap: 8, outro: 8 }, order: ["intro", "A", "B", "B2", "Ap", "outro"] },
};

// Degree-index progression families (0-indexed scale degrees). Work across
// major/minor/dorian because they describe FUNCTION (I, V, vi, IV...) not
// fixed chord quality. Pentatonic families use indices mod 5.
const FAMILIES_7 = [
  [0, 4, 5, 3], // I  V  vi  IV
  [0, 5, 3, 4], // I  vi IV  V
  [0, 3, 4, 0], // I  IV V   I
  [5, 3, 0, 4], // vi IV I   V
  [0, 3, 0, 4], // I  IV I   V
  [0, 1, 4, 0], // I  ii V   I
  [0, 4, 1, 4], // I  V  ii  V
];
const FAMILIES_5 = [
  [0, 3, 4, 0],
  [0, 4, 3, 0],
  [0, 1, 4, 0],
  [3, 4, 0, 0],
];

const BASS_TEMPLATES = [
  // each entry: {step, role, dur}. role: root | fifth | octave | approach | rest
  { name: "steady",     events: [{ step: 0, dur: 8, role: "root" }, { step: 8, dur: 8, role: "fifth" }] },
  { name: "walking",    events: [{ step: 0, dur: 4, role: "root" }, { step: 4, dur: 4, role: "fifth" }, { step: 8, dur: 4, role: "root" }, { step: 12, dur: 4, role: "approach" }] },
  { name: "sustained",  events: [{ step: 0, dur: 16, role: "root" }] },
  { name: "syncopated", events: [{ step: 0, dur: 6, role: "root" }, { step: 8, dur: 4, role: "fifth" }, { step: 12, dur: 4, role: "root" }] },
  { name: "pulse",      events: [{ step: 0, dur: 4, role: "root" }, { step: 4, dur: 4, role: "root" }, { step: 8, dur: 4, role: "fifth" }, { step: 12, dur: 4, role: "fifth" }] },
];

function buildDrumPattern(rng, densityLevel /* 0=sparse 1=med 2=dense */, fill) {
  const kick = new Array(STEPS_PER_BAR).fill(0);
  const snare = new Array(STEPS_PER_BAR).fill(0);
  const hat = new Array(STEPS_PER_BAR).fill(0);

  kick[0] = 1;
  if (densityLevel >= 1) kick[8] = 1;
  if (densityLevel >= 2 && rng.chance(0.5)) kick[10] = 1;
  if (densityLevel >= 1 && rng.chance(0.3)) kick[6] = 1;

  snare[4] = 1; snare[12] = 1;
  if (densityLevel >= 2 && rng.chance(0.35)) snare[14] = 1;

  if (densityLevel === 0) {
    for (let s = 0; s < STEPS_PER_BAR; s += 4) hat[s] = 0.7;
  } else if (densityLevel === 1) {
    for (let s = 0; s < STEPS_PER_BAR; s += 2) hat[s] = s % 4 === 0 ? 0.9 : 0.55;
  } else {
    for (let s = 0; s < STEPS_PER_BAR; s++) hat[s] = s % 4 === 0 ? 1.0 : (s % 2 === 0 ? 0.6 : 0.35);
  }

  if (fill) {
    // a small fill in the last beat leading into the next section
    for (let s = 12; s < STEPS_PER_BAR; s++) {
      if (rng.chance(0.6)) snare[s] = Math.max(snare[s], 0.6 + 0.1 * rng.next());
    }
    kick[STEPS_PER_BAR - 1] = rng.chance(0.5) ? 1 : kick[STEPS_PER_BAR - 1];
  }
  return { kick, snare, hat };
}

// ---- Motif system -------------------------------------------------------

function chordToneOffsets(scaleType) {
  return scaleType === "pentatonic" ? [0, 1, 3] : [0, 2, 4];
}

function buildMotif(rng, scaleType, spanSteps, densityBias) {
  const [rootOff, thirdOff, fifthOff] = chordToneOffsets(scaleType);
  const steps = [];
  let step = 0;
  let prevDeg = rootOff;
  const baseNoteChance = 0.62 + densityBias;

  while (step < spanSteps) {
    const beatPos = step % 4;
    const isStrong = beatPos === 0;
    const isMedium = beatPos === 2;
    const chance = isStrong ? 0.95 : isMedium ? 0.72 : baseNoteChance;

    if (!rng.chance(chance)) {
      const restLen = rng.pick([1, 2]);
      step += restLen;
      continue;
    }

    let degStep;
    if (isStrong || rng.chance(0.55)) {
      // chord tone, biased toward root/third
      degStep = rng.weighted([rootOff, thirdOff, fifthOff], [3, 2, 1]);
      if (rng.chance(0.5)) degStep += Math.sign(degStep - prevDeg || 1) * 0 ; // no-op keeps shape simple
    } else {
      // stepwise passing tone around the previous note
      const dir = rng.chance(0.5) ? 1 : -1;
      degStep = prevDeg + dir;
      if (rng.chance(0.12)) degStep = prevDeg + dir * (rng.pick([3, 4, 5])); // rare leap
    }

    let dur = rng.weighted([1, 2, 3, 4], [2, 4, 1, 3]);
    dur = Math.min(dur, spanSteps - step);
    if (dur <= 0) dur = 1;

    steps.push({ step, dur, degStep });
    prevDeg = degStep;
    step += dur;
  }

  // resolve the final note toward the tonic-ish chord tone
  if (steps.length) {
    steps[steps.length - 1].degStep = rng.chance(0.7) ? rootOff : thirdOff;
  }
  return { steps, spanSteps };
}

function transformMotif(motif, kind, rng, scaleLen) {
  const steps = motif.steps.map((s) => ({ ...s }));
  switch (kind) {
    case "original":
      break;
    case "rhythmic": {
      // nudge one or two note durations / drop or add a short passing note
      if (steps.length > 2) {
        const i = rng.int(0, steps.length - 2);
        const room = steps[i + 1].step - steps[i].step;
        steps[i].dur = Math.max(1, Math.min(room, steps[i].dur + rng.pick([-1, 1])));
      }
      break;
    }
    case "invert": {
      const anchor = steps.length ? steps[0].degStep : 0;
      for (const s of steps) s.degStep = anchor - (s.degStep - anchor);
      break;
    }
    case "transpose": {
      const shift = rng.pick([1, -1, 2, -2]);
      for (const s of steps) s.degStep += shift;
      break;
    }
    case "octaveDisplace": {
      if (steps.length) {
        const i = rng.int(0, steps.length - 1);
        steps[i].degStep += rng.chance(0.5) ? scaleLen : -scaleLen;
      }
      break;
    }
    case "changeEnding": {
      if (steps.length) {
        const [rootOff, thirdOff] = chordToneOffsets(scaleLen === 5 ? "pentatonic" : "major");
        steps[steps.length - 1].degStep = rootOff;
        steps[steps.length - 1].dur = Math.min(6, steps[steps.length - 1].dur + 2);
      }
      break;
    }
  }
  return { steps, spanSteps: motif.spanSteps };
}

// ---- Main generation ------------------------------------------------------

function generateComposition(params) {
  const { seed, length, tempo, mood, density, humanize } = params;
  const salts = params.salts || {};
  const S = (label) => label + "::" + (salts[label] || "");
  const master = new SeededRNG(seed);
  const moodDef = MOODS[mood] || MOODS.bright;

  // key & scale
  const scaleRng = master.fork(S("scale"));
  const scaleChoices = Object.keys(moodDef.scaleWeights);
  const scaleWeights = scaleChoices.map((k) => moodDef.scaleWeights[k]);
  const scaleType = scaleRng.weighted(scaleChoices, scaleWeights);
  const root = scaleRng.int(0, 11);
  const scaleLen = THEORY.SCALES[scaleType].intervals.length;

  // tempo
  const bpm = tempo === "auto"
    ? master.fork(S("tempo")).int(moodDef.tempo[0], moodDef.tempo[1])
    : Math.max(40, Math.min(200, Math.round(tempo)));

  // density -> numeric bias
  const densityBiasMap = { sparse: -0.15, balanced: 0, dense: 0.2 };
  const densityBias = (densityBiasMap[density] ?? 0) + moodDef.densityBias;
  const humAmt = Math.max(0, Math.min(1, humanize));

  // chord progression (the song's core harmonic loop)
  const progRng = master.fork(S("progression"));
  const families = scaleLen === 5 ? FAMILIES_5 : FAMILIES_7;
  let progression = progRng.pick(families).slice();
  // musical variation: occasionally swap a predominant-function slot
  if (progRng.chance(0.4) && scaleLen === 7) {
    const swapIdx = progRng.pick([1, 3]); // ii <-> IV style substitution slot
    if (progRng.chance(0.5)) progression[swapIdx] = progression[swapIdx] === 3 ? 1 : 3;
  }
  const progressionB = progression.slice(1).concat([progRng.chance(0.5) ? 4 : 0]);
  // ^ section B: rotate + resolve through the dominant for development/tension

  const romanList = THEORY.ROMAN[scaleType];
  const progressionRoman = progression.map((d) => romanList[d % romanList.length]);

  // song structure
  const preset = LENGTH_PRESETS[length] || LENGTH_PRESETS.medium;
  const sections = [];
  let cursorBar = 0;
  for (const name of preset.order) {
    const bars = preset.sectionBars[name];
    if (!bars) continue;
    sections.push({ name, startBar: cursorBar, bars });
    cursorBar += bars;
  }
  const totalBars = cursorBar;

  // per-section musical role config
  const sectionCfg = {
    intro: { drumDensity: 0, melodyChance: 0.25, bassOn: false, padOn: true, arpOn: false, vel: 0.55, prog: progression },
    A:     { drumDensity: 1, melodyChance: 1.0,  bassOn: true,  padOn: true, arpOn: moodDef.arp > 0.3, vel: 0.8, prog: progression },
    B:     { drumDensity: 2, melodyChance: 1.0,  bassOn: true,  padOn: true, arpOn: true, vel: 0.95, prog: progressionB },
    B2:    { drumDensity: 2, melodyChance: 1.0,  bassOn: true,  padOn: true, arpOn: true, vel: 0.9,  prog: progressionB.slice().reverse() },
    Ap:    { drumDensity: 1, melodyChance: 1.0,  bassOn: true,  padOn: true, arpOn: moodDef.arp > 0.4, vel: 0.85, prog: progression },
    outro: { drumDensity: 0, melodyChance: 0.4,  bassOn: false, padOn: true, arpOn: false, vel: 0.5, prog: progression },
  };

  const events = { pad: [], bass: [], melody: [], arp: [], kick: [], snare: [], hat: [] };

  const bassRng = master.fork(S("bass"));
  const melodyRngA = master.fork(S("melodyA"));
  const melodyRngB = master.fork(S("melodyB"));
  const drumRng = master.fork(S("drums"));
  const voicingRng = master.fork(S("voicing"));

  const melodyOctave = moodDef.octave;
  const chordOctave = melodyOctave - 2;

  // section-level bass template & melody motif (kept for the whole section for cohesion)
  let motifA = buildMotif(melodyRngA, scaleType, STEPS_PER_BAR * 2, densityBias);
  let motifAUsageCount = 0;
  let motifB = null;

  sections.forEach((sec, secIdx) => {
    const cfg = sectionCfg[sec.name] || sectionCfg.A;
    const prog = cfg.prog;
    const bassTemplate = bassRng.pick(BASS_TEMPLATES);
    const isOutro = sec.name === "outro";
    const isIntro = sec.name === "intro";

    for (let b = 0; b < sec.bars; b++) {
      const absBar = sec.startBar + b;
      const barStartBeat = absBar * BEATS_PER_BAR;
      const degIndex = prog[b % prog.length];
      const nextDegIndex = prog[(b + 1) % prog.length];
      const chord = THEORY.diatonicTriad(root, chordOctave, scaleType, degIndex);

      // outro: progressively thin the texture across its bars
      const outroFrac = isOutro ? b / Math.max(1, sec.bars - 1) : 0;
      const outroKeepDrums = !isOutro || outroFrac < 0.35;
      const outroKeepBass = !isOutro || outroFrac < 0.6;
      const outroKeepMelody = !isOutro || outroFrac < 0.75;
      const dynFade = isOutro ? Math.max(0.12, 1 - outroFrac) : 1;

      const velBase = (cfg.vel + moodDef.velBias / 100) * dynFade;

      // --- PAD ---
      if (cfg.padOn) {
        const inv = voicingRng.int(0, 2);
        const voiced = chord.pitches.map((p, i) => THEORY.clampRegister(p + (i < inv ? 12 : 0), 48, 84));
        // open voicing: drop the middle note an octave down sometimes
        if (voicingRng.chance(0.35) && voiced.length === 3) voiced[1] -= 12;
        voiced.forEach((p) => {
          events.pad.push({
            time: barStartBeat, dur: BEATS_PER_BAR * (isOutro ? 1 : 0.98),
            pitch: p, vel: 0.32 * velBase + 0.05,
          });
        });
      }

      // --- BASS ---
      if (cfg.bassOn && outroKeepBass) {
        for (const ev of bassTemplate.events) {
          let pitch;
          if (ev.role === "root") pitch = chord.rootMidi;
          else if (ev.role === "fifth") pitch = chord.pitches[2];
          else if (ev.role === "octave") pitch = chord.rootMidi + 12;
          else if (ev.role === "approach") {
            const nextRoot = THEORY.midiFromDegree(root, chordOctave, scaleType, nextDegIndex);
            const dir = bassRng.chance(0.5) ? 1 : -1;
            pitch = THEORY.midiFromDegree(root, chordOctave, scaleType, degIndex + dir);
            if (Math.abs(pitch - nextRoot) > 4) pitch = nextRoot + (dir > 0 ? -1 : 1);
          }
          pitch = THEORY.clampRegister(pitch, 28, 55);
          const jitter = humAmt * (bassRng.float(-0.015, 0.015));
          events.bass.push({
            time: barStartBeat + ev.step * STEP_BEATS + jitter,
            dur: ev.dur * STEP_BEATS * 0.95,
            pitch, vel: 0.7 * velBase + bassRng.float(-0.05, 0.05),
          });
        }
      }

      // --- MELODY (motif-based, 2-bar spans) ---
      if (outroKeepMelody && melodyRngA.chance(cfg.melodyChance)) {
        const spanPos = b % 2;
        if (spanPos === 0) {
          let motif;
          let activeMotif = motifA;
          if (sec.name === "B" || sec.name === "B2") {
            if (!motifB) motifB = buildMotif(melodyRngB, scaleType, STEPS_PER_BAR * 2, densityBias + 0.1);
            activeMotif = motifB;
            const kind = melodyRngB.pick(["transpose", "invert", "rhythmic", "original"]);
            motif = transformMotif(activeMotif, kind, melodyRngB, scaleLen);
          } else if (sec.name === "Ap") {
            motif = transformMotif(activeMotif, motifAUsageCount === 0 ? "changeEnding" : "octaveDisplace", melodyRngA, scaleLen);
          } else {
            const kinds = ["original", "rhythmic", "octaveDisplace", "changeEnding"];
            const kind = motifAUsageCount === 0 ? "original" : melodyRngA.pick(kinds);
            motif = transformMotif(activeMotif, kind, melodyRngA, scaleLen);
          }
          motifAUsageCount++;

          for (const s of motif.steps) {
            const globalStep = s.step; // within the 2-bar span starting at this bar
            const stepBar = absBar + Math.floor(globalStep / STEPS_PER_BAR);
            if (stepBar >= sec.startBar + sec.bars) continue; // don't overflow the section
            const stepInBar = globalStep % STEPS_PER_BAR;
            const barDeg = prog[(stepBar - sec.startBar) % prog.length];
            const pitch = THEORY.clampRegister(
              THEORY.midiFromDegree(root, melodyOctave, scaleType, barDeg + s.degStep),
              melodyOctave * 12 - 5, melodyOctave * 12 + 19
            );
            const t = stepBar * BEATS_PER_BAR + stepInBar * STEP_BEATS + humAmt * melodyRngA.float(-0.02, 0.02);
            events.melody.push({
              time: t, dur: s.dur * STEP_BEATS * (0.85 + humAmt * 0.1),
              pitch, vel: 0.85 * velBase + melodyRngA.float(-0.08, 0.08),
            });
          }
        }
      }

      // --- ARP (light texture layer) ---
      if (cfg.arpOn && !isIntro) {
        const arpPitches = [chord.pitches[0] + 12, chord.pitches[1] + 12, chord.pitches[2] + 12, chord.pitches[1] + 24];
        for (let i = 0; i < 8; i++) {
          if (voicingRng.chance(0.75)) {
            events.arp.push({
              time: barStartBeat + i * 0.5,
              dur: 0.42,
              pitch: THEORY.clampRegister(arpPitches[i % arpPitches.length], 60, 96),
              vel: 0.22 * velBase,
            });
          }
        }
      }

      // --- DRUMS ---
      if (cfg.drumDensity > 0 && outroKeepDrums) {
        const isLastBarOfSection = b === sec.bars - 1;
        const pat = buildDrumPattern(drumRng, cfg.drumDensity, isLastBarOfSection && secIdx < sections.length - 1);
        for (let s = 0; s < STEPS_PER_BAR; s++) {
          const t = barStartBeat + s * STEP_BEATS + humAmt * drumRng.float(-0.01, 0.01);
          if (pat.kick[s]) events.kick.push({ time: t, dur: 0.12, pitch: 36, vel: 0.9 * dynFade * pat.kick[s] });
          if (pat.snare[s]) events.snare.push({ time: t, dur: 0.1, pitch: 38, vel: 0.85 * dynFade * pat.snare[s] });
          if (pat.hat[s]) events.hat.push({ time: t, dur: 0.06, pitch: 42, vel: 0.55 * dynFade * pat.hat[s] });
        }
      }
    }
  });

  const totalBeats = totalBars * BEATS_PER_BAR;
  const noteCount = Object.values(events).reduce((sum, arr) => sum + arr.length, 0);

  return {
    seed, seedInt: master.seedInt,
    root, scaleType, keyLabel: THEORY.keyLabel(root, scaleType),
    bpm, mood, density, humanize,
    scaleLen,
    progression, progressionRoman,
    sections, totalBars, totalBeats,
    events, noteCount,
  };
}

// --- partial regeneration helpers ---
// Re-rolls only the requested subsystem(s) while every other fork keeps its
// existing salt — so the rest of the composition (key, other layers) is untouched.
const COMPONENT_LABELS = {
  melody: ["melodyA", "melodyB"],
  harmony: ["progression", "voicing"],
  chords: ["progression", "voicing"],
  beat: ["drums"],
  bass: ["bass"],
};
function regenerateComponent(prevComposition, params, component) {
  const labels = COMPONENT_LABELS[component] || [component];
  const salts = { ...(params.salts || {}) };
  const bump = String(Date.now() % 100000) + "-" + Math.floor(Math.random() * 1e6);
  for (const l of labels) salts[l] = bump;
  const next = { ...params, salts };
  return generateComposition(next);
}

window.SEEDSONG_COMPOSER = { generateComposition, regenerateComponent, STEPS_PER_BAR, BEATS_PER_BAR, STEP_BEATS, MOODS, LENGTH_PRESETS };
