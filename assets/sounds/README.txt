whistle.mp3 — placeholder
--------------------------
The app does NOT need an audio file. By default it SYNTHESIZES a referee
whistle using the Web Audio API (see js/timer.js), so it works offline with
zero assets.

If you'd rather use a real recording:
  1. Drop your file here as:  whistle.mp3
  2. In js/timer.js, set:      const USE_MP3 = true;

That's it — the timer will play your file at start/end and fall back to the
synth whistle if the file is ever missing.
