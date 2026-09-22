// SEEDSONG — MP3 export (via bundled lamejs, no network required)

function floatTo16BitPCM(floatArr) {
  const out = new Int16Array(floatArr.length);
  for (let i = 0; i < floatArr.length; i++) {
    let s = Math.max(-1, Math.min(1, floatArr[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function encodeMp3FromAudioBuffer(audioBuffer, kbps = 160) {
  if (typeof lamejs === "undefined") {
    throw new Error("MP3 encoder library not loaded");
  }
  const numChannels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const left = floatTo16BitPCM(audioBuffer.getChannelData(0));
  const right = numChannels > 1 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : left;

  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
  const blockSize = 1152;
  const chunks = [];

  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const r = numChannels > 1 ? right.subarray(i, i + blockSize) : undefined;
    const mp3buf = numChannels > 1 ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
    if (mp3buf.length > 0) chunks.push(mp3buf);
  }
  const finalBuf = encoder.flush();
  if (finalBuf.length > 0) chunks.push(finalBuf);

  return new Blob(chunks, { type: "audio/mpeg" });
}

window.SEEDSONG_MP3 = { encodeMp3FromAudioBuffer };
