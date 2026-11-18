/* Old Light: a few small WebAudio cues. Global SFX; SFX.enabled is saved in ol.settings.v1 by the UI. */
(function (root) {
  'use strict';
  var ctx = null;
  function ac() {
    if (!ctx) { var A = root.AudioContext || root.webkitAudioContext; if (!A) return null; try { ctx = new A(); } catch (e) { return null; } }
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  function tone(c, t0, f0, f1, dur, vol, type) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(c, t0, dur, vol, freq) {
    var n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; f.type = 'lowpass'; f.frequency.value = freq || 900; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t0);
  }
  var last = {};
  var SFX = {
    enabled: true,
    play: function (k) {
      if (!SFX.enabled) return;
      var now = Date.now(); if (last[k] && now - last[k] < 250) return; last[k] = now;
      var c = ac(); if (!c) return; var t = c.currentTime + 0.01;
      if (k === 'launch') { tone(c, t, 880, 880, 0.12, 0.05, 'triangle'); tone(c, t + 0.16, 660, 660, 0.18, 0.05, 'triangle'); }
      else if (k === 'impact') { noise(c, t, 0.35, 0.22, 700); tone(c, t, 110, 55, 0.3, 0.08, 'sine'); }
      else if (k === 'pause') { tone(c, t, 1318, 1318, 0.25, 0.035, 'sine'); tone(c, t + 0.09, 1760, 1760, 0.35, 0.03, 'sine'); }
      else if (k === 'click') { tone(c, t, 2200, 1800, 0.03, 0.015, 'square'); }
      else if (k === 'kill') { noise(c, t, 0.9, 0.18, 400); tone(c, t, 90, 40, 0.8, 0.07, 'sine'); }
    }
  };
  root.SFX = SFX;
})(typeof window !== 'undefined' ? window : this);
