/* Vellum & Vermilion: background music in Web Audio, played on recorded instruments (audio/, see
 * MUSIC.md) with synthesized stand-ins while they load or if they fail. Seven short new pieces in the
 * manner of insular and monastic music before c.1200: harp, bowed psaltery, a wooden duct whistle and
 * hand chimes; chant, organum at the fourth, lais and a ring dance. Tuning is Pythagorean (pure fifths).
 *
 *   1. Iona Round              ring dance, A A B B harp-alone A, D Mixolydian. Whistle over harp fifths,
 *                              hand chimes at the turns. Warm: the cover and the book.
 *   2. Lai of the Scriptorium  lai, paired versicles A A' B B' A A'. G Dorian. Harp in two voices. Warm.
 *   3. Bells for Terce         chimes, a chant on bowed psaltery, chimes, the chant again in organum at
 *                              the fourth below (the organal voice held on C at its floor, as in Musica
 *                              enchiriadis), chimes. D Dorian. Warm.
 *   4. Planctus                lament, E Phrygian. Bowed psaltery over held psaltery drone notes. Quiet:
 *                              while a page is being solved.
 *   5. Vigil                   slow harp, A Aeolian, low and sparse. Quiet.
 *   6. Night Antiphon          whistle phrases each answered by the harp an octave below. D Dorian. Quiet.
 *   7. Explicit                the flourish after a page is solved: a harp roll and three chimes.
 *
 * Score notation: a line is space-separated tokens PITCH/UNITS (D4/2, Bb3/1, C#5/3), r/UNITS for a rest.
 * '|' is ignored (bar lines for the eye). A line ending in '*' repeats to fill its section. Every other
 * line in a section must add up to the same number of units. piece.unit is seconds per unit;
 * piece.level evens out loudness between pieces.
 *
 * Wiring (this file loads after main.js and wires itself, so no other file needs to know about it):
 * it follows SFX.enabled (the page's sound toggle), wraps SFX.solved() for the flourish, and reads
 * VV.save().screen: 'play' is the quiet mood, anything else (cover, book) the warm one.
 *
 *   MUSIC.setEnabled(bool)   on/off (default on). Nothing plays until the first touch or key.
 *   MUSIC.screen(name)       'play' -> quiet pieces, anything else -> warm pieces
 *   MUSIC.solved()           a page finished: fade the piece, play the flourish, then go on quietly
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
      id: 'iona', title: 'Iona Round', form: 'ring dance: A A B B, A on the harp alone, A', mode: 'D Mixolydian', moods: ['warm'],
      unit: 0.22, accent: 3, level: 0.7,
      voices: { wh: { inst: 'whistle' }, hm: { inst: 'harp', gain: 0.9 }, lo: { inst: 'harp', gain: 0.75 }, hi: { inst: 'harp', gain: 0.5 }, ch: { inst: 'chimes', gain: 0.7 } },
      sections: {
        A: { wh: 'D5/2 E5/1 | F#5/2 G5/1 | A5/2 F#5/1 | D5/3 | E5/2 F#5/1 | G5/2 E5/1 | C5/2 E5/1 | D5/3 | ' +
                 'D5/2 E5/1 | F#5/2 A5/1 | B5/2 A5/1 | F#5/3 | G5/2 E5/1 | C5/2 E5/1 | E5/1 D5/1 C5/1 | D5/3',
             lo: 'D3/3 | D3/3 | D3/3 | D3/3 | D3/3 | D3/3 | C4/3 | D3/3 | D3/3 | D3/3 | G3/3 | D3/3 | C4/3 | C4/3 | A3/3 | D3/3',
             hi: 'r/1 A3/2 | r/1 A3/2 | r/1 A3/2 | r/1 A3/2 | r/1 A3/2 | r/1 A3/2 | r/1 G4/2 | r/1 A3/2 | ' +
                 'r/1 A3/2 | r/1 A3/2 | r/1 D4/2 | r/1 A3/2 | r/1 G4/2 | r/1 G4/2 | r/1 E4/2 | r/1 A3/2' },
        B: { wh: 'A5/2 B5/1 | C6/2 B5/1 | A5/2 G5/1 | A5/3 | D6/2 C6/1 | B5/2 A5/1 | G5/2 A5/1 | B5/3 | ' +
                 'A5/2 B5/1 | C6/2 A5/1 | G5/2 E5/1 | F#5/3 | G5/2 E5/1 | C5/2 E5/1 | E5/1 D5/1 C5/1 | D5/3',
             lo: 'A3/3 | C4/3 | D3/3 | A3/3 | D3/3 | G3/3 | G3/3 | G3/3 | D3/3 | C4/3 | C4/3 | D3/3 | C4/3 | C4/3 | A3/3 | D3/3',
             hi: 'r/1 E4/2 | r/1 G4/2 | r/1 A3/2 | r/1 E4/2 | r/1 A3/2 | r/1 D4/2 | r/1 D4/2 | r/1 D4/2 | ' +
                 'r/1 A3/2 | r/1 G4/2 | r/1 G4/2 | r/1 A3/2 | r/1 G4/2 | r/1 G4/2 | r/1 E4/2 | r/1 A3/2' },
        H: { hm: 'D4/2 E4/1 | F#4/2 G4/1 | A4/2 F#4/1 | D4/3 | E4/2 F#4/1 | G4/2 E4/1 | C4/2 E4/1 | D4/3 | ' +
                 'D4/2 E4/1 | F#4/2 A4/1 | B4/2 A4/1 | F#4/3 | G4/2 E4/1 | C4/2 E4/1 | E4/1 D4/1 C4/1 | D4/3',
             lo: 'D3/6 | D3/6 | D3/6 | C4/3 D3/3 | D3/6 | G3/6 | C4/6 | A3/3 D3/3' },
        RING: { ch: 'D6/3 A5/3 D5/6' },
        END: { wh: 'D5/9 r/3', lo: 'D3/12', hi: 'r/1 A3/11', ch: 'r/3 D6/3 A5/3 D5/3' }
      },
      order: [{ s: 'A', add: 'RING' }, 'A', 'B', 'B', 'H', 'A', 'END']
    },
    {
      id: 'lai', title: 'Lai of the Scriptorium', form: "lai: paired versicles A A' B B' A A'", mode: 'G Dorian', moods: ['warm'],
      unit: 0.34, accent: 3, level: 1.45,
      voices: { mel: { inst: 'harp' }, lo: { inst: 'harp', gain: 0.75 } },
      sections: {
        A1: { mel: 'G4/3 | Bb4/2 A4/1 | G4/2 F4/1 | G4/3 | Bb4/2 C5/1 | D5/3 | C5/2 Bb4/1 | A4/6 | r/3',
              lo: 'G3/6 | G3/6 | Bb3/6 | F3/6 | D3/3 r/3' },
        A2: { mel: 'G4/3 | Bb4/2 A4/1 | G4/2 F4/1 | G4/3 | Bb4/2 C5/1 | D5/3 | C5/2 A4/1 | G4/6 | r/3',
              lo: 'G3/6 | G3/6 | Bb3/6 | F3/3 D3/3 | G3/3 r/3' },
        B1: { mel: 'D5/2 C5/1 | D5/3 | F4/2 G4/1 | A4/3 | Bb4/2 A4/1 | G4/2 F4/1 | E4/2 F4/1 | D4/6 | r/3',
              lo: 'Bb3/6 | F3/6 | C4/6 | A3/3 F3/3 | D3/3 r/3' },
        B2: { mel: 'D5/2 C5/1 | D5/3 | F4/2 G4/1 | A4/3 | Bb4/2 A4/1 | G4/2 F4/1 | A4/2 F#4/1 | G4/6 | r/3',
              lo: 'Bb3/6 | F3/6 | C4/6 | D3/6 | G3/3 r/3' }
      },
      order: ['A1', 'A2', 'B1', 'B2', 'A1', 'A2']
    },
    {
      id: 'terce', title: 'Bells for Terce', form: 'chimes, chant, chimes, the chant in organum at the fourth, chimes', mode: 'D Dorian', moods: ['warm'],
      unit: 0.42, accent: 1000, level: 1.3,
      voices: { vp: { inst: 'psaltery' }, vo: { inst: 'psaltery', gain: 0.7 }, ch: { inst: 'chimes' } },
      sections: {
        TOLL: { ch: 'D6/2 C6/2 A5/2 G5/2 | D5/6' },
        S1: { vp: 'D5/1 F5/1 G5/2 | A5/1 A5/1 A5/1 G5/1 A5/2 | G5/1 F5/1 E5/1 D5/2 | r/2 | ' +
                  'F5/1 G5/1 A5/2 C6/1 A5/1 | G5/1 A5/1 F5/1 G5/2 | E5/1 F5/1 D5/1 E5/1 C5/2 | r/2 | ' +
                  'D5/1 F5/1 G5/1 A5/2 G5/1 | F5/1 G5/1 E5/1 D5/1 C5/1 D5/2 | F5/1 E5/1 D5/1 C5/1 D5/1 E5/1 D5/4 | r/3' },
        MID: { ch: 'A5/3 D5/5' },
        // vox principalis and, a fourth below it, vox organalis, which may not go below C: so it holds C
        // against D, E and F and meets the chant in unison at the ends of phrases
        S2: { vp: 'D5/1 F5/1 G5/2 | A5/1 A5/1 A5/1 G5/1 A5/2 | G5/1 F5/1 E5/1 D5/2 | r/2 | ' +
                  'F5/1 G5/1 A5/2 C6/1 A5/1 | G5/1 A5/1 F5/1 G5/2 | E5/1 F5/1 D5/1 E5/1 C5/2 | r/2 | ' +
                  'D5/1 F5/1 G5/1 A5/2 G5/1 | F5/1 G5/1 E5/1 D5/1 C5/1 D5/2 | F5/1 E5/1 D5/1 C5/1 D5/1 E5/1 D5/4 | r/3',
              vo: 'C5/1 C5/1 D5/2 | E5/1 E5/1 E5/1 D5/1 E5/2 | D5/1 C5/1 C5/1 D5/2 | r/2 | ' +
                  'C5/1 D5/1 E5/2 G5/1 E5/1 | D5/1 E5/1 C5/1 D5/2 | C5/1 C5/1 C5/1 C5/1 C5/2 | r/2 | ' +
                  'C5/1 C5/1 D5/1 E5/2 D5/1 | C5/1 D5/1 C5/1 C5/1 C5/1 D5/2 | C5/1 C5/1 C5/1 C5/1 C5/1 C5/1 D5/4 | r/3' },
        END: { ch: 'D6/2 A5/2 D5/8' }
      },
      order: ['TOLL', 'S1', 'MID', 'S2', 'END']
    },
    {
      id: 'planctus', title: 'Planctus', form: 'lament in four phrases, the first returning', mode: 'E Phrygian', moods: ['quiet'],
      unit: 0.5, accent: 4, level: 1.0,
      voices: { mel: { inst: 'psaltery' }, dr: { inst: 'psaltery', gain: 0.4 } },
      sections: {
        P1: { mel: 'E5/2 F5/1 G5/1 | A5/3 G5/1 | F5/2 E5/2 | F5/1 G5/1 F5/2 | E5/6 | r/2', dr: 'r/4 E5/18 r/2' },
        P2: { mel: 'G5/2 A5/1 B5/1 | C6/3 B5/1 | A5/2 B5/1 A5/1 | G5/4 | A5/2 G5/1 F5/1 | E5/6 | r/2', dr: 'r/4 E5/22 r/2' },
        P3: { mel: 'C6/2 D6/1 E6/1 | D6/3 C6/1 | B5/2 A5/2 | B5/2 C6/2 | A5/4 | G5/2 F5/2 | G5/1 F5/1 E5/6 | r/3',
              dr: 'r/8 A5/12 r/4 E5/8 r/3' },
        P4: { mel: 'E5/2 F5/1 G5/1 | A5/2 G5/2 | F5/3 E5/1 | E5/8 | r/4', dr: 'r/4 E5/16 r/4' }
      },
      order: ['P1', 'P2', 'P3', 'P1', 'P4']
    },
    {
      id: 'vigil', title: 'Vigil', form: 'four slow phrases, twice', mode: 'A Aeolian', moods: ['quiet'],
      unit: 0.45, accent: 4, level: 1.27,
      voices: { mel: { inst: 'harp' }, lo: { inst: 'harp', gain: 0.5 } },
      sections: {
        S1: { mel: 'A3/2 C4/2 | E4/4 | D4/2 C4/1 B3/1 | A3/4 | r/4', lo: 'A2/8 | E3/4 | A2/4 | r/4' },
        S2: { mel: 'C4/2 D4/2 | E4/2 G4/2 | F4/2 E4/1 D4/1 | E4/4 | r/4', lo: 'A2/4 | E3/4 | D3/4 | E3/4 | r/4' },
        S3: { mel: 'A4/2 G4/2 | E4/2 D4/2 | C4/2 D4/1 E4/1 | D4/4 | r/4', lo: 'F3/4 | G3/4 | A3/4 | D3/4 | r/4' },
        S4: { mel: 'C4/2 B3/1 A3/1 | G3/2 A3/2 | B3/2 C4/1 B3/1 | A3/6 | r/6', lo: 'A2/4 | E3/4 | E3/4 | A2/6 | r/6' }
      },
      order: ['S1', 'S2', 'S3', 'S4', 'S1', 'S2', 'S3', 'S4']
    },
    {
      id: 'antiphon', title: 'Night Antiphon', form: 'whistle phrases, each answered by the harp', mode: 'D Dorian', moods: ['quiet'],
      unit: 0.4, accent: 4, level: 1.3,
      voices: { wh: { inst: 'whistle', gain: 0.55 }, hp: { inst: 'harp' }, lo: { inst: 'harp', gain: 0.7 } },
      sections: {
        Q1: { wh: 'D5/2 F5/2 G5/2 A5/2 | C6/2 A5/2 G5/4 | A5/6 r/2', lo: 'D3/8 r/16' },
        R1: { hp: 'D4/2 F4/2 G4/2 A4/2 | C5/2 A4/2 G4/2 F4/2 | D4/6 r/2', lo: 'D3/8 r/8 A2/6 r/2' },
        Q2: { wh: 'A5/2 C6/2 D6/4 | C6/2 A5/2 G5/2 F5/2 | G5/6 r/2', lo: 'G3/8 r/16' },
        R2: { hp: 'A4/2 C5/2 D5/4 | C5/2 A4/2 G4/2 E4/2 | D4/6 r/2', lo: 'D3/8 r/8 D3/6 r/2' },
        Q3: { wh: 'F5/2 E5/2 D5/2 F5/2 | G5/2 F5/2 E5/2 C5/2 | D5/8', lo: 'D3/8 | C4/8 | D3/8' },
        R3: { hp: 'F4/2 E4/2 D4/2 F4/2 | E4/2 C4/2 D4/4 | r/8', lo: 'D3/8 | A2/4 D3/4 | r/8' }
      },
      order: ['Q1', 'R1', 'Q2', 'R2', 'Q1', 'R1', 'Q3', 'R3']
    },
    {
      id: 'explicit', title: 'Explicit', form: 'flourish: a harp roll and three chimes', mode: 'D', moods: [],
      unit: 0.2, accent: 1000, level: 1.45,
      voices: { hp: { inst: 'harp' }, ch: { inst: 'chimes' } },
      sections: { F: { hp: 'D3/1 A3/1 D4/1 F#4/1 A4/1 D5/15', ch: 'r/6 D6/3 A5/3 D5/8' } },
      order: ['F']
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
      else { var m = midi(n); if (m == null) throw new Error('bad pitch: ' + tok); out.push({ m: m, n: n, d: d }); }
    });
    out.loop = loop;
    return out;
  }
  function units(notes) { return notes.reduce(function (s, x) { return s + x.d; }, 0); }

  // the whole piece as timed events (seconds from the piece's start), plus section boundaries.
  // An order item {s, add} plays section `add` from the start of section s (its lines may be shorter).
  var flatCache = {};
  function flatten(P) {
    if (flatCache[P.id]) return flatCache[P.id];
    var u = P.unit, t = 0, ev = [], bounds = [0], acc = P.accent || 3, vorder = Object.keys(P.voices);
    P.order.forEach(function (item, si) {
      var name = typeof item === 'string' ? item : item.s, sec = P.sections[name];
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
      if (item.add) {
        var ex = P.sections[item.add];
        Object.keys(ex).forEach(function (v) { var k = v + '+'; lines[k] = parse(ex[v]); lines[k].voice = v; });
      }
      Object.keys(lines).forEach(function (k) {
        var notes = lines[k], v = notes.voice || k, pos = 0, i = 0;
        while (pos < L - 1e-9 && (notes.loop || i < notes.length)) {
          var n = notes[i % notes.length], d = Math.min(n.d, L - pos);
          if (!n.r) ev.push({ t: (t + pos) * u, v: v, m: n.m, d: d * u, vel: Math.abs(pos % acc) < 1e-9 ? 1 : 0.8, sec: si });
          pos += n.d; i++;
        }
      });
      t += L; bounds.push(t * u);
    });
    ev.sort(function (a, b) { return a.t - b.t || vorder.indexOf(a.v) - vorder.indexOf(b.v); });
    return (flatCache[P.id] = { ev: ev, end: t * u, bounds: bounds });
  }

  var byId = {};
  PIECES.forEach(function (P) { byId[P.id] = P; });
  var API = { PIECES: PIECES, parse: parse, flatten: flatten, midi: midi, hz: hz };
  if (typeof window === 'undefined') return API;      // node: the score alone, for tests and printing

  // ================================================================ synthesis (the stand-ins)
  var KS_SR = 22050, CAP = 12;
  var dataCache = {};

  // Karplus-Strong string with a fractional delay; rendered once per pitch
  var HARP = { name: 'harp', t60: 3.0, len: 3.2, bright: 0.32, pos: 0.27, s: 0.5 };
  function ksData(spec, m) {
    var key = spec.name + m;
    if (dataCache[key]) return dataCache[key];
    var sr = KS_SR, f = hz(m), len = Math.floor(spec.len * sr), out = new Float32Array(len), i;
    var s = spec.s, D = sr / f, L = D - (1 - s), n0 = Math.floor(L), fr = L - n0, w = 2 * Math.PI * f / sr;
    var H = Math.sqrt(s * s + (1 - s) * (1 - s) + 2 * s * (1 - s) * Math.cos(w));
    var Hi = Math.sqrt((1 - fr) * (1 - fr) + fr * fr + 2 * fr * (1 - fr) * Math.cos(w));
    var T60 = Math.max(0.3, Math.min(spec.len, spec.t60 * Math.pow(220 / f, 0.4)));
    var d = Math.min(0.99995, Math.pow(10, -3 * D / (T60 * sr)) / (H * Hi));
    var P = n0 + 2, lp = 0, mean = 0, ex = new Float32Array(P), M = Math.max(1, Math.round(spec.pos * D));
    for (i = 0; i < P; i++) { lp += ((Math.random() * 2 - 1) - lp) * spec.bright; ex[i] = lp; mean += lp; }
    mean /= P;
    for (i = 0; i < P; i++) out[i] = (ex[i] - mean) - (i >= M ? ex[i - M] - mean : 0) * 0.85;
    for (i = P; i < len; i++) {
      var a = i - n0, r = (1 - fr) * out[a] + fr * out[a - 1], rp = (1 - fr) * out[a - 1] + fr * out[a - 2];
      out[i] = d * (s * r + (1 - s) * rp);
    }
    var x1 = 0, y1 = 0, pk = 0, fade = Math.floor(0.08 * sr);
    for (i = 0; i < len; i++) { var yy = out[i] - x1 + 0.995 * y1; x1 = out[i]; y1 = yy; out[i] = yy; if (Math.abs(yy) > pk) pk = Math.abs(yy); }
    for (i = 0; i < len; i++) out[i] = out[i] / (pk || 1) * (i > len - fade ? (len - i) / fade : 1);
    return (dataCache[key] = out);
  }
  // a hand chime: a fundamental with its twelfth (the tuned third harmonic) and a faint high partial
  function chimeData(m) {
    var key = 'chime' + m;
    if (dataCache[key]) return dataCache[key];
    var sr = KS_SR, f = hz(m), len = Math.floor(3 * sr), out = new Float32Array(len), pk = 0, i;
    [[1, 1, 2.6], [3, 0.3, 0.9], [5.2, 0.06, 0.35], [1.003, 0.25, 2.6]].forEach(function (p) {
      if (f * p[0] > sr / 2.2) return;
      var w = 2 * Math.PI * f * p[0] / sr, k = Math.pow(10, -3 / (p[2] * sr)), a = p[1];
      for (var n = 0; n < len; n++) { out[n] += a * Math.sin(w * n); a *= k; }
    });
    for (i = 0; i < Math.floor(0.003 * sr); i++) out[i] *= i / (0.003 * sr);
    for (i = 0; i < len; i++) if (Math.abs(out[i]) > pk) pk = Math.abs(out[i]);
    for (i = 0; i < len; i++) out[i] /= pk;
    return (dataCache[key] = out);
  }
  // amplitudes of harmonics 1..n
  var WAVES = { whistle: [1, 0.1, 0.04, 0.012], bowed: [1, 0.55, 0.38, 0.22, 0.16, 0.1, 0.07, 0.05] };
  var WINDS = {
    whistle: { wave: 'whistle', att: 0.04, rel: 0.08, vib: 0.003, vibRate: 5, nf: 2.2, nq: 2.5, chiff: 0.3, breath: 0.04, gain: 0.26, legatoGap: 0.02 },
    psaltery: { wave: 'bowed', att: 0.12, rel: 0.3, vib: 0.002, vibRate: 4.6, nf: 3, nq: 4, chiff: 0.12, breath: 0.03, gain: 0.13, legatoGap: 0.03 }
  };

  function Engine(ac, dest) {
    var E = this;
    E.ac = ac; E.dest = dest; E.live = []; E.plucks = []; E.owner = null; E.waves = {}; E.bufs = {};
    var sr = ac.sampleRate, n, d, i;
    E.noise = ac.createBuffer(1, sr, sr);
    d = E.noise.getChannelData(0);
    for (i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // a stone chapel: a dark tail, mono and short (1.2 s) to keep the convolver cheap on a phone
    // (the convolver normalises the impulse, so the wet level holds)
    n = Math.floor(sr * 1.2);
    var ir = ac.createBuffer(1, n, sr), id = ir.getChannelData(0), lp = 0, pre = Math.floor(0.02 * sr);
    for (i = pre; i < n; i++) { var x = (i - pre) / sr; lp += ((Math.random() * 2 - 1) - lp) * (0.42 - 0.28 * x / 1.2); id[i] = lp * Math.exp(-x * 6.9 / 1.1); }
    E.out = ac.createGain(); E.out.gain.value = OUT;
    E.bus = ac.createGain();
    var dry = ac.createGain(); dry.gain.value = 0.8;
    var conv = ac.createConvolver(); conv.buffer = ir;
    var wet = ac.createGain(); wet.gain.value = 0.36;
    E.bus.connect(dry); dry.connect(E.out);
    E.bus.connect(conv); conv.connect(wet); wet.connect(E.out);
    E.out.connect(dest); E.connected = true;
  }
  var OUT = 0.5;      // the music's master level: under the page's sound effects
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
  // a struck or plucked note: let go of the oldest one still sounding past CAP
  Engine.prototype.pluck = function (src, g, t, dur) {
    var E = this;
    E.plucks = E.plucks.filter(function (p) { return p.end > t; });
    if (E.plucks.length >= CAP) {
      var old = E.plucks.shift();
      try { old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0, t + 0.06); old.src.stop(t + 0.08); } catch (e) { /* ended */ }
    }
    E.plucks.push({ src: src, g: g, end: t + dur });
  };
  function env(p, t, d, att, rel, peak) {
    var hold = Math.max(att, d);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + att);
    p.setValueAtTime(peak, t + hold);
    p.linearRampToValueAtTime(0, t + hold + rel);
    return t + hold + rel;
  }
  function oneBuf(E, b, t, gain, out, rate) {
    var src = E.ac.createBufferSource(); src.buffer = b;
    if (rate) src.playbackRate.value = rate;
    var a = E.ac.createGain(); a.gain.value = gain;
    src.connect(a); a.connect(out); src.start(t);
    E.pluck(src, a, t, b.duration / (rate || 1));
    E.track(src, [src, a]);
  }

  var INST = {};
  INST.harp = function (E, t, m, d, g, out) { oneBuf(E, E.buf('harp' + m, ksData(HARP, m)), t + (Math.random() - 0.5) * 0.012, 0.5 * g, out); };
  INST.chimes = function (E, t, m, d, g, out) { oneBuf(E, E.buf('chime' + m, chimeData(m)), t, 0.3 * g, out); };
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
      // breath or bow noise: a chiff at the start, then a whisper under the note
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

  // ================================================================ recorded instruments (audio/<set>/)
  // Made by tools/make-samples.py (see MUSIC.md). A set loads the first time a piece that needs it is
  // chosen; until it is ready, or if it fails, the piece plays on the synth voices above. Each note is
  // bent by playbackRate from the nearest sample's measured pitch to this file's Pythagorean hz().
  var AUDIO_V = 1;
  var SETS = { harp: {}, psaltery: {}, chimes: {}, whistle: {} };
  // loudness of each recorded voice against its synth stand-in (the samples are levelled to one RMS)
  var SLEVEL = { harp: 0.6, psaltery: 0.8, chimes: 0.75, whistle: 1 };
  function setsFor(P) {
    var s = [];
    Object.keys(P.voices).forEach(function (k) { var n = P.voices[k].inst; if (SETS[n] && s.indexOf(n) < 0) s.push(n); });
    return s;
  }
  function setsReady(P) { return setsFor(P).every(function (n) { return SETS[n].state === 'ready'; }); }
  function setsLoading(P) { return setsFor(P).some(function (n) { return SETS[n].state === 'loading'; }); }
  function getOk(url, how) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ': ' + r.status); return r[how](); });
  }
  function loadSet(name, ac) {
    var S = SETS[name];
    if (S.state) return S.p;
    S.state = 'loading';
    var base = 'audio/' + name + '/';
    S.p = getOk(base + name + '.json?v=' + AUDIO_V, 'json').then(function (man) {
      var all = Object.keys(man.notes).map(function (k) { return man.notes[k]; });
      return Promise.all(all.map(function (e) {
        return getOk(base + e.file + '?v=' + AUDIO_V, 'arrayBuffer')
          .then(function (ab) { return new Promise(function (res, rej) { ac.decodeAudioData(ab, res, rej); }); })
          .then(function (b) { e.buf = b; });
      })).then(function () { S.notes = all; S.state = 'ready'; });
    }).catch(function (err) { S.state = 'failed'; S.err = String(err && err.message || err); });
    return S.p;
  }
  function nearest(list, m) {
    var best = list[0];
    list.forEach(function (e) { if (Math.abs(e.m - m) < Math.abs(best.m - m)) best = e; });
    return best;
  }

  var SINST = {};
  // harp and chimes: the struck note as recorded (already faded at its end by the tool)
  ['harp', 'chimes'].forEach(function (name) {
    SINST[name] = function (E, t, m, d, g, out) {
      var e = nearest(SETS[name].notes, m);
      oneBuf(E, e.buf, t + (name === 'harp' ? (Math.random() - 0.5) * 0.012 : 0), e.gain * SLEVEL[name] * g, out, hz(m) / e.hz);
    };
  });
  // psaltery and whistle: one voice per note, its own attack, the steady part looped, a short release
  [['psaltery', 0.03, 0.32], ['whistle', 0.012, 0.09]].forEach(function (r) {
    var name = r[0], W = WINDS[name];
    SINST[name] = function (E, t, m, d, g, out) {
      var e = nearest(SETS[name].notes, m), dd = Math.max(0.05, d - W.legatoGap), ac = E.ac;
      var src = ac.createBufferSource();
      src.buffer = e.buf; src.loop = true; src.loopStart = e.loopStart; src.loopEnd = e.loopEnd;
      src.playbackRate.value = hz(m) / e.hz;
      var a = ac.createGain(); a.gain.value = 0;
      src.connect(a); a.connect(out); src.start(t);
      var end = env(a.gain, t, dd, r[1], r[2], e.gain * SLEVEL[name] * g);
      src.stop(end + 0.02);
      E.track(src, [src, a]);
    };
  });

  // one event of a piece, at absolute time t0 + ev.t; samp: play its recorded voices
  function play(E, P, ev, t0, out, samp) {
    var V = P.voices[ev.v], I = (samp && SINST[V.inst]) || INST[V.inst];
    I(E, t0 + ev.t, ev.m + (V.oct || 0), ev.d, (V.gain || 1) * ev.vel, out, ev);
  }

  // ================================================================ the player
  var LOOK = 0.6, TICK = 150, TAIL = 4.5;
  var E = null, on = true, mood = 'warm', gestured = false, timer = 0, cur = null, nextAt = 0, lastId = {}, held = false;
  var flourish = false, flourishAt = 0;
  var pend = null, pendSince = 0, WAIT = 5;    // a chosen piece waiting (at most WAIT s) for its samples
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function gap(md) { return md === 'quiet' ? rnd(22, 40) : rnd(12, 22); }
  function engine() {
    if (E) return E;
    var AC = window.AudioContext || window.webkitAudioContext, ac;
    if (!AC) return null;
    try { ac = new AC(); } catch (e) { return null; }
    E = new Engine(ac, ac.destination);
    return E;
  }
  function unlock() { if (E && E.ac.state === 'suspended' && !held) E.ac.resume(); }
  function choose() {
    if (flourish) { flourish = false; return byId.explicit; }
    var c = PIECES.filter(function (P) { return P.moods.indexOf(mood) >= 0 && P.id !== lastId[mood]; });
    if (!c.length) c = PIECES.filter(function (P) { return P.moods.indexOf(mood) >= 0; });
    return c[Math.floor(Math.random() * c.length)];
  }
  function begin(P, at) {
    var g = E.ac.createGain(); g.gain.value = P.level || 1; g.connect(E.bus);
    if (P.moods.length) lastId[mood] = P.id;
    cur = { P: P, F: flatten(P), t0: at, i: 0, g: g, src: [], cut: Infinity, samp: setsReady(P) };
    cur.endAt = at + cur.F.end;
  }
  function pump(now) {
    var F = cur.F, h = now + LOOK;
    E.owner = cur.src;
    while (cur.i < F.ev.length && cur.t0 + F.ev[cur.i].t < h) {
      var ev = F.ev[cur.i++];
      if (ev.t >= cur.cut) { cur.i = F.ev.length; break; }
      try { play(E, cur.P, ev, cur.t0, cur.g, cur.samp); } catch (e) { /* skip a bad note */ }
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
  }
  function tick() {
    timer = 0;
    if (!on || !gestured || held) return;
    if (!engine()) return;
    if (E.ac.state !== 'running') { unlock(); timer = setTimeout(tick, 300); return; }
    var now = E.ac.currentTime;
    if (!nextAt && !cur) nextAt = now + 1.5;
    if (cur) {
      pump(now);
      if (now > cur.endAt + TAIL) {
        var was = cur.P.id, soft = cur.ending;
        finish();
        nextAt = flourish ? Math.max(now + 0.1, flourishAt) : now + (was === 'explicit' ? rnd(4, 8) : soft ? rnd(3, 6) : gap(mood));
      }
    } else if (now >= nextAt - LOOK) {
      if (!pend) { pend = choose(); pendSince = now; setsFor(pend).forEach(function (n) { loadSet(n, E.ac); }); }
      if (!setsLoading(pend) || now > pendSince + WAIT) {
        var P = pend; pend = null;
        begin(P, Math.max(now + 0.1, nextAt));
        pump(now);
      }
    }
    timer = setTimeout(tick, TICK);
  }
  function kick() { if (!timer && on && gestured && !held) timer = setTimeout(tick, 20); }

  function gesture() {
    if (gestured) return;
    gestured = true;
    ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { window.removeEventListener(ev, gesture, true); });
    if (on && engine()) { unlock(); kick(); }
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
      if (E && E.suspended) { E.suspended = false; if (on) E.ac.resume(); }
      kick();
    }
  });

  API.setEnabled = function (b) {
    b = !!b;
    if (b === on) return;
    on = b;
    if (!E) { if (on && gestured && engine()) { unlock(); kick(); } return; }
    if (!on) {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (cur) { fade(E.ac.currentTime, 0.35); var c = cur; cur = null; setTimeout(function () { try { c.g.disconnect(); } catch (e) { /* gone */ } }, 600); }
      nextAt = 0; pend = null; flourish = false;
      // muted: once faded, unhook and stop the context's clock too (unlock() wakes it when sound comes back)
      setTimeout(function () {
        if (on) return;
        if (E.connected) { E.out.disconnect(); E.connected = false; }
        if (E.ac.state === 'running') E.ac.suspend();
      }, 500);
    } else {
      if (!E.connected) { E.out.connect(E.dest); E.connected = true; }
      unlock();
      nextAt = 0; kick();
    }
  };
  // settled a moment later, so a screen that passes straight through changes nothing
  var want = 'warm', settle = 0;
  API.screen = function (name) {
    want = name === 'play' ? 'quiet' : 'warm';
    if (!settle) settle = setTimeout(function () {
      settle = 0;
      if (want === mood) return;
      mood = want;
      if (pend && pend.id !== 'explicit') pend = null;
      if (!E || !on) return;
      if (cur) { if (cur.P.moods.length && cur.P.moods.indexOf(mood) < 0) softEnd(); }
      else if (nextAt && !flourish) nextAt = Math.min(nextAt, E.ac.currentTime + rnd(4, 8));
    }, 80);
  };
  // after the page's own solve chime (about 2.5 s): the piece fades, the flourish plays, then a short
  // gap and the current mood goes on
  API.solved = function () {
    if (!E || !on || !gestured) return;
    var now = E.ac.currentTime;
    flourish = true; flourishAt = now + 2.6;
    if (pend && pend.id !== 'explicit') pend = null;
    if (cur) { cur.ending = true; fade(now, 1.6); }
    else nextAt = flourishAt;
    kick();
  };
  API.play = function (id) {     // for testing: start a piece now
    if (!engine() || !byId[id]) return false;
    if (cur) finish();
    pend = byId[id]; pendSince = nextAt = E.ac.currentTime;      // tick() starts it once its samples are in
    setsFor(pend).forEach(function (n) { loadSet(n, E.ac); });
    gestured = true; unlock(); kick();
    return true;
  };
  // render a piece offline (a Promise of an AudioBuffer). opts.synth: the synth voices only;
  // opts.only: a list of voice names to keep (for measuring levels)
  API.render = function (id, sr, opts) {
    opts = opts || {};
    var P = byId[id], F = flatten(P);
    sr = sr || 44100;
    var oac = new OfflineAudioContext(1, Math.ceil((F.end + 5) * sr), sr);
    return Promise.all(opts.synth ? [] : setsFor(P).map(function (n) { return loadSet(n, (E && E.ac) || oac); })).then(function () {
      var e = new Engine(oac, oac.destination), g = oac.createGain(), samp = !opts.synth && setsReady(P);
      g.gain.value = P.level || 1;
      g.connect(e.bus);
      F.ev.forEach(function (ev) { if (!opts.only || opts.only.indexOf(ev.v) >= 0) play(e, P, ev, 0.25, g, samp); });
      return oac.startRendering();
    });
  };
  API.debug = function () {
    var now = E ? E.ac.currentTime : 0;
    return { on: on, mood: mood, gestured: gestured, timer: !!timer, held: held, state: E ? E.ac.state : 'none', connected: E ? E.connected : false,
      playing: cur ? cur.P.id : null, at: cur ? +(now - cur.t0).toFixed(2) : null, cut: cur && cur.cut < Infinity ? +cur.cut.toFixed(2) : null,
      nextIn: !cur && nextAt ? +(nextAt - now).toFixed(1) : null, live: E ? E.live.length : 0, flourish: flourish,
      sampled: cur ? cur.samp : null, waiting: pend ? pend.id : null,
      sets: Object.keys(SETS).reduce(function (o, k) { o[k] = SETS[k].state || 'idle'; if (SETS[k].err) o[k] += ' (' + SETS[k].err + ')'; return o; }, {}) };
  };

  // ================================================================ wiring into the page
  // the page's sound toggle (SFX.enabled) turns the music on and off too
  if (window.SFX) {
    var en = window.SFX.enabled !== false;
    try {
      Object.defineProperty(window.SFX, 'enabled', { configurable: true, enumerable: true,
        get: function () { return en; }, set: function (b) { en = !!b; API.setEnabled(en); } });
    } catch (e) { /* left as a plain field */ }
    API.setEnabled(en);
    var solvedSfx = window.SFX.solved;
    if (typeof solvedSfx === 'function') {
      window.SFX.solved = function () { var r = solvedSfx.apply(this, arguments); try { API.solved(); } catch (e) { /* music only */ } return r; };
    }
  }
  // the screen: the page screen ('play') is quiet, the cover and the book are warm. The screen only changes
  // after a tap or a key, so look shortly after each one (and once more when the page-turn or cover has run);
  // a slow fallback only reads one field, and does nothing at all while the tab is hidden
  var lastScr = null;
  function checkScreen() {
    if (document.hidden) return;
    var s = null;
    try { s = window.VV && window.VV.save && window.VV.save(); } catch (e) { /* not ready */ }
    if (!s) return;
    var scr = s.screen === 'play' ? 'play' : 'book';
    if (scr !== lastScr) { lastScr = scr; API.screen(scr); }
  }
  function soon() { setTimeout(checkScreen, 60); setTimeout(checkScreen, 1300); }
  ['pointerup', 'keyup'].forEach(function (ev) { window.addEventListener(ev, soon, { passive: true, capture: true }); });
  setInterval(checkScreen, 1500);
  setTimeout(checkScreen, 300);
  return API;
});
