// SEEDSONG — Visualization: reactive main visualizer + piano-roll timeline

const LAYER_COLORS = {
  pad:    "#5b7fff",
  bass:   "#ff7a59",
  melody: "#5be0c2",
  arp:    "#e0b0ff",
  kick:   "#ffd166",
  snare:  "#ff6b9d",
  hat:    "#9fb4c7",
};

class MainVisualizer {
  constructor(canvas, analyser) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.analyser = analyser;
    this.data = new Uint8Array(analyser ? analyser.frequencyBinCount : 512);
    this.running = false;
    this._raf = null;
    this.hueShift = 0;
  }
  setAnalyser(analyser) {
    this.analyser = analyser;
    this.data = new Uint8Array(analyser.frequencyBinCount);
  }
  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.drawIdle();
  }
  resize() {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
  }
  drawIdle() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    const w = canvas.width, h = canvas.height, mid = h / 2;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  draw() {
    if (!this.analyser) return;
    this.analyser.getByteFrequencyData(this.data);
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bars = 64;
    const step = Math.floor(this.data.length / bars);
    const barW = w / bars;
    this.hueShift = (this.hueShift + 0.15) % 360;

    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += this.data[i * step + j];
      const v = sum / step / 255;
      const barH = v * h * 0.92;
      const hue = (180 + this.hueShift + i * 2.2) % 360;
      ctx.fillStyle = `hsla(${hue}, 85%, ${45 + v * 25}%, ${0.55 + v * 0.4})`;
      const x = i * barW;
      ctx.fillRect(x + 1, h - barH, barW - 2, barH);
      ctx.fillStyle = `hsla(${hue}, 85%, 65%, 0.18)`;
      ctx.fillRect(x + 1, h - barH - 3, barW - 2, 3);
    }
  }
}

function midiRange(composition) {
  let lo = 127, hi = 0;
  for (const layer of ["melody", "bass", "arp", "pad"]) {
    for (const e of composition.events[layer]) {
      if (e.pitch < lo) lo = e.pitch;
      if (e.pitch > hi) hi = e.pitch;
    }
  }
  if (lo > hi) { lo = 48; hi = 72; }
  return [lo - 2, hi + 2];
}

function renderPianoRoll(canvas, composition) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const [lo, hi] = midiRange(composition);
  const pitchRange = Math.max(12, hi - lo);
  const totalBeats = composition.totalBeats;
  const beatsPerBar = 4;
  const px = (beat) => (beat / totalBeats) * w;
  const py = (pitch) => h - ((pitch - lo) / pitchRange) * h;

  // section backgrounds
  const sectionColors = { intro: "rgba(255,255,255,0.02)", A: "rgba(91,224,194,0.05)", B: "rgba(91,127,255,0.06)", B2: "rgba(224,176,255,0.06)", Ap: "rgba(91,224,194,0.05)", outro: "rgba(255,255,255,0.02)" };
  for (const sec of composition.sections) {
    const x0 = px(sec.startBar * beatsPerBar);
    const x1 = px((sec.startBar + sec.bars) * beatsPerBar);
    ctx.fillStyle = sectionColors[sec.name] || "rgba(255,255,255,0.02)";
    ctx.fillRect(x0, 0, x1 - x0, h);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `${Math.max(10, h * 0.03)}px 'JetBrains Mono', monospace`;
    ctx.fillText(sec.name, x0 + 4, 14);
  }

  // bar gridlines
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let bar = 0; bar <= composition.totalBars; bar++) {
    const x = px(bar * beatsPerBar);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // notes, back-to-front so melody sits on top
  const order = ["pad", "arp", "bass", "kick", "snare", "hat", "melody"];
  for (const layer of order) {
    const events = composition.events[layer];
    const color = LAYER_COLORS[layer];
    ctx.fillStyle = color;
    const isDrum = layer === "kick" || layer === "snare" || layer === "hat";
    for (const e of events) {
      const x = px(e.time);
      const wid = Math.max(1.5, px(e.time + e.dur) - x - 1);
      if (isDrum) {
        const yBase = h - (layer === "kick" ? 10 : layer === "snare" ? 20 : 30);
        ctx.globalAlpha = 0.55 + e.vel * 0.4;
        ctx.fillRect(x, yBase, 2.4, 6);
      } else {
        const y = py(e.pitch);
        ctx.globalAlpha = 0.45 + e.vel * 0.5;
        const height = layer === "pad" ? 3 : 4;
        ctx.fillRect(x, y - height / 2, wid, height);
      }
    }
  }
  ctx.globalAlpha = 1;

  return { lo, hi, pitchRange, totalBeats, w, h };
}

function drawPlayhead(canvas, geometry, beat) {
  const ctx = canvas.getContext("2d");
  const x = (beat / geometry.totalBeats) * geometry.w;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.shadowColor = "#5be0c2";
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, geometry.h);
  ctx.stroke();
  ctx.restore();
}

window.SEEDSONG_VIS = { MainVisualizer, renderPianoRoll, drawPlayhead, LAYER_COLORS };
