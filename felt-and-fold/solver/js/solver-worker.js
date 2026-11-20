/* Felt & Fold solver worker: runs solver.wasm (single-threaded) and solves spots on request.
 *
 * Runs as a browser Web Worker, as a Node worker_threads worker, or is required on the
 * main thread in Node, where it exports { Core, Runner } for direct (no-worker) use.
 *
 * Messages in:
 *   {type:'init', module: WebAssembly.Module}            or {type:'init', bytes: ArrayBuffer} / {type:'init', url}
 *   {type:'solve', id, config: <JSON string>, targetExploit, maxMs, maxIters, checkEvery,
 *        withEv, queries: [[step...]...], library: bool, keep: bool}
 *   {type:'query', id, handle, path: [step...], withEv}
 *   {type:'cancel', id}        stop a running solve after its current chunk; the result is still posted
 *   {type:'drop', handle}
 * Messages out:
 *   {type:'ready'}
 *   {type:'progress', id, iterations, exploit, ms}
 *   {type:'done', id, result}   result: summary + root + children (+ queries, library bytes, handle)
 *   {type:'error', id, error}
 */
(function () {
  'use strict';

  var enc = new TextEncoder(), dec = new TextDecoder();
  var now = (typeof performance !== 'undefined' && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };

  /* thin wrapper over the raw exports */
  function Core(module) {
    var inst = new WebAssembly.Instance(module, {});
    this.x = inst.exports;
  }
  Core.prototype._call = function (str, fn) {
    var b = enc.encode(str), x = this.x;
    var p = x.ff_alloc(b.length);
    new Uint8Array(x.memory.buffer, p, b.length).set(b);
    try { return fn(p, b.length); } finally { x.ff_free(p, b.length); }
  };
  Core.prototype._outBytes = function () {
    var x = this.x;
    return new Uint8Array(x.memory.buffer, x.ff_out_ptr(), x.ff_out_len()).slice();
  };
  Core.prototype._outText = function () { return dec.decode(this._outBytes()); };
  Core.prototype.create = function (configJson) {
    var x = this.x;
    var h = this._call(configJson, function (p, n) { return x.ff_new(p, n); });
    if (!h) throw new Error(this._outText());
    return h;
  };
  Core.prototype.iterate = function (h, n) { return this.x.ff_iterate(h, n); };
  Core.prototype.exploit = function (h) { return this.x.ff_exploit(h); };
  Core.prototype.memoryMb = function (h) { return this.x.ff_memory_mb(h); };
  Core.prototype.result = function (h, withEv) {
    if (!this.x.ff_result(h, withEv ? 1 : 0)) throw new Error('bad handle');
    return JSON.parse(this._outText());
  };
  Core.prototype.query = function (h, path, withEv) {
    var x = this.x;
    var ok = this._call(JSON.stringify(path || []), function (p, n) { return x.ff_query(h, p, n, withEv ? 1 : 0); });
    if (!ok) throw new Error(this._outText() || 'bad handle');
    return JSON.parse(this._outText());
  };
  Core.prototype.library = function (h, withEv) {
    if (!this.x.ff_library(h, withEv ? 1 : 0)) throw new Error('bad handle');
    return this._outBytes();
  };
  Core.prototype.drop = function (h) { this.x.ff_drop(h); };

  /* solve loop shared by worker and direct mode; post(msg) receives progress/done/error */
  function Runner(core) {
    this.core = core;
    this.cancelled = {};
  }
  Runner.prototype.solve = async function (msg, post) {
    var core = this.core, id = msg.id, h = 0;
    try {
      var cfg = JSON.parse(msg.config);
      var t0 = now();
      h = core.create(msg.config);
      var target = msg.targetExploit != null ? msg.targetExploit : (cfg.target_exploit != null ? cfg.target_exploit : 0.3);
      var maxMs = msg.maxMs != null ? msg.maxMs : Infinity;
      var maxIters = msg.maxIters != null ? msg.maxIters : (cfg.max_iters != null ? cfg.max_iters : 1000);
      var every = msg.checkEvery || cfg.check_every || 10;
      var iters = 0, e = Infinity, stopped = 'iters';
      while (iters < maxIters) {
        iters = core.iterate(h, Math.min(every, maxIters - iters));
        e = core.exploit(h);
        var ms = now() - t0;
        post({ type: 'progress', id: id, iterations: iters, exploit: e, ms: ms });
        if (e <= target) { stopped = 'target'; break; }
        if (ms >= maxMs) { stopped = 'time'; break; }
        // yield so cancel / query messages can arrive
        await new Promise(function (r) { setTimeout(r, 0); });
        if (this.cancelled[id]) { stopped = 'cancel'; break; }
      }
      delete this.cancelled[id];
      var res = core.result(h, msg.withEv !== false);
      res.exploit = e;
      res.target = target;
      res.converged = e <= target;
      res.stopped = stopped;
      res.ms = Math.round(now() - t0);
      if (msg.queries && msg.queries.length) {
        res.queries = msg.queries.map(function (q) {
          try { return core.query(h, q, msg.withEv !== false); } catch (err) { return { error: String(err.message || err) }; }
        });
      }
      if (msg.library) res.library = core.library(h, msg.withEv !== false);
      if (msg.keep) res.handle = h; else core.drop(h);
      post({ type: 'done', id: id, result: res });
    } catch (err) {
      if (h) core.drop(h);
      post({ type: 'error', id: id, error: String(err && err.message || err) });
    }
  };
  Runner.prototype.handle = function (msg, post) {
    var core = this.core;
    if (msg.type === 'solve') return this.solve(msg, post);
    if (msg.type === 'cancel') { this.cancelled[msg.id] = true; return; }
    if (msg.type === 'drop') { core.drop(msg.handle); return; }
    if (msg.type === 'query') {
      try { post({ type: 'done', id: msg.id, result: core.query(msg.handle, msg.path, msg.withEv !== false) }); }
      catch (err) { post({ type: 'error', id: msg.id, error: String(err.message || err) }); }
    }
  };

  async function moduleFrom(msg) {
    if (msg.module) return msg.module;
    if (msg.bytes) return WebAssembly.compile(msg.bytes);
    if (typeof fetch !== 'undefined' && msg.url && !/^[a-zA-Z]:\\|^\//.test(msg.url)) {
      return WebAssembly.compile(await (await fetch(msg.url)).arrayBuffer());
    }
    return WebAssembly.compile(require('fs').readFileSync(msg.url));
  }

  function serve(onMessage, post) {
    var runner = null, queue = [];
    onMessage(async function (msg) {
      if (msg.type === 'init') {
        try {
          runner = new Runner(new Core(await moduleFrom(msg)));
          post({ type: 'ready' });
          queue.splice(0).forEach(function (m) { runner.handle(m, post); });
        } catch (err) { post({ type: 'error', id: null, error: 'init: ' + (err.message || err) }); }
        return;
      }
      if (!runner) queue.push(msg); else runner.handle(msg, post);
    });
  }

  var isNode = typeof process !== 'undefined' && process.versions && process.versions.node && typeof require === 'function';
  if (isNode) {
    var wt = require('worker_threads');
    if (!wt.isMainThread && wt.parentPort) {
      serve(function (fn) { wt.parentPort.on('message', fn); }, function (m) {
        wt.parentPort.postMessage(m, m.result && m.result.library ? [m.result.library.buffer] : []);
      });
    } else if (typeof module === 'object' && module.exports) {
      module.exports = { Core: Core, Runner: Runner };
    }
  } else if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    serve(function (fn) { self.onmessage = function (ev) { fn(ev.data); }; }, function (m) {
      self.postMessage(m, m.result && m.result.library ? [m.result.library.buffer] : []);
    });
  }
})();
