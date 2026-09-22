// SEEDSONG — App glue

(function () {
  const $ = (id) => document.getElementById(id);

  const el = {
    seed: $("seedInput"), randomSeed: $("randomSeedBtn"),
    length: $("lengthSelect"), mood: $("moodSelect"),
    tempoMode: $("tempoMode"), tempoManualField: $("tempoManualField"),
    tempoSlider: $("tempoSlider"), tempoVal: $("tempoVal"),
    density: $("densitySelect"),
    humanize: $("humanizeSlider"), humanizeVal: $("humanizeVal"),
    volume: $("volumeSlider"), volumeVal: $("volumeVal"),
    generate: $("generateBtn"),
    newMelody: $("newMelodyBtn"), newHarmony: $("newHarmonyBtn"), newBeat: $("newBeatBtn"),
    play: $("playBtn"), stop: $("stopBtn"),
    exportMidi: $("exportMidiBtn"), exportWav: $("exportWavBtn"), exportMp3: $("exportMp3Btn"),
    infoKey: $("infoKey"), infoScale: $("infoScale"), infoTempo: $("infoTempo"),
    infoNotes: $("infoNotes"), infoSeed: $("infoSeed"),
    mainViz: $("mainViz"), rollNotes: $("rollNotes"), rollPlayhead: $("rollPlayhead"),
    legend: $("legend"), log: $("logCard"), liveDot: $("liveDot"),
  };

  let composition = null;
  let currentParams = null;
  let rollGeometry = null;
  const player = window.SEEDSONG_PLAYER;
  const visualizer = new SEEDSONG_VIS.MainVisualizer(el.mainViz, null);

  function log(msg, cls) {
    const line = document.createElement("div");
    line.className = "line" + (cls ? " " + cls : "");
    line.textContent = msg;
    el.log.appendChild(line);
    el.log.scrollTop = el.log.scrollHeight;
    while (el.log.children.length > 60) el.log.removeChild(el.log.firstChild);
  }

  function randomSeedString() {
    const words = ["orbital", "quiet", "amber", "drift", "glass", "hollow", "violet", "static",
      "signal", "kelp", "ember", "tundra", "vapor", "cinder", "lucid", "wren", "mono", "echo"];
    const w = words[Math.floor(Math.random() * words.length)];
    return `${w}-${Math.floor(Math.random() * 900 + 100)}`;
  }

  function buildLegend() {
    const layers = ["melody", "arp", "pad", "bass", "kick", "snare", "hat"];
    el.legend.innerHTML = layers.map((l) =>
      `<span><span class="swatch" style="background:${SEEDSONG_VIS.LAYER_COLORS[l]}"></span>${l}</span>`
    ).join("");
  }
  buildLegend();

  function readParams() {
    const tempo = el.tempoMode.value === "auto" ? "auto" : parseInt(el.tempoSlider.value, 10);
    return {
      seed: el.seed.value.trim() || "seedsong",
      length: el.length.value,
      mood: el.mood.value,
      tempo,
      density: el.density.value,
      humanize: parseInt(el.humanize.value, 10) / 100,
    };
  }

  function formatInfo(comp) {
    el.infoKey.textContent = THEORY.NOTE_NAMES[comp.root];
    el.infoScale.textContent = THEORY.SCALES[comp.scaleType].name;
    el.infoTempo.textContent = comp.bpm + " BPM";
    el.infoNotes.textContent = comp.noteCount;
    el.infoSeed.textContent = String(comp.seed);
  }

  function renderRoll(comp) {
    rollGeometry = SEEDSONG_VIS.renderPianoRoll(el.rollNotes, comp);
    const ph = el.rollPlayhead;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = ph.getBoundingClientRect();
    ph.width = Math.max(1, Math.round(rect.width * dpr));
    ph.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function doGenerate(params, isPartial, partialLabel) {
    player.stop();
    updatePlayUI(false);
    composition = SEEDSONG_COMPOSER.generateComposition(params);
    currentParams = params;
    formatInfo(composition);
    renderRoll(composition);
    const secs = (composition.totalBeats * 60 / composition.bpm).toFixed(1);
    if (isPartial) {
      log(`↻ Regenerated ${partialLabel}. ${composition.keyLabel}, ${composition.bpm} BPM.`, "hl");
    } else {
      log(`Generated ${composition.totalBars} bars — ${composition.keyLabel}, ${composition.bpm} BPM.`);
      log(`Progression: ${composition.progressionRoman.join(" – ")}`);
      log(`${composition.noteCount} events · ${secs}s · seed "${composition.seed}"`, "hl");
    }
  }

  el.generate.addEventListener("click", () => {
    const params = readParams();
    // fresh salts each explicit Generate so re-clicking with the same seed still
    // gives a *musical* result tied to that seed's core identity (key/progression
    // stay seed-derived) while subsystem rolls refresh.
    params.salts = {};
    doGenerate(params, false);
  });

  el.randomSeed.addEventListener("click", () => {
    el.seed.value = randomSeedString();
    const params = readParams();
    params.salts = {};
    doGenerate(params, false);
  });

  function regeneratePart(component, label) {
    if (!composition || !currentParams) {
      log("Generate a composition first.", "warn");
      return;
    }
    const next = SEEDSONG_COMPOSER.regenerateComponent(composition, currentParams, component);
    player.stop();
    updatePlayUI(false);
    composition = next;
    currentParams = { ...currentParams, salts: next.salts || currentParams.salts };
    formatInfo(composition);
    renderRoll(composition);
    log(`↻ New ${label} generated — same key & seed identity.`, "hl");
  }
  el.newMelody.addEventListener("click", () => regeneratePart("melody", "melody"));
  el.newHarmony.addEventListener("click", () => regeneratePart("harmony", "harmony"));
  el.newBeat.addEventListener("click", () => regeneratePart("beat", "beat"));

  el.tempoMode.addEventListener("change", () => {
    el.tempoManualField.style.display = el.tempoMode.value === "manual" ? "block" : "none";
  });
  el.tempoSlider.addEventListener("input", () => { el.tempoVal.textContent = el.tempoSlider.value + " BPM"; });
  el.humanize.addEventListener("input", () => { el.humanizeVal.textContent = el.humanize.value + "%"; });
  el.volume.addEventListener("input", () => {
    el.volumeVal.textContent = el.volume.value + "%";
    player.setVolume(parseInt(el.volume.value, 10) / 100);
  });

  // ---- Playback ----
  let animHandle = null;
  function updatePlayUI(playing) {
    el.liveDot.classList.toggle("live", playing);
    el.play.textContent = playing ? "⏸ Playing…" : "▶ Play";
  }

  function animLoop() {
    if (player.playing) {
      const beat = player.getPlaybackBeat();
      if (rollGeometry) {
        const ctx = el.rollPlayhead.getContext("2d");
        ctx.clearRect(0, 0, el.rollPlayhead.width, el.rollPlayhead.height);
        SEEDSONG_VIS.drawPlayhead(el.rollPlayhead, rollGeometry, beat);
      }
      animHandle = requestAnimationFrame(animLoop);
    } else {
      updatePlayUI(false);
    }
  }

  el.play.addEventListener("click", () => {
    if (!composition) { log("Generate a composition first.", "warn"); return; }
    player.ensureContext();
    visualizer.setAnalyser(player.analyser);
    player.setVolume(parseInt(el.volume.value, 10) / 100);
    player.onStop = () => { updatePlayUI(false); visualizer.stop(); };
    player.play(composition, 0);
    updatePlayUI(true);
    visualizer.resize();
    visualizer.start();
    cancelAnimationFrame(animHandle);
    animHandle = requestAnimationFrame(animLoop);
    log("▶ Playing.");
  });

  el.stop.addEventListener("click", () => {
    player.stop();
    updatePlayUI(false);
    visualizer.stop();
    cancelAnimationFrame(animHandle);
    if (rollGeometry) {
      const ctx = el.rollPlayhead.getContext("2d");
      ctx.clearRect(0, 0, el.rollPlayhead.width, el.rollPlayhead.height);
    }
    log("■ Stopped.");
  });

  // ---- Exports ----
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function safeSeedName() {
    return String(composition.seed).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || "seedsong";
  }

  el.exportMidi.addEventListener("click", () => {
    if (!composition) { log("Generate a composition first.", "warn"); return; }
    try {
      const blob = SEEDSONG_MIDI.exportMidi(composition);
      downloadBlob(blob, `seedsong_${safeSeedName()}.mid`);
      log("⬇ MIDI exported.", "hl");
    } catch (e) {
      console.error(e);
      log("MIDI export failed: " + e.message, "warn");
    }
  });

  async function withButtonBusy(btn, label, fn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try { await fn(); }
    finally { btn.disabled = false; btn.textContent = original; }
  }

  let cachedRender = null; // { forComposition, buffer }
  async function getRenderedBuffer() {
    if (cachedRender && cachedRender.forComposition === composition) return cachedRender.buffer;
    const buffer = await SEEDSONG_WAV.renderCompositionOffline(composition);
    cachedRender = { forComposition: composition, buffer };
    return buffer;
  }

  el.exportWav.addEventListener("click", async () => {
    if (!composition) { log("Generate a composition first.", "warn"); return; }
    await withButtonBusy(el.exportWav, "Rendering…", async () => {
      log("Rendering full offline mix for WAV…");
      const buffer = await getRenderedBuffer();
      const blob = SEEDSONG_WAV.audioBufferToWavBlob(buffer);
      downloadBlob(blob, `seedsong_${safeSeedName()}.wav`);
      log("⬇ WAV exported.", "hl");
    });
  });

  el.exportMp3.addEventListener("click", async () => {
    if (!composition) { log("Generate a composition first.", "warn"); return; }
    await withButtonBusy(el.exportMp3, "Encoding…", async () => {
      log("Rendering offline mix + encoding MP3…");
      const buffer = await getRenderedBuffer();
      const blob = SEEDSONG_MP3.encodeMp3FromAudioBuffer(buffer, 160);
      downloadBlob(blob, `seedsong_${safeSeedName()}.mp3`);
      log("⬇ MP3 exported.", "hl");
    });
  });

  window.addEventListener("resize", () => {
    if (composition) renderRoll(composition);
    visualizer.resize();
  });

  // initial generation on load
  const initial = readParams();
  initial.salts = {};
  doGenerate(initial, false);
})();
