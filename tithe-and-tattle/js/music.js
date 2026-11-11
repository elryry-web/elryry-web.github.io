/* Tithe & Tattle: a small score of background music, synthesized with Web Audio.
 * All six pieces are new compositions in the manner of English and northern French music c.1300-1340.
 * Tuning is Pythagorean (pure fifths), so drones and open fifths sit still.
 *
 *   1. Estampie of the Eel Rents   estampie: five puncti, each played with an ouvert then a clos ending
 *                                   D Dorian. Bagpipe (chanter and one drone) with tabor from the second
 *                                   punctus. Town dance. Title, Chronicle and other town screens.
 *   2. Hob's Weir (carol)          carol: burden, verse, burden... four burdens round three verses.
 *                                   F Lydian with B-flat. Burden: pipe and tabor over a symphony
 *                                   (hurdy-gurdy) drone; verses: gittern alone, closing each verse with a
 *                                   double-leading-tone cadence. Town; also plays first after a page is finished.
 *   3. The Abbot's Pears (rondeau)  rondeau shape A B a A a b A B; capitals two voices, lower case melody alone.
 *                                   G Mixolydian. Psaltery. Quiet: while solving.
 *   4. Wystan's Lamp (lai)         lai: paired versicles A A' B B' C C' and A' again; first of each pair open,
 *                                   second closed (sixth to octave, C-sharp to D). D Dorian. Solo harp,
 *                                   low and sparse. Quiet.
 *   5. Mist on the Lode            slow free-rhythm melody in phrases with breaths. G Dorian (B-flat).
 *                                   Recorder over a symphony drone on G and D. Quiet.
 *   6. Compline at St Alnoth       chant-like solo line, then the same line in parallel-fifth organum,
 *                                   framed by the abbey bells. D Hypodorian. Small organ and bells.
 *                                   Abbey: town screens.
 *
 * Score notation: a line is space-separated tokens PITCH/UNITS (D4/2, Bb3/1, C#5/3), r/UNITS for a rest,
 * x/UNITS and o/UNITS for strong and light tabor strokes. '|' is ignored (bar lines for the eye).
 * A line ending in '*' repeats to fill its section. Every other line in a section must add up to the
 * same number of units. piece.unit is seconds per unit; piece.level evens out loudness between pieces.
 *
 *   MUSIC.setEnabled(bool)   on/off (default on). Nothing plays until the first touch or key.
 *   MUSIC.screen(name)       'puzzle' -> quiet pieces, anything else -> town pieces
 *   MUSIC.solved()           a page finished: let the quiet piece end at its next phrase, festive next
 *   MUSIC.render(id, sr)     Promise<AudioBuffer> of one whole piece, rendered offline (for auditioning)
 *   MUSIC.debug()            state for tests
 */
(function (root, factory) {
  var M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.MUSIC = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ================================================================ the score
  var PIECES = [
    {
      id: 'estampie', title: 'Estampie of the Eel Rents', form: 'estampie', mode: 'D Dorian', moods: ['town'],
      unit: 0.2, accent: 3, level: 0.81,
      voices: { mel: { inst: 'chanter', legato: true }, drone: { inst: 'bagdrone', hold: 'D3' }, tab: { inst: 'tabor' } },
      sections: {
        P1: { mel: 'D4/2 F4/1 | A4/2 A4/1 | C5/2 A4/1 | G4/2 A4/1 | F4/2 G4/1 | A4/2 F4/1 | G4/1 F4/1 E4/1 | D4/2 E4/1' },
        P2: { mel: 'A4/2 C5/1 | D5/2 C5/1 | A4/2 C5/1 | D5/3 | C5/2 A4/1 | G4/2 F4/1 | G4/2 A4/1 | C5/2 A4/1', tab: 'x/2 o/1*' },
        P3: { mel: 'F4/1 G4/1 A4/1 | F4/1 G4/1 A4/1 | G4/2 E4/1 | C4/2 D4/1 | F4/1 G4/1 A4/1 | C5/2 A4/1 | G4/2 F4/1 | E4/2 D4/1', tab: 'x/2 o/1*' },
        P4: { mel: 'D4/2 C4/1 | D4/2 E4/1 | F4/2 E4/1 | D4/3 | A4/2 G4/1 | F4/2 E4/1 | F4/2 G4/1 | A4/3', tab: 'x/3 o/2 o/1*' },
        P5: { mel: 'D5/2 C5/1 | A4/2 C5/1 | D5/2 C5/1 | A4/2 G4/1 | A4/2 C5/1 | D5/2 A4/1 | G4/1 A4/1 G4/1 | F4/2 G4/1', tab: 'x/2 o/1 x/1 o/1 o/1*' },
        O: { mel: 'F4/2 G4/1 | A4/2 G4/1 | F4/1 E4/1 F4/1 | E4/3', tab: 'x/2 o/1*' },     // ouvert: open, on E
        C: { mel: 'F4/2 G4/1 | A4/2 G4/1 | F4/1 E4/1 C4/1 | D4/3', tab: 'x/2 o/1*' },     // clos: shut, on D
        END: { mel: 'D4/6', tab: 'x/3 r/3' }
      },
      order: [{ s: 'P1' }, { s: 'O', mute: ['tab'] }, { s: 'P1' }, { s: 'C', mute: ['tab'] },
        'P2', 'O', 'P2', 'C', 'P3', 'O', 'P3', 'C', 'P4', 'O', 'P4', 'C', 'P5', 'O', 'P5', 'C', 'END']
    },
    {
      id: 'carol', title: "Hob's Weir", form: 'carol', mode: 'F Lydian with B-flat', moods: ['town'], festive: true,
      unit: 0.24, accent: 3, level: 0.55,
      voices: {
        pipe: { inst: 'pipe', oct: 12 }, tab: { inst: 'tabor', gain: 0.8 },
        dr1: { inst: 'symphony' }, dr2: { inst: 'symphony', gain: 0.7 },
        git: { inst: 'gittern' }, glo: { inst: 'gittern', gain: 0.8 }, gmid: { inst: 'gittern', gain: 0.6 }
      },
      sections: {
        B: {   // the burden
          pipe: 'F4/2 G4/1 | A4/2 F4/1 | C5/2 Bb4/1 | A4/3 | G4/2 A4/1 | Bb4/2 A4/1 | G4/2 F4/1 | G4/3 | ' +
                'A4/2 C5/1 | C5/2 A4/1 | Bb4/2 A4/1 | G4/2 F4/1 | G4/2 A4/1 | G4/2 E4/1 | F4/3 | F4/3',
          tab: 'x/2 o/1*', dr1: 'F3/48', dr2: 'C4/48'
        },
        V: {   // the verse, gittern alone; sixth to octave and B to C at the close (double leading tone)
          git: 'A4/2 G4/1 | F4/2 G4/1 | A4/2 Bb4/1 | A4/3 | G4/2 F4/1 | E4/2 D4/1 | C4/2 D4/1 | E4/3 | F4/2 G4/1 | A4/2 F4/1 | G4/2 E4/1 | F4/3',
          glo: 'F3/6 | F3/6 | C3/6 | F3/6 | F3/6 | C3/2 G3/1 | F3/3',
          gmid: 'r/32 B3/1 C4/3'
        }
      },
      order: ['B', 'V', 'B', 'V', 'B', 'V', 'B']
    },
    {
      id: 'rondeau', title: "The Abbot's Pears", form: 'rondeau (A B a A a b A B)', mode: 'G Mixolydian', moods: ['quiet'],
      unit: 0.36, accent: 3, level: 1.35,
      voices: { hi: { inst: 'psaltery' }, lo: { inst: 'psaltery', gain: 0.75 }, mid: { inst: 'psaltery', gain: 0.55 } },
      sections: {
        A: { hi: 'G4/2 A4/1 | B4/2 C5/1 | D5/3 | B4/2 A4/1 | C5/2 B4/1 | A4/2 G4/1 | A4/3 | A4/3',
             lo: 'G3/6 | G3/6 | A3/3 C4/3 | D4/6' },
        B: { hi: 'D5/2 E5/1 | D5/2 C5/1 | B4/2 A4/1 | B4/3 | C5/2 B4/1 | A4/2 G4/1 | A4/2 F#4/1 | G4/3',
             lo: 'G3/6 | E3/6 | F3/3 | D3/3 | A3/3 | G3/3',
             mid: 'r/20 C#4/1 D4/3' },
        a: { hi: 'G4/2 A4/1 | B4/2 C5/1 | D5/3 | B4/2 A4/1 | C5/2 B4/1 | A4/2 G4/1 | A4/3 | A4/3' },
        b: { hi: 'D5/2 E5/1 | D5/2 C5/1 | B4/2 A4/1 | B4/3 | C5/2 B4/1 | A4/2 G4/1 | A4/2 F#4/1 | G4/3' }
      },
      order: ['A', 'B', 'a', 'A', 'a', 'b', 'A', 'B']
    },
    {
      id: 'lai', title: "Wystan's Lamp", form: 'lai (paired versicles)', mode: 'D Dorian', moods: ['quiet'],
      unit: 0.42, accent: 3, level: 0.72,
      voices: { mel: { inst: 'harp' }, lo: { inst: 'harp', gain: 0.8 }, hi: { inst: 'harp', gain: 0.5 }, mid: { inst: 'harp', gain: 0.45 } },
      sections: {
        A1: { mel: 'D4/3 | A4/2 G4/1 | F4/2 E4/1 | D4/3 | F4/2 G4/1 | A4/3 | G4/2 F4/1 | E4/6 | r/3',
              lo: 'D3/6 | D3/6 | D3/6 | r/3 | A2/6 | r/3' },
        A2: { mel: 'D4/3 | A4/2 G4/1 | F4/2 E4/1 | D4/3 | F4/2 G4/1 | A4/3 | F4/2 E4/1 | D4/6 | r/3',
              lo: 'D3/6 | D3/6 | D3/6 | r/3 | D3/6 | r/3', hi: 'r/20 C#5/1 D5/6 r/3' },
        B1: { mel: 'A4/2 C5/1 | D5/3 | C5/2 A4/1 | G4/3 | A4/2 C5/1 | D5/2 E5/1 | D5/2 C5/1 | A4/6 | r/3',
              lo: 'A2/6 | r/3 | C3/3 | D3/6 | r/3 | A2/6 | r/3' },
        B2: { mel: 'A4/2 C5/1 | D5/3 | C5/2 A4/1 | G4/3 | F4/2 G4/1 | A4/2 G4/1 | F4/2 E4/1 | D4/6 | r/3',
              lo: 'A2/6 | r/3 | C3/3 | F3/3 | D3/3 | r/3 | D3/6 | r/3', hi: 'r/20 C#5/1 D5/6 r/3' },
        C1: { mel: 'F4/2 G4/1 | A4/2 Bb4/1 | A4/3 | G4/2 F4/1 | E4/2 F4/1 | G4/3 | F4/2 D4/1 | E4/6 | r/3',
              lo: 'F3/6 | D3/3 | C3/3 | A2/3 | C3/3 | D3/3 | A2/6 | r/3' },
        C2: { mel: 'F4/2 G4/1 | A4/2 Bb4/1 | A4/3 | G4/2 F4/1 | E4/2 F4/1 | G4/3 | E4/2 C#4/1 | D4/6 | r/3',
              lo: 'F3/6 | D3/3 | C3/3 | A2/3 | C3/3 | E3/3 | D3/6 | r/3', mid: 'r/20 G#3/1 A3/6 r/3' }
      },
      order: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'A2']
    },
    {
      id: 'lode', title: 'Mist on the Lode', form: 'free melody over a drone', mode: 'G Dorian (B-flat)', moods: ['quiet'],
      unit: 0.5, accent: 4, level: 0.27,
      voices: { rec: { inst: 'recorder' }, d1: { inst: 'symphony', hold: 'G2', gain: 0.45 }, d2: { inst: 'symphony', hold: 'D3', gain: 0.3 } },
      sections: {
        IN: { rec: 'r/6' },
        P1: { rec: 'D5/4 C5/2 | Bb4/2 A4/2 G4/4 | r/2 | A4/2 Bb4/2 C5/4 | Bb4/2 A4/6 | r/4' },
        P2: { rec: 'G4/2 A4/2 Bb4/2 D5/4 | C5/2 Bb4/2 C5/4 | D5/8 | r/4' },
        P3: { rec: 'F5/3 E5/1 D5/4 | C5/2 D5/2 Bb4/2 A4/4 | r/2 | G4/2 A4/2 Bb4/2 A4/2 | G4/8 | r/4' },
        P4: { rec: 'D4/4 F4/2 G4/2 | A4/4 G4/4 | r/2 | Bb4/2 A4/2 G4/2 F4/2 | G4/10 | r/4' },
        OUT: { rec: 'r/6' }
      },
      order: ['IN', 'P1', 'P2', 'P3', 'P1', 'P4', 'OUT']
    },
    {
      id: 'compline', title: 'Compline at St Alnoth', form: 'chant-like solo, then organum at the fifth below', mode: 'D Hypodorian', moods: ['town'],
      unit: 0.45, accent: 1000, level: 0.84,
      voices: { org: { inst: 'organ' }, orgL: { inst: 'organ', gain: 0.8 }, bell: { inst: 'bell' } },
      sections: {
        TOLL: { bell: 'D4/7 D4/7 D4/7 D4/9' },
        S1: { org: 'A3/1 C4/1 D4/2 | F4/1 F4/1 F4/1 F4/1 G4/1 F4/1 E4/2 F4/3 | r/2 | ' +
                   'F4/1 G4/1 A4/2 G4/1 F4/1 G4/1 F4/1 E4/1 D4/1 E4/2 | C4/1 D4/1 D4/4 | r/3 | ' +
                   'D4/1 F4/1 G4/1 A4/2 G4/1 A4/1 A4/3 | F4/1 G4/1 F4/1 E4/1 D4/1 C4/2 D4/1 E4/1 F4/3 | r/2 | ' +
                   'F4/1 E4/1 D4/1 C4/1 A3/2 C4/1 D4/1 E4/2 | G4/1 F4/1 E4/1 D4/1 C4/1 D4/1 E4/2 D4/6 | r/3' },
        MID: { bell: 'A4/4 D4/8' },
        S2: { org: 'A3/1 C4/1 D4/2 | F4/1 F4/1 F4/1 F4/1 G4/1 F4/1 E4/2 F4/3 | r/2 | ' +
                   'F4/1 G4/1 A4/2 G4/1 F4/1 G4/1 F4/1 E4/1 D4/1 E4/2 | C4/1 D4/1 D4/4 | r/3 | ' +
                   'D4/1 F4/1 G4/1 A4/2 G4/1 A4/1 A4/3 | F4/1 G4/1 F4/1 E4/1 D4/1 C4/2 D4/1 E4/1 F4/3 | r/2 | ' +
                   'F4/1 E4/1 D4/1 C4/1 A3/2 C4/1 D4/1 E4/2 | G4/1 F4/1 E4/1 D4/1 C4/1 D4/1 E4/2 D4/6 | r/3',
              // the organal voice: a fifth below, closing to the octave at the ends of lines
              orgL: 'D3/1 F3/1 G3/2 | Bb3/1 Bb3/1 Bb3/1 Bb3/1 C4/1 Bb3/1 A3/2 F3/3 | r/2 | ' +
                    'Bb3/1 C4/1 D4/2 C4/1 Bb3/1 C4/1 Bb3/1 A3/1 G3/1 A3/2 | F3/1 G3/1 D3/4 | r/3 | ' +
                    'G3/1 Bb3/1 C4/1 D4/2 C4/1 D4/1 D4/3 | Bb3/1 C4/1 Bb3/1 A3/1 G3/1 F3/2 G3/1 A3/1 F3/3 | r/2 | ' +
                    'Bb3/1 A3/1 G3/1 F3/1 D3/2 F3/1 G3/1 A3/2 | C4/1 Bb3/1 A3/1 G3/1 F3/1 G3/1 A3/2 D3/6 | r/3' },
        END: { bell: 'D4/7 D4/7 D4/14' }
      },
      order: ['TOLL', 'S1', 'MID', 'S2', 'END']
    }
  ];

  // ================================================================ notation
  var STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(name) {
    var m = /^([A-G])(#|b)?(\d)$/.exec(name);
    if (!m) return null;
    return 12 * (+m[3] + 1) + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  // Pythagorean intonation from C (pure fifths); A4 lands at 440
  var PYTH = [1, 2187 / 2048, 9 / 8, 32 / 27, 81 / 64, 4 / 3, 729 / 512, 3 / 2, 6561 / 4096, 27 / 16, 16 / 9, 243 / 128];
  var C4 = 440 / (27 / 16);
  function hz(m) { var pc = ((m % 12) + 12) % 12, oct = Math.floor(m / 12) - 5; return C4 * PYTH[pc] * Math.pow(2, oct); }

  function parse(line) {
    var loop = /\*\s*$/.test(line), out = [];
    line.replace(/\*\s*$/, '').split(/\s+/).forEach(function (tok) {
      if (!tok || tok === '|') return;
      var p = tok.split('/'), d = +p[1], n = p[0];
      if (!(d > 0)) throw new Error('bad duration: ' + tok);
      if (n === 'r') out.push({ r: true, d: d });
      else if (n === 'x' || n === 'o') out.push({ hit: n, d: d });
      else { var m = midi(n); if (m == null) throw new Error('bad pitch: ' + tok); out.push({ m: m, n: n, d: d }); }
    });
    out.loop = loop;
    return out;
  }
  function units(notes) { return notes.reduce(function (s, x) { return s + x.d; }, 0); }

  // the whole piece as timed events (seconds from the piece's start), plus section boundaries
  var flatCache = {};
  function flatten(P) {
    if (flatCache[P.id]) return flatCache[P.id];
    var u = P.unit, t = 0, ev = [], bounds = [0], acc = P.accent || 3, vorder = Object.keys(P.voices);
    P.order.forEach(function (item, si) {
      var name = typeof item === 'string' ? item : item.s, mute = item.mute || [], sec = P.sections[name];
      if (!sec) throw new Error(P.id + ': no section ' + name);
      var L = 0, lines = {};
      Object.keys(sec).forEach(function (v) {
        if (!P.voices[v]) throw new Error(P.id + '/' + name + ': no voice ' + v);
        lines[v] = parse(sec[v]);
        if (!lines[v].loop) {
          var n = units(lines[v]);
          if (L && Math.abs(n - L) > 1e-9) throw new Error(P.id + '/' + name + ': voice ' + v + ' has ' + n + ' units, others ' + L);
          L = Math.max(L, n);
        }
      });
      Object.keys(lines).forEach(function (v) {
        if (mute.indexOf(v) >= 0) return;
        var notes = lines[v], pos = 0, i = 0;
        while (pos < L - 1e-9 && (notes.loop || i < notes.length)) {
          var n = notes[i % notes.length], d = Math.min(n.d, L - pos);
          if (!n.r) ev.push({ t: (t + pos) * u, v: v, m: n.m, hit: n.hit, d: d * u, vel: Math.abs(pos % acc) < 1e-9 ? 1 : 0.8, sec: si });
          pos += n.d; i++;
        }
      });
      t += L; bounds.push(t * u);
    });
    vorder.forEach(function (v) {
      var V = P.voices[v];
      if (V.hold) ev.push({ t: 0, v: v, m: midi(V.hold), d: t * u, vel: 1, sec: 0, hold: true });
    });
    ev.sort(function (a, b) { return a.t - b.t || vorder.indexOf(a.v) - vorder.indexOf(b.v); });
    vorder.forEach(function (v) {
      if (!P.voices[v].legato) return;
      var mine = ev.filter(function (e) { return e.v === v; });
      mine.forEach(function (e, i) { e.same = i > 0 && mine[i - 1].m === e.m; e.last = i === mine.length - 1; });
    });
    return (flatCache[P.id] = { ev: ev, end: t * u, bounds: bounds });
  }

  var byId = {};
  PIECES.forEach(function (P) { byId[P.id] = P; });
  var API = { PIECES: PIECES, parse: parse, flatten: flatten, midi: midi, hz: hz };
  if (typeof window === 'undefined') return API;      // node: the score alone, for tests and printing

  // ================================================================ synthesis
  var KS_SR = 22050, CAP = 10;
  var dataCache = {};

  // Karplus-Strong string with a fractional delay; rendered once per instrument and pitch
  function ksData(spec, m) {
    var key = spec.name + m;
    if (dataCache[key]) return dataCache[key];
    var sr = KS_SR, f0 = hz(m), len = Math.floor(spec.len * sr), out = new Float32Array(len);
    for (var k = 0; k < spec.strings; k++) {
      var f = f0 * (1 + (k ? spec.detune : 0));
      var s = spec.s, D = sr / f, L = D - (1 - s), n0 = Math.floor(L), fr = L - n0;
      var w = 2 * Math.PI * f / sr;
      var H = Math.sqrt(s * s + (1 - s) * (1 - s) + 2 * s * (1 - s) * Math.cos(w));
      var Hi = Math.sqrt((1 - fr) * (1 - fr) + fr * fr + 2 * fr * (1 - fr) * Math.cos(w));
      var T60 = Math.max(0.3, Math.min(spec.len, spec.t60 * Math.pow(220 / f, 0.4)));
      var d = Math.min(0.99995, Math.pow(10, -3 * D / (T60 * sr)) / (H * Hi));
      var y = new Float32Array(len), P = n0 + 2, lp = 0, mean = 0, ex = new Float32Array(P), M = Math.max(1, Math.round(spec.pos * D)), i;
      for (i = 0; i < P; i++) { lp += ((Math.random() * 2 - 1) - lp) * spec.bright; ex[i] = lp; mean += lp; }
      mean /= P;
      for (i = 0; i < P; i++) y[i] = (ex[i] - mean) - (i >= M ? ex[i - M] - mean : 0) * 0.85;
      for (i = P; i < len; i++) {
        var a = i - n0, r = (1 - fr) * y[a] + fr * y[a - 1], rp = (1 - fr) * y[a - 1] + fr * y[a - 2];
        y[i] = d * (s * r + (1 - s) * rp);
      }
      for (i = 0; i < len; i++) out[i] += y[i] * (k ? 0.8 : 1);
    }
    // DC block, a fade at the end, normalise
    var x1 = 0, y1 = 0, pk = 0, j, fade = Math.floor(0.08 * sr);
    for (j = 0; j < len; j++) { var yy = out[j] - x1 + 0.995 * y1; x1 = out[j]; y1 = yy; out[j] = yy; if (Math.abs(yy) > pk) pk = Math.abs(yy); }
    for (j = 0; j < len; j++) { out[j] = out[j] / (pk || 1) * (j > len - fade ? (len - j) / fade : 1); }
    return (dataCache[key] = out);
  }
  // a church bell: hum, prime, tierce, quint, nominal and upper partials, with a beating hum
  function bellData(m) {
    var key = 'bell' + m;
    if (dataCache[key]) return dataCache[key];
    var sr = KS_SR, f = hz(m), len = Math.floor(6 * sr), out = new Float32Array(len), pk = 0, i;
    var parts = [[0.5, 0.5, 6], [0.5025, 0.25, 6], [1, 0.45, 3.8], [1.2, 0.42, 3.2], [1.5, 0.2, 2.2], [2, 0.5, 2.6], [2.52, 0.14, 1.4], [3.01, 0.1, 1.0], [4.07, 0.05, 0.6]];
    parts.forEach(function (p) {
      var w = 2 * Math.PI * f * p[0] / sr, k = Math.pow(10, -3 / (p[2] * sr)), a = p[1], ph = Math.random() * 6.28;
      if (f * p[0] > sr / 2.2) return;
      for (var n = 0; n < len; n++) { out[n] += a * Math.sin(w * n + ph); a *= k; }
    });
    var lp = 0;
    for (i = 0; i < Math.floor(0.03 * sr); i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.3; out[i] += lp * 0.5 * (1 - i / (0.03 * sr)); }
    for (i = 0; i < Math.floor(0.004 * sr); i++) out[i] *= i / (0.004 * sr);
    for (i = 0; i < len; i++) if (Math.abs(out[i]) > pk) pk = Math.abs(out[i]);
    for (i = 0; i < len; i++) out[i] /= pk;
    return (dataCache[key] = out);
  }

  var STRINGS = {
    harp: { name: 'harp', t60: 3.0, len: 3.6, bright: 0.32, pos: 0.27, s: 0.5, strings: 1, detune: 0, gain: 0.5 },
    psaltery: { name: 'psaltery', t60: 3.2, len: 3.8, bright: 0.7, pos: 0.13, s: 0.6, strings: 2, detune: 0.0016, gain: 0.36 },
    gittern: { name: 'gittern', t60: 0.9, len: 1.5, bright: 0.9, pos: 0.1, s: 0.55, strings: 2, detune: 0.0011, gain: 0.42 }
  };
  // amplitudes of harmonics 1..n
  var WAVES = {
    recorder: [1, 0.12, 0.045, 0.015],
    pipe: [1, 0.28, 0.16, 0.06, 0.03],
    organ: [1, 0.5, 0.3, 0.17, 0.1, 0.06, 0.04, 0.025],
    reed: [1, 0.75, 0.6, 0.48, 0.36, 0.3, 0.22, 0.16, 0.12, 0.08, 0.05],
    saw: [1, 0.5, 0.33, 0.25, 0.2, 0.167, 0.143, 0.125, 0.111, 0.1, 0.09, 0.083]
  };
  var WINDS = {
    recorder: { wave: 'recorder', att: 0.045, rel: 0.08, vib: 0.0035, vibRate: 4.8, nf: 2.2, nq: 2.5, chiff: 0.32, breath: 0.045, gain: 0.3, legatoGap: 0.02 },
    pipe: { wave: 'pipe', att: 0.02, rel: 0.05, vib: 0.002, vibRate: 5.5, nf: 2, nq: 2, chiff: 0.45, breath: 0.06, gain: 0.17, legatoGap: 0.035 },
    organ: { wave: 'organ', att: 0.06, rel: 0.15, vib: 0, nf: 3, nq: 3, chiff: 0.22, breath: 0.01, gain: 0.15, legatoGap: 0.05 }
  };

  function Engine(ac, dest) {
    var E = this;
    E.ac = ac; E.dest = dest; E.live = []; E.plucks = []; E.owner = null; E.waves = {}; E.bufs = {};
    var sr = ac.sampleRate, n, d, i;
    E.noise = ac.createBuffer(1, sr, sr);
    d = E.noise.getChannelData(0);
    for (i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // a stone room: a short, darkening tail of noise, mono to keep the convolver cheap
    n = Math.floor(sr * 1.7);
    var ir = ac.createBuffer(1, n, sr), id = ir.getChannelData(0), lp = 0, pre = Math.floor(0.014 * sr);
    for (i = pre; i < n; i++) { var x = (i - pre) / sr; lp += ((Math.random() * 2 - 1) - lp) * (0.5 - 0.3 * x / 1.7); id[i] = lp * Math.exp(-x * 6.9 / 1.45); }
    E.out = ac.createGain(); E.out.gain.value = 0.62;
    E.bus = ac.createGain();
    var dry = ac.createGain(); dry.gain.value = 0.82;
    var conv = ac.createConvolver(); conv.buffer = ir;
    var wet = ac.createGain(); wet.gain.value = 0.34;
    E.bus.connect(dry); dry.connect(E.out);
    E.bus.connect(conv); conv.connect(wet); wet.connect(E.out);
    E.out.connect(dest); E.connected = true;
  }
  Engine.prototype.wave = function (name) {
    if (this.waves[name]) return this.waves[name];
    var h = WAVES[name], re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1);
    for (var i = 0; i < h.length; i++) im[i + 1] = h[i];
    return (this.waves[name] = this.ac.createPeriodicWave(re, im));
  };
  Engine.prototype.buf = function (key, data) {
    if (this.bufs[key]) return this.bufs[key];
    var b = this.ac.createBuffer(1, data.length, KS_SR);
    b.getChannelData(0).set(data);
    return (this.bufs[key] = b);
  };
  // every source is tracked until it ends; its chain is disconnected then
  Engine.prototype.track = function (src, nodes) {
    var E = this, rec = { src: src };
    E.live.push(rec);
    if (E.owner) E.owner.push(rec);
    src.onended = function () {
      nodes.forEach(function (nd) { try { nd.disconnect(); } catch (e) { /* gone */ } });
      var k = E.live.indexOf(rec); if (k >= 0) E.live.splice(k, 1);
    };
  };
  function env(p, t, d, att, rel, peak) {
    var hold = Math.max(att, d);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + att);
    p.setValueAtTime(peak, t + hold);
    p.linearRampToValueAtTime(0, t + hold + rel);
    return t + hold + rel;
  }

  var INST = {};
  Object.keys(STRINGS).forEach(function (name) {
    INST[name] = function (E, t, m, d, g, out) {
      var spec = STRINGS[name], ac = E.ac, b = E.buf(name + m, ksData(spec, m));
      t += (Math.random() - 0.5) * 0.012;
      // polyphony cap: let go of the oldest string still sounding
      E.plucks = E.plucks.filter(function (p) { return p.end > t; });
      if (E.plucks.length >= CAP) {
        var old = E.plucks.shift();
        try { old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0, t + 0.06); old.src.stop(t + 0.08); } catch (e) { /* ended */ }
      }
      var src = ac.createBufferSource(); src.buffer = b;
      var a = ac.createGain(); a.gain.value = spec.gain * g;
      src.connect(a); a.connect(out); src.start(t);
      E.plucks.push({ src: src, g: a, end: t + b.duration });
      E.track(src, [src, a]);
    };
  });
  Object.keys(WINDS).forEach(function (name) {
    INST[name] = function (E, t, m, d, g, out) {
      var W = WINDS[name], ac = E.ac, f = hz(m), dd = Math.max(0.05, d - W.legatoGap);
      var o = ac.createOscillator(); o.setPeriodicWave(E.wave(W.wave)); o.frequency.value = f;
      var a = ac.createGain();
      var end = env(a.gain, t, dd, W.att, W.rel, W.gain * g);
      o.connect(a); a.connect(out);
      var nodes = [o, a];
      if (W.vib && dd > 0.7) {      // vibrato that arrives late, as a player's does
        var lfo = ac.createOscillator(); lfo.frequency.value = W.vibRate;
        var lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.35); lg.gain.linearRampToValueAtTime(f * W.vib, t + 0.9);
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(end + 0.02);
        nodes.push(lfo, lg);
      }
      // breath: a chiff at the start, then a whisper under the note
      var ns = ac.createBufferSource(); ns.buffer = E.noise; ns.loop = true;
      var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(5000, f * W.nf); bp.Q.value = W.nq;
      var ng = ac.createGain(), pk = W.gain * g;
      ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(pk * W.chiff, t + 0.012);
      ng.gain.linearRampToValueAtTime(pk * W.breath, t + 0.08); ng.gain.setValueAtTime(pk * W.breath, t + Math.max(0.08, dd));
      ng.gain.linearRampToValueAtTime(0, end);
      ns.connect(bp); bp.connect(ng); ng.connect(out);
      ns.start(t, Math.random() * 0.8); ns.stop(end + 0.02); o.start(t); o.stop(end + 0.02);
      nodes.push(ns, bp, ng);
      E.track(o, nodes);
    };
  });
  // bagpipe chanter: one reed for the whole piece; notes change its pitch, repeated notes get a gracenote cut
  INST.chanter = {
    legato: true,
    open: function (E, t, m, g, out) {
      var ac = E.ac, f = hz(m), peak = 0.085;
      var o = ac.createOscillator(); o.setPeriodicWave(E.wave('reed'));
      o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.35);
      var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.6;
      var pkf = ac.createBiquadFilter(); pkf.type = 'peaking'; pkf.frequency.value = 1150; pkf.Q.value = 1.2; pkf.gain.value = 5;
      var a = ac.createGain(); a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(peak, t + 0.3);
      o.connect(lp); lp.connect(pkf); pkf.connect(a); a.connect(out); o.start(t);
      E.track(o, [o, lp, pkf, a]);
      var grace = hz(m >= 72 ? 67 : 74);
      return {
        set: function (t2, m2, same) {
          if (same) o.frequency.setValueAtTime(grace, t2 - 0.035);
          o.frequency.setValueAtTime(hz(m2), t2);
        },
        close: function (t2) {
          a.gain.setValueAtTime(peak, t2); a.gain.linearRampToValueAtTime(0, t2 + 0.3);
          o.stop(t2 + 0.35);
        }
      };
    }
  };
  INST.bagdrone = function (E, t, m, d, g, out) {
    var ac = E.ac, f = hz(m);
    var o = ac.createOscillator(); o.setPeriodicWave(E.wave('saw'));
    o.frequency.setValueAtTime(f * 0.93, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.6);
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = 0.7;
    var a = ac.createGain(), end = env(a.gain, t, d, 0.5, 0.35, 0.07 * g);
    o.connect(lp); lp.connect(a); a.connect(out); o.start(t); o.stop(end + 0.05);
    E.track(o, [o, lp, a]);
  };
  // symphony (hurdy-gurdy) drone string: a bowed saw, a wooden body hump, and the wheel's slight grain
  INST.symphony = function (E, t, m, d, g, out) {
    var ac = E.ac, f = hz(m), peak = 0.055 * g;
    var o = ac.createOscillator(); o.setPeriodicWave(E.wave('saw')); o.frequency.value = f;
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.5;
    var pkf = ac.createBiquadFilter(); pkf.type = 'peaking'; pkf.frequency.value = 650; pkf.Q.value = 1.1; pkf.gain.value = 6;
    var a = ac.createGain(), end = env(a.gain, t, d, 0.5, 0.7, peak);
    var lfo = ac.createOscillator(); lfo.frequency.value = 5.1 + Math.random() * 0.6;
    var lg = ac.createGain(); lg.gain.value = peak * 0.12;
    lfo.connect(lg); lg.connect(a.gain);
    o.connect(lp); lp.connect(pkf); pkf.connect(a); a.connect(out);
    o.start(t); lfo.start(t); o.stop(end + 0.05); lfo.stop(end + 0.05);
    E.track(o, [o, lp, pkf, a, lfo, lg]);
  };
  // tabor: a snared skin (filtered noise) over a low thump
  INST.tabor = function (E, t, m, d, g, out, ev) {
    var ac = E.ac, strong = ev.hit === 'x', v = g * (strong ? 1 : 0.5), dec = strong ? 0.11 : 0.07;
    var ns = ac.createBufferSource(); ns.buffer = E.noise;
    var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    var ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.002); ng.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    ns.connect(bp); bp.connect(ng); ng.connect(out); ns.start(t, Math.random() * 0.5); ns.stop(t + dec + 0.02);
    var o = ac.createOscillator(); o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(92, t + 0.1);
    var tg = ac.createGain();
    tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.004); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    o.connect(tg); tg.connect(out); o.start(t); o.stop(t + 0.2);
    E.track(ns, [ns, bp, ng]); E.track(o, [o, tg]);
  };
  INST.bell = function (E, t, m, d, g, out) {
    var ac = E.ac, b = E.buf('bell' + m, bellData(m));
    var src = ac.createBufferSource(); src.buffer = b;
    var a = ac.createGain(); a.gain.value = 0.3 * g;
    src.connect(a); a.connect(out); src.start(t);
    E.track(src, [src, a]);
  };

  // one event of a piece, at absolute time t0 + ev.t
  function play(E, P, ev, t0, out, legato) {
    var V = P.voices[ev.v], I = INST[V.inst], t = t0 + ev.t, g = (V.gain || 1) * ev.vel;
    var m = ev.m != null ? ev.m + (V.oct || 0) : null;
    if (I.legato) {
      var h = legato[ev.v];
      if (!h) h = legato[ev.v] = I.open(E, t, m, g, out);
      else h.set(t, m, ev.same);
      if (ev.last) h.close(t + ev.d);
    } else I(E, t, m, ev.d, g, out, ev);
  }

  // ================================================================ the player
  var LOOK = 0.6, TICK = 150, TAIL = 4.5;
  var E = null, on = true, mood = 'town', gestured = false, timer = 0, cur = null, nextAt = 0, festive = false, lastId = {}, held = false;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function gap(md) { return md === 'quiet' ? rnd(35, 65) : rnd(18, 32); }
  function engine() {
    if (E) return E;
    var ac = window.AUDIO && AUDIO.ctx && AUDIO.ctx();
    if (!ac) return null;
    E = new Engine(ac, ac.destination);
    return E;
  }
  function choose() {
    if (mood === 'town' && festive) { festive = false; return byId.carol; }
    var c = PIECES.filter(function (P) { return P.moods.indexOf(mood) >= 0 && P.id !== lastId[mood]; });
    if (!c.length) c = PIECES.filter(function (P) { return P.moods.indexOf(mood) >= 0; });
    return c[Math.floor(Math.random() * c.length)];
  }
  function begin(P, at) {
    var g = E.ac.createGain(); g.gain.value = P.level || 1; g.connect(E.bus);
    lastId[mood] = P.id;
    cur = { P: P, F: flatten(P), t0: at, i: 0, g: g, src: [], legato: {}, cut: Infinity };
    cur.endAt = at + cur.F.end;
  }
  function pump(now) {
    var F = cur.F, h = now + LOOK;
    E.owner = cur.src;
    while (cur.i < F.ev.length && cur.t0 + F.ev[cur.i].t < h) {
      var ev = F.ev[cur.i++];
      if (ev.t >= cur.cut) { cur.i = F.ev.length; break; }
      try { play(E, cur.P, ev, cur.t0, cur.g, cur.legato); } catch (e) { /* skip a bad note */ }
    }
    E.owner = null;
  }
  function stopSources(list, t) { list.forEach(function (r) { try { r.src.stop(t); } catch (e) { /* ended */ } }); }
  function finish() {
    var c = cur; cur = null;
    stopSources(c.src, E.ac.currentTime + 0.05);
    setTimeout(function () { try { c.g.disconnect(); } catch (e) { /* gone */ } }, 300);
  }
  // fade the current piece out between at and at + dur, scheduling nothing after it
  function fade(at, dur) {
    var p = cur.g.gain, now = E.ac.currentTime;
    p.cancelScheduledValues(now); p.setValueAtTime(p.value, now);
    p.setValueAtTime(p.value, Math.max(now, at)); p.linearRampToValueAtTime(0, Math.max(now, at) + dur);
    cur.cut = Math.min(cur.cut, Math.max(now, at) + dur - cur.t0);
    cur.endAt = Math.max(now, at) + dur - TAIL + 0.3;   // finish() runs soon after the fade
    stopSources(cur.src.slice(), Math.max(now, at) + dur + 0.05);
  }
  // end at the next section boundary if one is near, else fade now; never a cut mid-note
  function softEnd() {
    if (!cur || cur.ending) return;
    cur.ending = true;
    var now = E.ac.currentTime, rel = now + LOOK - cur.t0, b = null;
    for (var i = 0; i < cur.F.bounds.length; i++) if (cur.F.bounds[i] >= rel) { b = cur.F.bounds[i]; break; }
    if (b != null && b >= cur.F.end - 1e-6 && b - rel < 12) { /* the piece ends soon anyway */ }
    else if (b != null && b - rel < 7) { cur.cut = b; fade(cur.t0 + b - 0.6, 1.8); }
    else fade(now, 3);
    nextAt = cur.endAt + TAIL + rnd(5, 9);
  }
  function tick() {
    timer = 0;
    if (!on || !gestured || held) return;
    if (!engine()) return;
    if (E.ac.state !== 'running') { timer = setTimeout(tick, 300); return; }
    var now = E.ac.currentTime;
    if (!nextAt && !cur) nextAt = now + 1.5;
    if (cur) {
      pump(now);
      if (now > cur.endAt + TAIL) { var soft = cur.ending; finish(); nextAt = now + (soft ? rnd(3, 6) : gap(mood)); }
    } else if (now >= nextAt - LOOK) {
      begin(choose(), Math.max(now + 0.1, nextAt));
      pump(now);
    }
    timer = setTimeout(tick, TICK);
  }
  function kick() { if (!timer && on && gestured && !held) timer = setTimeout(tick, 20); }

  function gesture() {
    if (gestured) return;
    gestured = true;
    ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { window.removeEventListener(ev, gesture, true); });
    if (on && window.AUDIO) { AUDIO.unlock(); kick(); }
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { window.addEventListener(ev, gesture, { passive: true, capture: true }); });

  // a hidden tab stops the clock: the context is suspended, so nothing drifts or stalls
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      held = true;
      if (timer) { clearTimeout(timer); timer = 0; }
      if (E && E.ac.state === 'running') { E.suspended = true; E.ac.suspend(); }
    } else {
      held = false;
      if (E && E.suspended) { E.suspended = false; E.ac.resume(); }
      kick();
    }
  });

  API.setEnabled = function (b) {
    b = !!b;
    if (b === on) return;
    on = b;
    if (!E) { if (on) kick(); return; }
    if (!on) {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (cur) { fade(E.ac.currentTime, 0.35); var c = cur; cur = null; setTimeout(function () { try { c.g.disconnect(); } catch (e) { /* gone */ } }, 600); }
      nextAt = 0;
      setTimeout(function () { if (!on && E.connected) { E.out.disconnect(); E.connected = false; } }, 500);
    } else {
      if (!E.connected) { E.out.connect(E.dest); E.connected = true; }
      if (gestured && window.AUDIO) AUDIO.unlock();
      nextAt = 0; kick();
    }
  };
  // settled a moment later, so a screen that redirects at once (puzzle -> chronicle) changes nothing
  var want = 'town', settle = 0;
  API.screen = function (name) {
    want = name === 'puzzle' ? 'quiet' : 'town';
    if (!settle) settle = setTimeout(function () {
      settle = 0;
      if (want === mood) return;
      mood = want;
      if (!E || !on) return;
      if (cur) { if (cur.P.moods.indexOf(mood) < 0) softEnd(); }
      else if (nextAt) nextAt = Math.min(nextAt, E.ac.currentTime + rnd(5, 9));
    }, 80);
  };
  API.solved = function () {
    festive = true;
    if (E && cur && cur.P.moods.indexOf('quiet') >= 0) softEnd();
  };
  API.play = function (id) {     // for testing: start a piece now
    if (!engine() || !byId[id]) return false;
    if (cur) finish();
    begin(byId[id], E.ac.currentTime + 0.1); gestured = true; kick();
    return true;
  };
  API.render = function (id, sr) {
    var P = byId[id], F = flatten(P);
    sr = sr || 44100;
    var oac = new OfflineAudioContext(1, Math.ceil((F.end + 5) * sr), sr);
    var e = new Engine(oac, oac.destination), g = oac.createGain(), lg = {};
    g.gain.value = P.level || 1;
    g.connect(e.bus);
    F.ev.forEach(function (ev) { play(e, P, ev, 0.25, g, lg); });
    return oac.startRendering();
  };
  API.debug = function () {
    var now = E ? E.ac.currentTime : 0;
    return { on: on, mood: mood, gestured: gestured, timer: !!timer, held: held, state: E ? E.ac.state : 'none', connected: E ? E.connected : false,
      playing: cur ? cur.P.id : null, at: cur ? +(now - cur.t0).toFixed(2) : null, cut: cur && cur.cut < Infinity ? +cur.cut.toFixed(2) : null,
      nextIn: !cur && nextAt ? +(nextAt - now).toFixed(1) : null, live: E ? E.live.length : 0, cached: Object.keys(dataCache).length };
  };
  return API;
});
