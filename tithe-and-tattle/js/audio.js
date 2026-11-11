/* Tithe & Tattle: synthesized one-shot sound effects. The background music is in music.js.
 *   AUDIO.play('tick' | 'cross' | 'dot' | 'erase' | 'page' | 'bell' | 'soft')
 *   AUDIO.enabled = false mutes the effects only. The context unlocks on the first touch or key.
 *   AUDIO.ctx() is the shared AudioContext, which music.js uses too.
 */
(function () {
  'use strict';
  var ac = null, master = null, noiseBuf = null;
  function ctx() {
    if (ac) return ac;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
    return ac;
  }
  function unlock() {
    var a = ctx();
    if (a && a.state === 'suspended') a.resume();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { window.addEventListener(ev, unlock, { passive: true, capture: true }); });

  function noise(t, dur, freq, q, gain, type) {
    var src = ac.createBufferSource(); src.buffer = noiseBuf;
    var f = ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.006, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
    return f;
  }
  function tone(t, freq, dur, gain, type) {
    var o = ac.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  // a bell: inharmonic partials of a church bell (hum, prime, tierce, quint, nominal)
  function bell(t, f, gain) {
    [[0.5, 0.9, 3.2], [1, 1, 2.4], [1.19, 0.55, 1.8], [1.5, 0.4, 1.5], [2, 0.5, 1.2], [2.74, 0.18, 0.7]].forEach(function (p) {
      tone(t, f * p[0], p[2], gain * p[1] * 0.35);
    });
  }
  var SOUNDS = {
    tick: function (t) { noise(t, 0.035, 3800, 2.5, 0.35); },
    cross: function (t) { noise(t, 0.05, 3200, 1.8, 0.32); noise(t + 0.045, 0.04, 4200, 2.2, 0.25); },
    dot: function (t) { noise(t, 0.03, 2400, 3, 0.3); tone(t, 1760, 0.06, 0.03, 'triangle'); },
    erase: function (t) { noise(t, 0.09, 1500, 0.8, 0.12); },
    page: function (t) { var f = noise(t, 0.32, 900, 0.6, 0.16); f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(2200, t + 0.28); },
    soft: function (t) { tone(t, 659.3, 0.5, 0.05); },
    bell: function (t) { bell(t, 523.25, 0.5); bell(t + 0.22, 659.25, 0.42); bell(t + 0.44, 783.99, 0.46); }
  };
  var last = {};
  window.AUDIO = {
    enabled: true,
    unlock: unlock,
    ctx: ctx,
    play: function (name) {
      if (!AUDIO.enabled || !SOUNDS[name]) return;
      var a = ctx(); if (!a || a.state !== 'running') return;
      var now = a.currentTime;
      if (last[name] && now - last[name] < 0.03) return;
      last[name] = now;
      try { SOUNDS[name](now + 0.005); } catch (e) { /* ignore */ }
    }
  };
})();
