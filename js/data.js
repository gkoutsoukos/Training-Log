/* wrapped in an IIFE so top-level names don't collide across <script> files */
(function () {
/* =============================================================================
   data.js  —  THE FILE YOU EDIT MOST
   -----------------------------------------------------------------------------
   Everything that defines WHAT you train and HOW it is measured lives here.
   No app logic — just data. Change things here and the whole app updates.

   Sections:
     1. CATEGORIES   → the 5 training types + their colors + icons
     2. EXERCISES    → the list of movements inside each category
     3. FIELDS       → which input fields each category shows (dynamic form)
     4. GOALS        → your targets, shown as progress bars on the Dashboard
============================================================================= */


/* -----------------------------------------------------------------------------
   1. CATEGORIES
   -----------------------------------------------------------------------------
   key      → internal id (don't put spaces here)
   label    → what you see in the UI
   color    → the accent color for this category (hex). Change these freely.
   icon     → an emoji used as a quick glyph (swap for any emoji you like)

   To recolor the whole app by category, just edit `color` below.
----------------------------------------------------------------------------- */
const CATEGORIES = {
  gs:        { key: 'gs',        label: 'GS',        color: '#34C759', icon: '🟢' }, // Kettlebell Sport — green
  strength:  { key: 'strength',  label: 'Strength',  color: '#FF9F0A', icon: '🟠' }, // orange
  gpp:       { key: 'gpp',       label: 'GPP',       color: '#0A84FF', icon: '🔵' }, // blue
  accessory: { key: 'accessory', label: 'Accessory', color: '#FFD60A', icon: '🟡' }, // yellow
  technique: { key: 'technique', label: 'Technique', color: '#BF5AF2', icon: '🟣' }, // purple
};


/* -----------------------------------------------------------------------------
   2. EXERCISES
   -----------------------------------------------------------------------------
   Just arrays of names per category. Add or remove freely.
----------------------------------------------------------------------------- */
const EXERCISES = {
  gs: [
    'Long Cycle',
    'Snatch',
    'Jerk',
  ],
  strength: [
    'Back Squat',
    'Front Squat',
    'Deadlift',
    'Clean',
    'Press',
    'Push Press',
    'Jerk',
    'Row',
    'Snatch',
    'Overhead Squat',
  ],
  gpp: [
    'Rowing',
    'KB Flows',
    'Pull-ups',
    'Dips',
    'Push-ups',
    'Jump Squats',
    'Hanging',
    'Carries',
  ],
  accessory: [
    'Swing',
    'Bump Jerk',
    'Push Press',
    'Other',
  ],
  technique: [
    'Long Cycle',
    'Snatch',
    'Jerk',
    'Other',
  ],
};


/* -----------------------------------------------------------------------------
   3. FIELDS  (the dynamic form)
   -----------------------------------------------------------------------------
   Each category lists the input fields shown on the "Add Exercise" screen.
   The form rebuilds itself from this list, so adding a field here is enough.

   Each field:
     key         → where the value is stored (no spaces)
     label       → text shown next to the input
     type        → 'number' | 'text' | 'duration' | 'select' | 'rpe' | 'result' | 'textarea'
     unit        → small grey unit text (optional, e.g. 'kg', 'sec')
     placeholder → ghost text (optional)
     options     → only for 'select' type

   Special types explained:
     'duration' → shows two boxes mm : ss
     'rpe'      → number capped 1–10, shows "/10"
     'result'   → the PR / ↑ / → / ↓ marker buttons
     'textarea' → multi-line remarks box
----------------------------------------------------------------------------- */
const FIELDS = {
  gs: [
    { key: 'weight',   label: 'Weight',            type: 'number',   unit: 'kg', placeholder: '24' },
    { key: 'duration', label: 'Duration',          type: 'duration' },
    { key: 'workRest', label: 'Work / Rest',       type: 'workrest' },           // intervals (optional)
    { key: 'rpm',      label: 'RPM (avg)',         type: 'number',   placeholder: '7' },
    { key: 'reps',     label: 'Reps',              type: 'number',   placeholder: '70' },
    { key: 'rpe',      label: 'RPE',               type: 'rpe' },
    { key: 'result',   label: 'Result',            type: 'result' },
    { key: 'remarks',  label: 'Remarks',           type: 'textarea', placeholder: 'Rack position, grip, pace…' },
  ],
  strength: [
    { key: 'weight',  label: 'Weight',  type: 'number',   unit: 'kg', placeholder: '100' },
    { key: 'sets',    label: 'Sets',    type: 'number',   placeholder: '5' },
    { key: 'reps',    label: 'Reps',    type: 'number',   placeholder: '5' },
    { key: 'rest',    label: 'Rest',    type: 'number',   unit: 'sec', placeholder: '180' },
    { key: 'rpe',     label: 'RPE',     type: 'rpe' },
    { key: 'result',  label: 'Result',  type: 'result' },
    { key: 'remarks', label: 'Remarks', type: 'textarea', placeholder: 'Cues, bar speed, notes…' },
  ],
  gpp: [
    { key: 'weight',   label: 'Weight',         type: 'number',   unit: 'kg', placeholder: '—' },
    { key: 'sets',     label: 'Sets',           type: 'number',   placeholder: '3' },
    { key: 'reps',     label: 'Reps',           type: 'number',   placeholder: '12' },
    { key: 'distance', label: 'Distance / Time', type: 'text',    placeholder: '500m or 2:00' },
    { key: 'rest',     label: 'Rest',           type: 'number',   unit: 'sec', placeholder: '60' },
    { key: 'remarks',  label: 'Remarks',        type: 'textarea', placeholder: 'How it felt…' },
  ],
  accessory: [
    { key: 'weight',  label: 'Weight',  type: 'number',   unit: 'kg', placeholder: '24' },
    { key: 'sets',    label: 'Sets',    type: 'number',   placeholder: '3' },
    { key: 'reps',    label: 'Reps',    type: 'number',   placeholder: '10' },
    { key: 'rest',    label: 'Rest',    type: 'number',   unit: 'sec', placeholder: '60' },
    { key: 'remarks', label: 'Remarks', type: 'textarea', placeholder: 'Notes…' },
  ],
  // Technique is light on numbers, heavy on observation.
  technique: [
    { key: 'focus',        label: 'Focus',       type: 'text',     placeholder: 'e.g. fixation timing' },
    { key: 'quality',      label: 'Quality',     type: 'rpe' },                 // reuse 1–10 scale as a quality rating
    { key: 'observations', label: 'Observations', type: 'textarea', placeholder: 'What you noticed…' },
    { key: 'nextAction',   label: 'Next action', type: 'textarea', placeholder: 'What to fix next time…' },
  ],
};


/* -----------------------------------------------------------------------------
   RESULT MARKERS
   -----------------------------------------------------------------------------
   The PR / ↑ / → / ↓ buttons. Order = order shown.
----------------------------------------------------------------------------- */
const RESULT_MARKERS = [
  { key: 'pr',   label: 'PR', color: '#34C759' },
  { key: 'up',   label: '↑',  color: '#0A84FF' },
  { key: 'same', label: '→',  color: '#8E8E93' },
  { key: 'down', label: '↓',  color: '#FF453A' },
];


/* -----------------------------------------------------------------------------
   4. GOALS  (Dashboard progress bars)
   -----------------------------------------------------------------------------
   These are your seeded starting goals. You can also add/edit goals in-app on
   the Progress screen — those are saved to localStorage and merged with these.

   label    → text shown
   category → drives the bar color (use a CATEGORIES key)
   current  → where you are now
   target   → where you want to be
   unit     → small label after the numbers (e.g. 'reps', 'kg')
----------------------------------------------------------------------------- */
const DEFAULT_GOALS = [
  { id: 'g1', label: "Long Cycle 24kg 10'", category: 'gs',       current: 64,  target: 70,  unit: 'reps' },
  { id: 'g2', label: "Snatch 24kg 10'",     category: 'gs',       current: 165, target: 180, unit: 'reps' },
  { id: 'g3', label: 'Deadlift x5',         category: 'strength', current: 150, target: 160, unit: 'kg' },
  { id: 'g4', label: 'Pull-ups BW+20 x5',   category: 'strength', current: 4,   target: 5,   unit: 'reps' },
];


/* -----------------------------------------------------------------------------
   Helpers used across the app — no need to edit.
----------------------------------------------------------------------------- */
function catColor(key)  { return (CATEGORIES[key] || {}).color || '#8E8E93'; }
function catLabel(key)  { return (CATEGORIES[key] || {}).label || key; }
function catIcon(key)   { return (CATEGORIES[key] || {}).icon  || '•'; }

// Expose everything globally (simple, no build step needed for GitHub Pages).
window.GSDATA = {
  CATEGORIES, EXERCISES, FIELDS, RESULT_MARKERS, DEFAULT_GOALS,
  catColor, catLabel, catIcon,
};

})();
