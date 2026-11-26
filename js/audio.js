/* F1 by Ear 2 - Web Audio engine. Real recordings (Freesound, CC0 / CC BY) for engines and surfaces,
   a light synthesised layer that follows the gearbox, shift crackles, downshift blips, limiter,
   slipstream wind and tyre squeal that grows as you near the grip limit. Short tones for optional cues. */
(function (root) {
  'use strict';
  var META = { eng_lo: { loopStart: 0.15, loopEnd: 5.3486, f0: 247.6 }, eng_hi: { loopStart: 0.15, loopEnd: 1.7234, f0: 409.1 }, rival: { loopStart: 0.15, loopEnd: 1.2916, f0: 504.3 },
    kerb: { loopStart: 0.15, loopEnd: 6.9 }, gravel: { loopStart: 0.15, loopEnd: 11.7 }, squeal: { loopStart: 0.15, loopEnd: 3.9 }, crowd: { loopStart: 0.15, loopEnd: 9.9 },
    crash: {}, clank: {}, cheer: {}, horns: {} };
  var FILES = Object.keys(META);
  var fetched = {};
  function prefetch(base) {
    base = base || 'audio/';
    FILES.forEach(function (k) {
      if (fetched[k]) return;
      fetched[k] = fetch(base + k + '.mp3').then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); }).catch(function () { return null; });
    });
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  // V6 four-stroke: three firing pulses per revolution, so the note is rpm / 20 Hz (4,200 rpm = 210 Hz, 12,500 rpm = 625 Hz)
  function pitchFor(rpm) { return rpm / 20; }

  function Sound() {
    this.ctx = null; this.buf = {}; this.ready = false; this.failed = []; this.vol = { master: 0.9, engine: 0.8, rivals: 0.8, cues: 0.9, crowd: 0.6 };
    this.rv = []; this.started = false; this.lastShift = 0;
  }
  Sound.prototype.unlock = function () {
    var self = this;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    if (!this.ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return Promise.resolve(false);
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this.ctx = new AC(); }
      this.build();
    }
    try { var b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); } catch (e) {}
    if (!this.silentEl && !navigator.audioSession && typeof Audio !== 'undefined') {
      try { var el = new Audio('audio/silence.mp3'); el.loop = true; el.volume = 0.01; el.setAttribute('playsinline', ''); var p = el.play(); if (p && p.catch) p.catch(function () {}); this.silentEl = el; } catch (e) {}
    }
    var r = this.ctx.state === 'suspended' && this.ctx.resume ? this.ctx.resume() : Promise.resolve();
    return Promise.resolve(r).then(function () { return self.load(); }).then(function () { return true; }, function () { return true; });
  };
  Sound.prototype.load = function () {
    var self = this; if (this.loading) return this.loading;
    prefetch();
    this.loading = Promise.all(FILES.map(function (k) {
      return fetched[k].then(function (ab) {
        if (!ab) { self.failed.push(k); return; }
        return new Promise(function (res) {
          var done = false;
          var ok = function (b) { if (done) return; done = true; self.buf[k] = b; res(); };
          var bad = function () { if (done) return; done = true; self.failed.push(k); res(); };
          try { var p = self.ctx.decodeAudioData(ab.slice(0), ok, bad); if (p && p.then) p.then(ok, bad); } catch (e) { bad(); }
          setTimeout(bad, 8000);
        });
      });
    })).then(function () { self.ready = true; self.startLoops(); });
    return this.loading;
  };
  Sound.prototype.build = function () {
    var c = this.ctx, self = this;
    this.comp = c.createDynamicsCompressor();
    try { this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 5; this.comp.attack.value = 0.004; this.comp.release.value = 0.2; } catch (e) {}
    this.master = c.createGain(); this.master.gain.value = this.vol.master;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.duck = c.createGain(); this.duck.connect(this.master);
    this.cueBus = c.createGain(); this.cueBus.gain.value = this.vol.cues; this.cueBus.connect(this.master);
    // own car: recordings + synth layer -> lowpass -> gain -> pan
    this.ePan = this.pan(); this.ePan.connect(this.duck);
    this.eGain = c.createGain(); this.eGain.gain.value = 0; this.eGain.connect(this.ePan);
    this.eLP = c.createBiquadFilter(); this.eLP.type = 'lowpass'; this.eLP.frequency.value = 4000; this.eLP.Q.value = 0.7; this.eLP.connect(this.eGain);
    this.gLo = c.createGain(); this.gHi = c.createGain(); this.gLo.connect(this.eLP); this.gHi.connect(this.eLP);
    // synth layer: a buzzy fundamental, a growl an octave down and a bright second harmonic, softly clipped
    this.syn = c.createGain(); this.syn.gain.value = 0;
    this.synShape = c.createWaveShaper(); this.synShape.curve = this.curve(2.2);
    this.synShape.connect(this.syn); this.syn.connect(this.eLP);
    this.oscs = [['sawtooth', 1, 0.5], ['square', 0.5, 0.28], ['sawtooth', 2.003, 0.18]].map(function (d) {
      var o = c.createOscillator(); o.type = d[0]; o.frequency.value = 210 * d[1]; var g = c.createGain(); g.gain.value = d[2]; o.connect(g); g.connect(self.synShape); o.start(); return { o: o, m: d[1] };
    });
    // tunnel echo
    this.verb = c.createConvolver(); this.verb.buffer = this.ir(1.6); this.verbGain = c.createGain(); this.verbGain.gain.value = 0;
    this.eGain.connect(this.verbGain); this.verbGain.connect(this.verb); this.verb.connect(this.duck);
    ['kerb', 'gravel', 'squeal'].forEach(function (k) { var g = c.createGain(); g.gain.value = 0; var p = self.pan(); g.connect(p); p.connect(self.duck); self[k + 'G'] = g; self[k + 'P'] = p; });
    this.crowdG = c.createGain(); this.crowdG.gain.value = 0; this.crowdG.connect(this.duck);
    // wind: rushing air that grows with speed, plus a hollow roar in the slipstream
    this.windG = c.createGain(); this.windG.gain.value = 0; this.windF = c.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 700; this.windF.Q.value = 0.6;
    this.windF.connect(this.windG); this.windG.connect(this.duck);
    this.rivalBus = c.createGain(); this.rivalBus.gain.value = this.vol.rivals; this.rivalBus.connect(this.duck);
    this.fxBus = c.createGain(); this.fxBus.gain.value = 1; this.fxPan = this.pan(); this.fxBus.connect(this.fxPan); this.fxPan.connect(this.duck);
  };
  Sound.prototype.curve = function (k) { var n = 1024, a = new Float32Array(n); for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; a[i] = Math.tanh(k * x) / Math.tanh(k); } return a; };
  Sound.prototype.pan = function () {
    var c = this.ctx;
    if (c.createStereoPanner) return c.createStereoPanner();
    var p = c.createPanner(); p.panningModel = 'equalpower'; p._fake = true; return p;
  };
  function setPan(p, v, t) {
    v = clamp(v, -1, 1);
    if (p.pan) p.pan.setTargetAtTime(v, t, 0.015);
    else if (p.setPosition) p.setPosition(v, 0, 1 - Math.abs(v));
  }
  Sound.prototype.ir = function (sec) {
    var c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3) * (i < 300 ? 0 : 1); }
    return b;
  };
  Sound.prototype.noiseBuf = function (sec) {
    var c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), last = 0;
    for (var i = 0; i < n; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last * 1.8; }
    return b;
  };
  Sound.prototype.loopSrc = function (k, dest, offset) {
    var c = this.ctx, s = c.createBufferSource();
    if (this.buf[k]) {
      s.buffer = this.buf[k]; s.loop = true;
      var m = META[k]; if (m.loopEnd && m.loopEnd < s.buffer.duration) { s.loopStart = m.loopStart; s.loopEnd = m.loopEnd; }
    } else { s.buffer = this.synthLoop(k); s.loop = true; }
    s.connect(dest);
    var off = offset || (this.buf[k] && META[k].loopStart) || 0;
    try { s.start(0, off); } catch (e) { s.start(0); }
    return s;
  };
  Sound.prototype.synthLoop = function (k) {
    var c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * 1), b = c.createBuffer(1, n, sr), d = b.getChannelData(0), i;
    if (k === 'eng_lo' || k === 'eng_hi' || k === 'rival') {
      var f = Math.round(k === 'eng_lo' ? 248 : k === 'eng_hi' ? 409 : 504);
      for (i = 0; i < n; i++) { var ph = (i * f / sr) % 1; d[i] = 0.5 * (2 * ph - 1) + 0.3 * Math.sin(2 * Math.PI * ph * 2) + 0.1 * (Math.random() * 2 - 1); }
    } else for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (k === 'kerb' ? (Math.sin(i / sr * 2 * Math.PI * 30) > 0 ? 0.6 : 0.1) : 0.4);
    return b;
  };
  Sound.prototype.startLoops = function () {
    if (this.started || !this.ctx) return; this.started = true;
    this.sLo = this.loopSrc('eng_lo', this.gLo); this.sHi = this.loopSrc('eng_hi', this.gHi);
    this.kerbS = this.loopSrc('kerb', this.kerbG); this.gravelS = this.loopSrc('gravel', this.gravelG); this.squealS = this.loopSrc('squeal', this.squealG);
    this.crowdS = this.loopSrc('crowd', this.crowdG);
    var w = this.ctx.createBufferSource(); w.buffer = this.noiseBuf(2.5); w.loop = true; w.connect(this.windF); w.start(0); this.windS = w;
  };
  Sound.prototype.setRivalCount = function (n) {
    var c = this.ctx; if (!c) return;
    while (this.rv.length < n) {
      var v = { g: c.createGain(), lp: c.createBiquadFilter(), p: this.pan(), det: 0.94 + 0.12 * Math.random(), dop: 1 };
      v.g.gain.value = 0; v.lp.type = 'lowpass'; v.lp.frequency.value = 5000;
      v.lp.connect(v.g); v.g.connect(v.p); v.p.connect(this.rivalBus);
      var len = (META.rival.loopEnd - META.rival.loopStart);
      v.s = this.loopSrc('rival', v.lp, META.rival.loopStart + Math.random() * len * 0.9);
      this.rv.push(v);
    }
    for (var i = n; i < this.rv.length; i++) this.rv[i].g.gain.setTargetAtTime(0, c.currentTime, 0.05);
  };
  // Per-frame update. st = {rpm (real rpm), thr, lim, pan, speed, kerb, kerbSide, off, offSide, slide, grip, slip, tunnel, crowd, running}
  Sound.prototype.update = function (st, rivals) {
    var c = this.ctx; if (!c || !this.started) return;
    var t = c.currentTime, tc = 0.02;
    var hz = pitchFor(st.rpm);
    var sharp = t - this.lastShift < 0.03 ? 0.004 : 0.012; // the rev drop on a gear change is instant
    var x = clamp((hz - 330) / 190, 0, 1);
    var mLo = this.buf.eng_lo ? META.eng_lo.f0 : 248, mHi = this.buf.eng_hi ? META.eng_hi.f0 : 409;
    this.sLo.playbackRate.setTargetAtTime(hz / mLo, t, sharp);
    this.sHi.playbackRate.setTargetAtTime(hz / mHi, t, sharp);
    for (var o = 0; o < this.oscs.length; o++) this.oscs[o].o.frequency.setTargetAtTime(hz * this.oscs[o].m, t, sharp);
    this.gLo.gain.setTargetAtTime(Math.cos(x * Math.PI / 2), t, tc);
    this.gHi.gain.setTargetAtTime(Math.sin(x * Math.PI / 2) * 0.9, t, tc);
    var r01 = clamp((st.rpm - 4200) / 8300, 0, 1);
    this.syn.gain.setTargetAtTime(st.running ? (0.05 + 0.1 * st.thr + 0.06 * r01) : 0, t, tc);
    var cut = t - this.lastShift < 0.05 && this.lastShiftUp ? 0.3 : 1;
    var limCut = st.lim ? 0.75 : 1;
    var eg = st.running ? (0.3 + 0.38 * st.thr + 0.2 * r01) * this.vol.engine * cut * limCut : 0;
    this.eGain.gain.setTargetAtTime(eg, t, cut < 1 ? 0.006 : tc);
    this.eLP.frequency.setTargetAtTime(1200 + 4800 * st.thr + 3000 * r01 - (st.tunnel ? 600 : 0), t, 0.03);
    setPan(this.ePan, st.pan, t); setPan(this.fxPan, st.pan, t);
    this.verbGain.gain.setTargetAtTime(st.tunnel ? 0.55 : 0, t, 0.25);
    var sp = clamp(st.speed / 60, 0, 1.6);
    this.kerbG.gain.setTargetAtTime(st.kerb * clamp(st.speed / 25, 0, 1) * 0.9, t, 0.02);
    this.kerbS.playbackRate.setTargetAtTime(0.55 + sp * 0.7, t, 0.05); setPan(this.kerbP, st.kerbSide * 0.75, t);
    this.gravelG.gain.setTargetAtTime(st.off ? clamp(st.speed / 18, 0.15, 1) * 0.95 : 0, t, 0.03);
    this.gravelS.playbackRate.setTargetAtTime(0.75 + sp * 0.45, t, 0.05); setPan(this.gravelP, st.offSide * 0.6, t);
    // tyres: a faint hiss from 80% of the grip, a proper squeal at the limit, a scream when sliding
    var g = st.grip || 0, sq = 0;
    if (st.slide > 0.04) sq = clamp(0.3 + st.slide * 1.8, 0.3, 0.7);
    else if (g > 0.8 && st.speed > 12) sq = (g - 0.8) / 0.2 * 0.28;
    this.squealG.gain.setTargetAtTime(sq, t, 0.04); setPan(this.squealP, st.pan, t);
    this.squealS.playbackRate.setTargetAtTime(0.85 + clamp(g, 0, 1.4) * 0.2, t, 0.05);
    this.crowdG.gain.setTargetAtTime((st.crowd || 0) * this.vol.crowd * 0.55, t, 0.4);
    var wind = st.running ? clamp(st.speed / 90, 0, 1.1) * 0.12 + (st.slip || 0) * 0.22 : 0;
    this.windG.gain.setTargetAtTime(wind * this.vol.engine, t, 0.15);
    this.windF.frequency.setTargetAtTime(500 + st.speed * 9 - (st.slip || 0) * 300, t, 0.2);
    for (var i = 0; i < this.rv.length; i++) {
      var v = this.rv[i], r = rivals && rivals[i];
      if (!r) { v.g.gain.setTargetAtTime(0, t, 0.05); continue; }
      var dist = Math.sqrt(r.ds * r.ds + r.dy * r.dy * 2.2);
      var gg = 1 / (1 + Math.pow(dist / 11, 1.7));
      if (r.ds < 0) gg *= 0.85;
      gg *= (0.55 + 0.45 * (r.thr == null ? 1 : r.thr));
      var dop = 1 + clamp(r.closing / 343, -0.18, 0.18);
      v.dop += (dop - v.dop) * 0.25;
      v.s.playbackRate.setTargetAtTime(pitchFor(r.rpm) / (this.buf.rival ? META.rival.f0 : 504) * v.det * v.dop, t, 0.02);
      v.g.gain.setTargetAtTime(gg * 0.85, t, 0.03);
      v.lp.frequency.setTargetAtTime(r.ds < 0 ? 2200 + 2500 * gg : 3500 + 5000 * gg, t, 0.05);
      setPan(v.p, r.dy / (2.2 + 0.22 * Math.abs(r.ds)), t);
    }
  };
  // gear changes: upshift = ignition cut and a crackle; downshift = throttle blip and pops
  Sound.prototype.shift = function (up, blip) {
    var c = this.ctx; if (!c || !this.started) return;
    this.lastShift = c.currentTime; this.lastShiftUp = up;
    if (up) { this.pops(3, 2600, 0.22, 0.018); }
    else {
      var t = c.currentTime; this.eGain.gain.setTargetAtTime(this.eGain.gain.value * 1.35, t, 0.01);
      if (blip) this.pops(2 + Math.floor(Math.random() * 3), 700, 0.3, 0.035);
    }
  };
  Sound.prototype.pops = function (n, fc, gain, gap) {
    var c = this.ctx, t0 = c.currentTime + 0.01;
    if (!this._pop) { var len = Math.floor(c.sampleRate * 0.02); this._pop = c.createBuffer(1, len, c.sampleRate); var d = this._pop.getChannelData(0); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    for (var k = 0; k < n; k++) {
      var s = c.createBufferSource(); s.buffer = this._pop; s.playbackRate.value = 0.8 + Math.random() * 0.5;
      var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fc * (0.8 + Math.random() * 0.4); f.Q.value = 1.2;
      var g = c.createGain(); g.gain.value = gain * this.vol.engine * (0.6 + Math.random() * 0.5);
      s.connect(f); f.connect(g); g.connect(this.fxBus); s.start(t0 + k * gap * (0.7 + Math.random() * 0.6));
    }
  };
  Sound.prototype.setDuck = function (on) { if (!this.ctx) return; this.duck.gain.setTargetAtTime(on ? 0.62 : 1, this.ctx.currentTime, on ? 0.05 : 0.3); };
  Sound.prototype.silenceAll = function () {
    if (!this.ctx || !this.started) return; var t = this.ctx.currentTime;
    [this.eGain, this.kerbG, this.gravelG, this.squealG, this.windG, this.syn].forEach(function (g) { g.gain.setTargetAtTime(0, t, 0.05); });
    this.crowdG.gain.setTargetAtTime(0, t, 0.3);
    for (var i = 0; i < this.rv.length; i++) this.rv[i].g.gain.setTargetAtTime(0, t, 0.05);
  };
  Sound.prototype.setVolumes = function (v) {
    for (var k in v) this.vol[k] = v[k];
    if (!this.ctx) return; var t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05); this.cueBus.gain.setTargetAtTime(this.vol.cues, t, 0.05); this.rivalBus.gain.setTargetAtTime(this.vol.rivals, t, 0.05);
  };
  Sound.prototype.play = function (k, gain, pan, rate, dest) {
    var c = this.ctx; if (!c || !this.buf[k]) return null;
    var s = c.createBufferSource(); s.buffer = this.buf[k]; if (rate) s.playbackRate.value = rate;
    var g = c.createGain(); g.gain.value = gain == null ? 1 : gain; var p = this.pan(); setPan(p, pan || 0, c.currentTime);
    s.connect(g); g.connect(p); p.connect(dest || this.master); s.start(0);
    return { src: s, gain: g };
  };
  Sound.prototype.crash = function (impact, pan) { var g = clamp(impact / 25, 0.35, 1); if (!this.play('crash', g, pan, 0.9 + Math.random() * 0.2)) this.noise(0.4, g, pan, 300); };
  Sound.prototype.bigCrash = function (pan) { this.play('crash', 1, pan, 0.8); var self = this; setTimeout(function () { self.play('clank', 0.8, pan * 0.5, 0.7); }, 180); };
  Sound.prototype.contact = function (impact, pan) { var g = clamp(impact / 12, 0.4, 1); if (!this.play('clank', g, pan * 0.9, 0.85 + Math.random() * 0.3)) this.noise(0.15, g, pan, 900); };
  Sound.prototype.noise = function (dur, gain, pan, fc) {
    var c = this.ctx; if (!c) return; var n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var s = c.createBufferSource(); s.buffer = b; var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fc; var g = c.createGain(); g.gain.value = gain; var p = this.pan(); setPan(p, pan, c.currentTime);
    s.connect(f); f.connect(g); g.connect(p); p.connect(this.master); s.start();
  };
  Sound.prototype.tone = function (o) {
    var c = this.ctx; if (!c) return 0;
    var t0 = c.currentTime + (o.at || 0) + 0.005, d = o.dur || 0.2;
    var osc = c.createOscillator(); osc.type = o.type || 'triangle'; osc.frequency.setValueAtTime(o.f, t0); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + d);
    var g = c.createGain(); var pk = o.gain == null ? 0.5 : o.gain;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(pk, t0 + Math.min(0.015, d / 4)); g.gain.setValueAtTime(pk, t0 + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    var p = this.pan();
    if (p.pan) { p.pan.setValueAtTime(clamp(o.pan || 0, -1, 1), t0); if (o.pan2 != null) p.pan.linearRampToValueAtTime(clamp(o.pan2, -1, 1), t0 + d * 0.85); }
    else setPan(p, o.pan2 != null ? o.pan2 : (o.pan || 0), t0);
    osc.connect(g); g.connect(p); p.connect(this.cueBus);
    osc.start(t0); osc.stop(t0 + d + 0.05);
    return (o.at || 0) + d;
  };
  var SEVF = { 0: 1250, 1: 980, 2: 720, 3: 500 };
  // Optional bend tone: sweeps towards the bend. Lower pitch = tighter.
  Sound.prototype.cornerCue = function (group) {
    var at = 0, self = this, parts = group.parts;
    parts.forEach(function (p) { var f = SEVF[p.sev]; self.tone({ f: f, f2: f * 0.86, dur: 0.2, at: at, type: 'triangle', gain: 0.4, pan: 0, pan2: p.dir }); at += 0.26; });
    return at;
  };
  Sound.prototype.brakeCue = function () { this.tone({ f: 300, dur: 0.075, type: 'square', gain: 0.32, at: 0 }); this.tone({ f: 300, dur: 0.075, type: 'square', gain: 0.32, at: 0.13 }); };
  Sound.prototype.turnIn = function (dir) { this.tone({ f: 1700, dur: 0.045, type: 'sine', gain: 0.35, pan: dir * 0.9 }); };
  Sound.prototype.light = function () { this.tone({ f: 560, dur: 0.32, type: 'square', gain: 0.22 }); };
  Sound.prototype.lightsOut = function () { this.tone({ f: 880, f2: 1760, dur: 0.35, type: 'triangle', gain: 0.55 }); };
  Sound.prototype.lapLine = function () { this.tone({ f: 1320, dur: 0.07, type: 'sine', gain: 0.25 }); this.tone({ f: 1760, dur: 0.09, type: 'sine', gain: 0.25, at: 0.09 }); };
  Sound.prototype.ok = function () { this.tone({ f: 660, dur: 0.1, type: 'sine', gain: 0.35 }); this.tone({ f: 990, dur: 0.14, type: 'sine', gain: 0.35, at: 0.11 }); };
  Sound.prototype.finish = function () { this.play('horns', 0.55, 0); this.play('cheer', 0.7, 0); };
  Sound.prototype.cheer = function (g) { this.play('cheer', g || 0.5, 0); };
  Sound.prototype.suspend = function () { if (this.ctx && this.ctx.suspend) try { this.ctx.suspend(); } catch (e) {} };
  Sound.prototype.resume = function () { if (this.ctx && this.ctx.resume) try { this.ctx.resume(); } catch (e) {} };
  root.F1Sound = Sound; root.F1SoundPrefetch = prefetch; root.F1Pitch = pitchFor;
})(this);
