/* F1 by Ear 2 - app: menus, championships, race screen, pedals, steering, race engineer, lesson. */
(function () {
  'use strict';
  var L = window.F1L, S = window.F1S, W = window.F1W;
  function $(id) { return document.getElementById(id); }
  var KEY = 'f1be.v2';
  var DEF = { track: 'ashby-fields', laps: 'short', rivals: '7', diff: 'medium', grid: 'back', speed: 'manual', sens: '1', dead: '0.04', smooth: 'normal', centre: '1',
    vol: '0.9', eng: '0.85', riv: '0.85', voice: '', rate: '1.1', verb: 'full', lead: '0', tones: '0', unlockAll: '0',
    cal: null, rec: {}, champ: {}, unlocked: ['c1'], active: null };
  var st = load();
  function load() { var o = {}; try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {} var r = {}; for (var k in DEF) r[k] = o[k] != null ? o[k] : (typeof DEF[k] === 'object' && DEF[k] ? JSON.parse(JSON.stringify(DEF[k])) : DEF[k]); if (!L.TRACKS[r.track]) r.track = DEF.track; return r; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  var snd = new window.F1Sound(); window.F1SoundPrefetch();
  var ann = new window.F1Announcer(); ann.onDuck = function (on) { snd.setDuck(on); };
  var wheel = new S.Wheel();
  var G = { screen: 'menu', race: null, phase: null, touches: 0, maxTouches: 0, keys: {}, raf: 0, lastT: 0, paused: false, runId: 0,
    stats: { frames: 0, slow: 0, loopMax: 0, loopSum: 0 }, motion: 'unknown', listening: false, cal: null, lightsT: 0, lightN: 0, holdT: 0, demoRpm: null, lesson: null, lastSteer: 0,
    calls: [], cornerCheck: { passed: 0, called: 0, late: 0, missed: [] }, gearsSeen: {} };
  window.__f1 = { G: G, st: st, wheel: wheel, snd: snd, ann: ann, L: L, S: S, W: W, save: save };
  function status(msg) { var el = $('status'); el.textContent = ''; setTimeout(function () { el.textContent = msg; }, 30); }
  function lvl() { return { corners: 0, positions: 1, full: 2 }[st.verb] || 0; }
  function tones() { return st.tones === '1'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function champOf(id) { var T = L.TRACKS[id]; return L.CHAMPS.filter(function (c) { return c.id === T.champ; })[0] || null; }
  function isUnlocked(cid) { return st.unlockAll === '1' || st.unlocked.indexOf(cid) >= 0; }
  function lapsFor(id) {
    var T = L.buildTrack(id), m = { short: 5000, medium: 10000, long: 20000 }[st.laps];
    if (!m) return 1;
    var n = Math.round(m / T.length); return Math.max(st.laps === 'short' ? 2 : st.laps === 'medium' ? 3 : 5, Math.min(30, n));
  }
  function roster(ci) { var r = L.rng(ci * 31 + 5), a = L.DRIVERS.map(function (d) { return d.name; }); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a.slice(0, 7); }

  // ---------- motion ----------
  function listen() {
    if (G.listening) return; G.listening = true;
    window.addEventListener('devicemotion', function (e) { wheel.onMotion(e); }, { passive: true });
    window.addEventListener('deviceorientation', function (e) { wheel.onOrientation(e); }, { passive: true });
  }
  var needsPerm = (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') || (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function');
  if (!needsPerm) listen();
  function askMotion() {
    if (!needsPerm) { G.motion = 'granted'; return Promise.resolve(true); }
    var reqs = [];
    try { if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') reqs.push(DeviceMotionEvent.requestPermission()); } catch (e) {}
    try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') reqs.push(DeviceOrientationEvent.requestPermission()); } catch (e) {}
    return Promise.all(reqs.map(function (p) { return Promise.resolve(p).catch(function () { return 'denied'; }); })).then(function (r) {
      var ok = r.indexOf('granted') >= 0; G.motion = ok ? 'granted' : 'denied'; listen(); return ok;
    });
  }
  function steerNow() {
    var k = (G.keys.ArrowRight ? 1 : 0) - (G.keys.ArrowLeft ? 1 : 0);
    if (k) return k;
    if (wheel.angle == null || !G.cal) return 0;
    if (G.calPending) { G.calPending = false; centreNow(); }
    return S.mapSteer(wheel.angle, G.cal, { deadZone: +st.dead, sensitivity: +st.sens });
  }
  function baseCal() { return st.cal || S.defaultCal(wheel.angle == null ? 0 : wheel.angle); }
  function centreNow() {
    var b = baseCal();
    if (wheel.angle != null && (st.centre === '1' || !st.cal)) G.cal = { centre: wheel.angle, left: b.left, right: b.right };
    else G.cal = b;
    // no motion reading yet: centre on the first reading that arrives
    G.calPending = wheel.angle == null && (st.centre === '1' || !st.cal);
  }

  // ---------- menu views ----------
  function show(id) {
    var vs = document.querySelectorAll('.view');
    for (var i = 0; i < vs.length; i++) vs[i].hidden = vs[i].id !== id;
    if (id === 'vHome') renderHome(); if (id === 'vTracks') renderChamps(); if (id === 'vRecords') renderRecords();
    var h = $(id).querySelector('h1, h2');
    if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); setTimeout(function () { try { h.focus(); } catch (e) {} }, 30); }
    G.view = id;
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-go]'); if (b) show(b.getAttribute('data-go')); });
  function renderHome() {
    var T = L.buildTrack(st.track), c = champOf(st.track);
    $('homeTrack').textContent = 'Track: ' + T.name + (c ? ', ' + c.name + ' round ' + T.round : '') + '. ' + T.desc.short + ' ' + plural(lapsFor(st.track), 'lap') + '.';
    var a = st.active && st.champ[st.active];
    var ac = a && L.CHAMPS.filter(function (x) { return x.id === st.active; })[0];
    $('bChamp').textContent = ac && !a.done ? 'Continue championship: ' + ac.name + ', round ' + (a.round + 1) : 'Championship';
    renderCal();
  }
  function renderChamps() {
    var box = $('champList'); box.innerHTML = '';
    L.CHAMPS.forEach(function (c, i) {
      var b = document.createElement('button'); b.className = 'b';
      var s = st.champ[c.id], lock = !isUnlocked(c.id);
      b.textContent = (i + 1) + '. ' + c.name + (lock ? ', locked' : s && s.done ? ', finished P' + s.final : s && s.round ? ', round ' + (s.round + 1) + ' next' : '');
      b.addEventListener('click', function () { openChamp(c.id); });
      box.appendChild(b);
    });
  }
  var curChamp = null;
  function openChamp(cid, keepFocus) {
    var c = L.CHAMPS.filter(function (x) { return x.id === cid; })[0]; curChamp = c;
    show('vChamp');
    $('champTitle').textContent = (c.index + 1) + '. ' + c.name;
    $('champBlurb').textContent = c.blurb + (isUnlocked(c.id) ? '' : ' Locked: finish the ' + L.CHAMPS[c.index - 1].name + ' in the top three to unlock it. You can still race or practise on these tracks.');
    var box = $('champState'); box.innerHTML = '';
    var s = st.champ[c.id];
    if (isUnlocked(c.id)) {
      var b1 = document.createElement('button'); b1.className = 'b p';
      if (s && !s.done && s.round > 0) b1.textContent = 'Continue championship, round ' + (s.round + 1) + ': ' + L.TRACKS[c.ids[s.round]].name;
      else b1.textContent = 'Start championship';
      b1.addEventListener('click', function () { champGo(c.id, !(s && !s.done && s.round > 0)); });
      box.appendChild(b1);
      if (s && (s.round > 0 || s.done)) {
        var b2 = document.createElement('button'); b2.className = 'b'; b2.textContent = 'Start again from round 1';
        b2.addEventListener('click', function () { champGo(c.id, true); }); box.appendChild(b2);
        var p = document.createElement('p'); p.textContent = standingsText(c, s, true); box.appendChild(p);
      }
    }
    var tb = $('champTracks'); tb.innerHTML = '';
    c.ids.forEach(function (id, i) {
      var T = L.buildTrack(id), b = document.createElement('button'); b.className = 'b';
      b.setAttribute('aria-pressed', st.track === id ? 'true' : 'false');
      b.textContent = (i + 1) + '. ' + T.name + ', ' + T.desc.short.replace(/\.$/, '');
      b.addEventListener('click', function () { selectTrack(id); });
      tb.appendChild(b);
    });
    if (L.TRACKS[st.track].champ === c.id) renderSel(); else $('champSel').hidden = true;
  }
  function selectTrack(id) {
    st.track = id; save();
    var bs = $('champTracks').querySelectorAll('button'); var ids = curChamp.ids;
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', ids[i] === id ? 'true' : 'false');
    renderSel();
    setTimeout(function () { try { $('selTitle').focus(); } catch (e) {} }, 30);
  }
  function renderSel() {
    var T = L.buildTrack(st.track);
    $('champSel').hidden = false;
    $('selTitle').textContent = 'Selected: ' + T.name;
    var r = st.rec[T.id];
    $('selDesc').textContent = T.desc.long + ' A race is ' + plural(lapsFor(T.id), 'lap') + '.' + (r && r.lap ? ' Your best lap: ' + L.fmtShort(r.lap) + '.' : '');
  }
  function standingsText(c, s, full) {
    var rows = standings(s), me = rows.filter(function (r) { return r.me; })[0];
    var txt = (s.done ? 'Final standings. ' : 'After round ' + s.round + ' of 10. ') + 'You are P' + me.pos + ' with ' + plural(me.pts, 'point') + '. ';
    if (me.pos > 1) txt += rows[0].short + ' leads with ' + rows[0].pts + ', ' + (rows[0].pts - me.pts) + ' ahead of you. ';
    else if (rows[1]) txt += rows[1].short + ' is second with ' + rows[1].pts + ', ' + (me.pts - rows[1].pts) + ' behind. ';
    if (full) txt += 'Full table: ' + rows.map(function (r) { return r.pos + ', ' + (r.me ? 'you' : r.name) + ', ' + r.pts; }).join('; ') + '.';
    return txt;
  }
  function standings(s) {
    var rows = Object.keys(s.pts).map(function (n) { return { name: n, short: n === 'You' ? 'You' : L.surname(n), pts: s.pts[n], me: n === 'You' }; });
    rows.sort(function (a, b) { return b.pts - a.pts || (a.me ? -1 : 1); });
    rows.forEach(function (r, i) { r.pos = i + 1; });
    return rows;
  }
  function champGo(cid, fresh) {
    var c = L.CHAMPS.filter(function (x) { return x.id === cid; })[0];
    if (fresh || !st.champ[cid] || st.champ[cid].done) { var pts = { You: 0 }; roster(c.index).forEach(function (n) { pts[n] = 0; }); st.champ[cid] = { round: 0, pts: pts, done: false }; }
    st.active = cid; st.track = c.ids[st.champ[cid].round]; save();
    startRace('race', { champ: cid });
  }
  // compact button groups for settings
  function buildSettings() {
    var ds = document.querySelectorAll('[data-set]');
    for (var i = 0; i < ds.length; i++) (function (d) {
      var k = d.getAttribute('data-set'), id = 'gl_' + k;
      var lab = document.createElement('p'); lab.className = 'gl'; lab.id = id; lab.textContent = d.getAttribute('data-label'); d.appendChild(lab);
      d.setAttribute('role', 'group'); d.setAttribute('aria-labelledby', id);
      d.getAttribute('data-opts').split('|').forEach(function (o) {
        var p = o.split(':'), v = p[0], b = document.createElement('button'); b.className = 'b'; b.textContent = p.slice(1).join(':'); b.setAttribute('data-v', v);
        b.setAttribute('aria-pressed', String(st[k]) === v ? 'true' : 'false');
        b.addEventListener('click', function () {
          st[k] = v; save(); applySettings();
          var bs = d.querySelectorAll('button'); for (var j = 0; j < bs.length; j++) bs[j].setAttribute('aria-pressed', bs[j].getAttribute('data-v') === v ? 'true' : 'false');
          if (k === 'rate') { prepare(); ann.clear(); ann.say('Speech rate ' + b.textContent + '.', { prio: 1 }); }
        });
        d.appendChild(b);
      });
    })(ds[i]);
  }
  function applySettings() { snd.setVolumes({ master: +st.vol, engine: +st.eng, rivals: +st.riv }); ann.rate = +st.rate; ann.voiceURI = st.voice; wheel.setSmoothing(st.smooth); }

  // ---------- race screen ----------
  function showRace(on) {
    $('race').classList.toggle('on', on); $('race').setAttribute('aria-hidden', on ? 'false' : 'true');
    $('menu').setAttribute('aria-hidden', on ? 'true' : 'false');
    try { $('menu').inert = on; } catch (e) {}
    G.screen = on ? 'race' : 'menu';
    if (!on) $('results').classList.remove('on');
    wake(on);
  }
  function setBar(main, pause, leave) {
    $('rMain').textContent = main || ''; $('rMain').style.display = main ? '' : 'none';
    $('rPause').textContent = pause || ''; $('rPause').style.display = pause ? '' : 'none';
    $('rInfo').style.display = G.race && G.phase !== 'finished' && G.mode !== 'calib' ? '' : 'none';
    $('rLeave').textContent = leave || 'Leave';
  }
  function hud(a, b) { $('hud').textContent = a; $('hud2').textContent = b || ''; }
  var wl = null;
  function wake(on) {
    try {
      if (on && !wl && navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (l) { wl = l; l.addEventListener && l.addEventListener('release', function () { wl = null; }); }).catch(function () {});
      if (!on && wl) { wl.release(); wl = null; }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (G.screen === 'race' && !G.paused && (G.phase === 'racing' || G.phase === 'lights' || G.phase === 'lesson')) pause(true); }
    else if (G.screen === 'race') wake(true);
  });
  function prepare() {
    var a = snd.unlock(); ann.unlock();
    var m = askMotion();
    applySettings();
    return Promise.all([a, m]).then(function (r) { return r[1]; });
  }
  function callSecs(g) { return ann.secs(W.corner(g.words, 250, 'heavy braking')) + (+st.lead || 0); }
  function newRace(mode, o) {
    o = o || {};
    var track = mode === 'lesson' ? 'ring' : st.track, c = champOf(track);
    var champ = o.champ ? L.CHAMPS.filter(function (x) { return x.id === o.champ; })[0] : null;
    var opts = { track: track, laps: mode === 'race' ? lapsFor(track) : 99, rivals: mode === 'race' ? (champ ? 7 : +st.rivals) : 0, difficulty: st.diff, grid: st.grid, auto: st.speed === 'auto', mode: mode,
      callSecs: callSecs, champBase: (champ || c) && mode === 'race' ? (champ || c).base : 0, roster: champ ? roster(champ.index) : null };
    var R = new L.Race(opts);
    G.race = R; G.mode = mode; G.champ = champ ? champ.id : null; G.paused = false; G.runId++;
    G.cornerCheck = { passed: 0, called: 0, late: 0, missed: [] }; G.spoken = {}; G.calls = []; G.offSaidT = -9; G.lastPos = null; G.lastCornerT = -9;
    snd.setRivalCount(R.cars.length - 1);
    return R;
  }
  function startRace(mode, o) {
    ann.clear();
    var R = newRace(mode, o), T = R.T;
    var msg, c = G.champ && L.CHAMPS.filter(function (x) { return x.id === G.champ; })[0];
    if (mode === 'race') msg = (c ? c.name + ', round ' + T.round + ' of 10. ' : '') + T.desc.long + ' ' + plural(R.laps, 'lap') + ', ' + plural(R.cars.length - 1, 'rival') + '. You start P' + R.position() + ' of ' + R.cars.length + '. ';
    else msg = 'Free practice. ' + T.desc.long + ' ';
    msg += R.auto ? 'Double-tap Start lights when ready.' : 'Turn VoiceOver off, then tap the screen to start the lights.';
    ann.say(msg, { key: 'grid', prio: 1, queue: true });
    G.phase = 'grid'; G.lightsT = 0; G.lightN = 0;
    showRace(true); $('results').classList.remove('on');
    setBar('Start lights', 'Pause', 'Leave');
    hud('On the grid', T.name);
    prepare().then(function (ok) { if (!ok) ann.say('Motion access was not allowed, so steering will not work. Leave, then reload the page and allow Motion and Orientation access.', { prio: 2 }); });
    focusMain(); loop();
  }
  function focusMain() { setTimeout(function () { try { $('rMain').style.display !== 'none' ? $('rMain').focus() : $('rPause').focus(); } catch (e) {} }, 50); }
  function beginLights() {
    if (G.phase !== 'grid') return;
    centreNow();
    G.phase = 'lights'; G.lightsT = 0; G.lightN = 0; G.holdT = 1.0 + Math.random() * 1.6;
    ann.clear();
    setBar('', 'Pause', 'Leave');
    if (wheel.count === 0) setTimeout(function () { if (wheel.count === 0 && G.screen === 'race') ann.say('No steering readings from the phone yet.', { prio: 1 }); }, 2500);
  }
  function lightsTick(dt) {
    G.lightsT += dt;
    var want = Math.min(5, Math.floor(G.lightsT / 1.0));
    while (G.lightN < want) { G.lightN++; snd.light(); hud('Light ' + G.lightN); if (G.mode !== 'lesson') ann.say(W.lights(G.lightN), { prio: 2 }); }
    if (G.lightN >= 5 && G.lightsT >= 5 + G.holdT) {
      snd.lightsOut(); G.race.start(); G.phase = G.mode === 'lesson' ? 'lesson' : 'racing'; hud('Go');
      ann.say(W.pick('go', W.go), { prio: 2 });
    }
  }
  // ---------- pause / leave ----------
  function pause(auto) {
    if (G.phase === 'finished') { if (!auto) afterFinishTap(); return; }
    if (G.paused || G.screen !== 'race') return;
    G.paused = true; ann.clear(); snd.silenceAll();
    setTimeout(function () { if (G.paused) snd.suspend(); }, 200);
    setBar('Resume', '', 'Leave');
    ann.say(auto ? 'Paused.' : 'Paused. Tap with three fingers to carry on, or hold three fingers for two seconds to leave.', { prio: 2 });
    hud('Paused'); focusMain();
  }
  function resume() {
    if (!G.paused) return;
    snd.resume(); G.paused = false; G.lastT = 0; ann.clear();
    setBar(G.phase === 'grid' ? 'Start lights' : '', 'Pause', 'Leave');
    if (G.phase === 'lights') { G.lightsT = 0; G.lightN = 0; }
    if (G.phase === 'lesson' && G.lesson) lessonRepeat(); else ann.say('Go.', { prio: 2 });
  }
  function leave() {
    G.runId++; G.paused = false; ann.clear(); snd.silenceAll(); G.lesson = null; G.phase = null; G.race = null; G.demoRpm = null;
    cancelAnimationFrame(G.raf); G.raf = 0;
    setTimeout(function () { if (!G.race) snd.suspend(); }, 400);
    showRace(false);
    show(G.champ ? 'vHome' : (G.view || 'vHome'));
    setTimeout(function () { try { $('bRace').offsetParent && $('bRace').focus(); } catch (e) {} }, 60);
  }
  // ---------- touch ----------
  var pad = $('pad');
  function onTouch(e) {
    if (G.screen !== 'race') return;
    if (e.cancelable) e.preventDefault();
    var n = e.touches ? e.touches.length : 0;
    var was = G.touches; G.touches = n;
    if (was === 0 && n > 0) G.touchStartAt = performance.now();
    if (n > G.maxTouches) G.maxTouches = n;
    if (n >= 3 && !G.threeAt) G.threeAt = performance.now();
    if (e.type === 'touchstart' && was === 0) onPadTap();
    if (n === 0) {
      var dur = performance.now() - (G.touchStartAt || 0);
      if (G.maxTouches >= 3) {
        var held = performance.now() - (G.threeAt || 0);
        if (held < 1500) { if (G.paused) resume(); else pause(false); }
      } else if (G.maxTouches === 2 && dur < 320) {
        var now = performance.now();
        if (G.twoTapAt && now - G.twoTapAt < 700) { G.twoTapAt = 0; info(); } else G.twoTapAt = now;
      }
      G.maxTouches = 0; G.threeAt = 0;
    }
  }
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (t) { pad.addEventListener(t, onTouch, { passive: false }); });
  pad.addEventListener('mousedown', function () { if (G.screen !== 'race') return; G.touches = 1; onPadTap(); });
  window.addEventListener('mouseup', function () { if (G.touches === 1 && !('ontouchstart' in window)) G.touches = 0; });
  function onPadTap() {
    if (G.paused) return;
    ann.unlock();
    if (G.phase === 'grid') { snd.unlock(); beginLights(); }
    else if (G.phase === 'calib') calibAdvance();
    else if (G.lesson && G.lesson.waitTap) { var f = G.lesson.waitTap; G.lesson.waitTap = null; f(); }
  }
  function pedals() {
    var thr = 0, brk = 0, n = G.touches;
    if (G.maxTouches >= 3) n = 0;
    if (n === 1) thr = 1; else if (n === 2) brk = 1;
    if (G.keys.ArrowUp || G.keys[' ']) thr = 1;
    if (G.keys.ArrowDown) { brk = 1; thr = 0; }
    return { thr: thr, brk: brk };
  }
  window.addEventListener('keydown', function (e) {
    if (G.screen !== 'race') return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) { G.keys[e.key] = true; e.preventDefault(); }
    if (e.key === 'Enter' && document.activeElement === document.body) onPadTap();
    if (e.key === 'p' || e.key === 'P') { if (G.paused) resume(); else pause(false); }
    if (e.key === 'i' || e.key === 'I') info();
  });
  window.addEventListener('keyup', function (e) { if (G.keys[e.key]) G.keys[e.key] = false; });
  setInterval(function () { if (G.paused && G.threeAt && performance.now() - G.threeAt > 2000) { G.threeAt = 0; G.maxTouches = 0; leave(); } }, 200);
  // spoken gear, speed and position on demand
  function info() {
    var R = G.race; if (!R || G.phase === 'finished') return;
    var p = R.player, s = (p.gear ? 'Gear ' + p.gear : 'Neutral') + ', ' + Math.round(p.v * 3.6) + ' kilometres an hour.';
    if (R.mode === 'race' && R.started) s += ' P' + R.position() + ' of ' + R.cars.length + ', lap ' + Math.min(R.laps, p.lap + 1) + ' of ' + R.laps + '. ' + W.gaps(R.gaps());
    else if (R.started) s += ' Lap ' + (p.lap + 1) + '.';
    ann.say(s, { prio: 2, key: 'info' });
  }
  // ---------- main loop ----------
  function loop() { if (!G.raf) { G.lastT = 0; G.raf = requestAnimationFrame(frame); } }
  function frame(ts) {
    G.raf = requestAnimationFrame(frame);
    var t0 = performance.now();
    var dt = G.lastT ? (ts - G.lastT) / 1000 : 1 / 60; G.lastT = ts;
    if (dt > 0.05) dt = 0.05; if (dt <= 0) dt = 1 / 120;
    dt *= G.timeScale || 1;
    if (G.paused) return;
    tick(dt);
    var ms = performance.now() - t0;
    G.stats.frames++; G.stats.loopSum += ms; if (ms > G.stats.loopMax) G.stats.loopMax = ms; if (dt > 0.025) G.stats.slow++;
  }
  function tick(dt) {
    var R = G.race;
    if (G.phase === 'calib') { calibTick(dt); return; }
    if (!R) return;
    var steer = steerNow(); G.lastSteer = steer;
    var p = pedals();
    R.input.steer = steer; R.input.throttle = p.thr; R.input.brake = p.brk;
    if (G.phase === 'lights') lightsTick(dt);
    var n = Math.max(1, Math.round(dt * 120)), h = dt / n;
    for (var i = 0; i < n; i++) R.step(h);
    handle(R.drain());
    if (G.phase === 'lesson' && G.lesson) lessonTick();
    // keep telling the driver which way to steer while off the track
    var c = R.player;
    if (R.started && c.off && !c.finished && R.t - G.offSaidT > 2.6 && !G.lesson) { G.offSaidT = R.t; var sd = W.sides(c.y > 0 ? 1 : -1); ann.say(W.pick('offa', W.offAgain, sd), { prio: 2, key: 'off' }); }
    sound(R);
    G.hudT = (G.hudT || 0) + dt;
    if (G.hudT > 0.25) { G.hudT = 0; drawHud(R); }
  }
  function sound(R) {
    var c = R.player, T = R.T;
    var ws = L.wrapS(T, c.s), crowd = 0;
    T.crowd.forEach(function (z) { var a = L.wrapS(T, z[0]), b = L.wrapS(T, z[1]); var inside = a < b ? (ws >= a && ws <= b) : (ws >= a || ws <= b); if (inside) crowd = 1; });
    var demo = G.demoRpm != null;
    var stt = { rpm: demo ? G.demoRpm : c.rpm, thr: demo ? 1 : (R.started ? (c.thr || 0) : R.input.throttle), lim: c.lim, pan: Math.max(-1, Math.min(1, c.y / (T.halfW + 0.9) * 0.85)), speed: G.demoOff ? 30 : c.v,
      kerb: G.demoOff ? 0 : c.onKerb, kerbSide: c.y > 0 ? 1 : -1, off: G.demoOff || c.off, offSide: c.y > 0 ? 1 : -1, slide: c.slide || 0, grip: c.gripUse || 0, slip: c.slipF || 0,
      tunnel: !!T.tunnel[L.idx(T, c.s)] && !R.straight, crowd: G.mode === 'lesson' ? 0 : crowd, running: !c.crashUntil || demo };
    var rivals = [], k = 0;
    for (var i = 0; i < R.cars.length; i++) {
      var o = R.cars[i]; if (o.player) continue;
      var ds = o.s - c.s, dy = o.y - c.y, dist = Math.sqrt(ds * ds + dy * dy) || 1;
      rivals[k++] = { ds: ds, dy: dy, rpm: o.rpm, thr: o.thr, closing: (c.v - o.v) * ds / dist };
    }
    snd.update(stt, rivals);
  }
  function drawHud(R) {
    var c = R.player;
    var a = R.mode === 'race' ? 'P' + R.position() + ' of ' + R.cars.length + '   Lap ' + Math.min(R.laps, Math.max(1, c.lap + 1)) + ' of ' + R.laps : (G.mode === 'lesson' ? 'Lesson' : 'Practice lap ' + Math.max(1, c.lap + 1));
    if (!R.started && G.phase === 'grid') a = 'On the grid' + (R.mode === 'race' ? ', P' + R.position() : '');
    hud(a, Math.round(c.v * 3.6) + ' km/h   gear ' + (c.gear || 'N') + '   ' + Math.round(c.rpm) + ' rpm   steer ' + Math.round(G.lastSteer * 100));
  }
  // ---------- the race engineer ----------
  function distTo(R, g) { var d = g.start - L.wrapS(R.T, R.player.s); if (d < -5) d += R.T.length; return d; }
  function urgent(text, g, R, maxAge) {
    // a time-critical call (brake, turn): never waits behind chatter; if the engineer is mid-way through
    // the call for a later corner, that call is cut and repeated straight after with a fresh distance.
    var t0 = R.t, cur = ann.cur;
    var item = { prio: 3, key: 'u', valid: function () { return G.race === R && R.t - t0 < (maxAge || 1.0); } };
    if (cur && cur.item.prio === 3) {
      if (cur.item.group === g) { ann.q.unshift({ text: text, prio: 3, valid: item.valid, at: 0 }); return; }
      if (cur.item.group) { var again = cur.item; again.at = 1; ann.q.unshift(again); ann.q.unshift({ text: text, prio: 3, valid: item.valid, at: 0 }); ann.stopCurrent(); return; }
    }
    ann.say(text, item);
  }
  function handle(evs) {
    var R = G.race, V = lvl(), p = R.player;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      switch (e.type) {
        case 'cue': (function (e) {
          var g = e.group, then = R.t - G.lastCornerT < 3;
          if (tones()) snd.cornerCue(g);
          var rec = { g: g.idx, key: e.key, queuedD: e.dist };
          G.calls.push(rec);
          ann.say(function () {
            var d = distTo(R, g), v = Math.max(8, p.v), need = !g.flat && v > g.vmin * 1.03;
            rec.d = d; rec.bd = L.brakeDist(v, g.vmin * 0.97, 0.9); rec.v = v; rec.t = R.t;
            G.spoken[e.key] = rec;
            return W.corner(g.words, d, W.action(need, g.vmin / v, g.flat, R.auto), then);
          }, { prio: 3, key: 'c' + e.key, valid: function () { var d = distTo(R, g); return G.race === R && d > Math.max(12, p.v * 0.5) && d < 1600; } });
          ann.q.forEach(function (x) { if (x.key === 'c' + e.key) x.group = g; });
          if (ann.cur && ann.cur.item.key === 'c' + e.key) ann.cur.item.group = g;
        })(e); break;
        case 'brakeCue': if (tones()) snd.brakeCue(); urgent(e.group.vmin / Math.max(1, p.v) > 0.85 ? W.pick('lift', W.liftNow) : W.pick('brake', W.brakeNow), e.group, R, 0.9); break;
        case 'turnCall':
          if (e.k === 0) {
            G.cornerCheck.passed++;
            var sp = G.spoken[e.key];
            if (sp) { G.cornerCheck.called++; if (sp.d < sp.bd) G.cornerCheck.late++; } else G.cornerCheck.missed.push(e.group.idx);
          }
          if (e.part.kind !== 'kink') urgent(W.turn(e.part.dir, e.k), e.group, R, 0.8);
          break;
        case 'turnIn': if (tones()) snd.turnIn(e.part.dir); G.lastCornerT = R.t; break;
        case 'straight': ann.say(W.pick('straight', W.straight), { prio: 1 }); break;
        case 'shift': snd.shift(e.up, e.blip); G.gearsSeen[e.gear] = 1; if (G.lesson && G.lesson.sayGears && e.up) ann.say(W.gear(e.gear), { prio: 2 }); else if (V >= 2 && e.up && e.gear >= 5) ann.say(W.gear(e.gear), { prio: 0 }); break;
        case 'limiter': if (V >= 2) ann.say(W.pick('lim', W.limiter), { prio: 0 }); break;
        case 'wide': if (!G.lesson) ann.say(W.pick('wide', W.wide, W.sides(e.side)), { prio: 2, key: 'wide' }); break;
        case 'off': if (!G.lesson) { G.offSaidT = R.t; ann.say(W.pick('off', W.off, W.sides(e.side)), { prio: 2, key: 'off' }); } break;
        case 'rejoin': if (!G.lesson) ann.say(W.pick('rejoin', W.rejoin), { prio: 1 }); break;
        case 'wall': snd.crash(e.impact, e.side); if (G.lesson) G.lesson.wall = true; else ann.say(W.pick('wall', W.wall, W.sides(e.side)), { prio: 2, key: 'wall' }); break;
        case 'crash': snd.bigCrash(e.side); ann.say(W.pick('crash', W.crash), { prio: 2, key: 'crash' }); break;
        case 'recover': ann.say(W.pick('recover', W.recover), { prio: 2, key: 'recover' }); break;
        case 'contact': snd.contact(e.impact, e.side); if (G.lesson) G.lesson.contact = true; else if (V >= 1) ann.say(W.pick('contact', W.contact, { n: e.name }), { prio: 1 }); break;
        case 'overtake': if (V >= 2 && R.mode === 'race') ann.say(function () { var ps = R.position(); G.lastPos = { pos: ps, t: R.t }; return W.pick(e.lapped ? 'lapped' : 'ot', e.lapped ? W.lapped : W.overtake, { n: e.name }) + ' P' + ps + '.'; }, { prio: 1 }); break;
        case 'overtaken': if (V >= 2 && R.mode === 'race') ann.say(function () { var ps = R.position(); G.lastPos = { pos: ps, t: R.t }; return W.pick('otn', W.overtaken, { n: e.name }) + ' P' + ps + '.'; }, { prio: 1 }); break;
        case 'position': if (V >= 1 && R.mode === 'race' && !(G.lastPos && G.lastPos.pos === e.pos && R.t - G.lastPos.t < 4)) { G.lastPos = { pos: e.pos, t: R.t }; ann.say(W.pick(e.gained ? 'gain' : 'lost', e.gained ? W.gained : W.lost, { p: e.pos }), { prio: 1, key: 'pos' }); } break;
        case 'rivalMistake': if (V >= 2 && Math.abs(e.dist) < 300) ann.say(W.pick('mis', W.mistake, { n: e.name, c: e.corner }), { prio: 0 }); break;
        case 'defend': if (V >= 2) ann.say(W.pick('def', W.defend, { n: e.name }), { prio: 0 }); break;
        case 'slip': if (V >= 2) ann.say(W.pick('slip', W.slip, { n: e.name }), { prio: 0 }); break;
        case 'fastest': if (e.player && V >= 1) G.pendingFastest = e; else if (!e.player && V >= 2) ann.say(W.pick('fo', W.fastestOther, { n: e.name, t: W.lapTime(e.t) }), { prio: 0 }); break;
        case 'rivalFinish': if (V >= 1 && !G.rivalWon) { G.rivalWon = true; ann.say(e.name + ' takes the chequered flag.', { prio: 1 }); } break;
        case 'lap': onLap(e); break;
        case 'finish': onFinish(e); break;
      }
    }
  }
  function onLap(e) {
    var R = G.race, V = lvl(); snd.lapLine();
    var lt = e.lapTime, rec = st.rec[R.T.id] || (st.rec[R.T.id] = {});
    var isBest = !rec.lap || lt < rec.lap;
    if (isBest && (G.mode === 'practice' || G.mode === 'race')) { rec.lap = lt; save(); }
    if (R.mode === 'race') {
      var s = W.lapLine(e.lap, e.laps) + ' P' + e.pos + '.';
      if (V >= 1) {
        s += ' ' + W.gaps(R.gaps());
        if (G.pendingFastest) { s += ' ' + W.pick('fm', W.fastestMe, { t: W.lapTime(G.pendingFastest.t) }); G.pendingFastest = null; }
        else s += ' Lap time ' + W.lapTime(lt) + '.' + (isBest && R.notes.lapTimes.length > 1 ? ' ' + W.pick('pb', W.bestMe) : '');
      } else if (!e.final) return;
      ann.say(s, { prio: 1, key: 'lap', queue: true });
    } else {
      var note = L.lapNotes(e.notes);
      if (G.mode === 'lesson' && G.lesson && G.lesson.lapDone) { G.lesson.lapDone(lt, note); return; }
      ann.say('Lap time ' + L.fmtTime(lt) + (isBest ? ', your best here' : '') + '. ' + note, { prio: 1, key: 'lap', queue: true });
    }
  }
  function onFinish(e) {
    var R = G.race; G.phase = 'finished';
    snd.finish();
    var rows = e.results, me = rows.filter(function (r) { return r.player; })[0];
    var rec = st.rec[R.T.id] || (st.rec[R.T.id] = {});
    rec.races = (rec.races || 0) + 1; if (me.pos === 1) rec.wins = (rec.wins || 0) + 1;
    var newBest = !rec.pos || me.pos < rec.pos; if (newBest) rec.pos = me.pos;
    var fl = Math.min.apply(null, R.notes.lapTimes.slice(1).concat([Infinity]));
    if (isFinite(fl) && (!rec.lap || fl < rec.lap)) rec.lap = fl;
    var said = me.pos === 1 ? 'Chequered flag. You win! ' : 'Chequered flag. You finish P' + me.pos + ' of ' + rows.length + '. ';
    if (me.pos > 1) said += rows[0].short + ' won, ' + me.gap.toFixed(1) + ' seconds ahead of you. ';
    else if (rows[1]) said += rows[1].short + ' was ' + rows[1].gap.toFixed(1) + ' seconds behind. ';
    if (R.fastest && R.fastest.player) said += 'And you set the fastest lap. ';
    // championship points
    var chTxt = '', c = G.champ && L.CHAMPS.filter(function (x) { return x.id === G.champ; })[0];
    $('resChamp').innerHTML = '';
    if (c) {
      var s = st.champ[c.id];
      rows.forEach(function (r) { var nm = r.player ? 'You' : r.name; if (s.pts[nm] == null) s.pts[nm] = 0; s.pts[nm] += L.POINTS[r.pos - 1] || 0; });
      s.round++;
      said += 'You score ' + plural(L.POINTS[me.pos - 1] || 0, 'point') + '. ';
      if (s.round >= 10) {
        s.done = true; var fin = standings(s), mine = fin.filter(function (r) { return r.me; })[0]; s.final = mine.pos;
        chTxt = 'Championship over! You finish the ' + c.name + ' P' + mine.pos + ' with ' + plural(mine.pts, 'point') + '. ';
        if (mine.pos === 1) chTxt += 'You are the champion! ';
        var nx = L.CHAMPS[c.index + 1];
        if (mine.pos <= 3 && nx && st.unlocked.indexOf(nx.id) < 0) { st.unlocked.push(nx.id); chTxt += 'The ' + nx.name + ' is now unlocked. '; }
        else if (mine.pos > 3 && nx && !isUnlocked(nx.id)) chTxt += 'Finish in the top three to unlock the ' + nx.name + '. ';
        st.active = null;
      } else {
        chTxt = standingsText(c, s, false) + 'Next: round ' + (s.round + 1) + ', ' + L.TRACKS[c.ids[s.round]].name + '. ';
        st.track = c.ids[s.round];
      }
      said += chTxt;
      var pp = document.createElement('p'); pp.textContent = chTxt + ' ' + standingsText(c, s, true); $('resChamp').appendChild(pp);
    }
    save();
    said += 'Results are on the screen. ' + (c && !st.champ[c.id].done ? 'Tap with three fingers for the next round.' : 'Tap with three fingers to race again.');
    setTimeout(function () { ann.say(said, { prio: 2, key: 'finish', queue: true }); }, 1500);
    var ol = $('resList'); ol.innerHTML = '';
    rows.forEach(function (r) { var li = document.createElement('li'); li.textContent = (r.player ? 'You' : r.name) + (r.pos === 1 ? ', winner' : ', ' + r.gap.toFixed(1) + ' seconds behind') + (c ? ', ' + plural(L.POINTS[r.pos - 1] || 0, 'point') : ''); ol.appendChild(li); });
    $('resTitle').textContent = 'Results: you finished P' + me.pos + ' of ' + rows.length;
    var lapsTxt = R.notes.lapTimes.map(function (t, i) { return 'lap ' + (i + 1) + ' ' + L.fmtShort(t); }).join(', ');
    $('resNote').textContent = 'Your laps: ' + lapsTxt + '. Fastest lap of the race: ' + (R.fastest ? (R.fastest.player ? 'you' : R.fastest.name) + ', ' + L.fmtShort(R.fastest.t) : 'none') + '. Overtakes: ' + R.notes.overtakes + '. Wall hits: ' + R.notes.walls + '. Crashes: ' + R.notes.crashes + '. Contacts: ' + R.notes.contacts + '.';
    $('resNext').style.display = c && !st.champ[c.id].done ? '' : 'none';
    $('resAgain').style.display = c ? 'none' : '';
    $('results').classList.add('on'); setBar('', '', 'Leave');
    G.rivalWon = false;
    setTimeout(function () { snd.silenceAll(); }, 6000);
  }
  function afterFinishTap() {
    if (G.mode !== 'race') return;
    snd.resume();
    if (G.champ && st.champ[G.champ] && !st.champ[G.champ].done) startRace('race', { champ: G.champ });
    else if (!G.champ) startRace('race');
  }

  // ---------- calibration ----------
  var CAL_STEPS = [
    'Calibration. Hold the phone sideways in both hands like a steering wheel, screen facing you, in your natural driving position. Keep it still, then tap the screen, or double-tap Record if VoiceOver is on.',
    'Now turn the wheel fully to the left, as far as is comfortable, and tap.',
    'Now turn it fully to the right, and tap.'
  ];
  function startCalib() {
    ann.clear(); G.race = null; G.phase = 'calib'; G.calStep = 0; G.calVals = []; G.mode = 'calib';
    showRace(true); setBar('Record', '', 'Leave'); hud('Calibration', 'Step 1 of 3: centre');
    ann.say(CAL_STEPS[0], { key: 'cal', prio: 1, queue: true });
    prepare().then(function (ok) {
      if (!ok) ann.say('Motion access was not allowed. Leave, then reload the page and allow Motion and Orientation access when asked.', { prio: 2 });
      setTimeout(function () { if (wheel.count === 0 && G.phase === 'calib') ann.say('I am not getting any readings from the phone\'s motion sensor yet.', { prio: 2 }); }, 3000);
    });
    focusMain(); loop();
  }
  function calibAdvance() {
    if (G.phase !== 'calib') return;
    var now = performance.now(); if (G.calLast && now - G.calLast < 600) return; G.calLast = now;
    if (G.calStep === 3) { leave(); status('Steering calibrated.'); return; }
    if (wheel.angle == null) { ann.say('No readings from the motion sensor yet. Hold on a moment and tap again.', { prio: 2 }); return; }
    if (G.calStep === 0 && wheel.upright < 0.4) { ann.say('The phone seems nearly flat. Tilt the screen up towards you, like a wheel, and tap again.', { prio: 2 }); return; }
    G.calVals[G.calStep] = wheel.angle; snd.ok();
    G.calStep++;
    if (G.calStep < 3) { ann.clear(); ann.say(CAL_STEPS[G.calStep], { prio: 2 }); hud('Calibration', 'Step ' + (G.calStep + 1) + ' of 3: ' + (G.calStep === 1 ? 'full left' : 'full right')); return; }
    var r = S.makeCal(G.calVals[0], G.calVals[1], G.calVals[2]);
    ann.clear();
    if (!r.ok) {
      G.calStep = 0; G.calVals = [];
      ann.say(r.problem === 'small' ? 'That turn was too small. Let\'s try again. Hold it centred and tap.' : 'Left and right came out the same way. Let\'s try again. Hold it centred and tap.', { prio: 2 });
      return;
    }
    st.cal = r.cal; save(); G.cal = r.cal; G.calPending = false;
    ann.say('Calibrated. ' + Math.round(Math.abs(r.cal.left)) + ' degrees to the left, ' + Math.round(Math.abs(r.cal.right)) + ' to the right. Now turn the wheel and hear the engine follow it. Tap when you are done.', { prio: 2 });
    hud('Calibrated', 'Turn to test, tap to finish');
    setBar('Finish', '', 'Leave');
  }
  function calibTick() {
    var idle = { rpm: 4200, thr: 0, pan: 0, speed: 0, kerb: 0, kerbSide: 0, off: false, offSide: 0, slide: 0, tunnel: false, crowd: 0, running: false };
    if (G.calStep === 3 && G.cal) {
      var s = S.mapSteer(wheel.angle, G.cal, { deadZone: +st.dead, sensitivity: +st.sens }); G.lastSteer = s;
      idle.rpm = 6000 + Math.abs(s) * 3000; idle.thr = 0.4; idle.pan = s; idle.running = true;
      $('hud2').textContent = 'steer ' + Math.round(s * 100);
    }
    snd.update(idle, []);
  }

  // ---------- practice lesson ----------
  function fake(parts) { return { parts: parts.map(function (p) { return { dir: p > 0 ? 1 : -1, sev: Math.abs(p) }; }) }; }
  function lessonSteps(auto) {
    var steps = [];
    function S_(o) { steps.push(o); }
    S_({ say: 'Practice lesson. I will explain each sound and call, then you try it. Each part starts when I stop talking. Tap with three fingers to pause.' });
    S_({ say: 'This is your engine, idling.', act: function (R, done) { G.demoRpm = 4200; later(1800, done); } });
    S_({ say: 'Now listen to all eight gears. Revs climb in each gear, then drop with a crackle as it changes up. I will call each gear.', setup: function (R) { G.demoRpm = null; R.straight = true; R.start(); centreNow(); R.cruise = 0; },
      act: function (R, done) { ann.say('First.', { prio: 2 }); R.cruise = 120; G.lesson.sayGears = true; var t0 = R.t; G.lesson.anim = function () { if ((R.player.gear >= 8 && R.player.v > 85) || R.t - t0 > 30) { G.lesson.anim = null; G.lesson.sayGears = false; ann.say('Eighth gear, flat out at over 300.', { prio: 1, queue: true, then: function () { later(200, done); } }); } }; } });
    S_({ say: 'Now hard braking. Listen for the blips and pops as it changes down.',
      act: function (R, done) { R.cruise = 30; var t0 = R.t; G.lesson.anim = function () { if (R.player.v < 32 || R.t - t0 > 15) { G.lesson.anim = null; later(900, done); } }; } });
    S_({ say: 'Your engine sits where your car is across the track. Turn the wheel left until you hear the kerb rumble on your left.', setup: function (R) { R.cruise = 30; },
      check: function (R) { return R.player.onKerb > 0 && R.player.y < 0; }, ok: 'That is the left kerb.' });
    S_({ say: 'Now steer right, across the track, to the kerb on your right.', check: function (R) { return R.player.onKerb > 0 && R.player.y > 0; }, ok: 'That is the right kerb.' });
    S_({ say: 'Now bring the car back to the middle, so your engine sounds centred, and hold it there.', check: function (R) { G.lesson.mid = Math.abs(R.player.y) < 1.2 ? (G.lesson.mid || 0) + 1 : 0; return G.lesson.mid > 90; }, ok: 'Good, centred.' });
    S_({ say: 'In a race, if you drift to the edge I say: Wide right, steer left. If you go past the kerb you hear gravel, and I say: Off track, steer left. Here is the gravel.', act: function (R, done) { G.demoOff = true; later(2200, function () { G.demoOff = false; done(); }); } });
    S_({ say: 'On street tracks there is no gravel. The barrier is right beside the track. A big hit at speed is a crash, and you wait three seconds before you go again.', act: function (R, done) { snd.crash(20, -0.6); later(1500, done); } });
    if (!auto) {
      S_({ say: 'Pedals. Hold one thumb anywhere on the screen to accelerate. Lift it to coast. Get up to 200 kilometres an hour.', setup: function (R) { R.cruise = null; }, check: function (R) { return R.player.v >= 55.5; }, timeout: 45, ok: '200.' });
      S_({ say: 'Now put a second thumb on the screen to brake, and come to a stop.', check: function (R) { return R.player.v < 2; }, timeout: 40, ok: 'Stopped.' });
    } else S_({ say: 'You chose automatic speed, so the game accelerates and brakes for you. You only steer.' });
    S_({ say: 'Corner calls. I call each corner early, with its direction, how tight it is, and the distance in metres. Like this.', setup: function (R) { R.cruise = 0; } });
    S_({ say: 'Right hairpin in 250, heavy braking.' + (auto ? '' : ' Then, at the braking point: Brake now!') + ' Then, as you reach it: Turn right.' });
    S_({ say: 'Corners from slowest to fastest are: hairpin, tight, slow, medium and fast. Flat out means no braking at all. A chicane is: Chicane, left then right. And I say: Now right, for its second part.' });
    S_({ say: 'In a corner your car drifts to the outside, so steer into the corner, and hold it until your engine sounds centred again. Tyres hiss near the limit of grip and squeal when you are going too fast.' });
    S_({ say: 'Rival cars. A car is coming past you on your left.', setup: function (R) { R.cruise = 38; R.cars = R.cars.filter(function (c) { return c.player; }); var c = R.mkCar(false, 'Rival', R.player.s - 70, R.player.y - 3.5, 0.9); c.fixedV = 56; c.v = 56; R.cars.push(c); snd.setRivalCount(R.cars.length - 1); G.lesson.rival = c; },
      check: function (R) { return G.lesson.rival.s - R.player.s > 70; }, timeout: 20, ok: 'Its sound moved forward and dropped in pitch as it passed.' });
    S_({ say: 'Now overtake. A slower car is ahead of you in your lane. Steer into another lane, go past it, and keep clear of it.', setup: function (R) {
        R.cars = R.cars.filter(function (c) { return c.player; }); var c = R.mkCar(false, 'Rival', R.player.s + 90, R.player.y, 0.9); c.fixedV = 24; c.v = 24; R.cars.push(c); snd.setRivalCount(1); G.lesson.rival = c; G.lesson.contact = false;
        R.cruise = auto ? 40 : null; if (!auto) R.player.v = Math.max(R.player.v, 20);
      },
      check: function (R) { if (G.lesson.contact && !G.lesson.saidContact) { G.lesson.saidContact = true; ann.say('Contact. Steer away from its sound.', { prio: 2 }); } return R.player.s - G.lesson.rival.s > 20; }, timeout: 60, ok: 'You are past it. Well done.' });
    S_({ say: 'The race start. Five beeps for the five red lights, with a count, a short wait, then this rising tone means lights out. Go.', setup: function (R) { R.cars = R.cars.filter(function (c) { return c.player; }); snd.setRivalCount(0); R.cruise = 0; },
      act: function (R, done) { var k = 0; (function b() { if (k < 5) { snd.light(); k++; later(1000, b); } else later(1300, function () { snd.lightsOut(); later(900, done); }); })(); } });
    S_({ say: 'Last part. A full lap of the practice ring with corner calls. Your practice notes come at the end. The lights start when I stop talking.', setup: function (R) { R.cruise = 0; },
      act: function (R, done) {
        R.straight = false; R.cruise = null; R.player.s = -15; R.player.lap = 0; R.player.y = 0; R.player.v = 0; R.cueState = {}; R.straightState = {}; R.lapNotesCur = { off: {}, walls: 0, contacts: 0, entryErr: {} };
        R.started = false; G.lesson.free = true; G.phase = 'lights'; G.lightsT = 0; G.lightN = 0; G.holdT = 1 + Math.random(); centreNow();
        G.lesson.lapDone = function (lt, note) { G.lesson.lapDone = null; done(lt, note); };
      }, final: true });
    return steps;
  }
  var timers = [];
  function later(ms, fn) { var id = G.runId; var t = setTimeout(function () { if (id === G.runId && !G.paused) fn(); else if (id === G.runId && G.paused) G.lesson && (G.lesson.resumeFn = fn); }, ms); timers.push(t); return t; }
  function startLesson() {
    ann.clear();
    var R = newRace('lesson');
    G.phase = 'lesson'; G.lesson = { i: -1, steps: lessonSteps(R.auto) };
    showRace(true); setBar('', 'Pause', 'Leave'); hud('Lesson');
    prepare().then(function (ok) { if (!ok) ann.say('Motion access was not allowed, so steering will not work. Leave, then reload the page and allow Motion and Orientation access.', { prio: 2 }); });
    focusMain(); loop();
    lessonNext();
  }
  function lessonNext() {
    var Ls = G.lesson; if (!Ls) return;
    Ls.i++; Ls.check = null; Ls.mid = 0; Ls.anim = null;
    var s = Ls.steps[Ls.i], R = G.race, id = G.runId;
    if (!s) return lessonEnd();
    if (s.setup) s.setup(R);
    hud('Lesson', 'Part ' + (Ls.i + 1) + ' of ' + Ls.steps.length);
    ann.say(s.say, { key: 'lesson', prio: 1, queue: true, then: function () { if (id !== G.runId || G.lesson !== Ls || Ls.steps[Ls.i] !== s || G.paused) return; lessonGo(s); } });
  }
  function lessonGo(s) {
    var Ls = G.lesson, R = G.race;
    if (s.check) { Ls.check = s.check; Ls.deadline = R.t + (s.timeout || 30); Ls.stepRef = s; return; }
    if (s.act) { s.act(R, function (lt, note) { if (G.lesson !== Ls) return; if (s.final) return lessonEnd(lt, note); lessonNext(); }); return; }
    later(250, lessonNext);
  }
  function lessonTick() {
    var Ls = G.lesson, R = G.race;
    if (Ls.anim) Ls.anim();
    if (Ls.check) {
      var s = Ls.stepRef;
      if (Ls.check(R)) { Ls.check = null; snd.ok(); ann.say(s.ok || 'Good.', { key: 'lesson', prio: 1, queue: true, then: function () { if (G.lesson === Ls) lessonNext(); } }); }
      else if (R.t > Ls.deadline) { Ls.check = null; ann.say('Let\'s move on.', { key: 'lesson', prio: 1, queue: true, then: function () { if (G.lesson === Ls) lessonNext(); } }); }
    }
  }
  function lessonRepeat() {
    var Ls = G.lesson; if (!Ls) return;
    if (Ls.resumeFn) { var f = Ls.resumeFn; Ls.resumeFn = null; f(); return; }
    var s = Ls.steps[Ls.i]; if (!s) return;
    if (Ls.check) { Ls.deadline = G.race.t + (s.timeout || 30); ann.say(s.say, { key: 'lesson', prio: 1, queue: true }); return; }
    if (s.final && G.lesson.lapDone) { ann.say('Carry on with your lap.', { prio: 1 }); return; }
    Ls.i--; lessonNext();
  }
  function lessonEnd(lt, note) {
    G.phase = 'finished'; G.lesson = null;
    snd.cheer(0.5);
    ann.say('Lesson complete. ' + (lt ? 'Your lap took ' + L.fmtTime(lt) + '. ' + (note || '') + ' ' : '') + 'Next, try a race or start the Rookie Cup championship. Turn VoiceOver back on and double-tap Leave.', { key: 'lesson', prio: 2, queue: true });
    setBar('', '', 'Leave');
    setTimeout(function () { snd.silenceAll(); }, 3000);
  }
  // in the lesson the final lap uses the normal corner calls; G.lesson.free lets them through
  var origHandle = handle;
  handle = function (evs) { if (G.lesson && !G.lesson.free) evs = evs.filter(function (e) { return !/^(cue|brakeCue|turnCall|straight)$/.test(e.type); }); origHandle(evs); };

  // ---------- menu wiring ----------
  $('bRace').addEventListener('click', function () { G.champLaunch = false; startRace('race'); });
  $('bChamp').addEventListener('click', function () {
    var a = st.active && st.champ[st.active];
    if (a && !a.done) champGo(st.active, false); else show('vTracks');
  });
  $('bTracks').addEventListener('click', function () { var c = champOf(st.track); if (c) openChamp(c.id); else show('vTracks'); });
  $('bPractice').addEventListener('click', function () { startRace('practice'); });
  $('bLesson').addEventListener('click', function () { startLesson(); });
  $('bCalib').addEventListener('click', function () { startCalib(); });
  $('selRace').addEventListener('click', function () { startRace('race'); });
  $('selPractice').addEventListener('click', function () { startRace('practice'); });
  $('selHear').addEventListener('click', function () { prepare(); ann.clear(); ann.say(L.buildTrack(st.track).desc.long, { prio: 1, queue: true }); });
  $('rMain').addEventListener('click', function () {
    if (G.paused) { resume(); return; }
    if (G.phase === 'grid') { snd.unlock(); beginLights(); }
    else if (G.phase === 'calib') calibAdvance();
  });
  $('rInfo').addEventListener('click', info);
  $('rPause').addEventListener('click', function () { if (G.paused) resume(); else pause(false); });
  $('rLeave').addEventListener('click', leave);
  $('resAgain').addEventListener('click', function () { startRace('race'); });
  $('resNext').addEventListener('click', function () { afterFinishTap(); });
  $('resMenu').addEventListener('click', leave);
  $('bTestVoice').addEventListener('click', function () {
    prepare(); ann.clear();
    ann.say('This is your race engineer. Right hairpin in 250, heavy braking.', { prio: 1, queue: true });
  });
  $('bReset').addEventListener('click', function () {
    if (!window.confirm('Reset all championships, records and unlocks? Settings are kept.')) return;
    st.rec = {}; st.champ = {}; st.unlocked = ['c1']; st.active = null; save(); status('Progress reset.');
  });
  buildSettings();
  function fillVoices() {
    var sel = $('sVoice'), vs = ann.voices().filter(function (v) { return /^en/i.test(v.lang); });
    if (!vs.length) return;
    var cur = st.voice; sel.innerHTML = '';
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Automatic British voice'; sel.appendChild(o0);
    vs.forEach(function (v) { var o = document.createElement('option'); o.value = v.voiceURI; o.textContent = v.name + ' (' + v.lang + ')'; sel.appendChild(o); });
    sel.value = cur; if (sel.value !== cur) sel.value = '';
  }
  $('sVoice').addEventListener('change', function () { st.voice = $('sVoice').value; save(); applySettings(); });
  fillVoices(); setTimeout(fillVoices, 800);
  try { speechSynthesis.addEventListener('voiceschanged', fillVoices); } catch (e) {}
  function renderCal() { $('calInfo').textContent = st.cal ? 'Steering is calibrated: ' + Math.round(Math.abs(st.cal.left)) + ' degrees left, ' + Math.round(Math.abs(st.cal.right)) + ' degrees right.' : 'Steering not calibrated yet. It still works, centred on how you hold the phone at the start, but calibrating feels best.'; }
  function renderRecords() {
    var box = $('best'), html = '', any = false;
    L.CHAMPS.forEach(function (c) {
      var s = st.champ[c.id], lines = [];
      if (s && (s.round || s.done)) lines.push('<li><strong>Championship:</strong> ' + esc(standingsText(c, s, false)) + '</li>');
      c.ids.forEach(function (id) { var r = st.rec[id]; if (!r) return; lines.push('<li><strong>' + esc(L.TRACKS[id].name) + ':</strong> ' + [r.lap ? 'best lap ' + L.fmtShort(r.lap) : '', r.pos ? 'best finish P' + r.pos : '', r.wins ? plural(r.wins, 'win') : '', r.races ? plural(r.races, 'race') : ''].filter(Boolean).join(', ') + '</li>'); });
      if (lines.length) { any = true; html += '<h3>' + esc(c.name) + (isUnlocked(c.id) ? '' : ', locked') + '</h3><ul class="plain">' + lines.join('') + '</ul>'; }
    });
    box.innerHTML = any ? html : '<p>No races yet. Championships unlocked: ' + L.CHAMPS.filter(function (c) { return isUnlocked(c.id); }).length + ' of 10.</p>';
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  applySettings();
  show('vHome');
  if ('serviceWorker' in navigator && location.protocol === 'https:') { try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {} }
  window.__f1.api = { startRace: startRace, startLesson: startLesson, startCalib: startCalib, beginLights: beginLights, pause: pause, resume: resume, leave: leave, calibAdvance: calibAdvance, onPadTap: onPadTap, info: info, champGo: champGo, openChamp: openChamp, selectTrack: selectTrack, show: show };
})();
