/* F1 by Ear 2 - what the race engineer and commentator say. Varied lines, never the same twice in a row. */
(function (root) {
  'use strict';
  var last = {};
  function pick(key, arr, vars) {
    var i, tries = 0;
    do { i = Math.floor(Math.random() * arr.length); tries++; } while (arr.length > 1 && i === last[key] && tries < 6);
    last[key] = i;
    return fill(arr[i], vars);
  }
  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] != null ? v[k] : ''; }); }
  var ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
  var NUMW = ['zero', 'One', 'Two', 'Three', 'Four', 'Five'];
  function secs(t) { return t < 10 ? t.toFixed(1) : String(Math.round(t)); }
  function lapTime(t) { var m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ' ' : '') + (m && s < 10 ? 'oh ' : '') + s.toFixed(1); }
  var W = {
    pick: pick, fill: fill, secs: secs, lapTime: lapTime, ORD: ORD, NUMW: NUMW,
    // Corner call. dist in metres (already measured when the line starts).
    corner: function (words, dist, action, then) {
      var s = (then ? 'Then ' + words.charAt(0).toLowerCase() + words.slice(1) : words);
      if (dist >= 90) s += ' in ' + (Math.round(dist / 50) * 50);
      if (action) s += ', ' + action;
      return s + '.';
    },
    action: function (needBrake, drop, flat, auto) {
      if (flat) return 'flat out';
      if (!needBrake) return auto ? '' : 'stay flat';
      if (auto) return drop < 0.5 ? 'big stop' : '';
      return drop < 0.5 ? 'heavy braking' : drop < 0.85 ? 'brake' : 'lift';
    },
    brakeNow: ['Brake now!', 'Brake!', 'Brake, brake!'],
    liftNow: ['Lift!', 'Lift now!'],
    turn: function (dir, k) { return (k ? 'Now ' : 'Turn ') + (dir > 0 ? 'right' : 'left') + '.'; },
    straight: ['Long straight.', 'Long straight, flat out.', 'Big straight now. Full throttle.', 'Long straight, use all eight gears.'],
    wide: ['Wide {side}! Steer {back}.', 'Drifting {side}, steer {back}.', 'Running wide {side}, bring it {back}.'],
    off: ['Off track, {side} side. Steer {back}.', 'You\'re off on the {side}. Steer {back}.', 'Off the track {side}. Come back {back}.'],
    offAgain: ['Steer {back}.', 'Still off. Steer {back}.', 'Keep steering {back}.'],
    rejoin: ['Back on track.', 'Back on the tarmac.', 'Good, back on.'],
    wall: ['Barrier on the {side}!', 'Wall hit, {side} side.', 'Into the barrier, {side}.'],
    crash: ['Big crash! Hold on, the marshals will get you going.', 'Crash! Stay with me, we will get you back out.', 'Heavy impact! Hold on a moment.'],
    recover: ['Back on track. Go, go!', 'You\'re going again. Full throttle.', 'Rejoining now. Off you go.'],
    contact: ['Contact with {n}!', 'You touched {n}!', 'Wheel to wheel with {n}, contact!'],
    overtake: ['You\'re past {n}.', 'Great move on {n}!', 'Through on {n}.', '{n} is behind you now.', 'Overtake done, {n} is gone.', 'Lovely move, past {n}.'],
    lapped: ['Lapping {n}.', 'Past the backmarker, {n}.'],
    overtaken: ['{n} has got past you.', '{n} goes by.', 'Lost a place to {n}.', '{n} is through.', '{n} sneaks past.'],
    gained: ['Up to P{p}.', 'P{p} now.', 'Into P{p}!', 'Gained a place. P{p}.'],
    lost: ['Down to P{p}.', 'P{p} now.', 'Dropped to P{p}.'],
    mistake: ['{n} runs wide at {c}!', '{n} has a big moment at {c}!', 'Lock-up for {n} at {c}!', '{n} is off line at {c}!'],
    defend: ['{n} moves over to defend.', '{n} is covering your line.', '{n} defends hard.', '{n} blocks, try the other side.'],
    slip: ['In the slipstream of {n}. Pull out and pass!', 'Good tow from {n}.', 'Slipstream on {n}, you\'re catching fast.'],
    fastestMe: ['Fastest lap of the race! {t}.', 'Purple! Fastest lap, {t}.', 'That\'s the fastest lap of the race, {t}.'],
    fastestOther: ['{n} sets the fastest lap, {t}.', 'Fastest lap to {n}, {t}.'],
    bestMe: ['Your best lap so far.', 'Personal best.'],
    limiter: ['On the limiter.', 'Bouncing off the rev limiter.'],
    gear: function (g) { return ORD[g] + '.'; },
    lights: function (n) { return NUMW[n] + '.'; },
    go: ['Lights out! Go, go, go!', 'Lights out and away we go!', 'Go, go, go!'],
    finalLap: ['Final lap!', 'Last lap, give it everything!', 'Final lap now.'],
    lap: ['Lap {l} of {n}.', 'Lap {l}, {n} to go.']
  };
  W.lapLine = function (l, n) { return n - l + 1 === 1 ? pick('fl', W.finalLap) : (Math.random() < 0.5 ? fill('Lap {l} of {n}.', { l: l, n: n }) : fill('Lap {l}, {r} to go.', { l: l, r: n - l + 1 })); };
  W.gaps = function (g) {
    var a = [];
    if (g.ahead) a.push(g.ahead.t < 0.3 ? g.ahead.name + ' right ahead' : g.ahead.name + ' ' + secs(g.ahead.t) + ' ahead');
    if (g.behind) a.push(g.behind.t < 0.3 ? g.behind.name + ' right behind' : g.behind.name + ' ' + secs(g.behind.t) + ' behind');
    return a.length ? a.join(', ') + '.' : '';
  };
  W.sides = function (side) { return { side: side > 0 ? 'right' : 'left', back: side > 0 ? 'left' : 'right' }; };
  if (typeof module !== 'undefined' && module.exports) module.exports = W; else root.F1W = W;
})(this);
