// SEEDSONG — Sound design
// Builds small synth "instruments" bound to a given AudioContext or
// OfflineAudioContext. Every instrument exposes play(time, pitch, dur, vel, sink)
// and pushes any nodes it creates into `sink` (array) so playback can stop them.

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createNoiseBuffer(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makeEnvGain(ctx, destination) {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(destination);
  return g;
}

function applyADSR(gainParam, t0, vel, a, d, s, r, holdDur) {
  const peak = Math.max(0.0001, vel);
  const sustainLevel = peak * s;
  gainParam.cancelScheduledValues(t0);
  gainParam.setValueAtTime(0, t0);
  gainParam.linearRampToValueAtTime(peak, t0 + a);
  gainParam.linearRampToValueAtTime(sustainLevel, t0 + a + d);
  const relStart = Math.max(t0 + a + d, t0 + holdDur);
  gainParam.setValueAtTime(sustainLevel, relStart);
  gainParam.linearRampToValueAtTime(0.0001, relStart + r);
}

function createInstruments(ctx, destination) {
  const noiseBufShort = createNoiseBuffer(ctx, 0.4);

  const pad = {
    play(time, pitch, dur, vel, sink) {
      const freq = midiToFreq(pitch);
      const g = makeEnvGain(ctx, destination);
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 1800;
      filt.Q.value = 0.4;
      filt.connect(g);
      const oscs = [];
      [-0.06, 0.0, 0.07].forEach((detune, i) => {
        const o = ctx.createOscillator();
        o.type = i === 1 ? "sine" : "sawtooth";
        o.frequency.value = freq * Math.pow(2, detune / 12);
        o.connect(filt);
        o.start(time);
        o.stop(time + dur + 0.6);
        oscs.push(o);
      });
      applyADSR(g.gain, time, vel * 0.5, 0.35, 0.25, 0.7, 0.5, dur);
      if (sink) sink.push(...oscs, g);
    },
  };

  const bass = {
    play(time, pitch, dur, vel, sink) {
      const freq = midiToFreq(pitch);
      const g = makeEnvGain(ctx, destination);
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 900;
      filt.Q.value = 0.8;
      filt.connect(g);
      const o1 = ctx.createOscillator();
      o1.type = "triangle";
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = freq / 2;
      o1.connect(filt); o2.connect(filt);
      o1.start(time); o1.stop(time + dur + 0.08);
      o2.start(time); o2.stop(time + dur + 0.08);
      applyADSR(g.gain, time, vel, 0.008, 0.09, 0.75, 0.12, dur);
      if (sink) sink.push(o1, o2, g);
    },
  };

  const melody = {
    play(time, pitch, dur, vel, sink) {
      const freq = midiToFreq(pitch);
      const g = makeEnvGain(ctx, destination);
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 3200;
      filt.Q.value = 1.1;
      filt.connect(g);
      const o1 = ctx.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = freq * 2;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.18;
      o2.connect(o2g); o2g.connect(filt);
      o1.connect(filt);
      o1.start(time); o1.stop(time + dur + 0.15);
      o2.start(time); o2.stop(time + dur + 0.15);
      applyADSR(g.gain, time, vel, 0.012, 0.07, 0.55, 0.14, dur);
      if (sink) sink.push(o1, o2, g, o2g);
    },
  };

  const arp = {
    play(time, pitch, dur, vel, sink) {
      const freq = midiToFreq(pitch);
      const g = makeEnvGain(ctx, destination);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      const filt = ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = freq * 2;
      filt.Q.value = 2;
      o.connect(filt); filt.connect(g);
      o.start(time); o.stop(time + dur + 0.25);
      applyADSR(g.gain, time, vel, 0.004, 0.12, 0.0, 0.18, Math.min(dur, 0.05));
      if (sink) sink.push(o, g);
    },
  };

  const kick = {
    play(time, pitch, dur, vel, sink) {
      const g = makeEnvGain(ctx, destination);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(150, time);
      o.frequency.exponentialRampToValueAtTime(48, time + 0.13);
      o.connect(g);
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vel, time + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
      o.start(time); o.stop(time + 0.3);
      if (sink) sink.push(o, g);
    },
  };

  const snare = {
    play(time, pitch, dur, vel, sink) {
      const g = makeEnvGain(ctx, destination);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBufShort;
      const bp = ctx.createBiquadFilter();
      bp.type = "highpass";
      bp.frequency.value = 900;
      noise.connect(bp); bp.connect(g);
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vel * 0.9, time + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
      noise.start(time); noise.stop(time + 0.18);

      const g2 = makeEnvGain(ctx, destination);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = 190;
      o.connect(g2);
      g2.gain.setValueAtTime(0, time);
      g2.gain.linearRampToValueAtTime(vel * 0.5, time + 0.002);
      g2.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      o.start(time); o.stop(time + 0.12);
      if (sink) sink.push(noise, g, o, g2);
    },
  };

  const hat = {
    play(time, pitch, dur, vel, sink) {
      const g = makeEnvGain(ctx, destination);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBufShort;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      noise.connect(hp); hp.connect(g);
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vel * 0.6, time + 0.001);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
      noise.start(time); noise.stop(time + 0.06);
      if (sink) sink.push(noise, g);
    },
  };

  return { pad, bass, melody, arp, kick, snare, hat };
}

window.SEEDSONG_SYNTH = { createInstruments, midiToFreq, createNoiseBuffer };
