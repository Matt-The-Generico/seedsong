// SEEDSONG — MIDI export
// Writes a Format-1 Standard MIDI File with one track per instrument,
// preserving pitch, timing, duration, velocity and tempo.

const PPQ = 480; // ticks per quarter note

function writeVarLen(value) {
  const bytes = [];
  let buffer = value & 0x7f;
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

function u32be(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}
function u16be(n) {
  return [(n >>> 8) & 0xff, n & 0xff];
}

function buildTrackChunk(bytesArr) {
  const header = [0x4d, 0x54, 0x72, 0x6b]; // "MTrk"
  return header.concat(u32be(bytesArr.length), bytesArr);
}

function trackFromEvents(events, channel, trackName, vClamp = [1, 127]) {
  // events: [{tick, dur, pitch, vel}] -> paired note-on/off, sorted, delta-encoded
  const raw = [];
  for (const e of events) {
    const vel = Math.max(vClamp[0], Math.min(vClamp[1], Math.round(e.vel * 127)));
    const startTick = Math.max(0, Math.round(e.tick));
    const endTick = Math.max(startTick + 1, Math.round(e.tick + e.durTicks));
    raw.push({ tick: startTick, type: "on", pitch: e.pitch, vel });
    raw.push({ tick: endTick, type: "off", pitch: e.pitch, vel: 0 });
  }
  raw.sort((a, b) => (a.tick - b.tick) || (a.type === "off" ? -1 : 1));

  const bytes = [];
  // track name meta event
  const nameBytes = Array.from(trackName).map((c) => c.charCodeAt(0));
  bytes.push(...writeVarLen(0), 0xff, 0x03, ...writeVarLen(nameBytes.length), ...nameBytes);
  // program change for a reasonable GM patch (skipped for drum channel)
  if (channel !== 9) {
    const program = { 0: 89, 1: 38, 2: 81, 3: 9 }[channel] ?? 0; // pad/synth-bass/saw-lead/celesta
    bytes.push(...writeVarLen(0), 0xc0 | channel, program);
  }

  let lastTick = 0;
  for (const ev of raw) {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;
    const status = (ev.type === "on" ? 0x90 : 0x80) | channel;
    bytes.push(...writeVarLen(delta), status, ev.pitch & 0x7f, ev.vel & 0x7f);
  }
  bytes.push(...writeVarLen(0), 0xff, 0x2f, 0x00); // end of track
  return buildTrackChunk(bytes);
}

function tempoTrack(bpm) {
  const microsPerBeat = Math.round(60000000 / bpm);
  const bytes = [];
  bytes.push(...writeVarLen(0), 0xff, 0x51, 0x03,
    (microsPerBeat >> 16) & 0xff, (microsPerBeat >> 8) & 0xff, microsPerBeat & 0xff);
  bytes.push(...writeVarLen(0), 0xff, 0x58, 0x04, 4, 2, 24, 8); // 4/4
  const nameBytes = Array.from("SEEDSONG").map((c) => c.charCodeAt(0));
  bytes.push(...writeVarLen(0), 0xff, 0x03, ...writeVarLen(nameBytes.length), ...nameBytes);
  bytes.push(...writeVarLen(0), 0xff, 0x2f, 0x00);
  return buildTrackChunk(bytes);
}

function beatsToTickEvents(list) {
  return list.map((e) => ({ tick: e.time * PPQ, durTicks: e.dur * PPQ, pitch: Math.round(e.pitch), vel: e.vel }));
}

function exportMidi(composition) {
  const tracks = [];
  tracks.push(tempoTrack(composition.bpm));

  const mapping = [
    { key: "pad", channel: 0, name: "Pad" },
    { key: "bass", channel: 1, name: "Bass" },
    { key: "melody", channel: 2, name: "Melody" },
    { key: "arp", channel: 3, name: "Arp" },
  ];
  for (const m of mapping) {
    const evs = beatsToTickEvents(composition.events[m.key]);
    if (evs.length) tracks.push(trackFromEvents(evs, m.channel, m.name));
  }

  // drums combined on GM channel 10 (index 9)
  const drumEvents = []
    .concat(composition.events.kick)
    .concat(composition.events.snare)
    .concat(composition.events.hat);
  if (drumEvents.length) {
    tracks.push(trackFromEvents(beatsToTickEvents(drumEvents), 9, "Drums"));
  }

  const numTracks = tracks.length;
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32be(6), ...u16be(1), ...u16be(numTracks), ...u16be(PPQ)];
  const all = header.concat(...tracks);
  const arr = new Uint8Array(all);
  return new Blob([arr], { type: "audio/midi" });
}

window.SEEDSONG_MIDI = { exportMidi, PPQ };
