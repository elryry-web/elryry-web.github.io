/* Vellum & Vermilion — sound. Everything is synthesized with WebAudio; no files, and no music bed.
   SFX.unlock() on the first touch; SFX.enabled = bool; SFX.turn() wiggle() whole(pigment) broken() pin() solved() */
(function () {
  'use strict';
  var ac = null, master = null, noiseBuf = null;
  // each pigment rings its own bell
  var BELL = { lapis: 784, vermilion: 659.3, verdigris: 880, orpiment: 987.8, gold: 1046.5, ink: 587.3 };

  function ctx() {
    if (ac) return ac;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ac = new AC(); } catch (e) { return null; }
    master = ac.createGain(); master.gain.value = 0.55;
    var comp = ac.createDynamicsCompressor();
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, Math.round(ac.sampleRate * 0.4), ac.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }
  function ok() { return SFX.enabled && ac && ac.state === 'running'; }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function tone(freq, type, t, a, peak, dec, dest) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    env(g, t, a, peak, dec);
    o.connect(g); g.connect(dest || master);
    o.start(t); o.stop(t + a + dec + 0.05);
    return o;
  }
  function noise(t, dur, peak, ftype, freq, q) {
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = ftype; f.frequency.value = freq; f.Q.value = q || 1;
    env(g, t, 0.002, peak, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }
  function bell(freq, t, peak, dec) {
    // a small struck bell: fundamental plus inharmonic partials
    [[1, 1], [2.76, 0.35], [5.4, 0.12], [0.5, 0.18]].forEach(function (p) {
      tone(freq * p[0], 'sine', t, 0.004, peak * p[1], dec * (p[0] > 2 ? 0.45 : 1));
    });
  }

  var SFX = {
    enabled: true,
    unlock: function () {
      var a = ctx(); if (!a) return;
      if (a.state === 'suspended') a.resume();
    },
    turn: function () {   // soft quill tick, random pitch
      if (!ok()) return;
      var t = ac.currentTime;
      noise(t, 0.045, 0.32, 'bandpass', 2600 + Math.random() * 1600, 2.5);
      tone(1500 + Math.random() * 500, 'triangle', t, 0.002, 0.05, 0.03);
    },
    wiggle: function () {   // muted wooden tock
      if (!ok()) return;
      var t = ac.currentTime;
      var o = tone(210, 'sine', t, 0.003, 0.35, 0.09);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.09);
      noise(t, 0.03, 0.12, 'lowpass', 900, 0.7);
    },
    whole: function (pigment) {   // a small bell, pitched by the pigment
      if (!ok()) return;
      bell(BELL[pigment] || 880, ac.currentTime + 0.02, 0.16, 1.1);
    },
    broken: function () {   // soft low pluck
      if (!ok()) return;
      var t = ac.currentTime, o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(196, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.25);
      f.type = 'lowpass'; f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
      env(g, t, 0.004, 0.22, 0.3);
      o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
    },
    pin: function () {   // tiny metallic tap
      if (!ok()) return;
      var t = ac.currentTime;
      tone(2350, 'sine', t, 0.001, 0.12, 0.12); tone(3710, 'sine', t, 0.001, 0.06, 0.07);
      noise(t, 0.02, 0.1, 'highpass', 4000, 0.7);
    },
    solved: function () {   // rising three-note bell chord and a shimmer
      if (!ok()) return;
      var t = ac.currentTime + 0.03;
      [523.25, 659.25, 783.99].forEach(function (f, i) { bell(f, t + i * 0.16, 0.15, 2.2); });
      bell(1046.5, t + 0.5, 0.07, 2.4);
      for (var i = 0; i < 9; i++) tone(2093 * Math.pow(1.122, i % 5) * (i > 4 ? 1.5 : 1), 'sine', t + 0.55 + i * 0.07, 0.01, 0.025, 0.5);
    }
  };
  window.SFX = SFX;
})();
