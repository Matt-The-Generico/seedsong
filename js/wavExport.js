// SEEDSONG — Offline render + WAV export
// Renders the full composition through an OfflineAudioContext (not a live
// recording) so the exported audio is sample-accurate and complete.

async function renderCompositionOffline(composition, sampleRate = 44100) {
  const secPerBeat = 60 / composition.bpm;
  const tail = 2.2; // let reverbless releases/pads ring out before the file ends
  const durationSec = composition.totalBeats * secPerBeat + tail;
  const numSamples = Math.ceil(durationSec * sampleRate);

  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offlineCtx = new OfflineCtx(2, numSamples, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 0.9;
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.ratio.value = 3;
  masterGain.connect(compressor);
  compressor.connect(offlineCtx.destination);

  const instruments = SEEDSONG_SYNTH.createInstruments(offlineCtx, masterGain);
  const sink = [];
  const layers = ["pad", "bass", "melody", "arp", "kick", "snare", "hat"];
  for (const layer of layers) {
    const inst = instruments[layer];
    for (const ev of composition.events[layer]) {
      const when = ev.time * secPerBeat;
      inst.play(when, ev.pitch, ev.dur * secPerBeat, ev.vel, sink);
    }
  }

  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer;
}

function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = [];
  for (let c = 0; c < numChannels; c++) channelData.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channelData[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

window.SEEDSONG_WAV = { renderCompositionOffline, audioBufferToWavBlob };
