// SEEDSONG — Music theory primitives

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SCALES = {
  major:      { name: "Major",          intervals: [0, 2, 4, 5, 7, 9, 11], qualities: ["maj", "min", "min", "maj", "maj", "min", "dim"] },
  minor:      { name: "Minor",          intervals: [0, 2, 3, 5, 7, 8, 10], qualities: ["min", "dim", "maj", "min", "min", "maj", "maj"] },
  dorian:     { name: "Dorian",         intervals: [0, 2, 3, 5, 7, 9, 10], qualities: ["min", "min", "maj", "maj", "min", "dim", "maj"] },
  pentatonic: { name: "Major Pentatonic", intervals: [0, 2, 4, 7, 9], qualities: ["maj", "min", "min", "maj", "min"] },
};

const ROMAN = {
  major:      ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  minor:      ["i", "ii°", "III", "iv", "v", "VI", "VII"],
  dorian:     ["i", "ii", "III", "IV", "v", "vi°", "VII"],
  pentatonic: ["I", "ii", "iii", "IV", "v"],
};

// scale-degree function tags, used to steer progression generation musically
const FUNCTION_TAGS = {
  major:      ["tonic", "pre", "tonic", "pre", "dom", "tonic", "dom"],
  minor:      ["tonic", "pre", "tonic", "pre", "dom", "pre", "dom"],
  dorian:     ["tonic", "pre", "tonic", "pre", "dom", "pre", "dom"],
  pentatonic: ["tonic", "pre", "tonic", "dom", "dom"],
};

const CHORD_TRIADS = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
};

function midiFromDegree(root, octave, scaleType, degree) {
  const intervals = SCALES[scaleType].intervals;
  const len = intervals.length;
  const oct = octave + Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return 12 * (oct + 1) + root + intervals[idx];
}

// build a diatonic triad rooted at scale degree `degIndex` (0-based), returns midi pitches
function diatonicTriad(root, octave, scaleType, degIndex) {
  const quality = SCALES[scaleType].qualities[degIndex % SCALES[scaleType].qualities.length];
  const shape = CHORD_TRIADS[quality];
  const rootMidi = midiFromDegree(root, octave, scaleType, degIndex);
  // stack thirds diatonically (skip a scale step each time) for correct diatonic 7th color,
  // but keep it a clean triad using scale-relative thirds rather than fixed semitone shape
  const len = SCALES[scaleType].intervals.length;
  const third = midiFromDegree(root, octave, scaleType, degIndex + (len === 5 ? 1 : 2));
  const fifth = midiFromDegree(root, octave, scaleType, degIndex + (len === 5 ? 3 : 4));
  return { rootMidi, pitches: [rootMidi, third, fifth], quality };
}

function noteName(midi) {
  const n = ((midi % 12) + 12) % 12;
  return NOTE_NAMES[n];
}

function keyLabel(root, scaleType) {
  const scaleName = scaleType === "minor" ? "Minor" : scaleType === "major" ? "Major" : SCALES[scaleType].name;
  return `${NOTE_NAMES[root]} ${scaleName}`;
}

// clamp a midi pitch into a comfortable register
function clampRegister(midi, lo, hi) {
  while (midi < lo) midi += 12;
  while (midi > hi) midi -= 12;
  return midi;
}

window.THEORY = {
  NOTE_NAMES, SCALES, ROMAN, FUNCTION_TAGS, CHORD_TRIADS,
  midiFromDegree, diatonicTriad, noteName, keyLabel, clampRegister,
};
