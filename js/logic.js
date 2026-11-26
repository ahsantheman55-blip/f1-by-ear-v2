/* F1 by Ear 2 - pure game logic (no DOM, no audio). Works in browsers and Node. */
(function (root) {
  'use strict';
  var TR = (typeof module !== 'undefined' && module.exports) ? require('./tracks.js') : root.F1T;
  var KMH = 3.6;
  var PHYS = {
    vTop: 94,            // m/s, about 338 km/h
    accel0: 13.5, gripBase: 22, gripAero: 18, brakeBase: 26, brakeAero: 14, coastBase: 2.5, coastAero: 7,
    carLen: 5.0, carWid: 1.9,
    // modern F1: 8 gears. km/h at the 12,500 rpm limiter in each gear.
    gears: [110, 150, 185, 218, 250, 282, 314, 345],
    rpmMax: 12500, rpmIdle: 4200, rpmUp: 11900, rpmDown: 7600
  };
  var TRACKS = TR.TRACKS;

  function grip(v) { return PHYS.gripBase + PHYS.gripAero * Math.pow(v / PHYS.vTop, 2); }
  function brakeDecel(v) { return PHYS.brakeBase + PHYS.brakeAero * Math.pow(v / PHYS.vTop, 2); }
  function accelAt(v, top) { top = top || PHYS.vTop; var f = 1 - Math.pow(Math.min(v, top) / top, 2); return PHYS.accel0 * Math.max(0, f) + (v < 15 ? 2 : 0); }
  function coastDecel(v) { return PHYS.coastBase + PHYS.coastAero * Math.pow(v / PHYS.vTop, 2); }
  function cornerVmax(r, gs) {
    gs = gs || 1; if (!r) return PHYS.vTop * 1.2;
    var k = 1 / Math.abs(r), a = PHYS.gripAero * gs / (PHYS.vTop * PHYS.vTop);
    if (k <= a) return PHYS.vTop * 1.2;
    return Math.sqrt(PHYS.gripBase * gs / (k - a));
  }
  function brakeDist(v, vt, bs) { if (v <= vt) return 0; var b = (brakeDecel(vt) + brakeDecel(v)) / 2 * (bs || 1); return (v * v - vt * vt) / (2 * b); }

  // ---------- corner words ----------
  function dirWord(d) { return d > 0 ? 'right' : 'left'; }
  function partKind(p) {
    var kmh = p.vmax * KMH, ang = p.len / Math.abs(p.r) / Math.PI * 180;
    if (p.vmax >= PHYS.vTop) return ang < 22 ? 'kink' : 'flat';
    if (kmh < 72 && ang >= 120) return 'hairpin';
    if (kmh < 85) return 'tight';
    if (kmh < 140) return 'slow';
    if (kmh < 220) return 'medium';
    return 'fast';
  }
  function partPhrase(p, cap) {
    var d = dirWord(p.dir), s;
    switch (p.kind) {
      case 'hairpin': s = d + ' hairpin'; break;
      case 'kink': s = 'kink ' + d; break;
      case 'flat': s = 'fast ' + d; break;
      default: s = (p.long && p.kind !== 'tight' ? 'long ' : '') + p.kind + ' ' + d;
    }
    return cap ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  function describeGroup(g) {
    var P = g.parts, n = P.length, i, alt = true, same = true;
    for (i = 1; i < n; i++) { if (P[i].dir === P[i - 1].dir) alt = false; else same = false; }
    var slowish = P.every(function (p) { return /tight|slow|medium|hairpin/.test(p.kind); });
    if (n === 1) { g.kind = P[0].kind; return partPhrase(P[0], true); }
    if (n === 2 && alt) { g.kind = 'chicane'; return (slowish ? 'Chicane, ' : 'Fast chicane, ') + dirWord(P[0].dir) + ' then ' + dirWord(P[1].dir); }
    if (n >= 3 && alt) { g.kind = 'esses'; return 'Esses, ' + P.map(function (p) { return dirWord(p.dir); }).join(', '); }
    if (same) { g.kind = 'double'; var tight = P[n - 1].vmax < P[0].vmax * 0.85; return 'Double ' + dirWord(P[0].dir) + (tight ? ', tightens' : ''); }
    g.kind = 'combo';
    return partPhrase(P[0], true) + ', then ' + P.slice(1).map(function (p) { return partPhrase(p); }).join(', then ');
  }

  // Build per-metre arrays, corner groups, words and a description
  function buildTrack(id) {
    var T = TRACKS[id]; if (!T) throw new Error('no track ' + id);
    if (T._built) return T;
    T.laneW = T.laneW || 3.5;
    var L = 0, i, j;
    T.segs.forEach(function (s) { s.start = L; L += s.len; });
    T.length = L;
    var N = Math.ceil(L);
    T.kappa = new Float32Array(N); T.radius = new Float32Array(N); T.tunnel = new Uint8Array(N);
    T.segs.forEach(function (s) {
      for (j = Math.floor(s.start); j < Math.min(N, Math.ceil(s.start + s.len)); j++) { T.kappa[j] = s.r ? 1 / s.r : 0; T.radius[j] = s.r || 0; T.tunnel[j] = s.tunnel ? 1 : 0; }
    });
    T.halfW = T.lanes * T.laneW / 2;
    T.laneY = []; for (i = 0; i < T.lanes; i++) T.laneY.push(-T.halfW + T.laneW * (i + 0.5));
    T.kerbIn = T.halfW - 1.0; T.edge = T.halfW + 0.9; T.wall = T.edge + T.runoffW;
    var parts = [];
    T.segs.forEach(function (s) { if (s.r) parts.push({ start: s.start, len: s.len, r: s.r, dir: s.r > 0 ? 1 : -1, n: s.n, vmax: cornerVmax(s.r) }); });
    // merge same-direction pieces that join with no straight (one corner drawn as two arcs)
    var merged = [];
    parts.forEach(function (p) { var q = merged[merged.length - 1]; if (q && q.dir === p.dir && Math.abs(q.start + q.len - p.start) < 1 && Math.abs(q.r) > 150 && Math.abs(p.r) > 150) { q.len += p.len; q.vmax = Math.min(q.vmax, p.vmax); } else merged.push(p); });
    parts = merged;
    var groups = [], g = null;
    parts.forEach(function (p) {
      if (g && p.start - g.end < 60) { g.parts.push(p); g.end = p.start + p.len; }
      else { g = { parts: [p], start: p.start, end: p.start + p.len }; groups.push(g); }
    });
    groups.forEach(function (g, gi) {
      g.idx = gi; g.num = gi + 1;
      g.vmin = Math.min.apply(null, g.parts.map(function (p) { return p.vmax; }));
      g.name = g.parts.reduce(function (a, b) { return b.vmax < a.vmax ? b : a; }).n || ('Turn ' + g.num);
      g.parts.forEach(function (p) { p.kind = partKind(p); p.long = p.len > 170; p.sev = p.vmax >= PHYS.vTop ? 0 : (Math.abs(p.r) < 32 ? 3 : (p.vmax < 50 ? 2 : 1)); });
      g.sev = Math.max.apply(null, g.parts.map(function (p) { return p.sev; }));
      g.flat = g.vmin >= PHYS.vTop;
      g.words = describeGroup(g);
    });
    groups.forEach(function (g, gi) { var nx = groups[(gi + 1) % groups.length]; var gap = nx.start - g.end; if (gap < 0) gap += L; g.after = gap; });
    T.groups = groups;
    T.profiles = {};
    T.desc = describeTrack(T);
    T._built = true;
    return T;
  }
  var DIFFW = ['', 'gentle', 'moderate', 'demanding', 'hard', 'brutal'];
  function num(n, w, ws) { var words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']; return (n <= 10 ? words[n] : n) + ' ' + (n === 1 ? w : (ws || w + 's')); }
  function km(m) { return (m / 1000).toFixed(1) + ' kilometres'; }
  function describeTrack(T) {
    var c = { hairpin: 0, chicane: 0, esses: 0, fast: 0, slow: 0, double: 0 };
    T.groups.forEach(function (g) {
      if (g.kind === 'hairpin' || g.parts.some(function (p) { return p.kind === 'hairpin'; })) c.hairpin++;
      else if (g.kind === 'chicane') c.chicane++;
      else if (g.kind === 'esses') c.esses++;
      else if (g.kind === 'double') c.double++;
      else if (/fast|flat|kink/.test(g.kind)) c.fast++;
      else c.slow++;
    });
    var longest = 0; T.groups.forEach(function (g) { if (g.after > longest) longest = g.after; });
    var bits = [];
    if (c.hairpin) bits.push(num(c.hairpin, 'hairpin'));
    if (c.chicane) bits.push(num(c.chicane, 'chicane'));
    if (c.esses) bits.push(num(c.esses, 'set', 'sets') + ' of esses');
    if (c.double) bits.push(num(c.double, 'double corner'));
    if (c.fast) bits.push(num(c.fast, 'fast bend'));
    if (c.slow) bits.push(num(c.slow, 'slower corner'));
    var list = bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] : bits.join('');
    var lw = /barrier/i.test(T.blurb) ? '' : T.runoff === 'wall' ? 'Barriers right beside the track.' : 'Gravel run-off.';
    if (T.lanes === 3) lw += (lw ? ' ' : '') + 'Narrow, three lanes wide.';
    return {
      short: km(T.length) + ', ' + num(T.groups.length, 'corner') + ', ' + DIFFW[T.diff || 3] + '.',
      long: T.name + '. ' + km(T.length) + ' a lap, with ' + num(T.groups.length, 'corner') + ': ' + list + '. Longest straight ' + (Math.round(longest / 50) * 50) + ' metres. ' + T.blurb + ' ' + lw + ' Difficulty: ' + DIFFW[T.diff || 3] + '.',
      counts: c, longest: longest
    };
  }
  function profile(T, gs, bs, top) {
    var key = gs.toFixed(3) + '|' + bs.toFixed(3) + '|' + (top || 0).toFixed(2);
    if (T.profiles[key]) return T.profiles[key];
    var N = T.kappa.length, v = new Float32Array(N), i, k, pass;
    top = top || PHYS.vTop;
    for (i = 0; i < N; i++) v[i] = Math.min(top, cornerVmax(T.radius[i], gs));
    for (pass = 0; pass < 2; pass++) {
      for (k = 2 * N - 1; k >= 0; k--) { i = k % N; var nx = v[(i + 1) % N]; var b = brakeDecel(nx) * bs; var lim = Math.sqrt(nx * nx + 2 * b); if (v[i] > lim) v[i] = lim; }
      for (k = 0; k < 2 * N; k++) { i = k % N; var pv = v[(i - 1 + N) % N]; var a = accelAt(pv, top); var lim2 = Math.sqrt(pv * pv + 2 * a); if (v[i] > lim2) v[i] = lim2; }
    }
    T.profiles[key] = v; return v;
  }
  function rng(seed) { return TR.rng(seed); }

  // Rival drivers (fictional). pace 0..1, aggression (defending), consistency (fewer mistakes)
  var DRIVERS = [
    { name: 'Tomas Hartmann', pace: 0.95, aggr: 0.6, cons: 0.9 }, { name: 'Ade Okafor', pace: 0.9, aggr: 0.8, cons: 0.7 }, { name: 'Luca Bellini', pace: 0.85, aggr: 0.9, cons: 0.6 },
    { name: 'Freya Lindqvist', pace: 0.88, aggr: 0.4, cons: 0.95 }, { name: 'Jules Moreau', pace: 0.75, aggr: 0.5, cons: 0.8 }, { name: 'Kenji Tanaka', pace: 0.8, aggr: 0.3, cons: 0.9 },
    { name: 'Rafa Silva', pace: 0.7, aggr: 0.95, cons: 0.5 }, { name: 'Petra Novak', pace: 0.65, aggr: 0.5, cons: 0.85 }, { name: 'Kuba Kowalski', pace: 0.6, aggr: 0.7, cons: 0.6 },
    { name: 'Niamh Byrne', pace: 0.55, aggr: 0.6, cons: 0.75 }, { name: 'Ines Duarte', pace: 0.5, aggr: 0.4, cons: 0.7 }, { name: 'Sami Haddad', pace: 0.45, aggr: 0.8, cons: 0.5 }
  ];
  function surname(n) { var p = n.split(' '); return p[p.length - 1]; }
  // difficulty: rival grip scale = base + championship step + driver pace spread
  var DIFF = { easy: { k: 0.85, spread: 0.05, mistake: 0.12 }, medium: { k: 0.93, spread: 0.045, mistake: 0.07 }, hard: { k: 0.95, spread: 0.035, mistake: 0.035 } };

  function wrapS(T, s) { var L = T.length; s = s % L; return s < 0 ? s + L : s; }
  function idx(T, s) { var i = Math.floor(wrapS(T, s)); return i >= T.kappa.length ? T.kappa.length - 1 : i; }

  // ---------- Race ----------
  function Race(opts) {
    opts = opts || {};
    var T = buildTrack(opts.track || 'monza');
    var R = this;
    R.T = T; R.opts = opts; R.laps = opts.laps || 3; R.rand = rng(opts.seed || (Date.now() & 0xffffff));
    R.mode = opts.mode || 'race'; R.auto = !!opts.auto;
    R.t = 0; R.started = false; R.finished = false; R.events = [];
    R.diff = DIFF[opts.difficulty || 'medium'] || DIFF.medium;
    R.champBase = opts.champBase || 0;
    R.callSecs = opts.callSecs || function () { return 2.0; };
    var n = R.mode === 'race' ? Math.max(0, Math.min(11, opts.rivals == null ? 5 : opts.rivals)) : (opts.rivals || 0);
    R.cars = [];
    var grid = opts.grid || 'back';
    var total = n + 1, pslot = grid === 'pole' ? 0 : grid === 'middle' ? Math.floor(total / 2) : total - 1;
    // rival line-up: a fixed roster (championship) or a shuffled one
    var roster = opts.roster ? opts.roster.map(function (nm) { return DRIVERS.filter(function (d) { return d.name === nm; })[0]; }).filter(Boolean) : DRIVERS.slice();
    if (!opts.roster) for (var q = roster.length - 1; q > 0; q--) { var w = Math.floor(R.rand() * (q + 1)); var tmp = roster[q]; roster[q] = roster[w]; roster[w] = tmp; }
    roster = roster.slice(0, n);
    // grid order for rivals: fastest at the front, with a little shuffle
    roster.sort(function (a, b) { return (b.pace + R.rand() * 0.15) - (a.pace + R.rand() * 0.15); });
    var laneL = T.laneY[Math.max(0, Math.floor(T.lanes / 2) - 1)], laneR = T.laneY[Math.floor(T.lanes / 2)];
    var ri = 0;
    for (var slot = 0; slot < total; slot++) {
      var s0 = -8 - slot * 8, y0 = slot % 2 === 0 ? laneL : laneR;
      if (slot === pslot) { R.player = R.mkCar(true, 'You', s0, y0, 1); R.cars.push(R.player); }
      else {
        var d = roster[ri++];
        var k = Math.min(0.995, R.diff.k + R.champBase + R.diff.spread * (d.pace - 0.7));
        var c = R.mkCar(false, d.name, s0, y0, k); c.aggr = d.aggr; c.cons = d.cons; c.short = surname(d.name); R.cars.push(c);
      }
    }
    if (!R.player) { R.player = R.mkCar(true, 'You', -8, laneL, 1); R.cars.push(R.player); }
    R.input = { steer: 0, throttle: 0, brake: 0 };
    R.lastPos = R.position(); R.posPending = null;
    R.cueState = {}; R.lap = 0;
    R.notes = { offTrack: [], walls: 0, contacts: 0, crashes: 0, kerbT: 0, lapTimes: [], overtakes: 0 };
    R.lapStart = 0; R.contactCool = {};
    R.lapNotesCur = { off: {}, walls: 0, contacts: 0, entryErr: {} };
    R.fastest = null; R.rel = {}; R.cool = {};
    R.straightState = {};
  }
  Race.prototype.mkCar = function (isPlayer, name, s, y, k) {
    var T = this.T;
    var c = { player: isPlayer, name: name, short: name, s: s, y: y, v: 0, vy: 0, k: k, gear: 0, rpm: PHYS.rpmIdle, lap: 0, finished: false, finishT: 0, laneTarget: y,
      mistakeUntil: 0, contactT: -9, off: false, onKerb: 0, wallT: -9, slide: 0, gripUse: 0, shiftT: -9, lim: false, lapStartT: 0, crashUntil: 0, wideT: -9 };
    if (!isPlayer) { c.top = PHYS.vTop * (0.955 + 0.045 * k); c.prof = profile(T, k * k, k, c.top); }
    return c;
  };
  Race.prototype.progress = function (c) { return c.finished ? 1e9 - c.finishT : c.s; };
  Race.prototype.order = function () { var R = this; return R.cars.slice().sort(function (a, b) { return R.progress(b) - R.progress(a); }); };
  Race.prototype.position = function () { return this.order().indexOf(this.player) + 1; };
  Race.prototype.emit = function (type, data) { var e = data || {}; e.type = type; e.t = this.t; this.events.push(e); };
  Race.prototype.start = function () { this.started = true; this.startT = this.t; this.lapStart = this.t; this.cars.forEach(function (c) { c.lapStartT = 0; }); };
  Race.prototype.autoTarget = function (c) { var T = this.T; var p = profile(T, 0.9, 0.85); return p[idx(T, c.s + Math.max(5, c.v * 0.1))]; };

  Race.prototype.stepPlayer = function (dt) {
    var R = this, T = R.T, c = R.player, inp = R.input;
    if (!R.started || c.finished) { if (c.finished) c.v = Math.max(0, c.v - 8 * dt); this.gearbox(c, dt, R.started ? 0 : inp.throttle, 0); return; }
    if (c.crashUntil) {
      c.v = 0; c.thr = 0; c.brk = 0; c.slide = 0; c.gripUse = 0; this.gearbox(c, dt, 0, 0);
      if (R.t >= c.crashUntil) { c.crashUntil = 0; var sg = c.y >= 0 ? 1 : -1; c.y = sg * Math.max(0, T.halfW - 2.2); c.vy = 0; c.off = false; R.emit('recover', {}); }
      return;
    }
    var v = c.v, thr = inp.throttle, brk = inp.brake;
    if (R.cruise != null) {
      var vc = R.cruise; thr = 0; brk = 0;
      if (vc <= 0) brk = v > 0 ? 1 : 0; else if (v < vc - 0.5) thr = 1; else if (v > vc + 1) brk = Math.min(1, (v - vc) / 6); else thr = 0.35;
    } else if (R.auto) {
      var vt = R.autoTarget(c); thr = 0; brk = 0;
      if (v < vt - 0.5) thr = 1; else if (v > vt + 1.5) brk = Math.min(1, (v - vt) / 8); else thr = 0.4;
    }
    var top = PHYS.vTop * (1 + R.slip(c) * 0.04);
    var a = 0;
    if (brk > 0) a = -brakeDecel(v) * brk - coastDecel(v);
    else if (thr > 0) a = accelAt(v, top) * thr * (R.t - c.shiftT < 0.05 ? 0.6 : 1) - (v > top ? coastDecel(v) : 0);
    else a = -coastDecel(v);
    if (Math.abs(c.y) > T.edge) { a -= 14 + v * 0.25; if (v > 45) a -= 10; }
    c.v = Math.max(0, v + a * dt);
    c.thr = thr; c.brk = brk;
    this.lateral(c, inp.steer, dt);
    c.s += c.v * dt;
    this.gearbox(c, dt, thr, brk);
  };
  Race.prototype.slip = function (c) {
    var best = 0, R = this, who = null;
    for (var i = 0; i < R.cars.length; i++) {
      var o = R.cars[i]; if (o === c || o.finished) continue;
      var ds = o.s - c.s; if (ds < 7 || ds > 45) continue;
      var dy = Math.abs(o.y - c.y); if (dy > 1.6) continue;
      var f = (1 - (ds - 7) / 38) * (1 - dy / 1.6); if (f > best) { best = f; who = o; }
    }
    c.slipBy = who; c.slipF = best;
    return best;
  };
  Race.prototype.steerMax = function (v) { return 2.5 + 8.5 * Math.min(1, v / 50); };
  Race.prototype.lateral = function (c, steer, dt) {
    var R = this, T = R.T, v = c.v, i = idx(T, c.s), k = R.straight ? 0 : T.kappa[i];
    var smax = R.steerMax(v);
    var demand = v * v * Math.abs(k), g = grip(v), ratio = demand / g;
    var drift = 0, slide = 0;
    if (k) {
      drift = 0.55 * smax * Math.min(1, ratio);
      if (ratio > 1) { slide = ratio - 1; drift += smax * slide * 1.6; c.v = Math.max(0, c.v - Math.min(25, slide * 30) * dt); }
      drift *= (k > 0 ? -1 : 1);
    }
    c.gripUse = k ? ratio : 0;
    var eff = 1 / (1 + slide);
    if (Math.abs(c.y) > T.edge) eff *= 0.65;
    var vy = steer * smax * eff + drift;
    c.vy = vy; c.slide = slide;
    var ny = c.y + vy * dt, ay = Math.abs(ny);
    c.onKerb = ay > T.kerbIn && ay <= T.edge ? Math.min(1, (ay - T.kerbIn) / (T.edge - T.kerbIn) + 0.3) : 0;
    var wasOff = c.off; c.off = ay > T.edge;
    if (c.player && R.started) {
      if (c.off && !wasOff) { R.emit('off', { side: ny > 0 ? 1 : -1 }); R.noteOff(); }
      if (!c.off && wasOff) R.emit('rejoin', {});
      // drifting wide: near the edge and still moving outwards
      if (!c.off && ay > T.kerbIn - 0.4 && ny * vy > 0 && Math.abs(vy) > 0.9 && R.t - c.wideT > 2.5 && c.v > 12) { c.wideT = R.t; R.emit('wide', { side: ny > 0 ? 1 : -1 }); }
    }
    if (ay > T.wall) {
      var impact = Math.abs(vy) + c.v * 0.12;
      ny = (ny > 0 ? 1 : -1) * (T.wall - 0.4);
      if (c.player && R.started && c.v > 36 && impact > 8) {
        c.crashUntil = R.t + 3.0; c.v = 0; c.vy = 0; R.notes.crashes++; R.notes.walls++; R.lapNotesCur.walls++;
        R.emit('crash', { side: ny > 0 ? 1 : -1, impact: impact });
      } else {
        c.v *= T.runoff === 'wall' ? 0.5 : 0.6; c.vy = 0;
        if (R.t - c.wallT > 0.4) { c.wallT = R.t; if (c.player) { R.emit('wall', { side: ny > 0 ? 1 : -1, impact: impact }); R.lapNotesCur.walls++; R.notes.walls++; } }
      }
    }
    c.y = ny;
  };
  Race.prototype.noteOff = function () { var g = this.groupAt(this.player.s, 80); var nm = g ? g.name : 'a straight'; this.lapNotesCur.off[nm] = (this.lapNotesCur.off[nm] || 0) + 1; };
  Race.prototype.groupAt = function (s, slack) {
    var T = this.T, ws = wrapS(T, s);
    for (var i = 0; i < T.groups.length; i++) { var g = T.groups[i]; if (ws >= g.start - 30 && ws <= g.end + (slack || 0)) return g; }
    return null;
  };
  // 8-speed gearbox with real rpm. Upshift with an ignition cut, downshifts with a throttle blip, limiter bounce.
  Race.prototype.gearbox = function (c, dt, thr, brk) {
    var G = PHYS.gears, v = c.v * KMH, R = this;
    if (!R.started || c.crashUntil) {
      var target = PHYS.rpmIdle + (PHYS.rpmMax - PHYS.rpmIdle) * (thr || 0);
      c.rpm += (target - c.rpm) * Math.min(1, dt * (target > c.rpm ? 7 : 3));
      c.lim = false;
      if (c.rpm > PHYS.rpmMax - 120 && thr > 0.9) { c.lim = true; c.rpm = PHYS.rpmMax - ((R.t * 14) % 1 < 0.5 ? 0 : 650); }
      if (!R.started) c.gear = 0;
      return;
    }
    if (c.gear < 1) c.gear = 1;
    var rpmIn = function (g) { return v / G[g - 1] * PHYS.rpmMax; };
    var r = rpmIn(c.gear);
    if (r >= PHYS.rpmUp && c.gear < G.length && thr > 0.3 && R.t - c.shiftT > 0.12) {
      c.gear++; c.shiftT = R.t; if (c.player) R.emit('shift', { up: true, gear: c.gear });
    } else if (c.gear > 1 && R.t - c.shiftT > 0.11) {
      var low = (brk > 0.2 || thr < 0.1) ? PHYS.rpmDown : 5600;
      if (r < low && rpmIn(c.gear - 1) < PHYS.rpmUp - 200) { c.gear--; c.shiftT = R.t; if (c.player) R.emit('shift', { up: false, gear: c.gear, blip: brk > 0.2 }); }
    }
    r = rpmIn(c.gear);
    if (c.gear === 1 && thr > 0.3) r = Math.max(r, PHYS.rpmIdle + 4200 * thr); // clutch slip off the line
    r = Math.max(PHYS.rpmIdle, r);
    c.lim = false;
    if (r >= PHYS.rpmMax - 15 && thr > 0.5) { c.lim = true; r = PHYS.rpmMax - ((R.t * 14) % 1 < 0.5 ? 0 : 600); if (c.player && R.t - (c.limT || -9) > 4) { c.limT = R.t; R.emit('limiter', {}); } }
    r = Math.min(PHYS.rpmMax, r);
    var justShifted = R.t - c.shiftT < 0.02;
    c.rpm += (r - c.rpm) * (justShifted ? 1 : Math.min(1, dt * 30));
  };
  // rivals
  Race.prototype.stepRival = function (c, dt) {
    var R = this, T = R.T, p = R.player;
    if (!R.started) { c.rpm += (PHYS.rpmIdle + 2500 - c.rpm) * dt * 3; return; }
    if (c.finished) { c.v = Math.max(20, c.v - 4 * dt); c.s += c.v * dt; R.gearbox(c, dt, 0, 0); return; }
    if (c.fixedV != null) { c.v += (c.fixedV - c.v) * Math.min(1, dt * 2); c.thr = 1; c.s += c.v * dt; R.gearbox(c, dt, 1, 0); return; }
    var look = Math.max(4, c.v * 0.05);
    var vt = c.prof[idx(T, c.s + look)];
    if (R.t < c.mistakeUntil) vt *= 0.72;
    var ahead = null, gap = 1e9, i, o;
    for (i = 0; i < R.cars.length; i++) {
      o = R.cars[i]; if (o === c) continue;
      var ds = o.s - c.s; if (ds <= 0 || ds > 40) continue;
      if (Math.abs(o.y - c.y) < 2.4 && ds < gap) { gap = ds; ahead = o; }
    }
    if (ahead && (ahead.v < vt || gap < 15)) {
      var bestLane = null, bestScore = -1e9;
      for (i = 0; i < T.laneY.length; i++) {
        var ly = T.laneY[i]; if (Math.abs(ly - c.y) < 1) continue;
        var free = true;
        for (var j = 0; j < R.cars.length; j++) { o = R.cars[j]; if (o === c) continue; var d2 = o.s - c.s; if (d2 > -12 && d2 < 30 && Math.abs(o.y - ly) < 2.6) { free = false; break; } }
        if (free) { var sc = -Math.abs(ly - c.y); if (sc > bestScore) { bestScore = sc; bestLane = ly; } }
      }
      if (bestLane !== null && Math.abs(c.laneTarget - c.y) < 0.5) c.laneTarget = bestLane;
      if (gap < 18 && Math.abs(c.laneTarget - c.y) < 1.2) vt = Math.min(vt, ahead.v + (gap - 9) * 0.6);
    }
    // defending: the player is close behind on a straight, so move across to cover their lane
    var behind = c.s - p.s;
    if (!p.finished && !p.crashUntil && behind > 9 && behind < 32 && Math.abs(p.y - c.y) > 1.6 && R.t > (c.defendT || 0) && !T.kappa[idx(T, c.s)] && !T.kappa[idx(T, c.s + 120)] && R.rand() < (c.aggr || 0.5) * dt * 1.5) {
      var near = T.laneY.reduce(function (a, b) { return Math.abs(b - p.y) < Math.abs(a - p.y) ? b : a; });
      var clear = true;
      for (i = 0; i < R.cars.length; i++) { o = R.cars[i]; if (o === c || o === p) continue; var d3 = o.s - c.s; if (Math.abs(d3) < 14 && Math.abs(o.y - near) < 2.6) clear = false; }
      if (clear) { c.laneTarget = near; c.defendT = R.t + 7; R.emit('defend', { name: c.short }); }
    }
    var a;
    if (c.v < vt) a = Math.min(accelAt(c.v, c.top * (1 + R.slip(c) * 0.03)) * (0.9 + 0.1 * c.k), (vt - c.v) * 4 + 1);
    else a = -Math.min(brakeDecel(c.v) * c.k, (c.v - vt) * 6 + 1);
    c.v = Math.max(0, c.v + a * dt);
    c.thr = a > 0 ? 1 : 0;
    var dy = c.laneTarget - c.y, ls = 3.2;
    c.y += Math.max(-ls * dt, Math.min(ls * dt, dy));
    c.s += c.v * dt;
    R.gearbox(c, dt, c.thr, a < 0 ? 1 : 0);
  };
  Race.prototype.contacts = function () {
    var R = this, p = R.player;
    if (!R.started || p.finished) return;
    for (var i = 0; i < R.cars.length; i++) {
      var o = R.cars[i]; if (o === p) continue;
      var ds = o.s - p.s, dy = o.y - p.y;
      if (Math.abs(ds) < PHYS.carLen && Math.abs(dy) < PHYS.carWid) {
        var key = o.name; if (R.t - (R.contactCool[key] || -9) < 0.6) continue;
        R.contactCool[key] = R.t;
        var rel = Math.abs(p.v - o.v), side = Math.abs(dy) > 0.9 && Math.abs(ds) < PHYS.carLen * 0.8;
        if (side) { var push = dy > 0 ? -1 : 1; p.y += push * 0.7; o.y -= push * 0.7; o.laneTarget = o.y; p.v *= 0.95; o.v *= 0.95; }
        else if (ds > 0) { p.v = Math.max(0, Math.min(p.v, o.v) - 4); o.v += 1; }
        else { o.v = Math.max(0, Math.min(o.v, p.v) - 4); }
        R.notes.contacts++; R.lapNotesCur.contacts++;
        R.emit('contact', { name: o.short, side: dy > 0 ? 1 : -1, ahead: ds > 0, impact: rel + (side ? 4 : 2) });
      }
    }
  };
  Race.prototype.step = function (dt) {
    var R = this, T = R.T, L = T.length, p = R.player, i;
    R.t += dt;
    R.stepPlayer(dt);
    for (i = 0; i < R.cars.length; i++) if (!R.cars[i].player) R.stepRival(R.cars[i], dt);
    R.contacts();
    if (!R.started) return;
    for (i = 0; i < R.cars.length; i++) {
      var c = R.cars[i];
      var lapNow = Math.floor(c.s / L);
      if (lapNow > c.lap && R.straight) c.lap = lapNow;
      if (lapNow > c.lap) {
        c.lap = lapNow;
        var lt = R.t - (c.lapStartT || 0); c.lapStartT = R.t;
        if (R.mode === 'race' && c.lap >= 2 && (!R.fastest || lt < R.fastest.t)) { R.fastest = { name: c.short, t: lt, player: c.player }; R.emit('fastest', { name: c.short, t: lt, player: c.player, lap: c.lap }); }
        if (!c.player && R.rand() < R.diff.mistake * (1.6 - (c.cons || 0.7)) * 3) c.mistakeLap = true;
        if (R.mode === 'race' && !c.finished && c.lap >= R.laps) { c.finished = true; c.finishT = R.t; if (c.player) R.finishRace(); else R.emit('rivalFinish', { name: c.short }); }
        else if (c.player) R.playerLap();
      }
      if (!c.player && c.mistakeLap) {
        var g = R.groupAt(c.s, 0);
        if (g && !g.flat) { c.mistakeLap = false; c.mistakeUntil = R.t + 0.8 + R.rand() * 1.0; c.laneTarget = c.laneTarget > 0 ? T.laneY[T.laneY.length - 1] : T.laneY[0]; R.emit('rivalMistake', { name: c.short, corner: g.name, dist: c.s - p.s }); }
      }
    }
    if (!R.straight) { R.cornerCues(); R.straightCues(); }
    R.passes();
    // slipstream
    if (p.slipF > 0.45 && p.v > 50 && !p.finished) { p.slipT = (p.slipT || 0) + dt; if (p.slipT > 0.7 && R.t - (R.cool.slip || -99) > 12) { R.cool.slip = R.t; R.emit('slip', { name: p.slipBy.short }); } } else p.slipT = 0;
    var pos = R.position();
    if (pos !== R.lastPos && !p.finished) {
      if (!R.posPending || R.posPending.pos !== pos) R.posPending = { pos: pos, t: R.t };
      else if (R.t - R.posPending.t > 1.2) { var gained = pos < R.lastPos; R.lastPos = pos; R.posPending = null; R.emit('position', { pos: pos, gained: gained }); }
    } else R.posPending = null;
  };
  // overtakes and being overtaken, with hysteresis so side-by-side running does not chatter
  Race.prototype.passes = function () {
    var R = this, p = R.player;
    if (p.finished || R.t - R.startT < 2) return;
    for (var i = 0; i < R.cars.length; i++) {
      var o = R.cars[i]; if (o === p || o.finished) continue;
      var d = p.s - o.s, st = R.rel[o.name];
      if (st == null) { R.rel[o.name] = d > 0 ? 1 : -1; continue; }
      if (st < 0 && d > 6) { R.rel[o.name] = 1; R.notes.overtakes++; R.emit('overtake', { name: o.short, lapped: d > R.T.length * 0.5 }); }
      else if (st > 0 && d < -6) { R.rel[o.name] = -1; R.emit('overtaken', { name: o.short }); }
    }
  };
  // gaps (seconds) to the car ahead and behind
  Race.prototype.gaps = function () {
    var R = this, ord = R.order(), i = ord.indexOf(R.player), p = R.player, v = Math.max(25, p.v);
    var a = ord[i - 1], b = ord[i + 1];
    return { ahead: a && !a.finished ? { name: a.short, t: (a.s - p.s) / Math.max(25, a.v) } : null, behind: b ? { name: b.short, t: (p.s - b.s) / v } : null };
  };
  Race.prototype.playerLap = function () {
    var R = this, p = R.player, lt = R.t - R.lapStart;
    if (p.lap >= 1) R.notes.lapTimes.push(lt);
    var noteCur = R.lapNotesCur; R.lapNotesCur = { off: {}, walls: 0, contacts: 0, entryErr: {} };
    R.lapStart = R.t;
    if (p.lap >= 1) R.emit('lap', { lap: p.lap + 1, laps: R.laps, pos: R.position(), lapTime: lt, final: R.mode === 'race' && p.lap + 1 === R.laps, notes: noteCur });
  };
  Race.prototype.finishRace = function () {
    var R = this;
    R.notes.lapTimes.push(R.t - R.lapStart);
    R.finished = true;
    R.results = R.computeResults();
    R.emit('finish', { pos: R.results.filter(function (r) { return r.player; })[0].pos, results: R.results });
  };
  Race.prototype.computeResults = function () {
    var R = this, L = R.T.length, end = R.laps * L;
    var rows = R.cars.map(function (c) {
      var t;
      if (c.finished) t = c.finishT; else { var rem = end - c.s; t = R.t + rem / Math.max(20, c.v || 40); }
      return { name: c.player ? 'You' : c.name, short: c.short, player: c.player, time: t - (R.startT || 0) };
    });
    rows.sort(function (a, b) { return a.time - b.time; });
    var lead = rows[0].time;
    rows.forEach(function (r, i) { r.pos = i + 1; r.gap = r.time - lead; });
    return rows;
  };
  // Spoken corner calls: early enough to finish speaking before the braking point.
  Race.prototype.cornerCues = function () {
    var R = this, T = R.T, p = R.player, L = T.length;
    if (p.finished || p.crashUntil) return;
    var ws = wrapS(T, p.s), lapIdx = Math.floor(p.s / L), v = Math.max(p.v, 8);
    for (var i = 0; i < T.groups.length; i++) {
      var g = T.groups[i];
      var d = g.start - ws; if (d < -5) d += L;
      if (d > 1500) continue;
      var key = g.idx + ':' + (g.start < ws - 5 ? lapIdx + 1 : lapIdx);
      var st = R.cueState[key] || (R.cueState[key] = {});
      var bd = brakeDist(v, g.vmin * 0.97, 0.9);
      var needBrake = !g.flat && v > g.vmin * 1.03;
      var lead = R.callSecs(g) + 0.55 + 0.5;
      var callD = Math.max(g.flat ? 110 : 150, bd + v * lead);
      if (!st.call && d <= callD && d > 0) { st.call = true; R.emit('cue', { group: g, dist: d, needBrake: needBrake, drop: g.vmin / v, key: key, bd: bd }); }
      if (!R.auto && needBrake && !st.brake && st.call && d > 0 && d <= bd + v * 0.55) { st.brake = true; R.emit('brakeCue', { group: g, dist: d, key: key }); }
      if (!st.tc && d <= Math.max(4, v * 0.5) && d > -5) { st.tc = true; R.emit('turnCall', { group: g, part: g.parts[0], k: 0, key: key }); }
      if (!st.turn && d <= Math.max(3, v * 0.12) && d > -5) { st.turn = true; R.emit('turnIn', { group: g, part: g.parts[0] }); if (!g.flat && v > g.vmin * 1.12) R.lapNotesCur.entryErr[g.name] = 1; }
      if (st.tc) {
        for (var k = 1; k < g.parts.length; k++) {
          var pd = g.parts[k].start - ws; if (pd < -5) pd += L;
          if (!st['c' + k] && pd <= Math.max(4, v * 0.5) && pd > -5) { st['c' + k] = true; R.emit('turnCall', { group: g, part: g.parts[k], k: k, key: key }); }
          if (!st['p' + k] && pd <= Math.max(3, v * 0.12) && pd > -5) { st['p' + k] = true; R.emit('turnIn', { group: g, part: g.parts[k] }); }
        }
      }
    }
    if (R.t % 5 < 0.01) { for (var kk in R.cueState) { if (+kk.split(':')[1] < lapIdx - 1) delete R.cueState[kk]; } }
  };
  Race.prototype.straightCues = function () {
    var R = this, T = R.T, p = R.player, ws = wrapS(T, p.s), lapIdx = Math.floor(p.s / T.length);
    for (var i = 0; i < T.groups.length; i++) {
      var g = T.groups[i]; if (g.after < 500) continue;
      var d = ws - g.end; if (d < 0 || d > 40) continue;
      var key = i + ':' + lapIdx; if (R.straightState[key]) continue;
      R.straightState[key] = 1; R.emit('straight', { len: g.after, group: g });
    }
  };
  Race.prototype.drain = function () { var e = this.events; this.events = []; return e; };
  function lapNotes(n) {
    var bits = [], offs = Object.keys(n.off);
    if (!offs.length && !n.walls && !n.contacts) bits.push('A clean lap.');
    if (offs.length) bits.push('Off the track at ' + list(offs) + '.');
    if (n.walls) bits.push(n.walls === 1 ? 'One wall hit.' : n.walls + ' wall hits.');
    if (n.contacts) bits.push(n.contacts === 1 ? 'One contact with a car.' : n.contacts + ' contacts with cars.');
    var hot = Object.keys(n.entryErr).filter(function (x) { return offs.indexOf(x) >= 0; });
    if (hot.length) bits.push('Brake earlier for ' + list(hot) + '.');
    return bits.join(' ');
  }
  function list(a) { a = a.slice(0, 3); return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function fmtTime(t) { if (!isFinite(t)) return '--'; var m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ' minute' + (m > 1 ? 's ' : ' ') : '') + s.toFixed(1) + ' seconds'; }
  function fmtShort(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
  var POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  var api = { PHYS: PHYS, TRACKS: TRACKS, CHAMPS: TR.CHAMPS, ORDER: TR.ORDER, DRIVERS: DRIVERS, POINTS: POINTS, buildTrack: buildTrack, profile: profile, cornerVmax: cornerVmax, brakeDist: brakeDist,
    Race: Race, wrapS: wrapS, idx: idx, KMH: KMH, lapNotes: lapNotes, fmtTime: fmtTime, fmtShort: fmtShort, DIFF: DIFF, accelAt: accelAt, rng: rng, dirWord: dirWord, partPhrase: partPhrase, surname: surname };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.F1L = api;
})(this);
