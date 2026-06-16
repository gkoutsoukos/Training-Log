/* =============================================================================
   storage.js  —  everything that touches localStorage
   -----------------------------------------------------------------------------
   The whole app state lives under three keys:
     gslog.sessions   → array of saved training sessions
     gslog.goals      → array of goals (your edits override the defaults)
     gslog.settings   → small object (e.g. timer whistle on/off)

   Nothing here renders UI. It only reads/writes data and hands it back.
   Export/Import JSON lives at the bottom.
============================================================================= */

const KEYS = {
  sessions: 'gslog.sessions',
  goals:    'gslog.goals',
  settings: 'gslog.settings',
};

/* ---- low-level read/write (safe against corrupt JSON) -------------------- */
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('Bad data in', key, '— resetting.', e);
    return fallback;
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---- ids & dates --------------------------------------------------------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---- SESSIONS ------------------------------------------------------------ */
function getSessions() {
  // newest first
  return read(KEYS.sessions, []).sort((a, b) => new Date(b.date) - new Date(a.date));
}
function getSession(id) {
  return getSessions().find(s => s.id === id) || null;
}
function saveSession(session) {
  const all = read(KEYS.sessions, []);
  const i = all.findIndex(s => s.id === session.id);
  if (i >= 0) all[i] = session;       // update existing
  else        all.push(session);      // add new
  write(KEYS.sessions, all);
  return session;
}
function deleteSession(id) {
  write(KEYS.sessions, read(KEYS.sessions, []).filter(s => s.id !== id));
}

/* ---- GOALS --------------------------------------------------------------- */
// If the user has never touched goals, seed with the defaults from data.js.
function getGoals() {
  const stored = read(KEYS.goals, null);
  if (stored) return stored;
  const seeded = window.GSDATA.DEFAULT_GOALS.slice();
  write(KEYS.goals, seeded);
  return seeded;
}
function saveGoal(goal) {
  const all = getGoals();
  const i = all.findIndex(g => g.id === goal.id);
  if (i >= 0) all[i] = goal; else all.push(goal);
  write(KEYS.goals, all);
  return goal;
}
function deleteGoal(id) {
  write(KEYS.goals, getGoals().filter(g => g.id !== id));
}

/* ---- SETTINGS ------------------------------------------------------------ */
function getSettings() {
  return read(KEYS.settings, { whistle: true, switchWhistle: false });
}
function saveSettings(patch) {
  const next = Object.assign(getSettings(), patch);
  write(KEYS.settings, next);
  return next;
}

/* ---- EXPORT / IMPORT  (the "later" feature, ready to go) ----------------- */
function exportJSON() {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    sessions: read(KEYS.sessions, []),
    goals: getGoals(),
    settings: getSettings(),
  }, null, 2);
}
function importJSON(text) {
  const data = JSON.parse(text);
  if (data.sessions) write(KEYS.sessions, data.sessions);
  if (data.goals)    write(KEYS.goals, data.goals);
  if (data.settings) write(KEYS.settings, data.settings);
}

/* ---- DEMO SEED  (so a fresh app looks alive, like the mockup) ------------ */
// Runs once. Delete this call in app.js if you want to start empty.
function seedDemoIfEmpty() {
  if (read(KEYS.sessions, []).length) return;
  write(KEYS.sessions, DEMO_SESSIONS);
}

window.GSStore = {
  uid,
  getSessions, getSession, saveSession, deleteSession,
  getGoals, saveGoal, deleteGoal,
  getSettings, saveSettings,
  exportJSON, importJSON,
  seedDemoIfEmpty,
};

/* -----------------------------------------------------------------------------
   Demo data — mirrors the numbers in your mockup. Safe to delete.
----------------------------------------------------------------------------- */
const DEMO_SESSIONS = [
  {
    id: 'demo8', date: '2026-06-08', type: 'gs', duration: 3504,
    sleep: 8, energy: 7, bodyweight: 90.8, notes: 'Felt strong and focused.',
    exercises: [
      { id: 'e1', category: 'gs', exercise: 'Long Cycle',
        params: { weight: 24, duration: 600, rpm: 7, reps: 70, rpe: 8 },
        result: 'pr', remarks: 'Rack position much better.\nGrip faded in the last 2 minutes.' },
      { id: 'e2', category: 'gs', exercise: 'Snatch',
        params: { weight: 24, duration: 600, rpm: 18, reps: 165, rpe: 8 },
        result: 'up', remarks: 'Smooth sets.\nLost a few reps on left side.' },
    ],
  },
  {
    id: 'demo7', date: '2026-06-07', type: 'strength', duration: 3360,
    sleep: 7, energy: 7, bodyweight: 90.5, notes: 'Upper focus.',
    exercises: [
      { id: 'e3', category: 'strength', exercise: 'Push Press',
        params: { weight: 70, sets: 5, reps: 5, rest: 180, rpe: 8 }, result: 'up', remarks: '' },
      { id: 'e4', category: 'strength', exercise: 'Pull-ups',
        params: { weight: 20, sets: 5, reps: 5, rest: 120, rpe: 9 }, result: 'pr', remarks: 'BW+20.' },
    ],
  },
  {
    id: 'demo6', date: '2026-06-06', type: 'strength', duration: 3720,
    sleep: 6, energy: 6, bodyweight: 90.9, notes: 'Lower focus.',
    exercises: [
      { id: 'e5', category: 'strength', exercise: 'Deadlift',
        params: { weight: 150, sets: 1, reps: 5, rest: 240, rpe: 9 }, result: 'pr', remarks: '' },
    ],
  },
  {
    id: 'demo4', date: '2026-06-04', type: 'gpp', duration: 2520,
    sleep: 7, energy: 8, bodyweight: 90.6, notes: 'Conditioning.',
    exercises: [
      { id: 'e6', category: 'gpp', exercise: 'Rowing',
        params: { distance: '2000m', rest: 0 }, result: '', remarks: 'Steady pace.' },
    ],
  },
];
