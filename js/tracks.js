/* F1 by Ear 2 - track library. 100 race tracks in 10 championships, plus the practice ring.
   Six signature tracks are laid out by hand ("-style": inspired by famous circuits, not copies).
   The other 94 are built from a written spec (name, length, corners, character, difficulty)
   and a fixed seed, so every track is the same every time. Pure data and maths: works in Node too. */
(function (root) {
  'use strict';
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function between(r, a, b) { return a + (b - a) * r(); }
  var D2R = Math.PI / 180;

  // ---------- hand-laid signature tracks (r: signed radius in metres, + right, - left) ----------
  var SIG = {
    monza: { name: 'Monza-style speedway', lanes: 4, runoff: 'gravel', runoffW: 7, diff: 2, crowd: [[-250, 320], [3900, 4150]],
      blurb: 'The temple of speed. Long flat-out straights broken by two slow chicanes, the Lesmo bends, Ascari and the long Parabolica.',
      segs: [{ len: 1000 }, { len: 32, r: 26, n: 'the first chicane' }, { len: 32, r: -26, n: 'the first chicane' }, { len: 260 },
        { len: 480, r: 360, n: 'Curva Grande' }, { len: 330 }, { len: 30, r: -30, n: 'the second chicane' }, { len: 30, r: 30, n: 'the second chicane' }, { len: 260 },
        { len: 110, r: 95, n: 'Lesmo 1' }, { len: 160 }, { len: 90, r: 75, n: 'Lesmo 2' }, { len: 880 },
        { len: 80, r: -95, n: 'Ascari' }, { len: 90, r: 120, n: 'Ascari' }, { len: 90, r: -160, n: 'Ascari' }, { len: 980 },
        { len: 120, r: 70, n: 'Parabolica' }, { len: 220, r: 140, n: 'Parabolica' }, { len: 150 }] },
    silverstone: { name: 'Silverstone-style airfield circuit', lanes: 4, runoff: 'gravel', runoffW: 8, diff: 3, crowd: [[-200, 300], [2900, 3300]],
      blurb: 'A fast old airfield. Big flowing right-handers, a slow loop in the middle, and a sequence of very fast esses that rewards a smooth wheel.',
      segs: [{ len: 420 }, { len: 110, r: 150, n: 'the first fast right' }, { len: 130 }, { len: 80, r: -110, n: 'the left kink' }, { len: 300 },
        { len: 38, r: 16, n: 'the village loop' }, { len: 36, r: -15, n: 'the village loop' }, { len: 50 }, { len: 60, r: -45, n: 'the infield left' }, { len: 760 },
        { len: 70, r: 40, n: 'the slow right' }, { len: 70 }, { len: 80, r: 45, n: 'the long double right' }, { len: 30 }, { len: 70, r: 60, n: 'the long double right' }, { len: 360 },
        { len: 130, r: 300, n: 'the flat-out right' }, { len: 460 }, { len: 120, r: 120, n: 'the big right' }, { len: 340 },
        { len: 70, r: -110, n: 'the fast esses' }, { len: 70, r: 100, n: 'the fast esses' }, { len: 70, r: -95, n: 'the fast esses' }, { len: 60, r: 85, n: 'the fast esses' }, { len: 80, r: -70, n: 'the fast esses' }, { len: 820 },
        { len: 120, r: 75, n: 'the long right at the end of the straight' }, { len: 300 }, { len: 45, r: -25, n: 'the final complex' }, { len: 45, r: 22, n: 'the final complex' }, { len: 60, r: 50, n: 'the final complex' }, { len: 380 }] },
    spa: { name: 'Spa-style forest circuit', lanes: 4, runoff: 'gravel', runoffW: 7, diff: 4, crowd: [[-200, 260], [6300, 6600]],
      blurb: 'A long forest classic. A tight hairpin straight away, a fast climbing S-bend, one of the longest straights anywhere, a double left, and a flat-out kink before the final chicane.',
      segs: [{ len: 320 }, { len: 34, r: 12, n: 'the opening hairpin' }, { len: 380 }, { len: 60, r: -90, n: 'the climbing S-bend' }, { len: 60, r: 85, n: 'the climbing S-bend' }, { len: 70, r: -110, n: 'the climbing S-bend' },
        { len: 1600 }, { len: 34, r: 30, n: 'the top chicane' }, { len: 34, r: -28, n: 'the top chicane' }, { len: 40, r: 40, n: 'the top chicane' }, { len: 380 },
        { len: 45, r: 20, n: 'the downhill hairpin' }, { len: 420 }, { len: 140, r: -100, n: 'the double left' }, { len: 40 }, { len: 120, r: -90, n: 'the double left' }, { len: 500 },
        { len: 90, r: 70, n: 'the fast right' }, { len: 260 }, { len: 70, r: -45, n: 'the forest left' }, { len: 420 }, { len: 100, r: -110, n: 'the long left' }, { len: 700 },
        { len: 100, r: 320, n: 'the flat-out kink' }, { len: 650 }, { len: 30, r: 20, n: 'the bus stop chicane' }, { len: 30, r: -18, n: 'the bus stop chicane' }, { len: 260 }] },
    monaco: { name: 'Monaco-style street circuit', lanes: 3, runoff: 'wall', runoffW: 1.0, diff: 4, crowd: [[-200, 250], [1450, 1700], [2700, 2900]],
      blurb: 'Tight and slow. Barriers right beside the track, a hairpin, a tunnel and a harbour chicane. One mistake and you are in the wall.',
      segs: [{ len: 380 }, { len: 45, r: 28, n: 'Sainte Devote' }, { len: 120 }, { len: 380, r: -420, n: 'Beau Rivage' },
        { len: 90, r: -55, n: 'Massenet' }, { len: 40 }, { len: 55, r: 40, n: 'Casino' }, { len: 170 },
        { len: 40, r: 20, n: 'Mirabeau' }, { len: 110 }, { len: 34, r: -11, n: 'the hairpin' }, { len: 90 },
        { len: 35, r: 19, n: 'the second Mirabeau' }, { len: 60 }, { len: 40, r: 22, n: 'Portier' }, { len: 60 },
        { len: 520, r: 320, n: 'the tunnel', tunnel: true }, { len: 220 },
        { len: 26, r: -18, n: 'the harbour chicane' }, { len: 26, r: 18, n: 'the harbour chicane' }, { len: 200 },
        { len: 48, r: -40, n: 'Tabac' }, { len: 150 },
        { len: 38, r: -55, n: 'the swimming pool' }, { len: 38, r: 55, n: 'the swimming pool' }, { len: 110 },
        { len: 38, r: 60, n: 'the second swimming pool' }, { len: 38, r: -60, n: 'the second swimming pool' }, { len: 120 },
        { len: 48, r: 15, n: 'Rascasse' }, { len: 50 }, { len: 40, r: 25, n: 'Anthony Noghes' }, { len: 300 }] },
    suzuka: { name: 'Suzuka-style technical circuit', lanes: 4, runoff: 'gravel', runoffW: 6, diff: 4, crowd: [[-200, 300], [5300, 5600]],
      blurb: 'A driver\'s circuit. A double right, a long run of S-curves, a hairpin, a long double-apex left and a frightening flat-out left before the last chicane.',
      segs: [{ len: 650 }, { len: 110, r: 70, n: 'the opening double right' }, { len: 30 }, { len: 60, r: 55, n: 'the opening double right' }, { len: 130 },
        { len: 50, r: -60, n: 'the S-curves' }, { len: 50, r: 55, n: 'the S-curves' }, { len: 50, r: -55, n: 'the S-curves' }, { len: 55, r: 60, n: 'the S-curves' }, { len: 260 },
        { len: 60, r: 35, n: 'the double right' }, { len: 50 }, { len: 40, r: 30, n: 'the double right' }, { len: 260 }, { len: 34, r: -11, n: 'the hairpin' }, { len: 450 },
        { len: 200, r: 250, n: 'the long right' }, { len: 260 }, { len: 90, r: -55, n: 'the spoon' }, { len: 40 }, { len: 80, r: -60, n: 'the spoon' }, { len: 1000 },
        { len: 120, r: -330, n: 'the flat-out left' }, { len: 400 }, { len: 28, r: 20, n: 'the final chicane' }, { len: 28, r: -20, n: 'the final chicane' }, { len: 320 }] },
    interlagos: { name: 'Interlagos-style bowl circuit', lanes: 4, runoff: 'gravel', runoffW: 6, diff: 4, crowd: [[-250, 300], [3800, 4100]],
      blurb: 'Anticlockwise, so mostly left-handers. A tricky S-bend at the start, a twisting infield, and a long flat-out left curve up to the line.',
      segs: [{ len: 500 }, { len: 40, r: -28, n: 'the opening S-bend' }, { len: 40, r: 25, n: 'the opening S-bend' }, { len: 60, r: -60, n: 'the opening S-bend' }, { len: 620 },
        { len: 50, r: -40, n: 'the descending left' }, { len: 260 }, { len: 80, r: 55, n: 'the infield right' }, { len: 160 }, { len: 70, r: -40, n: 'the infield left' }, { len: 110 },
        { len: 60, r: 30, n: 'the slow right' }, { len: 160 }, { len: 100, r: -50, n: 'the long left' }, { len: 130 }, { len: 45, r: -25, n: 'the tight left' }, { len: 210 },
        { len: 50, r: 35, n: 'the last right' }, { len: 160 }, { len: 60, r: -45, n: 'the junction' }, { len: 260 }, { len: 300, r: -350, n: 'the flat-out curve' }, { len: 500 }] },
    ring: { name: 'Practice ring', lanes: 4, runoff: 'gravel', runoffW: 7, diff: 1, crowd: [],
      blurb: 'A short practice loop with one corner of each kind.',
      segs: [{ len: 650 }, { len: 160, r: 130, n: 'the fast right' }, { len: 350 }, { len: 70, r: -38, n: 'the medium left' },
        { len: 420 }, { len: 36, r: -12, n: 'the hairpin' }, { len: 280 }, { len: 28, r: 24, n: 'the chicane' }, { len: 28, r: -24, n: 'the chicane' }, { len: 380 },
        { len: 200, r: 220, n: 'the long right' }, { len: 200 }] }
  };

  // ---------- procedural tracks ----------
  // corner building blocks: radius range (m) and angle range (degrees)
  var K = { hairpin: [10, 15, 150, 185], tight: [15, 20, 75, 115], slow: [20, 30, 65, 110], medium: [32, 60, 55, 100], fast: [70, 150, 40, 85], sweeper: [180, 420, 30, 75], kink: [320, 700, 8, 18] };
  // weights of each feature, by character
  var CHAR = {
    flowing: { w: { medium: 2, fast: 3, sweeper: 3, kink: 1, esses: 2, hairpin: 0.4, chicane: 0.5, slow: 1, double: 1 }, straights: 1.2, text: 'Flowing and fast, with long sweeping bends.' },
    fast: { w: { fast: 3, sweeper: 3, kink: 2, esses: 2, medium: 1, chicane: 0.6, hairpin: 0.3 }, straights: 1.6, text: 'Very fast. Mostly quick bends you can take near flat out.' },
    power: { w: { chicane: 3, slow: 2, hairpin: 1.5, kink: 2, medium: 1, fast: 1 }, straights: 2.6, text: 'A power circuit. Long straights broken by slow corners and chicanes, so brake hard and get on the power early.' },
    stopgo: { w: { hairpin: 3, tight: 2, slow: 2, chicane: 2, medium: 0.5 }, straights: 2.2, text: 'Stop and go. Straights into hairpins and slow corners, again and again. Braking is everything.' },
    mixed: { w: { hairpin: 1, tight: 1, slow: 1.5, medium: 2, fast: 2, sweeper: 1, kink: 1, chicane: 1, esses: 1, double: 1, tighten: 0.7 }, straights: 1.4, text: 'A bit of everything: fast bends, slow corners and a chicane or two.' },
    technical: { w: { slow: 3, medium: 3, hairpin: 1.5, tight: 1.5, double: 2, tighten: 1.5, chicane: 1.5, esses: 1 }, straights: 0.8, text: 'Technical and twisty. Corner after corner, with short straights and corners that tighten.' },
    street: { w: { tight: 3, slow: 3, hairpin: 1.2, chicane: 2, medium: 1.5, kink: 0.8, double: 1 }, straights: 0.9, text: 'A street circuit: right-angle corners between barriers, with no room for error.' }
  };
  function pick(r, w) { var tot = 0, k; for (k in w) tot += w[k]; var x = r() * tot; for (k in w) { x -= w[k]; if (x <= 0) return k; } return k; }
  function part(r, kind, dir, diff) {
    var k = K[kind], tight = 1 - 0.05 * (diff - 1); // harder tracks have slightly tighter bends
    var rad = between(r, k[0], k[1]) * (kind === 'kink' || kind === 'sweeper' ? 1 : tight), ang = between(r, k[2], k[3]);
    return { len: Math.max(18, Math.round(rad * ang * D2R)), r: Math.round(dir * rad) };
  }
  // one corner group (array of parts) of a feature type
  function feature(r, f, dir, diff) {
    var a = [], i, n;
    switch (f) {
      case 'chicane': var ck = r() < 0.25 + 0.1 * diff ? 'slow' : 'medium'; a.push(part(r, ck, dir, diff)); a.push(part(r, ck, -dir, diff)); a.forEach(function (p) { p.len = Math.round(p.len * 0.6); }); break;
      case 'esses': n = r() < 0.5 ? 3 : 4; for (i = 0; i < n; i++) { var ep = part(r, r() < 0.6 ? 'fast' : 'medium', i % 2 ? -dir : dir, diff); ep.len = Math.round(ep.len * 0.7); a.push(ep); } break;
      case 'double': a.push(part(r, 'medium', dir, diff)); a.push({ len: Math.round(between(r, 25, 45)) }); a.push(part(r, r() < 0.5 ? 'medium' : 'slow', dir, diff)); break;
      case 'tighten': a.push(part(r, 'fast', dir, diff)); a.push(part(r, r() < 0.5 ? 'slow' : 'tight', dir, diff)); break;
      default: a.push(part(r, f, dir, diff));
    }
    return a;
  }
  // spec: [name, km, corners, character, difficulty 1-5, flags]  flags: w = walls, n = narrow (3 lanes)
  function generate(spec, seed) {
    var name = spec[0], km = spec[1], N = spec[2], ch = CHAR[spec[3]], diff = spec[4], flags = spec[5] || '';
    var r = rng(seed * 7919 + 17), groups = [], i, last = '';
    var rightBias = r() < 0.75 ? 0.6 : 0.4;
    for (i = 0; i < N; i++) {
      var w = {}, k; for (k in ch.w) w[k] = ch.w[k] * (k === last ? 0.35 : 1);
      if (diff >= 4) { w.hairpin = (w.hairpin || 0) + 0.5; w.chicane = (w.chicane || 0) + 0.4; }
      var f = pick(r, w); last = f;
      groups.push({ f: f, parts: feature(r, f, r() < rightBias ? 1 : -1, diff) });
    }
    var cornerLen = 0; groups.forEach(function (g) { g.parts.forEach(function (p) { cornerLen += p.len; }); });
    var minGap = Math.round(170 - 22 * diff), startMin = 380;
    var target = km * 1000, S = target - cornerLen;
    // gap weights: heavy-tailed for power tracks, even for technical ones
    var ws = [], tot = 0;
    for (i = 0; i <= N; i++) { var x = Math.pow(r(), ch.straights) * 1 + 0.15; if (i === 0 || i === N) x *= 1.4; ws.push(x); tot += x; }
    var spare = S - minGap * (N - 1) - startMin; if (spare < 0) spare = 0;
    var gaps = ws.map(function (x, gi) { return Math.round((gi === 0 || gi === N ? startMin / 2 : minGap) + spare * x / tot); });
    // make sure the gap that follows a slow corner is not shorter than the minimum, and the start straight is long
    var segs = [{ len: gaps[0] }], ti = 0;
    groups.forEach(function (g, gi) {
      ti++;
      g.parts.forEach(function (p) { var s = { len: p.len }; if (p.r) { s.r = p.r; s.n = 'Turn ' + ti; } segs.push(s); });
      segs.push({ len: gaps[gi + 1] });
    });
    var lanes = flags.indexOf('n') >= 0 ? 3 : 4, wall = flags.indexOf('w') >= 0;
    return { name: name, lanes: lanes, runoff: wall ? 'wall' : 'gravel', runoffW: wall ? 1.0 : Math.max(3.5, 9 - 1.2 * diff), diff: diff, character: spec[3], blurb: ch.text, segs: segs, crowd: [[-250, 300]] };
  }

  // ---------- the championships ----------
  var CH = [
    { id: 'c1', name: 'Rookie Cup', blurb: 'Gentle, wide tracks with gravel run-off. The place to learn.', base: 0.0, tracks: [
      ['Ashby Fields', 2.2, 6, 'flowing', 1], ['Kelderton Park', 2.6, 7, 'mixed', 1], ['Marsh Lane Circuit', 2.4, 6, 'power', 1], ['Brindle Heath', 2.9, 8, 'flowing', 1], ['Oakwell Raceway', 3.1, 7, 'fast', 1],
      ['Hollin Green', 2.5, 8, 'mixed', 1], ['Fennick Park', 3.0, 8, 'stopgo', 1], ['Copley Downs', 3.3, 9, 'flowing', 1], ['Thornbury Ring', 2.8, 9, 'technical', 1], ['Wexley Airfield', 3.4, 8, 'power', 1]] },
    { id: 'c2', name: 'Coastal Trophy', blurb: 'Seaside circuits: flowing, fast and a little longer.', base: 0.006, tracks: [
      ['Saltmarsh Bay', 3.0, 8, 'flowing', 1], ['Cliffside Raceway', 3.4, 9, 'fast', 2], ['Port Averna', 2.9, 10, 'mixed', 2], ['Gullhaven Circuit', 3.6, 9, 'flowing', 2], ['Lighthouse Point', 3.2, 10, 'technical', 2],
      ['Seacombe Ring', 3.8, 10, 'fast', 2], ['Dunewater Park', 3.5, 11, 'mixed', 2], ['Harbour Reach', 3.1, 10, 'street', 2, 'w'], ['Kestrel Head', 4.0, 10, 'flowing', 2], ['Tidewater Circuit', 4.2, 11, 'mixed', 2]] },
    { id: 'c3', name: 'Speedway Series', blurb: 'Power circuits. Huge straights, big braking zones and slipstream battles.', base: 0.012, tracks: [
      ['Velocity Park', 3.8, 7, 'power', 2], ['Longmeadow Speedway', 4.4, 8, 'power', 2], ['Ironbridge Raceway', 4.0, 9, 'stopgo', 2], ['Calderfield Speedway', 4.8, 8, 'power', 2], ['Hawkstone Airfield', 4.6, 9, 'fast', 2],
      ['Brackenmoor Raceway', 4.2, 10, 'stopgo', 3], ['Steelworks Ring', 3.9, 10, 'power', 3], ['Northgate Speedway', 5.2, 9, 'power', 3], ['Sable Flats', 5.5, 11, 'stopgo', 3], 'monza'] },
    { id: 'c4', name: 'Heartland Championship', blurb: 'Classic parkland circuits with a mix of everything.', base: 0.018, tracks: [
      ['Elmsworth Park', 3.8, 11, 'mixed', 2], ['Barrowdale Circuit', 4.1, 12, 'technical', 3], ['Shepton Vale', 4.4, 11, 'flowing', 3], ['Millbrook Raceway', 3.6, 12, 'mixed', 3], ['Harewood Downs', 4.8, 12, 'fast', 3],
      ['Linton Grange', 4.0, 13, 'technical', 3], ['Corfield Ring', 4.5, 12, 'mixed', 3], ['Ravensby Park', 5.0, 13, 'flowing', 3], ['Greystone Circuit', 4.6, 14, 'mixed', 3], 'silverstone'] },
    { id: 'c5', name: 'Forest Challenge', blurb: 'Fast, narrow-feeling forest tracks with long esses and big commitment.', base: 0.024, tracks: [
      ['Pinecrest Circuit', 4.4, 12, 'fast', 3], ['Blackwood Ring', 4.9, 13, 'flowing', 3], ['Fernhollow Raceway', 4.2, 13, 'mixed', 3], ['Ardenwood', 5.4, 13, 'fast', 3], ['Larchmere Park', 4.7, 14, 'flowing', 3],
      ['Hartwell Forest Circuit', 5.8, 14, 'fast', 3], ['Rowan Ridge', 4.5, 14, 'technical', 3], ['Mossbank Ring', 5.2, 15, 'mixed', 4], ['Silverbirch Raceway', 6.2, 15, 'flowing', 4], 'spa'] },
    { id: 'c6', name: 'City Lights Street Series', blurb: 'Street circuits with barriers beside the track and only three lanes. Precise or painful.', base: 0.03, tracks: [
      ['Riverside Street Circuit', 2.6, 12, 'street', 3, 'wn'], ['Old Town Loop', 2.2, 12, 'street', 3, 'wn'], ['Canal Quarter', 2.9, 13, 'street', 3, 'wn'], ['Docklands Street Circuit', 3.4, 13, 'power', 3, 'wn'], ['Cathedral Streets', 2.5, 14, 'street', 4, 'wn'],
      ['Market Square Circuit', 2.8, 14, 'technical', 4, 'wn'], ['Neon Boulevard', 3.6, 13, 'street', 4, 'w'], ['Bridgeport Streets', 3.1, 15, 'street', 4, 'wn'], ['Embankment Circuit', 3.8, 16, 'street', 4, 'wn'], 'monaco'] },
    { id: 'c7', name: 'Endurance Classics', blurb: 'Long circuits, six to nine kilometres a lap. Concentration over a long lap.', base: 0.034, tracks: [
      ['Grand Marlow Circuit', 6.0, 15, 'mixed', 3], ['Highmoor Endurance Ring', 7.2, 16, 'fast', 3], ['Westvale Circuit', 6.4, 17, 'flowing', 3], ['Kingsmere Grand Circuit', 6.8, 18, 'mixed', 4], ['Long Ashton Raceway', 7.6, 17, 'power', 4],
      ['Thundridge Ring', 6.6, 19, 'technical', 4], ['Fallowfield Grand Circuit', 8.0, 18, 'fast', 4], ['Stormhaven', 7.0, 20, 'mixed', 4], ['Crownhill Circuit', 8.4, 21, 'flowing', 4], ['Eaglesfield Endurance Ring', 9.0, 22, 'mixed', 4]] },
    { id: 'c8', name: 'Technical Masters', blurb: 'Twisty, demanding circuits where corners come one after another.', base: 0.038, tracks: [
      ['Clockwork Park', 3.6, 15, 'technical', 4], ['Knotsford Circuit', 4.0, 16, 'technical', 4], ['Spirelow Raceway', 4.3, 16, 'mixed', 4], ['Puzzlewood Ring', 3.8, 17, 'technical', 4], 'interlagos',
      ['Twistleton', 4.5, 17, 'technical', 4, 'n'], ['Kinkby Hollow', 4.2, 18, 'stopgo', 4], ['Serpent Hill Circuit', 4.8, 18, 'technical', 4], ['Labyrinth Park', 5.2, 19, 'technical', 5], 'suzuka'] },
    { id: 'c9', name: 'Night Sprint', blurb: 'Short, savage sprint tracks with corners coming thick and fast.', base: 0.042, tracks: [
      ['Midnight Mile', 1.6, 9, 'technical', 4], ['Lantern Loop', 1.8, 10, 'street', 4, 'w'], ['Starfall Sprint', 2.0, 10, 'stopgo', 4], ['Moonlit Quay', 2.1, 11, 'street', 4, 'wn'], ['Ember Alley', 1.7, 11, 'street', 5, 'wn'],
      ['Nightjar Circuit', 2.3, 12, 'technical', 5], ['Afterdark Ring', 2.4, 12, 'mixed', 5, 'n'], ['Owlsgate Sprint', 2.2, 13, 'technical', 5, 'w'], ['Glowline', 2.6, 13, 'street', 5, 'wn'], ['Blackout Bend', 2.5, 14, 'technical', 5, 'wn']] },
    { id: 'c10', name: 'Legends\' Crown', blurb: 'The final test. Long, brutal circuits with everything at once, and the fastest rivals.', base: 0.046, tracks: [
      ['Crown Heights Circuit', 4.6, 16, 'mixed', 5], ['Valkyrie Ring', 5.0, 17, 'technical', 5], ['Titan\'s Reach', 5.6, 17, 'fast', 5], ['Monarch Park', 4.8, 18, 'mixed', 5, 'n'], ['Gauntlet Circuit', 4.4, 18, 'street', 5, 'w'],
      ['Dragonback Raceway', 6.0, 19, 'mixed', 5], ['Summit Grand Circuit', 6.4, 20, 'flowing', 5], ['Iron Crown Ring', 5.2, 20, 'technical', 5, 'n'], ['Hall of Fame Circuit', 6.8, 21, 'mixed', 5], ['The Final Crown', 7.0, 22, 'mixed', 5, 'w']] }
  ];
  var TRACKS = {}, ORDER = [];
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  CH.forEach(function (c, ci) {
    c.index = ci; c.ids = [];
    c.tracks.forEach(function (spec, ti) {
      var T, id;
      if (typeof spec === 'string') { id = spec; T = SIG[spec]; T.character = 'signature'; T.signature = true; }
      else { id = slug(spec[0]); T = generate(spec, (ci + 1) * 100 + ti + 1); T.spec = spec; }
      T.id = id; T.champ = c.id; T.round = ti + 1; T.short = T.name.replace(/-style.*$/, '').replace(/ (Circuit|Raceway|Speedway|Ring|Park|Street Circuit)$/, '') || T.name;
      if (T.signature) T.short = T.name.split(' ')[0];
      TRACKS[id] = T; c.ids.push(id); ORDER.push(id);
    });
  });
  SIG.ring.id = 'ring'; SIG.ring.short = 'the practice ring'; SIG.ring.champ = null; TRACKS.ring = SIG.ring;
  var api = { TRACKS: TRACKS, CHAMPS: CH, ORDER: ORDER, generate: generate, rng: rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.F1T = api;
})(this);
