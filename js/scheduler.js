// SEEDSONG — Playback engine
// Because the full note list is known ahead of time, every voice is scheduled
// directly on the Web Audio clock (node.start(exactTime)) instead of a manual
// setTimeout loop — this is what the platform guarantees sample-accurate,
// drift-free timing for.

class Player {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.instruments = null;
    this.activeNodes = [];
    this.playing = false;
    this.startCtxTime = 0;   // ctx.currentTime at which beat 0 played
    this.startOffsetBeats = 0;
    this.composition = null;
    this.secPerBeat = 0.5;
    this.onStop = null;
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.9;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.instruments = SEEDSONG_SYNTH.createInstruments(this.ctx, this.masterGain);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  play(composition, startBeat = 0) {
    this.ensureContext();
    this.stopVoices();
    this.composition = composition;
    this.secPerBeat = 60 / composition.bpm;
    this.startOffsetBeats = startBeat;
    this.startCtxTime = this.ctx.currentTime + 0.06;

    const layers = ["pad", "bass", "melody", "arp", "kick", "snare", "hat"];
    for (const layer of layers) {
      const inst = this.instruments[layer];
      const list = composition.events[layer];
      for (const ev of list) {
        if (ev.time < startBeat - 0.001) continue;
        const when = this.startCtxTime + (ev.time - startBeat) * this.secPerBeat;
        inst.play(when, ev.pitch, ev.dur * this.secPerBeat, ev.vel, this.activeNodes);
      }
    }

    this.playing = true;
    const totalDurSec = (composition.totalBeats - startBeat) * this.secPerBeat;
    clearTimeout(this._endTimer);
    this._endTimer = setTimeout(() => {
      if (this.playing) {
        this.playing = false;
        if (this.onStop) this.onStop();
      }
    }, totalDurSec * 1000 + 250);
  }

  stopVoices() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    for (const node of this.activeNodes) {
      try {
        if (node.stop) node.stop(now);
      } catch (e) { /* already stopped */ }
      try { node.disconnect && node.disconnect(); } catch (e) {}
    }
    this.activeNodes = [];
  }

  stop() {
    clearTimeout(this._endTimer);
    this.stopVoices();
    this.playing = false;
  }

  getPlaybackBeat() {
    if (!this.playing || !this.ctx) return this.startOffsetBeats;
    const elapsed = this.ctx.currentTime - this.startCtxTime;
    return this.startOffsetBeats + Math.max(0, elapsed) / this.secPerBeat;
  }
}

window.SEEDSONG_PLAYER = new Player();
