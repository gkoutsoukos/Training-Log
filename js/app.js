/* =============================================================================
   app.js  —  the application: navigation, screens, and event wiring
   -----------------------------------------------------------------------------
   This is the "engine room". You normally edit data.js (what you train) and
   style.css (how it looks) far more than this file.

   Architecture (deliberately tiny, no framework, no build step):
     • One <div id="app"> that we re-render per screen.
     • navigate(view, params) sets the screen and calls render().
     • Each screen has a render function returning an HTML string, then we wire
       up its buttons. State lives in localStorage via GSStore (storage.js).

   Screens: dashboard · sessions · session · newSession · addExercise ·
            timer · progress · more
============================================================================= */

const { CATEGORIES, EXERCISES, FIELDS, RESULT_MARKERS, catColor, catLabel, catIcon } = window.GSDATA;
const Store = window.GSStore;
const { GSTimer, playWhistle, playSwitchCue } = window.GSTimerKit;

const appEl = document.getElementById('app');
const tabbarEl = document.getElementById('tabbar');

let state = { view: 'dashboard', params: {} };
let liveTimer = null;        // active GSTimer instance (timer screen)

/* ---------- tiny helpers -------------------------------------------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function navigate(view, params = {}) {
  if (liveTimer) { liveTimer.stop(); liveTimer = null; }   // never leave a timer running
  state = { view, params };
  render();
  window.scrollTo(0, 0);
}

/* ---------- formatters ---------------------------------------------------- */
function pad(n) { return String(n).padStart(2, '0'); }
function fmtClock(totalSec) {                       // 600 → "10:00"
  totalSec = Math.max(0, Math.round(totalSec));
  return `${pad(Math.floor(totalSec / 60))}:${pad(totalSec % 60)}`;
}
function fmtDuration(sec) {                          // 3504 → "58:24"
  return fmtClock(sec);
}
function fmtDateShort(iso) {                         // "2026-06-08" → "Jun 8"
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateLong(iso) {                          // → "Mon, Jun 8, 2026"
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

function density(reps, durationSec) {               // GS reps/min
  if (!reps || !durationSec) return null;
  return (reps / (durationSec / 60));
}

/* ---------- stat helpers (Dashboard) -------------------------------------- */
function isThisMonth(iso) {
  const d = new Date(iso + 'T00:00:00'), now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
function dashboardStats() {
  const sessions = Store.getSessions();
  const month = sessions.filter(s => isThisMonth(s.date));
  const totalMin = month.reduce((a, s) => a + (s.duration || 0), 0) / 60;

  // latest metrics + 7-most-recent series for sparklines
  const recent = sessions.slice(0, 7).reverse();
  const series = key => recent.map(s => s[key]).filter(v => v != null);
  const last = arr => arr.length ? arr[arr.length - 1] : null;
  const avg  = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const bw = series('bodyweight'), sl = series('sleep'), en = series('energy');

  return {
    monthCount: month.length,
    gsCount: month.filter(s => s.type === 'gs').length,
    gsMinutes: month.filter(s => s.type === 'gs').reduce((a, s) => a + (s.duration || 0), 0) / 60,
    strengthCount: month.filter(s => s.type === 'strength').length,
    bodyweight: last(bw), bwSeries: bw,
    sleepAvg: avg(sl), sleepSeries: sl,
    energyAvg: avg(en), energySeries: en,
  };
}
// Best performance per exercise across all history (max reps for GS/GPP, max weight for lifts).
function topPerformances() {
  const sessions = Store.getSessions();
  const best = {};   // key → {exercise, category, value, label, date}
  sessions.forEach(s => (s.exercises || []).forEach(ex => {
    const p = ex.params || {};
    let metric = null, label = '';
    if (ex.category === 'gs' || ex.category === 'gpp') {
      if (p.reps) { metric = +p.reps; label = `${p.reps}`; }
    } else if (ex.category === 'strength' || ex.category === 'accessory') {
      if (p.weight) { metric = +p.weight; label = `${p.weight}${p.reps ? ' × ' + p.reps : ''}`; }
    }
    if (metric == null) return;
    const key = ex.category + '|' + ex.exercise + (p.weight ? '|' + p.weight : '');
    if (!best[key] || metric > best[key].value) {
      best[key] = { exercise: ex.exercise, category: ex.category, value: metric, label, date: s.date,
                    sub: p.weight ? `(${p.weight}kg)` : '' };
    }
  }));
  return Object.values(best).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
}

/* ---------- sparkline (tiny inline SVG) ----------------------------------- */
function sparkline(values, color) {
  if (!values || values.length < 2) return '';
  const w = 96, h = 34, min = Math.min(...values), max = Math.max(...values);
  const span = (max - min) || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 4 - ((v - min) / span) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ===========================================================================
   SCREEN: DASHBOARD
=========================================================================== */
function renderDashboard() {
  const s = dashboardStats();
  const tops = topPerformances();
  const recent = Store.getSessions().slice(0, 4);
  const goals = Store.getGoals();

  appEl.innerHTML = `
    <header class="topbar">
      <h1 class="screen-title">GS Training Log</h1>
      <button class="round-add" id="add-session" aria-label="New session">+</button>
    </header>

    <section class="group">
      <div class="group-label">Overview</div>
      <div class="card overview">
        <div class="ov-cell">
          <div class="ov-icon" style="color:#0A84FF">📅</div>
          <div class="ov-num">${s.monthCount}</div>
          <div class="ov-sub">This Month</div>
        </div>
        <div class="ov-cell">
          <div class="ov-icon" style="color:${catColor('gs')}">🟢</div>
          <div class="ov-num" style="color:${catColor('gs')}">${s.gsCount}</div>
          <div class="ov-sub">GS · ${fmtClock(s.gsMinutes * 60)}h</div>
        </div>
        <div class="ov-cell">
          <div class="ov-icon" style="color:${catColor('strength')}">🟠</div>
          <div class="ov-num" style="color:${catColor('strength')}">${s.strengthCount}</div>
          <div class="ov-sub">Strength</div>
        </div>
      </div>
    </section>

    <section class="group">
      <div class="group-label">Key Metrics</div>
      <div class="card metrics">
        ${metricRow('Bodyweight', s.bodyweight, 'kg', s.bwSeries, '#0A84FF')}
        ${metricRow('Sleep (7d avg)', s.sleepAvg, 'h', s.sleepSeries, '#BF5AF2')}
        ${metricRow('Energy (7d avg)', s.energyAvg, '/10', s.energySeries, catColor('gs'))}
      </div>
    </section>

    <section class="group">
      <div class="group-label row-label">Top Performances</div>
      <div class="card list">
        ${tops.length ? tops.map(t => `
          <div class="li">
            <span class="li-glyph" style="color:${catColor(t.category)}">${catIcon(t.category)}</span>
            <div class="li-main">
              <div class="li-title">${t.exercise} ${t.sub}</div>
              <div class="li-sub">Best · ${fmtDateShort(t.date)}</div>
            </div>
            <div class="li-value" style="color:${catColor(t.category)}">${t.label}</div>
          </div>`).join('') : emptyRow('Log a session to see your bests here.')}
      </div>
    </section>

    <section class="group">
      <div class="group-label">Goal Progress</div>
      <div class="card">
        ${goals.length ? goals.map(goalBar).join('') : emptyRow('No goals yet — add one in Progress.')}
      </div>
    </section>

    <section class="group">
      <div class="group-label">Recent Sessions</div>
      <div class="card list">
        ${recent.length ? recent.map(sess => `
          <button class="li tap" data-session="${sess.id}">
            <span class="li-date">${fmtDateShort(sess.date)}</span>
            <div class="li-main">
              <div class="li-title">${catLabel(sess.type)} · ${sessionHeadline(sess)}</div>
            </div>
            <span class="li-value" style="color:${catColor(sess.type)}">${sessionMetric(sess)}</span>
            <span class="chev">›</span>
          </button>`).join('') : emptyRow('Tap + to log your first session.')}
      </div>
    </section>
  `;

  $('#add-session').onclick = () => navigate('newSession');
  $$('[data-session]').forEach(b => b.onclick = () => navigate('session', { id: b.dataset.session }));
}

function metricRow(label, value, unit, series, color) {
  const val = value == null ? '—' : (Number.isInteger(value) ? value : value.toFixed(1));
  return `<div class="metric">
    <div class="metric-left"><div class="metric-label">${label}</div>
      <div class="metric-val">${val}<span class="metric-unit">${unit}</span></div></div>
    ${sparkline(series, color)}
  </div>`;
}
function goalBar(g) {
  const pct = Math.min(100, Math.round((g.current / g.target) * 100));
  const c = catColor(g.category);
  return `<div class="goal">
    <div class="goal-top">
      <span class="goal-label">${g.label}</span>
      <span class="goal-nums">${g.current} / ${g.target} <span class="goal-unit">${g.unit || ''}</span></span>
    </div>
    <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${c}"></div></div>
  </div>`;
}
function sessionHeadline(sess) {
  const first = (sess.exercises || [])[0];
  return first ? first.exercise : (sess.notes ? sess.notes.slice(0, 24) : 'Session');
}
function sessionMetric(sess) {
  const first = (sess.exercises || [])[0];
  if (first && (first.category === 'gs' || first.category === 'gpp') && first.params.reps)
    return `${first.params.reps} reps`;
  return fmtDuration(sess.duration || 0).replace(/^00:/, '') + 'm';
}
function emptyRow(text) { return `<div class="empty">${text}</div>`; }

/* ===========================================================================
   SCREEN: SESSIONS (history list)
=========================================================================== */
function renderSessions() {
  const sessions = Store.getSessions();
  appEl.innerHTML = `
    <header class="topbar">
      <h1 class="screen-title">Sessions</h1>
      <button class="round-add" id="add-session" aria-label="New session">+</button>
    </header>
    <section class="group">
      <div class="card list">
        ${sessions.length ? sessions.map(sess => `
          <button class="li tap" data-session="${sess.id}">
            <span class="li-glyph" style="color:${catColor(sess.type)}">${catIcon(sess.type)}</span>
            <div class="li-main">
              <div class="li-title">${catLabel(sess.type)} · ${sessionHeadline(sess)}</div>
              <div class="li-sub">${fmtDateLong(sess.date)} · ${fmtDuration(sess.duration || 0)}</div>
            </div>
            <span class="chev">›</span>
          </button>`).join('') : emptyRow('No sessions yet.')}
      </div>
    </section>`;
  $('#add-session').onclick = () => navigate('newSession');
  $$('[data-session]').forEach(b => b.onclick = () => navigate('session', { id: b.dataset.session }));
}

/* ===========================================================================
   SCREEN: SESSION DETAIL (review) — header card + exercise cards
=========================================================================== */
function renderSessionDetail(id) {
  const sess = Store.getSession(id);
  if (!sess) return navigate('sessions');

  appEl.innerHTML = `
    <header class="topbar nav">
      <button class="back" id="back">‹ Sessions</button>
      <h2 class="nav-title">${fmtDateLong(sess.date)}</h2>
      <button class="link danger" id="del">Delete</button>
    </header>

    <section class="group">
      <div class="card kv" style="border-left:3px solid ${catColor(sess.type)}">
        ${kv('Type', `<span style="color:${catColor(sess.type)}">${catLabel(sess.type)}</span>`)}
        ${kv('Duration', fmtDuration(sess.duration || 0))}
        ${sess.sleep != null ? kv('Sleep', `${sess.sleep} / 10`) : ''}
        ${sess.energy != null ? kv('Energy', `${sess.energy} / 10`) : ''}
        ${sess.bodyweight != null ? kv('Bodyweight', `${sess.bodyweight} kg`) : ''}
        ${sess.notes ? `<div class="kv-notes">${escapeHtml(sess.notes)}</div>` : ''}
      </div>
    </section>

    <section class="group">
      <div class="group-label row-label">Exercises</div>
      ${(sess.exercises || []).map(ex => exerciseCard(ex)).join('') || emptyRow('No exercises logged.')}
    </section>

    <div class="actions">
      <button class="btn primary" id="add-ex">+ Add Exercise</button>
    </div>
  `;

  $('#back').onclick = () => navigate('sessions');
  $('#add-ex').onclick = () => navigate('addExercise', { sessionId: sess.id, category: sess.type });
  $('#del').onclick = () => {
    if (confirm('Delete this session?')) { Store.deleteSession(sess.id); navigate('sessions'); }
  };
}

function exerciseCard(ex) {
  const c = catColor(ex.category), p = ex.params || {};
  const marker = ex.result ? RESULT_MARKERS.find(m => m.key === ex.result) : null;

  // Build the small stat grid depending on category.
  let grid = '';
  if (ex.category === 'gs') {
    const dens = density(+p.reps, p.duration);
    grid = statGrid([
      ['Weight', p.weight != null ? `${p.weight} kg` : '—'],
      ['Duration', p.duration != null ? fmtClock(p.duration) : '—'],
      ['RPM (avg)', p.rpm ?? '—'],
      ['Reps', p.reps ?? '—'],
      ['RPE', p.rpe != null ? `${p.rpe}/10` : '—'],
      ['Density', dens != null ? `${dens.toFixed(1)} /min` : '—'],
    ]);
  } else if (ex.category === 'strength' || ex.category === 'accessory') {
    grid = statGrid([
      ['Weight', p.weight != null ? `${p.weight} kg` : '—'],
      ['Sets × Reps', `${p.sets ?? '—'} × ${p.reps ?? '—'}`],
      ['Rest', p.rest ? `${p.rest}s` : '—'],
      ['RPE', p.rpe != null ? `${p.rpe}/10` : '—'],
    ]);
  } else if (ex.category === 'gpp') {
    grid = statGrid([
      ['Weight', p.weight != null && p.weight !== '' ? `${p.weight} kg` : '—'],
      ['Sets × Reps', `${p.sets ?? '—'} × ${p.reps ?? '—'}`],
      ['Dist / Time', p.distance || '—'],
      ['Rest', p.rest ? `${p.rest}s` : '—'],
    ]);
  } else if (ex.category === 'technique') {
    grid = statGrid([
      ['Focus', p.focus || '—'],
      ['Quality', p.quality != null ? `${p.quality}/10` : '—'],
    ]);
  }

  const remarks = ex.category === 'technique'
    ? [p.observations && `Obs: ${p.observations}`, p.nextAction && `Next: ${p.nextAction}`].filter(Boolean).join('\n')
    : ex.remarks;

  return `<div class="card ex" style="border-left:3px solid ${c}">
    <div class="ex-head">
      <span class="ex-glyph" style="color:${c}">${catIcon(ex.category)}</span>
      <span class="ex-name">${escapeHtml(ex.exercise)}</span>
      ${marker ? `<span class="marker" style="background:${marker.color}">${marker.label}</span>` : ''}
    </div>
    ${grid}
    ${remarks ? `<div class="ex-remarks">${escapeHtml(remarks).replace(/\n/g, '<br>')}</div>` : ''}
  </div>`;
}
function statGrid(pairs) {
  return `<div class="stat-grid">${pairs.map(([k, v]) =>
    `<div class="stat"><div class="stat-k">${k}</div><div class="stat-v">${v}</div></div>`).join('')}</div>`;
}
function kv(k, v) { return `<div class="kv-row"><span class="kv-k">${k}</span><span class="kv-v">${v}</span></div>`; }

/* ===========================================================================
   SCREEN: NEW SESSION (header form) — creates a session, then go log exercises
=========================================================================== */
function renderNewSession() {
  const cats = Object.values(CATEGORIES);
  appEl.innerHTML = `
    <header class="topbar nav">
      <button class="back" id="cancel">Cancel</button>
      <h2 class="nav-title">New Session</h2>
      <button class="link strong" id="start">Start</button>
    </header>

    <section class="group">
      <div class="group-label">Session Type</div>
      <div class="seg" id="type-seg">
        ${cats.map((c, i) => `<button class="seg-btn ${i === 0 ? 'on' : ''}" data-type="${c.key}"
            style="--c:${c.color}">${c.label}</button>`).join('')}
      </div>
    </section>

    <section class="group">
      <div class="card form">
        ${inputRow('date', 'Date', 'date', todayISO())}
        ${inputRow('sleep', 'Sleep', 'number', '', '/10')}
        ${inputRow('energy', 'Energy', 'number', '', '/10')}
        ${inputRow('bodyweight', 'Bodyweight', 'number', '', 'kg')}
      </div>
      <div class="card form">
        <textarea id="notes" class="ta" placeholder="Notes — how you slept, mood, plan for today…"></textarea>
      </div>
    </section>
  `;

  let chosenType = cats[0].key;
  $$('#type-seg .seg-btn').forEach(b => b.onclick = () => {
    $$('#type-seg .seg-btn').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); chosenType = b.dataset.type;
  });
  $('#cancel').onclick = () => navigate('dashboard');
  $('#start').onclick = () => {
    const session = {
      id: Store.uid(),
      date: $('#date').value || todayISO(),
      type: chosenType,
      duration: 0,
      sleep: numOrNull($('#sleep').value),
      energy: numOrNull($('#energy').value),
      bodyweight: numOrNull($('#bodyweight').value),
      notes: $('#notes').value.trim(),
      exercises: [],
    };
    Store.saveSession(session);
    navigate('session', { id: session.id });   // straight into logging
  };
}

/* ===========================================================================
   SCREEN: ADD EXERCISE (dynamic fields by category) — the heart of the app
=========================================================================== */
function renderAddExercise(sessionId, category, prefill) {
  const sess = Store.getSession(sessionId);
  if (!sess) return navigate('sessions');
  const cats = Object.values(CATEGORIES);
  let cat = category || sess.type;

  function paint() {
    const fields = FIELDS[cat];
    const exList = EXERCISES[cat];

    appEl.innerHTML = `
      <header class="topbar nav">
        <button class="back" id="cancel">Cancel</button>
        <h2 class="nav-title">Add Exercise</h2>
        <button class="link strong" id="save">Save</button>
      </header>

      <div class="cat-tabs" id="cat-tabs">
        ${cats.map(c => `<button class="cat-tab ${c.key === cat ? 'on' : ''}" data-cat="${c.key}"
            style="--c:${c.color}"><span class="cat-glyph">${c.icon}</span>${c.label}</button>`).join('')}
      </div>

      <section class="group">
        <div class="card form">
          <div class="field">
            <label class="field-label">Exercise</label>
            <select id="f-exercise" class="field-input select">
              ${exList.map(e => `<option ${prefill && prefill.exercise === e ? 'selected' : ''}>${e}</option>`).join('')}
            </select>
          </div>
          ${fields.map(f => fieldRow(f, prefill && prefill.params ? prefill.params[f.key] : undefined,
                                     prefill ? prefill.result : undefined)).join('')}
        </div>

        ${cat === 'gs' ? `<div class="actions tight">
          <button class="btn ghost" id="use-timer" style="--c:${catColor('gs')}">▶ Use GS Timer</button>
        </div>` : ''}
      </section>
    `;

    // category switch
    $$('#cat-tabs .cat-tab').forEach(b => b.onclick = () => { cat = b.dataset.cat; paint(); });
    $('#cancel').onclick = () => navigate('session', { id: sessionId });
    $('#save').onclick = save;
    if ($('#use-timer')) $('#use-timer').onclick = () => {
      // carry current weight/duration into the timer setup
      const weight = numOrNull(($('[data-key="weight"]') || {}).value);
      navigate('timer', { sessionId, exercise: $('#f-exercise').value, weight });
    };
  }

  function save() {
    const params = collectFields(cat);
    const ex = {
      id: Store.uid(),
      category: cat,
      exercise: $('#f-exercise').value,
      params,
      result: params.__result || '',
      remarks: params.remarks || params.observations || '',
    };
    delete params.__result;
    const fresh = Store.getSession(sessionId);
    fresh.exercises.push(ex);
    Store.saveSession(fresh);
    navigate('session', { id: sessionId });
  }

  paint();
}

/* ---------- dynamic field rendering + collection -------------------------- */
function fieldRow(f, value, resultValue) {
  const v = value == null ? '' : value;
  switch (f.type) {
    case 'duration': {
      const mm = v ? Math.floor(v / 60) : '', ss = v ? v % 60 : '';
      return wrap(f, `<div class="dual" data-key="${f.key}" data-type="duration">
        <input class="mini" inputmode="numeric" placeholder="mm" data-part="m" value="${mm}">
        <span class="sep">:</span>
        <input class="mini" inputmode="numeric" placeholder="ss" data-part="s" value="${ss}"></div>`);
    }
    case 'workrest':
      return wrap(f, `<div class="dual" data-key="${f.key}" data-type="workrest">
        <input class="mini" inputmode="numeric" placeholder="work" data-part="w">
        <span class="sep">/</span>
        <input class="mini" inputmode="numeric" placeholder="rest" data-part="r"></div>`);
    case 'rpe':
      return wrap(f, `<input class="field-input num" data-key="${f.key}" data-type="rpe"
        inputmode="numeric" min="1" max="10" type="number" value="${v}" placeholder="–">
        <span class="suffix">/10</span>`);
    case 'result':
      return wrap(f, `<div class="markers" data-key="${f.key}" data-type="result">
        ${RESULT_MARKERS.map(m => `<button type="button" class="mk ${resultValue === m.key ? 'on' : ''}"
          data-result="${m.key}" style="--c:${m.color}">${m.label}</button>`).join('')}</div>`);
    case 'textarea':
      return `<div class="field col"><label class="field-label">${f.label}</label>
        <textarea class="ta" data-key="${f.key}" data-type="text" placeholder="${f.placeholder || ''}">${escapeHtml(v)}</textarea></div>`;
    case 'select':
      return wrap(f, `<select class="field-input select" data-key="${f.key}" data-type="text">
        ${(f.options || []).map(o => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`);
    default: // number / text
      return wrap(f, `<input class="field-input ${f.type === 'number' ? 'num' : ''}"
        data-key="${f.key}" data-type="${f.type}" inputmode="${f.type === 'number' ? 'decimal' : 'text'}"
        value="${escapeHtml(v)}" placeholder="${f.placeholder || ''}">
        ${f.unit ? `<span class="suffix">${f.unit}</span>` : ''}`);
  }
}
function wrap(f, inner) {
  return `<div class="field"><label class="field-label">${f.label}</label>
    <div class="field-control">${inner}</div></div>`;
}

function collectFields(category) {
  const out = {};
  $$('[data-key]').forEach(el => {
    const key = el.dataset.key, type = el.dataset.type;
    if (type === 'duration') {
      const m = +($('[data-part="m"]', el).value || 0), s = +($('[data-part="s"]', el).value || 0);
      if (m || s) out[key] = m * 60 + s;
    } else if (type === 'workrest') {
      const w = $('[data-part="w"]', el).value, r = $('[data-part="r"]', el).value;
      if (w || r) out[key] = { work: +w || 0, rest: +r || 0 };
    } else if (type === 'result') {
      const on = $('.mk.on', el);
      out.__result = on ? on.dataset.result : '';
    } else {
      const val = el.value.trim();
      if (val === '') return;
      out[key] = (type === 'number' || type === 'rpe') ? +val : val;
    }
  });
  return out;
}
// wire result markers (delegated, since they can be repainted)
document.addEventListener('click', e => {
  const mk = e.target.closest('.mk');
  if (!mk) return;
  const group = mk.parentElement;
  const wasOn = mk.classList.contains('on');
  $$('.mk', group).forEach(x => x.classList.remove('on'));
  if (!wasOn) mk.classList.add('on');     // tap again to clear
});

/* ===========================================================================
   SCREEN: GS TIMER  (the signature feature)
=========================================================================== */
function renderTimer(params) {
  const sessionId = params.sessionId || null;
  const exercise  = params.exercise || 'Long Cycle';
  const weight    = params.weight != null ? params.weight : 24;

  // setup defaults — editable on the ready screen
  let targetSec = 600;      // 10:00
  let targetReps = 70;
  const c = catColor('gs');

  function ready() {
    appEl.innerHTML = `
      <header class="topbar nav">
        <button class="back" id="cancel">Cancel</button>
        <h2 class="nav-title">GS Timer</h2><span></span>
      </header>
      <div class="timer-ready">
        <div class="ready-word">READY?</div>
        <div class="ready-ex" style="color:${c}">${escapeHtml(exercise)}</div>
        <div class="ready-weight">${weight} kg</div>

        <div class="ready-config">
          <label>Duration
            <div class="dual">
              <input id="t-min" class="mini" inputmode="numeric" value="${Math.floor(targetSec/60)}">
              <span class="sep">:</span>
              <input id="t-sec" class="mini" inputmode="numeric" value="${pad(targetSec%60)}">
            </div>
          </label>
          <label>Target reps
            <input id="t-reps" class="mini wide" inputmode="numeric" value="${targetReps}">
          </label>
        </div>
        <div class="ready-pace">Target pace: <b style="color:${c}">${(targetReps/(targetSec/60)).toFixed(1)} RPM</b></div>

        <button class="btn big" id="go" style="--c:${c}">START</button>
        <div class="ready-hint">Whistle plays at start, half, and finish.</div>
      </div>`;
    $('#cancel').onclick = () => sessionId ? navigate('addExercise', { sessionId, category: 'gs', prefill: null }) : navigate('dashboard');
    $('#go').onclick = () => {
      targetSec = (+$('#t-min').value || 0) * 60 + (+$('#t-sec').value || 0);
      targetReps = +$('#t-reps').value || 0;
      run();
    };
  }

  function run() {
    let reps = 0;
    appEl.innerHTML = `
      <div class="timer-live" style="--c:${c}">
        <div class="live-ex">${escapeHtml(exercise)} · ${weight}kg</div>
        <div class="live-clock" id="clock">${fmtClock(targetSec)}</div>
        <div class="live-row">
          <div class="live-stat"><div class="ls-num" id="minute">1</div><div class="ls-lab">Minute</div></div>
          <div class="live-stat"><div class="ls-num" id="reps">0</div><div class="ls-lab">Reps</div></div>
          <div class="live-stat"><div class="ls-num" id="proj">0</div><div class="ls-lab">Projected</div></div>
        </div>
        <div class="live-target">Target: ${targetReps} reps</div>
        <button class="rep-btn" id="rep" style="--c:${c}">+1 REP</button>
        <button class="btn end" id="end">End Set</button>
      </div>`;

    playWhistle();   // referee start

    const total = targetSec;
    liveTimer = new GSTimer({
      mode: 'down', target: total,
      onHalf: () => playSwitchCue(),
      onTick: (elapsed, remaining) => {
        $('#clock').textContent = fmtClock(remaining);
        const min = Math.min(Math.ceil(elapsed / 60) || 1, Math.ceil(total / 60));
        $('#minute').textContent = min;
        const elapsedMin = Math.max(elapsed / 60, 0.0001);
        $('#proj').textContent = Math.round(reps / elapsedMin * (total / 60));
        if (remaining < 4) $('#clock').classList.add('flash');
      },
      onDone: () => { playWhistle(); finish(reps, total); },
    });
    liveTimer.start();

    $('#rep').onclick = () => { reps++; $('#reps').textContent = reps; };
    $('#end').onclick = () => {
      const elapsed = Math.round(liveTimer.elapsed());
      liveTimer.stop(); liveTimer = null;
      finish(reps, elapsed || total);
    };
  }

  // After the set: build params and hand them to the Add Exercise screen pre-filled.
  function finish(reps, durationSec) {
    const rpm = reps ? (reps / (durationSec / 60)) : 0;
    appEl.innerHTML = `
      <header class="topbar nav"><span></span><h2 class="nav-title">Set Complete</h2><span></span></header>
      <div class="timer-done">
        <div class="done-check" style="color:${c}">✓</div>
        <div class="stat-grid wide">
          <div class="stat"><div class="stat-k">Reps</div><div class="stat-v">${reps}</div></div>
          <div class="stat"><div class="stat-k">Duration</div><div class="stat-v">${fmtClock(durationSec)}</div></div>
          <div class="stat"><div class="stat-k">Avg RPM</div><div class="stat-v">${rpm.toFixed(1)}</div></div>
          <div class="stat"><div class="stat-k">Density</div><div class="stat-v">${rpm.toFixed(1)}/min</div></div>
        </div>
        <button class="btn primary" id="log" style="--c:${c}">Add to Session →</button>
        ${sessionId ? '' : '<div class="ready-hint">No open session — this will start one.</div>'}
      </div>`;
    $('#log').onclick = () => {
      let sid = sessionId;
      if (!sid) {   // no session open → make a GS session on the spot
        const s = { id: Store.uid(), date: todayISO(), type: 'gs', duration: durationSec,
                    sleep: null, energy: null, bodyweight: null, notes: '', exercises: [] };
        Store.saveSession(s); sid = s.id;
      }
      navigate('addExercise', {
        sessionId: sid, category: 'gs',
        prefill: { exercise, result: '', params: { weight, duration: durationSec, reps, rpm: +rpm.toFixed(1) } },
      });
    };
  }

  ready();
}

/* ===========================================================================
   SCREEN: PROGRESS (goals: view / add / edit)
=========================================================================== */
function renderProgress() {
  const goals = Store.getGoals();
  appEl.innerHTML = `
    <header class="topbar">
      <h1 class="screen-title">Progress</h1>
      <button class="round-add" id="add-goal" aria-label="New goal">+</button>
    </header>
    <section class="group">
      <div class="group-label">Goals</div>
      <div class="card">
        ${goals.length ? goals.map(g => `
          <div class="goal editable">
            <button class="goal-del" data-del="${g.id}" aria-label="Delete goal">×</button>
            ${goalBar(g)}
            <div class="goal-edit">
              <label>Now <input class="mini" data-cur="${g.id}" inputmode="decimal" value="${g.current}"></label>
              <label>Target <input class="mini" data-tar="${g.id}" inputmode="decimal" value="${g.target}"></label>
            </div>
          </div>`).join('') : emptyRow('No goals yet.')}
      </div>
    </section>`;

  $('#add-goal').onclick = addGoal;
  $$('[data-del]').forEach(b => b.onclick = () => { Store.deleteGoal(b.dataset.del); renderProgress(); });
  // live-edit current/target
  $$('[data-cur]').forEach(i => i.onchange = () => updateGoal(i.dataset.cur, { current: +i.value }));
  $$('[data-tar]').forEach(i => i.onchange = () => updateGoal(i.dataset.tar, { target: +i.value }));

  function updateGoal(id, patch) {
    const g = Store.getGoals().find(x => x.id === id);
    if (g) { Store.saveGoal(Object.assign(g, patch)); renderProgress(); }
  }
  function addGoal() {
    const label = prompt('Goal name (e.g. "Jerk 28kg 10\'")'); if (!label) return;
    const cat = (prompt('Category: gs / strength / gpp / accessory / technique', 'gs') || 'gs').toLowerCase();
    const target = +prompt('Target number', '100') || 100;
    const unit = prompt('Unit (reps / kg)', 'reps') || 'reps';
    Store.saveGoal({ id: Store.uid(), label, category: CATEGORIES[cat] ? cat : 'gs', current: 0, target, unit });
    renderProgress();
  }
}

/* ===========================================================================
   SCREEN: MORE (settings + export / import / reset)
=========================================================================== */
function renderMore() {
  const set = Store.getSettings();
  appEl.innerHTML = `
    <header class="topbar"><h1 class="screen-title">More</h1></header>
    <section class="group">
      <div class="group-label">Timer Sound</div>
      <div class="card form">
        ${toggleRow('whistle', 'Whistle at start & end', set.whistle)}
        ${toggleRow('switchWhistle', 'Cue at half (hand switch)', set.switchWhistle)}
        <div class="field"><span class="field-label">Test</span>
          <button class="btn ghost sm" id="test-whistle">Play whistle</button></div>
      </div>
    </section>
    <section class="group">
      <div class="group-label">Data</div>
      <div class="card form">
        <div class="field"><span class="field-label">Export</span>
          <button class="btn ghost sm" id="export">Download JSON</button></div>
        <div class="field"><span class="field-label">Import</span>
          <label class="btn ghost sm">Choose file<input id="import" type="file" accept="application/json" hidden></label></div>
        <div class="field"><span class="field-label">Demo data</span>
          <button class="btn ghost sm danger" id="reset">Reset to demo</button></div>
      </div>
      <div class="group-label foot">GS Training Log · local-only · v1</div>
    </section>`;

  $('#whistle').onchange = e => Store.saveSettings({ whistle: e.target.checked });
  $('#switchWhistle').onchange = e => Store.saveSettings({ switchWhistle: e.target.checked });
  $('#test-whistle').onclick = () => { Store.saveSettings({ whistle: true }); playWhistle(); };
  $('#export').onclick = () => {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gs-log-${todayISO()}.json`; a.click();
  };
  $('#import').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { Store.importJSON(r.result); alert('Imported.'); navigate('dashboard'); }
                       catch { alert('That file could not be read.'); } };
    r.readAsText(file);
  };
  $('#reset').onclick = () => {
    if (!confirm('Replace all data with demo data?')) return;
    localStorage.removeItem('gslog.sessions'); localStorage.removeItem('gslog.goals');
    Store.seedDemoIfEmpty(); navigate('dashboard');
  };
}
function toggleRow(id, label, on) {
  return `<div class="field"><span class="field-label">${label}</span>
    <label class="switch"><input id="${id}" type="checkbox" ${on ? 'checked' : ''}><span class="slider"></span></label></div>`;
}

/* ---------- small generic input row (new-session form) -------------------- */
function inputRow(id, label, type, value = '', unit = '') {
  return `<div class="field"><label class="field-label" for="${id}">${label}</label>
    <div class="field-control">
      <input id="${id}" class="field-input ${type === 'number' ? 'num' : ''}" type="${type}"
        inputmode="${type === 'number' ? 'decimal' : 'text'}" value="${value}">
      ${unit ? `<span class="suffix">${unit}</span>` : ''}
    </div></div>`;
}

/* ---------- utils --------------------------------------------------------- */
function numOrNull(v) { v = (v || '').toString().trim(); return v === '' ? null : +v; }
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ===========================================================================
   TAB BAR + ROUTER
=========================================================================== */
const TABS = [
  { view: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { view: 'sessions',  label: 'Sessions',  icon: '🗒️' },
  { view: 'timer',     label: 'Timer',     icon: '⏱️' },   // center = signature feature
  { view: 'progress',  label: 'Progress',  icon: '📈' },
  { view: 'more',      label: 'More',       icon: '•••' },
];
function renderTabbar() {
  // which top-level tab is "active" (detail screens map back to a parent)
  const active = { session: 'sessions', newSession: 'sessions', addExercise: 'sessions' }[state.view] || state.view;
  tabbarEl.innerHTML = TABS.map(t => `
    <button class="tab ${t.view === active ? 'on' : ''}" data-view="${t.view}">
      <span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span>
    </button>`).join('');
  $$('.tab', tabbarEl).forEach(b => b.onclick = () => navigate(b.dataset.view));
}

function render() {
  switch (state.view) {
    case 'dashboard':   renderDashboard(); break;
    case 'sessions':    renderSessions(); break;
    case 'session':     renderSessionDetail(state.params.id); break;
    case 'newSession':  renderNewSession(); break;
    case 'addExercise': renderAddExercise(state.params.sessionId, state.params.category, state.params.prefill); break;
    case 'timer':       renderTimer(state.params); break;
    case 'progress':    renderProgress(); break;
    case 'more':        renderMore(); break;
    default:            renderDashboard();
  }
  renderTabbar();
}

/* ---------- boot ---------------------------------------------------------- */
Store.seedDemoIfEmpty();   // remove this line to start with an empty app
render();
