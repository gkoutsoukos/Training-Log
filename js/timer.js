/* =============================================================================
   timer.js  —  the training timer engine + whistle sound
   -----------------------------------------------------------------------------
   Two things live here:
     1. Whistle  → a referee-style whistle. By default it is SYNTHESIZED with the
                   Web Audio API so the app needs NO sound file and works offline.
                   If you drop a real file at assets/sounds/whistle.mp3 it will be
                   used instead automatically (see USE_MP3 below).
     2. Timer    → a small reusable countdown/count-up engine used by the GS timer
                   and (later) interval / EMOM / rest modes.

   The GS timer UI itself is wired up in app.js — this file only does the timing
   and sound so it stays testable and reusable.
============================================================================= */

/* -----------------------------------------------------------------------------
   WHISTLE
----------------------------------------------------------------------------- */
const USE_MP3 = false;                       // flip to true after adding a real mp3
const MP3_PATH = 'assets/sounds/whistle.mp3';

let _audioCtx = null;
let _mp3 = null;

function _ctx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();   // unlock on iOS after a tap
  return _audioCtx;
}

// A short two-tone referee whistle, synthesized. Good enough for a gym app and
// avoids shipping/hosting a binary asset on GitHub Pages.
function _synthWhistle(durationMs = 550) {
  const ctx = _ctx();
  const now = ctx.currentTime;
  const dur = durationMs / 1000;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();     // the "trill" that makes it sound like a whistle
  const lfoGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(2300, now);
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(28, now);  // flutter speed
  lfoGain.gain.setValueAtTime(120, now);  // flutter depth (Hz)

  lfo.connect(lfoGain).connect(osc.frequency);

  // quick attack, short sustain, fast release
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
  gain.gain.setValueAtTime(0.35, now + dur - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);  lfo.start(now);
  osc.stop(now + dur); lfo.stop(now + dur);
}

function playWhistle() {
  if (!window.GSStore.getSettings().whistle) return;   // respect the setting
  if (USE_MP3) {
    if (!_mp3) { _mp3 = new Audio(MP3_PATH); }
    _mp3.currentTime = 0;
    _mp3.play().catch(() => _synthWhistle());           // fall back if file missing
  } else {
    _synthWhistle();
  }
}

// A lighter, single beep for the optional hand-switch cue at the half.
function playSwitchCue() {
  if (!window.GSStore.getSettings().switchWhistle) return;
  _synthWhistle(220);
}

/* -----------------------------------------------------------------------------
   TIMER ENGINE
   -----------------------------------------------------------------------------
   new GSTimer({ mode, target, onTick, onHalf, onDone })
     mode   → 'down' (count toward 0 from target) or 'up' (count from 0)
     target → seconds (used by 'down', and as the set length for the half cue)
     onTick(elapsedSec, remainingSec) → called ~10x/sec for a smooth display
     onHalf()  → fired once when the set passes the halfway point (hand switch)
     onDone()  → fired when a 'down' timer reaches 0
----------------------------------------------------------------------------- */
class GSTimer {
  constructor({ mode = 'down', target = 600, onTick, onHalf, onDone } = {}) {
    this.mode = mode;
    this.target = target;
    this.onTick = onTick || (() => {});
    this.onHalf = onHalf || (() => {});
    this.onDone = onDone || (() => {});
    this._raf = null;
    this._startAt = 0;
    this._halfFired = false;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._startAt = performance.now();
    this._loop();
  }

  _loop() {
    const tick = () => {
      if (!this.running) return;
      const elapsed = (performance.now() - this._startAt) / 1000;
      const remaining = Math.max(0, this.target - elapsed);

      if (!this._halfFired && elapsed >= this.target / 2) {
        this._halfFired = true;
        this.onHalf();
      }
      this.onTick(elapsed, remaining);

      if (this.mode === 'down' && remaining <= 0) {
        this.stop();
        this.onDone();
        return;
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  // seconds elapsed right now (used when the athlete ends a set early)
  elapsed() {
    return this.running ? (performance.now() - this._startAt) / 1000 : 0;
  }
}

window.GSTimerKit = { GSTimer, playWhistle, playSwitchCue };
