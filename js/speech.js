/* F1 by Ear 2 - race engineer voice. One short utterance at a time, never overlapping.
   Priorities: 3 corner calls, 2 safety (off track, crash), 1 race info, 0 chatter.
   A higher-priority line (2 or more) cuts in; corner and safety calls wait their turn; anything else is dropped
   when speech is busy, so calls are never late because of chatter.
   Strong references to utterances, stale callbacks ignored, and a watchdog so a lost "end" event
   can never jam the voice. Based on the Narration App speech engine. */
(function (root) {
  'use strict';
  var synth = root.speechSynthesis, Utter = root.SpeechSynthesisUtterance;
  function Announcer() {
    this.q = []; this.cur = null; this.gen = 0; this.keep = []; this.rate = 1.1; this.voiceURI = ''; this.onDuck = null; this.enabled = !!(synth && Utter);
    this.log = []; this.unlocked = false; this.onSpeak = null; this.dropped = 0;
    var self = this;
    if (synth && synth.addEventListener) try { synth.addEventListener('voiceschanged', function () { self._voices = null; }); } catch (e) {}
  }
  Announcer.prototype.voices = function () {
    if (!synth) return [];
    if (!this._voices || !this._voices.length) { try { this._voices = synth.getVoices() || []; } catch (e) { this._voices = []; } }
    return this._voices;
  };
  Announcer.prototype.voice = function () {
    var vs = this.voices(), i, v;
    for (i = 0; i < vs.length; i++) if (vs[i].voiceURI === this.voiceURI) return vs[i];
    var pick = function (re) { for (var j = 0; j < vs.length; j++) if (/^en[-_]GB/i.test(vs[j].lang) && re.test(vs[j].name + ' ' + vs[j].voiceURI)) return vs[j]; return null; };
    v = pick(/premium/i) || pick(/enhanced/i) || pick(/Daniel|Serena|Kate|Arthur|Martha|Stephanie|Jamie/i) || pick(/./);
    if (v) return v;
    for (i = 0; i < vs.length; i++) if (/^en/i.test(vs[i].lang)) return vs[i];
    return null;
  };
  // seconds a line is likely to take at the current rate
  Announcer.prototype.secs = function (text) { return 0.3 + String(text).length / (13.5 * this.rate); };
  // Call from inside a tap: iOS only lets speech start from a user gesture the first time.
  Announcer.prototype.unlock = function () {
    if (this.unlocked || !this.enabled) return;
    this.unlocked = true;
    if (this.cur || this.q.length) return;
    try { var u = new Utter(' '); u.volume = 0; u.rate = 1.4; this.keep.push(u); synth.speak(u); } catch (e) {}
  };
  // say(text or function, {prio, key, then, queue, valid}) -> true if spoken or queued
  Announcer.prototype.say = function (text, o) {
    o = o || {};
    var prio = o.prio == null ? 1 : o.prio;
    if (!this.enabled || !text) { if (o.then) setTimeout(o.then, 10); return false; }
    var item = { text: text, prio: prio, key: o.key || null, then: o.then || null, valid: o.valid || null, at: Date.now() };
    if (this.cur) {
      if (prio >= 2 && prio > this.cur.item.prio) { this.q.unshift(item); this.stopCurrent(); return true; }
      if (prio >= 2 || o.queue) { this.enqueue(item); return true; }
      this.dropped++; return false;
    }
    this.enqueue(item); this.next(); return true;
  };
  Announcer.prototype.enqueue = function (item) {
    if (item.key) this.q = this.q.filter(function (x) { return x.key !== item.key || x.then; });
    this.q.push(item);
    // highest priority first, oldest first within a priority
    this.q.sort(function (a, b) { return b.prio - a.prio || a.at - b.at; });
    while (this.q.length > 4) { var drop = this.q.pop(); if (drop.then) setTimeout(drop.then, 0); }
  };
  Announcer.prototype.busy = function () { return !!this.cur || this.q.length > 0; };
  Announcer.prototype.speakingPrio = function () { return this.cur ? this.cur.item.prio : -1; };
  Announcer.prototype.stopCurrent = function () {
    var self = this, c = this.cur;
    this.gen++; this.cur = null;
    if (c) clearTimeout(c.wd);
    try { synth.cancel(); } catch (e) {}
    // Safari needs a short breath after cancel or the next utterance can be dropped.
    var g = this.gen;
    setTimeout(function () { if (g === self.gen && !self.cur) self.next(); }, 120);
  };
  Announcer.prototype.clear = function () {
    var c = this.cur; this.q = []; this.gen++; this.cur = null;
    if (c) clearTimeout(c.wd);
    try { if (synth && (synth.speaking || synth.pending)) synth.cancel(); } catch (e) {}
    if (this.onDuck) this.onDuck(false);
  };
  Announcer.prototype.next = function () {
    var self = this;
    if (this.cur) return;
    var item, text;
    while ((item = this.q.shift())) {
      if (item.valid && !item.valid()) { if (item.then) setTimeout(item.then, 0); continue; }
      // stale chatter is useless: drop low-priority lines that waited more than 4 seconds
      if (item.prio < 2 && !item.then && Date.now() - item.at > 4000) continue;
      if (item.prio === 2 && !item.then && item.at > 1 && Date.now() - item.at > 3000) continue;
      text = typeof item.text === 'function' ? item.text() : item.text;
      if (!text) { if (item.then) setTimeout(item.then, 0); continue; }
      break;
    }
    if (!item) { if (this.onDuck) this.onDuck(false); return; }
    var gen = ++this.gen;
    var u = new Utter(text);
    var v = this.voice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
    u.rate = this.rate; u.pitch = 1; u.volume = 1;
    var cur = { item: item, u: u, gen: gen, done: false, text: text, started: false };
    var finish = function () {
      if (cur.done) return; cur.done = true; clearTimeout(cur.wd);
      if (self.cur === cur) self.cur = null;
      if (item.then) { try { item.then(); } catch (e) { setTimeout(function () { throw e; }); } }
      setTimeout(function () { if (!self.cur) self.next(); }, 40);
    };
    u.onstart = function () { if (gen === self.gen) cur.started = true; };
    u.onend = function () { if (gen === self.gen) finish(); };
    u.onerror = function () { if (gen === self.gen) finish(); };
    this.cur = cur;
    this.keep.push(u); if (this.keep.length > 10) this.keep.shift();
    this.log.push(text); if (this.log.length > 400) this.log.shift();
    if (this.onSpeak) try { this.onSpeak(text, item); } catch (e) {}
    if (this.onDuck) this.onDuck(true);
    // Watchdog: if speech never starts, or the end event is lost, move on.
    var limit = 1500 + text.length * 80 / this.rate;
    cur.wd = setTimeout(function check() {
      if (cur.done || self.cur !== cur) return;
      try { if (synth.speaking && cur.started) { cur.wd = setTimeout(finish, 3000); return; } } catch (e) {}
      finish();
    }, limit);
    this.unlocked = true;
    try { if (synth.paused) synth.resume(); synth.speak(u); } catch (e) { finish(); }
  };
  root.F1Announcer = Announcer;
})(this);
