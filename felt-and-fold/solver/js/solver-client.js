/* Felt & Fold solver client: promise API over a small pool of solver workers.
 * UMD: window.FF.Solver in the browser, require('./solver-client.js') in Node.
 *
 *   FF.Solver.configure({ workerUrl, wasmUrl, poolSize })   optional; defaults sit next to this script
 *   FF.Solver.solveSpot(config, { targetExploit, maxMs, maxIters, onProgress, withEv, queries, library, keep, signal })
 *       -> Promise<result>
 *   FF.Solver.solveDirect(config, opts)   Node only: same thing on this thread, no worker
 *   FF.Solver.terminate()                  stop all workers
 *
 * config is the spot config (see solver/README.md); ranges may be strings, arrays or
 * Float64Array(1326). With keep: true, result.session = { query(path, withEv), release() }
 * stays bound to the worker that solved it until released.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.FF = root.FF || {}; root.FF.Solver = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var isNode = typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined';
  var base = '';
  if (!isNode && typeof document !== 'undefined' && document.currentScript) {
    base = document.currentScript.src.replace(/[^/]*$/, '');
  }
  var opts = {
    workerUrl: isNode ? require('path').join(__dirname, 'solver-worker.js') : base + 'solver-worker.js',
    wasmUrl: isNode ? require('path').join(__dirname, '..', 'pkg', 'solver.wasm') : base + '../pkg/solver.wasm',
    poolSize: 0
  };
  var modulePromise = null, pool = [], waiting = [], nextId = 1;

  function configure(o) { for (var k in o) opts[k] = o[k]; }

  function poolSize() {
    if (opts.poolSize) return opts.poolSize;
    var hc = isNode ? require('os').cpus().length : (navigator.hardwareConcurrency || 4);
    return Math.max(1, Math.min(4, Math.floor(hc / 2)));
  }

  function getModule() {
    if (!modulePromise) {
      modulePromise = isNode
        ? WebAssembly.compile(require('fs').readFileSync(opts.wasmUrl))
        : fetch(opts.wasmUrl).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return WebAssembly.compile(b); });
    }
    return modulePromise;
  }

  function normalise(config) {
    var c = {};
    for (var k in config) {
      var v = config[k];
      c[k] = (v && ArrayBuffer.isView(v)) ? Array.prototype.slice.call(v) : v;
    }
    return JSON.stringify(c);
  }

  function makeWorker(module) {
    var w;
    if (isNode) {
      var WT = require('worker_threads').Worker;
      w = { raw: new WT(opts.workerUrl) };
      w.send = function (m) { w.raw.postMessage(m); };
      w.raw.on('message', function (m) { w.onmsg(m); });
      w.raw.on('error', function (e) { w.onfail(e); });
    } else {
      w = { raw: new Worker(opts.workerUrl) };
      w.send = function (m) { w.raw.postMessage(m); };
      w.raw.onmessage = function (ev) { w.onmsg(ev.data); };
      w.raw.onerror = function (e) { w.onfail(e); };
    }
    w.busy = false;
    w.pending = {};
    w.onmsg = function (m) {
      var p = w.pending[m.id];
      if (!p) return;
      if (m.type === 'progress') { if (p.onProgress) p.onProgress(m); return; }
      delete w.pending[m.id];
      if (m.type === 'done') p.resolve(m.result); else p.reject(new Error(m.error));
    };
    w.onfail = function (e) {
      for (var id in w.pending) w.pending[id].reject(e instanceof Error ? e : new Error(String(e.message || e)));
      w.pending = {};
      var i = pool.indexOf(w);
      if (i >= 0) pool.splice(i, 1);
    };
    w.send({ type: 'init', module: module });
    return w;
  }

  function acquire() {
    return getModule().then(function (module) {
      for (var i = 0; i < pool.length; i++) if (!pool[i].busy) { pool[i].busy = true; return pool[i]; }
      if (pool.length < poolSize()) { var w = makeWorker(module); w.busy = true; pool.push(w); return w; }
      return new Promise(function (res) { waiting.push(res); });
    });
  }

  function release(w) {
    if (waiting.length) waiting.shift()(w); else w.busy = false;
  }

  function request(w, msg, onProgress) {
    return new Promise(function (resolve, reject) {
      w.pending[msg.id] = { resolve: resolve, reject: reject, onProgress: onProgress };
      w.send(msg);
    });
  }

  function solveMessage(config, o) {
    return {
      type: 'solve', id: nextId++, config: normalise(config),
      targetExploit: o.targetExploit, maxMs: o.maxMs, maxIters: o.maxIters, checkEvery: o.checkEvery,
      withEv: o.withEv !== false, queries: o.queries, library: !!o.library, keep: !!o.keep
    };
  }

  function solveSpot(config, o) {
    o = o || {};
    return acquire().then(function (w) {
      var msg = solveMessage(config, o);
      if (o.signal) o.signal.addEventListener('abort', function () { w.send({ type: 'cancel', id: msg.id }); });
      return request(w, msg, o.onProgress).then(function (res) {
        release(w);
        if (o.keep && res.handle) {
          var h = res.handle;
          res.session = {
            query: function (path, withEv) { return request(w, { type: 'query', id: nextId++, handle: h, path: path || [], withEv: withEv !== false }); },
            release: function () { w.send({ type: 'drop', handle: h }); }
          };
        }
        return res;
      }, function (err) { release(w); throw err; });
    });
  }

  /* Node: solve on the calling thread (used by tests) */
  var direct = null;
  function solveDirect(config, o) {
    o = o || {};
    return getModule().then(function (module) {
      if (!direct) {
        var W = require(opts.workerUrl);
        direct = new W.Runner(new W.Core(module));
      }
      var msg = solveMessage(config, o);
      return new Promise(function (resolve, reject) {
        direct.solve(msg, function (m) {
          if (m.type === 'progress') { if (o.onProgress) o.onProgress(m); }
          else if (m.type === 'done') {
            var res = m.result;
            if (o.keep && res.handle) {
              var h = res.handle;
              res.session = {
                query: function (path, withEv) { return Promise.resolve(direct.core.query(h, path || [], withEv !== false)); },
                release: function () { direct.core.drop(h); }
              };
            }
            resolve(res);
          } else reject(new Error(m.error));
        });
      });
    });
  }

  function terminate() {
    pool.forEach(function (w) { w.raw.terminate(); });
    pool = [];
  }

  return { configure: configure, solveSpot: solveSpot, solveDirect: solveDirect, terminate: terminate };
});
