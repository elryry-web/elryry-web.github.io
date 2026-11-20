/* Felt & Fold flop library reader: parses the compact FFL1 files written by
 * `ff-solve batch` / `ff-solve solve --ffl` / the WASM library export.
 * UMD: window.FF.Library in the browser, require('./library-reader.js') in Node.
 *
 *   FF.Library.parse(arrayBufferOrUint8Array) -> lib
 *   FF.Library.node(lib, path)                 -> node or null; path = action indices from the root, e.g. [] or [1]
 *   FF.Library.combo(lib, path, comboIndex)    -> { freq:[0..1 per action], ev:[chips per action] or null, weight } or null
 *   FF.Library.overall(lib, path)              -> range-weighted action frequencies at a node
 *
 * lib = { version, hasEv, board:[cards], pot, stack, exploit, iterations,
 *         nodes:[{ path:[k..], player:'oop'|'ip', actions:[{kind, to, label}],
 *                  combos: Uint16Array, freq: [Uint8Array per action] (each combo sums to 255),
 *                  ev: [Float32Array per action] or null (chips), weight: Uint8Array (0..255, relative to max) }] }
 * Combo index and card encoding match js/cards.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.FF = root.FF || {}; root.FF.Library = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KINDS = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];

  function fmt(x) { return String(Math.round(x * 100) / 100); }

  function parse(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'FFL1') throw new Error('not an FFL1 file');
    var lib = { version: u8[4], hasEv: !!(u8[5] & 1), board: [], nodes: [] };
    var boardLen = u8[6], nodeCount = u8[7];
    for (var i = 0; i < boardLen; i++) lib.board.push(u8[8 + i]);
    var o = 16;
    lib.pot = dv.getFloat32(o, true); o += 4;
    lib.stack = dv.getFloat32(o, true); o += 4;
    lib.exploit = dv.getFloat32(o, true); o += 4;
    lib.iterations = dv.getUint32(o, true); o += 4;
    for (var n = 0; n < nodeCount; n++) {
      var node = { path: [], actions: [] };
      var pl = u8[o++];
      for (i = 0; i < pl; i++) node.path.push(u8[o++]);
      node.player = u8[o++] ? 'ip' : 'oop';
      var na = u8[o++];
      for (i = 0; i < na; i++) {
        var kind = KINDS[u8[o++]], to = dv.getFloat32(o, true); o += 4;
        // labels match the solver's: call shows chips added, which the file does not store
        node.actions.push({ kind: kind, to: to, label: kind === 'fold' || kind === 'check' || kind === 'call' ? kind : kind + ' ' + fmt(to) });
      }
      var combos = [];
      for (i = 0; i < 1326; i++) if (u8[o + (i >> 3)] & (1 << (i & 7))) combos.push(i);
      o += 166;
      var nc = combos.length;
      node.combos = Uint16Array.from(combos);
      node.freq = [];
      for (i = 0; i < na; i++) { node.freq.push(u8.slice(o, o + nc)); o += nc; }
      node.ev = null;
      if (lib.hasEv) {
        node.ev = [];
        for (i = 0; i < na; i++) {
          var e = new Float32Array(nc);
          for (var j = 0; j < nc; j++) { e[j] = dv.getInt16(o, true) * lib.pot / 256; o += 2; }
          node.ev.push(e);
        }
      }
      node.weight = u8.slice(o, o + nc); o += nc;
      node.index = {};
      for (i = 0; i < nc; i++) node.index[combos[i]] = i;
      lib.nodes.push(node);
    }
    return lib;
  }

  function node(lib, path) {
    path = path || [];
    for (var i = 0; i < lib.nodes.length; i++) {
      var p = lib.nodes[i].path;
      if (p.length === path.length && p.every(function (x, k) { return x === path[k]; })) return lib.nodes[i];
    }
    return null;
  }

  function combo(lib, path, c) {
    var nd = node(lib, path);
    if (!nd) return null;
    var j = nd.index[c];
    if (j === undefined) return null;
    return {
      freq: nd.freq.map(function (f) { return f[j] / 255; }),
      ev: nd.ev ? nd.ev.map(function (e) { return e[j]; }) : null,
      weight: nd.weight[j] / 255
    };
  }

  function overall(lib, path) {
    var nd = node(lib, path);
    if (!nd) return null;
    var tot = 0, out = nd.actions.map(function () { return 0; });
    for (var j = 0; j < nd.combos.length; j++) {
      var w = nd.weight[j];
      tot += w;
      for (var k = 0; k < out.length; k++) out[k] += w * nd.freq[k][j] / 255;
    }
    return out.map(function (x) { return tot ? x / tot : 0; });
  }

  return { parse: parse, node: node, combo: combo, overall: overall, KINDS: KINDS };
});
