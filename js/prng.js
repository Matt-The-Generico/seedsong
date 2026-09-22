// SEEDSONG — Seeded PRNG
// Deterministic pseudo-random generator. Same seed -> same stream, always.

function hashStringToInt(str) {
  // xfnv1a-ish string hash -> 32-bit unsigned int
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += h << 13; h ^= h >>> 7;
  h += h << 3;  h ^= h >>> 17;
  h += h << 5;
  return h >>> 0;
}

function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return (Math.floor(seed) >>> 0) || 1;
  }
  const str = String(seed ?? "").trim();
  if (str === "") return 1;
  // pure numeric strings hash the same as numbers, for predictability
  if (/^-?\d+$/.test(str)) return (Math.abs(parseInt(str, 10)) >>> 0) || 1;
  return hashStringToInt(str) || 1;
}

// mulberry32 — small, fast, good enough statistical quality for creative use
class SeededRNG {
  constructor(seed) {
    this.seedInt = normalizeSeed(seed);
    this.state = this.seedInt >>> 0;
  }
  // returns float in [0, 1)
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // integer in [min, max] inclusive
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  // float in [min, max)
  float(min, max) {
    return min + this.next() * (max - min);
  }
  // true with probability p (0..1)
  chance(p) {
    return this.next() < p;
  }
  // pick a random element from an array
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }
  // pick index using weights (array of numbers, same length as choices)
  weighted(choices, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < choices.length; i++) {
      r -= weights[i];
      if (r <= 0) return choices[i];
    }
    return choices[choices.length - 1];
  }
  // fork a derived, independent-looking RNG for a sub-system (bass, melody, drums...)
  // keeps every subsystem deterministic from the same master seed but decorrelated.
  fork(label) {
    const derived = hashStringToInt(this.seedInt + "::" + label);
    return new SeededRNG(derived);
  }
}

window.SeededRNG = SeededRNG;
window.hashStringToInt = hashStringToInt;
