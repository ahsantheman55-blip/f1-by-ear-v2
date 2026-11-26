/* F1 by Ear - phone-as-steering-wheel maths. Pure functions plus a small stateful reader. */
(function (root) {
  'use strict';
  var D2R = Math.PI / 180;
  function wrap(d) { d = (d + 540) % 360; if (d < 0) d += 360; return d - 180; }
  // Wheel angle (degrees) from a gravity vector in the device frame.
  // Rotating the phone anticlockwise (as you look at the screen) makes this angle grow,
  // in either landscape direction and whichever sign the browser uses for gravity.
  function angleFromGravity(gx, gy) { return Math.atan2(gx, gy) / D2R; }
  // Gravity direction from DeviceOrientation Euler angles (W3C Z-X'-Y'').
  function gravityFromEuler(beta, gamma) {
    var b = beta * D2R, g = gamma * D2R;
    return { x: -Math.cos(b) * Math.sin(g), y: Math.sin(b), z: Math.cos(b) * Math.cos(g) };
  }
  // How upright the screen is: 1 = standing up, 0 = flat on a table.
  function uprightness(gx, gy, gz) { var m = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1; return Math.sqrt(gx * gx + gy * gy) / m; }
  // Screen orientation angle (0, 90, -90/270, 180)
  function screenAngle(w) {
    w = w || (typeof window !== 'undefined' ? window : {});
    try { if (w.screen && w.screen.orientation && typeof w.screen.orientation.angle === 'number') return w.screen.orientation.angle; } catch (e) {}
    if (typeof w.orientation === 'number') return w.orientation;
    return 0;
  }
  function isLandscape(w) { var a = Math.abs(screenAngle(w)) % 180; return a === 90; }
  // The expected wheel centre for a phone held level in landscape, from the screen angle.
  // window.orientation 90 means the top of the phone is to the left: gravity runs along +x or -x.
  function defaultCentre(angle) {
    if (angle === 90) return -90; if (angle === -90 || angle === 270) return 90;
    if (angle === 180) return 180; return 0;
  }
  // Calibrated mapping from wheel angle to steering -1 (full left) .. +1 (full right)
  function mapSteer(theta, cal, opt) {
    opt = opt || {};
    var d = wrap(theta - cal.centre);
    var s;
    // cal.left and cal.right are signed offsets from centre at full lock
    if (cal.right !== 0 && (d >= 0) === (cal.right >= 0)) s = Math.abs(d) / Math.abs(cal.right);
    else s = -Math.abs(d) / Math.abs(cal.left || 35);
    var dz = opt.deadZone == null ? 0.04 : opt.deadZone, sens = opt.sensitivity == null ? 1 : opt.sensitivity, curve = opt.curve == null ? 1.15 : opt.curve;
    var a = Math.abs(s);
    if (a <= dz) return 0;
    a = Math.pow((a - dz) / (1 - dz), curve) * sens;
    if (a > 1) a = 1;
    return s < 0 ? -a : a;
  }
  // Default calibration: turning the wheel left raises the angle.
  function defaultCal(centre) { return { centre: centre, left: 38, right: -38, auto: true }; }
  // Build a calibration from three recorded angles. Returns {ok, cal, problem}
  function makeCal(centre, leftA, rightA) {
    var l = wrap(leftA - centre), r = wrap(rightA - centre);
    if (Math.abs(l) < 8 || Math.abs(r) < 8) return { ok: false, problem: 'small' };
    if ((l > 0) === (r > 0)) return { ok: false, problem: 'same' };
    return { ok: true, cal: { centre: centre, left: l, right: r, auto: false } };
  }
  // One Euro filter: smooth when still, almost no lag when you turn quickly.
  function OneEuro(minCutoff, beta, dCutoff) { this.minCutoff = minCutoff || 1.5; this.beta = beta == null ? 0.04 : beta; this.dCutoff = dCutoff || 1.0; this.x = null; this.dx = 0; this.t = null; }
  OneEuro.prototype.alpha = function (cutoff, dt) { var tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };
  OneEuro.prototype.filter = function (x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    var dt = Math.max(1e-3, Math.min(0.2, t - this.t)); this.t = t;
    var dxr = wrap(x - this.x) / dt;
    var ad = this.alpha(this.dCutoff, dt); this.dx = this.dx + ad * (dxr - this.dx);
    var cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    var a = this.alpha(cutoff, dt);
    this.x = wrap(this.x + a * wrap(x - this.x));
    return this.x;
  };
  OneEuro.prototype.reset = function () { this.x = null; this.dx = 0; this.t = null; };

  // Stateful reader fed by DeviceMotion / DeviceOrientation events (or tests).
  function Wheel() {
    this.source = null; this.raw = null; this.angle = null; this.upright = 1; this.lastT = 0; this.count = 0;
    this.filter = new OneEuro(1.5, 0.04); this.listeners = [];
    this.motionSeen = 0; this.orientSeen = 0;
  }
  Wheel.prototype.setSmoothing = function (level) { var m = { low: [3.0, 0.06], normal: [1.5, 0.04], high: [0.8, 0.025] }[level] || [1.5, 0.04]; this.filter.minCutoff = m[0]; this.filter.beta = m[1]; };
  Wheel.prototype.feed = function (theta, upright, src, tms) {
    var t = (tms == null ? (typeof performance !== 'undefined' ? performance.now() : Date.now()) : tms) / 1000;
    this.raw = theta; this.upright = upright; this.source = src; this.lastT = t; this.count++;
    this.angle = this.filter.filter(theta, t);
    for (var i = 0; i < this.listeners.length; i++) this.listeners[i](this.angle);
  };
  Wheel.prototype.onMotion = function (e, tms) {
    var g = e && e.accelerationIncludingGravity; if (!g || g.x == null || g.y == null) return;
    this.motionSeen++;
    this.feed(angleFromGravity(g.x, g.y), uprightness(g.x, g.y, g.z || 0), 'motion', tms);
  };
  Wheel.prototype.onOrientation = function (e, tms) {
    if (!e || e.beta == null || e.gamma == null) return;
    this.orientSeen++;
    if (this.motionSeen > 3) return; // motion is better when present
    var g = gravityFromEuler(e.beta, e.gamma);
    this.feed(angleFromGravity(g.x, g.y), uprightness(g.x, g.y, g.z), 'orientation', tms);
  };
  var api = { wrap: wrap, angleFromGravity: angleFromGravity, gravityFromEuler: gravityFromEuler, uprightness: uprightness, screenAngle: screenAngle, isLandscape: isLandscape, defaultCentre: defaultCentre, mapSteer: mapSteer, defaultCal: defaultCal, makeCal: makeCal, OneEuro: OneEuro, Wheel: Wheel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.F1S = api;
})(this);
