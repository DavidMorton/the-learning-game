/* Lakehouse Quest: a practice game for the Databricks Certified Data Engineer Associate exam.
   Plain browser JavaScript with no build step. Questions come from questions.json and
   progress is kept in localStorage. */
(() => {
  'use strict';

  // ─── Configuration ──────────────────────────────────────────────────────────

  const CONFIG = {
    bankUrl: 'questions.json',
    storageKey: 'lakehouse-quest:v1',
    mock: { questions: 45, minutes: 90 },
    passTarget: 0.7,
    quickLengths: [10, 20, 30],
    reviewLength: 15,
    dailyGoal: 20,
    lightning: { seconds: 120, penalty: 5 },
    survivalLives: 3,
    // Leitner boxes: a wrong answer drops a question to box 0, each right answer moves it up.
    // A question is "mastered" at masteryBox. intervalDays[box] is how long before it is due again.
    masteryBox: 3,
    maxBox: 5,
    intervalDays: [0, 1, 2, 4, 8, 16],
    xp: { easy: 10, medium: 15, hard: 25, streakStep: 2, streakCap: 10, redemption: 5, mockPass: 150, dailyGoal: 50 },
  };

  const LEVELS = [
    { xp: 0, title: 'Raw File' },
    { xp: 150, title: 'Bronze Ingestor' },
    { xp: 400, title: 'Silver Refiner' },
    { xp: 800, title: 'Gold Curator' },
    { xp: 1400, title: 'Stream Wrangler' },
    { xp: 2200, title: 'Pipeline Pilot' },
    { xp: 3200, title: 'Job Orchestrator' },
    { xp: 4500, title: 'Catalog Keeper' },
    { xp: 6000, title: 'Lakehouse Architect' },
    { xp: 8000, title: 'Delta Legend' },
  ];

  const ACHIEVEMENTS = [
    { id: 'first', icon: '🎯', name: 'Hello, Lakehouse', desc: 'Answer your first question correctly' },
    { id: 'streak5', icon: '🔥', name: 'On a Roll', desc: '5 correct answers in a row' },
    { id: 'streak10', icon: '☄️', name: 'Hot Streak', desc: '10 correct answers in a row' },
    { id: 'streak25', icon: '🌋', name: 'Unstoppable', desc: '25 correct answers in a row' },
    { id: 'perfect', icon: '💎', name: 'Flawless', desc: 'Finish a Quick Play round of 10+ with no misses' },
    { id: 'lightning10', icon: '⚡', name: 'Speed Reader', desc: 'Get 10 right in one Lightning Round' },
    { id: 'survival15', icon: '🛡️', name: 'Survivor', desc: 'Reach 15 correct in Survival' },
    { id: 'redemption', icon: '🔁', name: 'Redemption', desc: 'Fix a question you previously missed' },
    { id: 'hard10', icon: '🧗', name: 'Hard Mode', desc: 'Answer 10 hard questions correctly' },
    { id: 'century', icon: '💯', name: 'Centurion', desc: 'Answer 100 questions' },
    { id: 'explorer', icon: '🗺️', name: 'Explorer', desc: 'See every question in the bank' },
    { id: 'daily', icon: '✅', name: 'Daily Grind', desc: `Hit the daily goal of ${CONFIG.dailyGoal} answers` },
    { id: 'habit3', icon: '📅', name: 'Habit Forming', desc: 'Practice 3 days in a row' },
    { id: 'week7', icon: '🗓️', name: 'Week Warrior', desc: 'Practice 7 days in a row' },
    { id: 'specialist', icon: '🎓', name: 'Specialist', desc: 'Reach 80% mastery in any section' },
    { id: 'rounded', icon: '🧭', name: 'Well Rounded', desc: 'Reach 50% mastery in every section' },
    { id: 'mockPass', icon: '🏆', name: 'Exam Ready', desc: `Score ${Math.round(CONFIG.passTarget * 100)}%+ on a Mock Exam` },
    { id: 'mockAce', icon: '👑', name: 'Ace', desc: 'Score 90%+ on a Mock Exam' },
  ];
  const ACH_BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));

  const LETTERS = 'ABCDEFGH';
  const DAY_MS = 86400000;
  const PRAISE = ['Correct!', 'Nailed it!', 'Spot on!', 'Exactly right!', 'You got it!', 'Textbook!'];

  const app = document.getElementById('app');
  const toastsEl = document.getElementById('toasts');

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = n => Math.round((n || 0) * 100);
  const fmtNum = n => Number(n || 0).toLocaleString();
  const randomOf = arr => arr[Math.floor(Math.random() * arr.length)];
  const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : null);
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function fmtClock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function dayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dayKey(d);
  }

  // Split `total` across sections in proportion to their weights (largest remainder method).
  function allocate(total, sections) {
    const sum = sections.reduce((a, s) => a + s.weight, 0) || 1;
    const rows = sections.map(s => {
      const exact = (total * s.weight) / sum;
      return { id: s.id, n: Math.floor(exact), rem: exact - Math.floor(exact) };
    });
    let left = total - rows.reduce((a, r) => a + r.n, 0);
    rows.slice().sort((a, b) => b.rem - a.rem).forEach(r => { if (left > 0) { r.n++; left--; } });
    return Object.fromEntries(rows.map(r => [r.id, r.n]));
  }

  // Answer choices that are code (PySpark, SQL, CLI) render in monospace; prose that merely
  // starts with a keyword ("SELECT on the table") does not.
  const CODE_START = /^(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\(|(?:spark|df|dbutils)\.|(?:SELECT|CREATE|ALTER|GRANT|REVOKE|MERGE|COPY INTO|INSERT|UPDATE|DELETE|OPTIMIZE|VACUUM|DESCRIBE|SHOW|SET|DROP|WITH|FROM)\b|databricks\s|%\w|\{|\$\{|[a-z_][\w.]*\s*=|[a-z_]+:\s)/;
  const PROSE = /,\s[a-z]+\s+\w|\s(?:the|a|an|which|because|only|always|called|once|every|is|are|its|before|after|then|instead|nothing|sets|controls|changes|works|followed|within|with|on)\s/;
  const looksLikeCode = s => CODE_START.test(s) && !PROSE.test(s.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''"));

  // ─── Persistence ────────────────────────────────────────────────────────────

  function defaultStore() {
    return {
      xp: 0,
      q: {}, // per question: { box, n, right, wrong, ok, last, due }
      best: { streak: 0, lightning: 0, survival: 0, mock: 0 },
      totals: { answered: 0, correct: 0, hardCorrect: 0 },
      days: { last: null, streak: 0, best: 0 },
      daily: { date: null, n: 0, done: false },
      achievements: {},
      mocks: [],
      settings: { sound: true },
      prefs: { quick: { sections: [], difficulty: 'any', length: 10, order: 'smart' } },
    };
  }

  function loadStore() {
    const base = defaultStore();
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || 'null');
      if (saved && typeof saved === 'object') {
        for (const key of Object.keys(base)) {
          if (saved[key] === undefined) continue;
          const isObj = base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]);
          base[key] = isObj ? { ...base[key], ...saved[key] } : saved[key];
        }
      }
    } catch (e) { /* storage unavailable or corrupt: start fresh */ }
    return base;
  }

  function save() {
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(store)); } catch (e) { /* play on without saving */ }
  }

  let store = loadStore();

  // ─── Question bank ──────────────────────────────────────────────────────────

  let bank = null;

  function prepareBank(data) {
    if (!data || !Array.isArray(data.questions)) throw new Error('the file has no "questions" array');
    const questions = data.questions.filter(q =>
      q && q.id && q.question && Array.isArray(q.choices) && q.choices.length >= 2 &&
      q.choices.length <= LETTERS.length && Number.isInteger(q.answerIndex) &&
      q.answerIndex >= 0 && q.answerIndex < q.choices.length);
    if (!questions.length) throw new Error('no valid questions found');

    const sections = (Array.isArray(data.sections) ? data.sections : [])
      .map(s => ({ id: String(s.id), name: s.name || `Section ${s.id}`, weight: Number(s.weight) || 1 }));
    const bySection = new Map(sections.map(s => [s.id, []]));
    for (const q of questions) {
      q.section = String(q.section ?? '?');
      q.difficulty = ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium';
      if (!bySection.has(q.section)) {
        sections.push({ id: q.section, name: q.sectionName || `Section ${q.section}`, weight: 1 });
        bySection.set(q.section, []);
      }
      bySection.get(q.section).push(q);
    }
    const used = sections.filter(s => bySection.get(s.id).length);
    const weightSum = used.reduce((a, s) => a + s.weight, 0);
    return {
      title: data.title || 'Practice questions',
      questions,
      sections: used,
      bySection,
      sectionById: new Map(used.map(s => [s.id, s])),
      weightsArePercent: Math.abs(weightSum - 100) < 0.5,
    };
  }

  // ─── Progress model ─────────────────────────────────────────────────────────

  function record(q, correct) {
    const now = Date.now();
    const prev = store.q[q.id];
    const r = prev ? { ...prev } : { box: 0, n: 0, right: 0, wrong: 0 };
    const redeemed = correct && prev && prev.ok === false;
    r.n++;
    if (correct) {
      r.right++;
      // Knowing it cold the first time skips a box.
      r.box = prev ? Math.min(r.box + 1, CONFIG.maxBox) : 2;
    } else {
      r.wrong++;
      r.box = 0;
    }
    r.ok = correct;
    r.last = now;
    r.due = now + CONFIG.intervalDays[r.box] * DAY_MS;
    store.q[q.id] = r;

    store.totals.answered++;
    if (correct) {
      store.totals.correct++;
      if (q.difficulty === 'hard') store.totals.hardCorrect++;
    }
    touchDay();
    return { redeemed, isNew: !prev };
  }

  function touchDay() {
    const today = dayKey();
    const d = store.days;
    if (d.last !== today) {
      d.streak = d.last === yesterdayKey() ? d.streak + 1 : 1;
      d.best = Math.max(d.best, d.streak);
      d.last = today;
    }
    if (store.daily.date !== today) store.daily = { date: today, n: 0, done: false };
    store.daily.n++;
    if (!store.daily.done && store.daily.n >= CONFIG.dailyGoal) {
      store.daily.done = true;
      toast({ icon: '✅', title: 'Daily goal complete!', body: `+${CONFIG.xp.dailyGoal} XP bonus` });
      addXP(CONFIG.xp.dailyGoal);
      unlock('daily');
    }
  }

  function currentDayStreak() {
    const d = store.days;
    return d.last === dayKey() || d.last === yesterdayKey() ? d.streak : 0;
  }

  function dailyCount() {
    return store.daily.date === dayKey() ? store.daily.n : 0;
  }

  function masteryStats() {
    let weightSum = 0, weighted = 0, mastered = 0, seen = 0, right = 0, attempts = 0;
    const sections = bank.sections.map(s => {
      const qs = bank.bySection.get(s.id);
      let m = 0, sSeen = 0, sRight = 0, sAttempts = 0, sMastered = 0;
      for (const q of qs) {
        const r = store.q[q.id];
        if (!r) continue;
        sSeen++;
        sRight += r.right;
        sAttempts += r.n;
        m += Math.min(r.box, CONFIG.masteryBox) / CONFIG.masteryBox;
        if (r.box >= CONFIG.masteryBox) sMastered++;
      }
      const mastery = m / qs.length;
      weightSum += s.weight;
      weighted += s.weight * mastery;
      mastered += sMastered;
      seen += sSeen;
      right += sRight;
      attempts += sAttempts;
      return { ...s, count: qs.length, mastery, seen: sSeen, mastered: sMastered, accuracy: sAttempts ? sRight / sAttempts : null };
    });
    return { sections, readiness: weightSum ? weighted / weightSum : 0, mastered, seen, accuracy: attempts ? right / attempts : null };
  }

  function tierFor(mastery) {
    if (mastery <= 0) return { key: 'raw', label: 'Raw' };
    if (mastery < 0.4) return { key: 'bronze', label: 'Bronze' };
    if (mastery < 0.75) return { key: 'silver', label: 'Silver' };
    return { key: 'gold', label: 'Gold' };
  }

  function readinessLabel(r) {
    if (r <= 0) return "Let's get started";
    if (r < 0.25) return 'Warming up';
    if (r < 0.5) return 'Building momentum';
    if (r < 0.75) return 'Getting close';
    if (r < 0.9) return 'Nearly exam-ready';
    return 'Exam-ready';
  }

  function levelFor(xp) {
    let i = 0;
    while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
    const cur = LEVELS[i], next = LEVELS[i + 1] || null;
    return { index: i, num: i + 1, title: cur.title, next, progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
  }

  function addXP(n) {
    if (!n) return;
    const before = levelFor(store.xp).index;
    store.xp += n;
    if (session) session.xp = (session.xp || 0) + n;
    const after = levelFor(store.xp);
    if (after.index > before) {
      sfx('level');
      confetti();
      toast({ icon: '⬆️', title: `Level ${after.num}: ${after.title}`, body: 'You ranked up!' });
    }
  }

  function xpFor(q, streak, redeemed) {
    const base = CONFIG.xp[q.difficulty] || CONFIG.xp.medium;
    const bonus = Math.min(Math.max(streak - 1, 0), CONFIG.xp.streakCap) * CONFIG.xp.streakStep;
    return base + bonus + (redeemed ? CONFIG.xp.redemption : 0);
  }

  // Higher means "ask this sooner": last answer wrong, then new or due, then the rest.
  function priority(q) {
    const r = store.q[q.id];
    if (!r) return 2 + Math.random();
    if (r.ok === false) return 3 + Math.random();
    if (r.due <= Date.now()) return 2.2 + Math.random() * 0.8 - r.box * 0.1;
    return 1 / (r.box + 1) + Math.random() * 0.5;
  }

  const mistakeQuestions = () => bank.questions
    .filter(q => store.q[q.id]?.ok === false)
    .sort((a, b) => store.q[b.id].wrong - store.q[a.id].wrong);

  function unlock(id) {
    if (store.achievements[id]) return;
    const a = ACH_BY_ID.get(id);
    if (!a) return;
    store.achievements[id] = Date.now();
    if (session && session.newAchievements) session.newAchievements.push(a);
    sfx('achieve');
    toast({ icon: a.icon, title: `Achievement: ${a.name}`, body: a.desc });
  }

  function checkProgress() {
    const t = store.totals;
    if (t.correct >= 1) unlock('first');
    if (t.hardCorrect >= 10) unlock('hard10');
    if (t.answered >= 100) unlock('century');
    if (bank.questions.every(q => store.q[q.id])) unlock('explorer');
    if (store.days.streak >= 3) unlock('habit3');
    if (store.days.streak >= 7) unlock('week7');
    const m = masteryStats();
    if (m.sections.some(s => s.mastery >= 0.8)) unlock('specialist');
    if (m.sections.every(s => s.mastery >= 0.5)) unlock('rounded');
  }

  // ─── Effects: sound, confetti, toasts, floating text ────────────────────────

  let audioCtx = null;
  const SOUNDS = {
    correct: [[660, 0, 0.09], [990, 0.08, 0.16]],
    wrong: [[220, 0, 0.12, 'square'], [160, 0.1, 0.22, 'square']],
    level: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.35]],
    achieve: [[880, 0, 0.1, 'triangle'], [1175, 0.09, 0.1, 'triangle'], [1568, 0.18, 0.3, 'triangle']],
    start: [[440, 0, 0.08], [660, 0.08, 0.12]],
    tick: [[1250, 0, 0.04, 'square']],
  };

  function sfx(name) {
    if (!store.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t0 = audioCtx.currentTime;
      for (const [freq, at, dur, type = 'sine'] of SOUNDS[name] || []) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        const vol = type === 'square' ? 0.035 : 0.09;
        gain.gain.setValueAtTime(0.0001, t0 + at);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + dur + 0.02);
      }
    } catch (e) { /* audio unavailable */ }
  }

  function confetti() {
    if (reducedMotion()) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti';
    document.body.appendChild(canvas);
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const colors = ['#ff5a36', '#ff8f3d', '#f6c544', '#34d88a', '#5eb0ff', '#c084fc'];
    const parts = Array.from({ length: 150 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 15 - 4,
      size: Math.random() * 7 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
    }));
    const start = performance.now();
    const LIFE = 2600;
    (function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - t / LIFE);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < LIFE) requestAnimationFrame(frame);
      else canvas.remove();
    })(start);
  }

  function toast({ icon, title, body }) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="t-icon">${icon}</span><div><strong>${esc(title)}</strong>${body ? `<div class="small muted">${esc(body)}</div>` : ''}</div>`;
    toastsEl.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 400);
    }, 3800);
  }

  function floatText(anchor, text, cls) {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `float-text ${cls || ''}`;
    el.textContent = text;
    el.style.left = `${r.right - 14}px`;
    el.style.top = `${r.top + r.height / 2}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  // A small promise-based confirm dialog that keeps keyboard input away from the game.
  let activeModal = null;
  function confirmModal(title, body, okLabel = 'OK', cancelLabel = 'Cancel') {
    dismissModal();
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">${esc(title)}</h2>
          <p>${esc(body)}</p>
          <div class="modal-actions">
            <button class="btn ghost" data-r="0">${esc(cancelLabel)}</button>
            <button class="btn primary" data-r="1">${esc(okLabel)}</button>
          </div>
        </div>`;
      const prevFocus = document.activeElement;
      const onKey = e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
        else if (e.key === 'Enter') { e.preventDefault(); close(document.activeElement?.dataset.r !== '0'); }
      };
      const close = value => {
        document.removeEventListener('keydown', onKey, true);
        wrap.remove();
        activeModal = null;
        if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
        resolve(value);
      };
      wrap.addEventListener('click', e => {
        const b = e.target.closest('[data-r]');
        if (b) close(b.dataset.r === '1');
        else if (e.target === wrap) close(false);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(wrap);
      wrap.querySelector('[data-r="1"]').focus();
      activeModal = { close };
    });
  }
  function dismissModal() { if (activeModal) activeModal.close(false); }

  // ─── Screens and timers ─────────────────────────────────────────────────────

  let screen = 'loading';
  let session = null;
  let setup = null;
  const timers = new Set();

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }
  function every(fn, ms) { timers.add(setInterval(fn, ms)); }
  function clearTimers() {
    timers.forEach(id => { clearTimeout(id); clearInterval(id); });
    timers.clear();
  }

  const SCREENS = {
    home: () => renderHome(),
    setup: () => renderSetup(),
    results: () => renderResults(),
    mock: () => { renderMock(); startMockClock(); },
    mockResults: () => renderMockResults(),
  };

  function go(name) {
    clearTimers();
    dismissModal();
    document.querySelectorAll('.float-text').forEach(el => el.remove());
    screen = name;
    SCREENS[name]();
    window.scrollTo(0, 0);
  }

  // ─── Home ───────────────────────────────────────────────────────────────────

  function renderHome() {
    const lvl = levelFor(store.xp);
    const m = masteryStats();
    const mistakes = mistakeQuestions().length;
    const days = currentDayStreak();
    const today = dailyCount();
    const now = Date.now();
    let unseen = 0, due = 0;
    for (const q of bank.questions) {
      const r = store.q[q.id];
      if (!r) unseen++;
      else if (r.ok && r.due <= now) due++;
    }
    const best = store.best;
    const unlocked = ACHIEVEMENTS.filter(a => store.achievements[a.id]).length;

    app.innerHTML = `
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true">🧱</span><span>Lakehouse <b>Quest</b></span></div>
        <div class="top-actions">
          <span class="chip ${days ? 'lit' : ''}" title="Days in a row you've practiced">🔥 ${plural(days, 'day')}</span>
          ${soundButton()}
        </div>
      </header>

      <section class="hero">
        <div class="card player">
          <div class="lvl-badge" aria-label="Level ${lvl.num}"><span>LV</span><b>${lvl.num}</b></div>
          <div class="player-info">
            <div class="eyebrow">Your rank</div>
            <div class="lvl-title">${esc(lvl.title)}</div>
            <div class="xpbar"><span style="width:${pct(lvl.progress)}%"></span></div>
            <div class="muted small">${lvl.next
              ? `${fmtNum(store.xp)} / ${fmtNum(lvl.next.xp)} XP · next rank: ${esc(lvl.next.title)}`
              : `${fmtNum(store.xp)} XP · top rank reached`}</div>
          </div>
          <div class="daily ${today >= CONFIG.dailyGoal ? 'done' : ''}">
            <span class="daily-label">${today >= CONFIG.dailyGoal ? '✅ Daily goal done' : '🎯 Daily goal'}</span>
            <div class="xpbar"><span style="width:${Math.min(100, pct(today / CONFIG.dailyGoal))}%"></span></div>
            <span class="daily-count">${Math.min(today, CONFIG.dailyGoal)} / ${CONFIG.dailyGoal}</span>
          </div>
          <div class="player-stats">
            <div><b>${fmtNum(store.totals.answered)}</b><span>answered</span></div>
            <div><b>${best.streak}</b><span>best streak</span></div>
            <div><b>${unlocked}/${ACHIEVEMENTS.length}</b><span>achievements</span></div>
          </div>
        </div>

        <div class="card readiness">
          ${ring(m.readiness, 'ready')}
          <div class="readiness-info">
            <div class="eyebrow">Exam readiness</div>
            <div class="readiness-label">${readinessLabel(m.readiness)}</div>
            <ul class="kv">
              <li><span>Mastered</span><b>${m.mastered} / ${bank.questions.length}</b></li>
              <li><span>Seen</span><b>${m.seen} / ${bank.questions.length}</b></li>
              <li><span>Accuracy</span><b>${m.accuracy == null ? '—' : `${pct(m.accuracy)}%`}</b></li>
              <li><span>Best mock exam</span><b>${store.mocks.length ? `${pct(best.mock)}%` : '—'}</b></li>
            </ul>
          </div>
          <p class="readiness-note muted small">Readiness is your mastery of each section, weighted by its share of the exam. A question counts as mastered once you've answered it right on spaced repeats.</p>
        </div>
      </section>

      <h2 class="h-section">Play</h2>
      <div class="modes">
        ${modeCard({ mode: 'quick', icon: '🎯', title: 'Quick Play', featured: true,
          desc: 'Choose sections and difficulty. Questions you missed and new ones come first.',
          meta: `${unseen} new · ${due} due for review` })}
        ${modeCard({ mode: 'lightning', icon: '⚡', title: 'Lightning Round',
          desc: `${CONFIG.lightning.seconds / 60} minutes on the clock. Streaks multiply your score; misses cost ${CONFIG.lightning.penalty}s.`,
          meta: best.lightning ? `Best: ${fmtNum(best.lightning)} pts` : 'No score yet' })}
        ${modeCard({ mode: 'survival', icon: '❤️', title: 'Survival',
          desc: `${CONFIG.survivalLives} lives. Questions get harder the longer you last.`,
          meta: best.survival ? `Best: ${best.survival} correct` : 'No run yet' })}
        ${modeCard({ mode: 'mock', icon: '📝', title: 'Mock Exam',
          desc: `${CONFIG.mock.questions} questions in ${CONFIG.mock.minutes} minutes, spread across sections by exam weight. Score at the end.`,
          meta: store.mocks.length ? `Best: ${pct(best.mock)}% · ${plural(store.mocks.length, 'attempt')}` : `Target: ${pct(CONFIG.passTarget)}%` })}
        ${modeCard({ mode: 'review', icon: '🔁', title: 'Fix Mistakes', disabled: !mistakes,
          desc: 'Replay the questions you got wrong last time until they stick.',
          meta: mistakes ? `${mistakes} to fix` : 'Nothing to fix yet' })}
      </div>

      <h2 class="h-section">Section mastery <span class="muted small">Raw → Bronze → Silver → Gold · click a section to practice it</span></h2>
      <div class="card sections">${m.sections.map(sectionRow).join('')}</div>

      <h2 class="h-section">Achievements <span class="muted small">${unlocked} / ${ACHIEVEMENTS.length}</span></h2>
      <div class="achievements">
        ${ACHIEVEMENTS.map(a => `
          <div class="ach ${store.achievements[a.id] ? 'got' : ''}">
            <span class="ach-icon" aria-hidden="true">${a.icon}</span>
            <span class="ach-name">${esc(a.name)}</span>
            <span class="ach-desc">${esc(a.desc)}</span>
          </div>`).join('')}
      </div>

      <footer class="foot">
        <span class="muted small">${bank.questions.length} questions · ${esc(bank.title)}</span>
        <button class="link-btn small" data-action="reset">Reset progress</button>
      </footer>`;
  }

  function soundButton() {
    const on = store.settings.sound;
    return `<button class="icon-btn" data-action="toggle-sound" aria-pressed="${on}" aria-label="Sound effects" title="Sound ${on ? 'on' : 'off'}">${on ? '🔊' : '🔇'}</button>`;
  }

  function modeCard({ mode, icon, title, desc, meta, disabled, featured }) {
    return `
      <button class="mode-card ${featured ? 'featured' : ''}" data-action="mode" data-mode="${mode}" ${disabled ? 'disabled' : ''}>
        <span class="mode-icon" aria-hidden="true">${icon}</span>
        <span class="mode-title">${esc(title)}</span>
        <span class="mode-desc">${esc(desc)}</span>
        <span class="mode-meta">${esc(meta)}</span>
      </button>`;
  }

  function sectionRow(s) {
    const tier = tierFor(s.mastery);
    const weight = bank.weightsArePercent ? ` · ${s.weight}% of exam` : '';
    return `
      <button class="sec-row" data-action="practice-section" data-section="${esc(s.id)}">
        <span class="sec-num">${esc(s.id)}</span>
        <span class="sec-main">
          <span class="sec-name">${esc(s.name)}</span>
          <span class="bar tier-${tier.key}"><span style="width:${pct(s.mastery)}%"></span></span>
          <span class="sec-meta">${s.mastered}/${s.count} mastered · ${s.seen} seen · ${s.accuracy == null ? 'no answers yet' : `${pct(s.accuracy)}% accuracy`}${weight}</span>
        </span>
        <span class="sec-side">
          <span class="sec-go">Practice →</span>
          <span class="medal tier-${tier.key}">${tier.label}</span>
          <b>${pct(s.mastery)}%</b>
        </span>
      </button>`;
  }

  function ring(value, label, cls = '') {
    const r = 52, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, value)));
    return `
      <div class="ring ${cls}" style="width:136px;height:136px">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--gold)"/>
          </linearGradient></defs>
          <circle cx="60" cy="60" r="${r}" class="ring-track"/>
          <circle cx="60" cy="60" r="${r}" class="ring-fill" style="--c:${c.toFixed(1)}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
        </svg>
        <div class="ring-label"><b>${pct(value)}%</b><span>${esc(label)}</span></div>
      </div>`;
  }

  // ─── Quick Play setup ───────────────────────────────────────────────────────

  function openSetup() {
    const p = store.prefs.quick || {};
    setup = {
      sections: (p.sections || []).filter(id => bank.sectionById.has(id)),
      difficulty: p.difficulty || 'any',
      length: CONFIG.quickLengths.includes(p.length) ? p.length : CONFIG.quickLengths[0],
      order: p.order === 'random' ? 'random' : 'smart',
    };
    go('setup');
  }

  function filterPool(cfg) {
    return bank.questions.filter(q =>
      (!cfg.sections.length || cfg.sections.includes(q.section)) &&
      (cfg.difficulty === 'any' || q.difficulty === cfg.difficulty));
  }

  function seg(action, current, options) {
    return `<div class="seg" role="radiogroup">${options.map(([v, label]) => {
      const on = String(v) === String(current);
      return `<button class="${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-action="${action}" data-v="${esc(v)}">${esc(label)}</button>`;
    }).join('')}</div>`;
  }

  function renderSetup() {
    const pool = filterPool(setup);
    const all = !setup.sections.length;
    app.innerHTML = `
      <div class="screen-head">
        <button class="icon-btn" data-action="home" aria-label="Back to home">←</button>
        <h1>🎯 Quick Play</h1>
      </div>
      <div class="card setup">
        <div class="field">
          <div class="field-label">Sections</div>
          <div class="chips">
            <button class="chip-toggle ${all ? 'on' : ''}" data-action="setup-sec" data-section=""><span class="chip-num">★</span>All sections</button>
            ${bank.sections.map(s => `
              <button class="chip-toggle ${setup.sections.includes(s.id) ? 'on' : ''}" data-action="setup-sec" data-section="${esc(s.id)}">
                <span class="chip-num">${esc(s.id)}</span>${esc(s.name)}
              </button>`).join('')}
          </div>
        </div>
        <div class="field">
          <div class="field-label">Difficulty</div>
          ${seg('setup-diff', setup.difficulty, [['any', 'Any'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']])}
        </div>
        <div class="field">
          <div class="field-label">Questions per round</div>
          ${seg('setup-len', setup.length, CONFIG.quickLengths.map(n => [n, String(n)]))}
        </div>
        <div class="field">
          <div class="field-label">Order</div>
          ${seg('setup-order', setup.order, [['smart', 'Smart mix'], ['random', 'Random']])}
          <p class="muted small">${setup.order === 'smart'
            ? 'Questions you missed come first, then new and due ones, spread across sections by exam weight.'
            : 'A random draw from the questions that match.'}</p>
        </div>
        <div class="setup-foot">
          <span class="muted">${plural(pool.length, 'question')} match${pool.length && pool.length < setup.length ? `, so the round will be ${pool.length} long` : ''}</span>
          <button class="btn primary big" data-action="setup-start" ${pool.length ? '' : 'disabled'}>Start round →</button>
        </div>
      </div>`;
  }

  // ─── Sessions: Quick Play, Fix Mistakes, Lightning, Survival ────────────────

  function newSession(mode, queue = []) {
    return {
      mode, queue, index: -1, used: new Set(), current: null,
      answered: 0, correct: 0, streak: 0, bestStreak: 0, xp: 0, score: 0,
      lives: CONFIG.survivalLives, timeLeft: CONFIG.lightning.seconds, paused: false,
      missed: [], newAchievements: [], over: false, replay: null,
    };
  }

  // Pick n questions, highest priority first, split across sections by exam weight.
  function pickSmart(pool, n) {
    const groups = new Map();
    for (const q of pool) {
      if (!groups.has(q.section)) groups.set(q.section, []);
      groups.get(q.section).push(q);
    }
    const secs = bank.sections.filter(s => groups.has(s.id));
    const quota = allocate(Math.min(n, pool.length), secs);
    const chosen = [], spare = [];
    for (const s of secs) {
      const ranked = groups.get(s.id).map(q => [priority(q), q]).sort((a, b) => b[0] - a[0]);
      chosen.push(...ranked.slice(0, quota[s.id]).map(x => x[1]));
      spare.push(...ranked.slice(quota[s.id]));
    }
    if (chosen.length < n) chosen.push(...spare.sort((a, b) => b[0] - a[0]).slice(0, n - chosen.length).map(x => x[1]));
    return chosen;
  }

  // For endless modes: choose a section by exam weight, then its highest-priority unused question.
  function pickNext(accept) {
    const unused = bank.questions.filter(q => !session.used.has(q.id));
    let pool = unused.filter(accept);
    if (!pool.length) pool = unused;
    if (!pool.length) return null;
    const secIds = [...new Set(pool.map(q => q.section))];
    const weights = secIds.map(id => bank.sectionById.get(id).weight);
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    let sec = secIds[secIds.length - 1];
    for (let i = 0; i < secIds.length; i++) {
      roll -= weights[i];
      if (roll < 0) { sec = secIds[i]; break; }
    }
    let best = null, bestP = -Infinity;
    for (const q of pool) {
      if (q.section !== sec) continue;
      const p = priority(q);
      if (p > bestP) { best = q; bestP = p; }
    }
    return best;
  }

  function startQuick(cfg, remember) {
    if (remember) { store.prefs.quick = { ...cfg }; save(); }
    const pool = filterPool(cfg);
    const picks = cfg.order === 'random' ? shuffle(pool).slice(0, cfg.length) : pickSmart(pool, cfg.length);
    if (!picks.length) return toast({ icon: '🤔', title: 'No questions match', body: 'Try widening your filters.' });
    session = newSession('quick', shuffle(picks));
    beginPlay(() => startQuick(cfg, false));
  }

  function startReview(list) {
    const qs = list && list.length ? list : mistakeQuestions().slice(0, CONFIG.reviewLength);
    if (!qs.length) return toast({ icon: '🎉', title: 'Nothing to fix', body: 'You have no outstanding mistakes.' });
    session = newSession('review', shuffle(qs));
    beginPlay(() => startReview());
  }

  function startLightning() {
    session = newSession('lightning');
    beginPlay(startLightning);
  }

  function startSurvival() {
    session = newSession('survival');
    beginPlay(startSurvival);
  }

  const SURVIVAL_STAGES = [
    { from: 0, label: 'Stage 1 · Warm-up', difficulties: ['easy'] },
    { from: 5, label: 'Stage 2 · Rising', difficulties: ['easy', 'medium'] },
    { from: 15, label: 'Stage 3 · Tough', difficulties: ['medium', 'hard'] },
    { from: 25, label: 'Stage 4 · Brutal', difficulties: ['hard', 'medium'] },
  ];
  const survivalStage = correct => SURVIVAL_STAGES.filter(s => correct >= s.from).pop();

  const DIFFICULTY_FACTOR = { easy: 1, medium: 1.5, hard: 2 };
  const lightningMult = streak => Math.min(1 + Math.floor(streak / 3), 5);

  function beginPlay(replay) {
    session.replay = replay;
    clearTimers();
    dismissModal();
    screen = 'play';
    window.scrollTo(0, 0);
    sfx('start');
    nextQuestion();
    if (session.mode === 'lightning') startLightningClock();
  }

  function startLightningClock() {
    let last = performance.now();
    let lastWhole = Math.ceil(session.timeLeft);
    every(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const s = session;
      if (!s || s.over || s.paused || activeModal) return;
      s.timeLeft = Math.max(0, s.timeLeft - dt);
      const whole = Math.ceil(s.timeLeft);
      if (whole !== lastWhole && whole <= 5 && whole > 0) sfx('tick');
      lastWhole = whole;
      updateTimer();
      if (s.timeLeft <= 0) finishSession();
    }, 100);
  }

  function updateTimer() {
    const s = session;
    const bar = app.querySelector('.timebar');
    if (!bar) return;
    bar.firstElementChild.style.width = `${((s.timeLeft / CONFIG.lightning.seconds) * 100).toFixed(1)}%`;
    bar.classList.toggle('low', s.timeLeft <= 10);
    const label = document.getElementById('time-label');
    if (label) label.textContent = fmtClock(s.timeLeft);
  }

  function nextQuestion() {
    const s = session;
    if (!s || s.over) return;
    let q;
    if (s.mode === 'lightning') q = pickNext(() => true);
    else if (s.mode === 'survival') {
      const stage = survivalStage(s.correct);
      q = pickNext(x => stage.difficulties.includes(x.difficulty));
    } else {
      s.index++;
      q = s.queue[s.index];
    }
    if (!q) return finishSession();
    s.used.add(q.id);
    s.current = { q, order: shuffle(q.choices.map((_, i) => i)), picked: null, correct: null };
    s.paused = false;
    renderPlay();
  }

  function isLastQuestion() {
    const s = session;
    if (s.mode === 'survival') return s.lives <= 0;
    if (s.mode === 'quick' || s.mode === 'review') return s.index >= s.queue.length - 1;
    return false;
  }

  function renderPlay() {
    const s = session, c = s.current, q = c.q;
    const sec = bank.sectionById.get(q.section);
    const keys = q.choices.length;
    app.innerHTML = `
      <div class="play mode-${s.mode}">
        <div class="session-bar">
          <button class="icon-btn" data-action="quit" aria-label="End round" title="End round (Esc)">✕</button>
          <div class="bar-mid" id="bar-mid">${barMid()}</div>
          <div class="bar-stats" id="bar-stats">${barStats()}</div>
        </div>
        <article class="card qcard enter">
          <div class="qmeta">
            <span class="tag">§${esc(sec.id)} ${esc(sec.name)}</span>
            <span class="pill diff-${q.difficulty}">${q.difficulty}</span>
            ${q.topic ? `<span class="topic">${esc(q.topic)}</span>` : ''}
          </div>
          <h1 class="qtext">${esc(q.question)}</h1>
          <div class="choices" role="group" aria-label="Answer choices">
            ${c.order.map((ci, pos) => `
              <button class="choice" data-action="answer" data-pos="${pos}">
                <span class="key">${LETTERS[pos]}</span>
                <span class="ctext ${looksLikeCode(q.choices[ci]) ? 'code' : ''}">${esc(q.choices[ci])}</span>
              </button>`).join('')}
          </div>
          <div id="feedback" aria-live="polite"></div>
        </article>
        <p class="hint">Press <kbd>1</kbd>–<kbd>${keys}</kbd> or <kbd>A</kbd>–<kbd>${LETTERS[keys - 1]}</kbd> to answer${s.mode === 'lightning'
          ? ` · a miss costs ${CONFIG.lightning.penalty} seconds`
          : ' · <kbd>Enter</kbd> for the next question · <kbd>Esc</kbd> to end the round'}</p>
      </div>`;
  }

  function barMid() {
    const s = session;
    if (s.mode === 'lightning') {
      const f = s.timeLeft / CONFIG.lightning.seconds;
      return `<div class="timebar ${s.timeLeft <= 10 ? 'low' : ''}"><span style="width:${(f * 100).toFixed(1)}%"></span></div>
        <div class="bar-label" id="time-label">${fmtClock(s.timeLeft)}</div>`;
    }
    if (s.mode === 'survival') {
      const hearts = Array.from({ length: CONFIG.survivalLives }, (_, i) =>
        `<span class="heart ${i < s.lives ? '' : 'lost'}">${i < s.lives ? '❤️' : '🖤'}</span>`).join('');
      return `<div class="hearts" aria-label="${plural(s.lives, 'life')} left">${hearts}</div>
        <div class="bar-label">${survivalStage(s.correct).label}</div>`;
    }
    const total = s.queue.length;
    return `<div class="progress"><span style="width:${pct(s.answered / total)}%"></span></div>
      <div class="bar-label">${Math.min(s.index + 1, total)} / ${total}</div>`;
  }

  function barStats() {
    const s = session;
    const combo = `<span class="combo ${s.streak >= 3 ? 'hot' : ''}" title="Current streak">🔥 ${s.streak}</span>`;
    if (s.mode === 'lightning') {
      const mult = lightningMult(s.streak);
      return `${combo}<span class="score"><b>${fmtNum(s.score)}</b> pts${mult > 1 ? ` <em>×${mult}</em>` : ''}</span>`;
    }
    if (s.mode === 'survival') return `${combo}<span class="score"><b>${s.correct}</b> survived</span>`;
    return `${combo}<span class="score"><b>+${s.xp}</b> XP</span>`;
  }

  function answer(pos) {
    const s = session, c = s && s.current;
    if (!c || c.picked !== null || s.over || pos >= c.order.length) return;
    const q = c.q;
    const correct = c.order[pos] === q.answerIndex;
    c.picked = pos;
    c.correct = correct;
    s.answered++;
    if (s.mode === 'lightning') s.paused = true;

    const info = record(q, correct);
    let gained = 0, points = 0;
    if (correct) {
      s.correct++;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      store.best.streak = Math.max(store.best.streak, s.streak);
      gained = xpFor(q, s.streak, info.redeemed);
      if (s.mode === 'lightning') {
        points = Math.round(100 * DIFFICULTY_FACTOR[q.difficulty] * lightningMult(s.streak));
        s.score += points;
      }
    } else {
      s.streak = 0;
      s.missed.push({ q, order: c.order, picked: pos });
      if (s.mode === 'survival') s.lives--;
      if (s.mode === 'lightning') s.timeLeft = Math.max(0, s.timeLeft - CONFIG.lightning.penalty);
    }

    sfx(correct ? 'correct' : 'wrong');
    addXP(gained);
    if (info.redeemed) unlock('redemption');
    if (s.streak >= 5) unlock('streak5');
    if (s.streak >= 10) unlock('streak10');
    if (s.streak >= 25) unlock('streak25');
    checkProgress();
    save();

    showFeedback(pos, correct, gained, points, info);

    if (s.mode === 'lightning') {
      updateTimer();
      later(() => {
        if (s.timeLeft <= 0) finishSession();
        else nextQuestion();
      }, correct ? 650 : 1500);
    }
  }

  function streakCallout(streak) {
    if (streak === 3) return '3 in a row!';
    if (streak === 5) return '5 in a row! You\'re on fire';
    if (streak >= 10 && streak % 5 === 0) return `${streak} in a row! Unstoppable`;
    return null;
  }

  function showFeedback(pos, correct, gained, points, info) {
    const s = session, c = s.current, q = c.q;
    const correctPos = c.order.indexOf(q.answerIndex);
    const buttons = [...app.querySelectorAll('.choice')];
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (i === correctPos) b.classList.add('is-correct');
      else if (i === pos) b.classList.add('is-wrong');
      else b.classList.add('is-dim');
    });

    if (s.mode !== 'lightning') document.getElementById('bar-mid').innerHTML = barMid();
    const stats = document.getElementById('bar-stats');
    stats.innerHTML = barStats();
    if (correct && s.streak >= 2) stats.querySelector('.combo').classList.add('pop');

    if (correct) floatText(buttons[pos], s.mode === 'lightning' ? `+${points}` : `+${gained} XP`, 'good');
    else if (s.mode === 'lightning') floatText(buttons[pos], `−${CONFIG.lightning.penalty}s`, 'bad');

    if (s.mode === 'lightning') return;

    let headline;
    if (correct) headline = streakCallout(s.streak) || randomOf(PRAISE);
    else if (s.mode === 'survival') headline = s.lives > 0 ? `Ouch! ${plural(s.lives, 'life')} left` : 'Out of lives!';
    else headline = 'Not quite';
    const src = safeUrl(q.source);
    const fb = document.getElementById('feedback');
    fb.innerHTML = `
      <div class="fb ${correct ? 'good' : 'bad'}">
        <div class="fb-head">
          <span class="fb-icon">${correct ? '✓' : '✗'}</span>
          <span>${esc(headline)}</span>
          ${info.redeemed ? '<span class="badge">Redeemed</span>' : ''}
        </div>
        ${correct ? '' : `<p class="fb-answer">The answer is <b>${LETTERS[correctPos]}</b>: ${esc(q.choices[q.answerIndex])}</p>`}
        <p class="fb-expl">${esc(q.explanation)}</p>
        <div class="fb-foot">
          ${src ? `<a href="${esc(src)}" target="_blank" rel="noopener">📖 Read the docs</a>` : '<span></span>'}
          <button class="btn primary" data-action="next" id="next-btn">${isLastQuestion() ? 'See results' : 'Next question'} →</button>
        </div>
      </div>`;
    document.getElementById('next-btn').focus({ preventScroll: true });
    fb.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }

  function next() {
    const s = session;
    if (!s || s.over || !s.current || s.current.picked === null || s.mode === 'lightning') return;
    if (isLastQuestion()) finishSession();
    else nextQuestion();
  }

  async function quit() {
    const s = session;
    if (!s || s.over) return go('home');
    if (s.mode === 'mock') {
      const ok = await confirmModal('Leave the mock exam?', 'Your answers will be discarded and the exam will not be scored.', 'Leave exam', 'Keep going');
      if (ok && session === s && !s.over) { session = null; go('home'); }
      return;
    }
    if (!s.answered) { session = null; return go('home'); }
    const ok = await confirmModal('End this round?', 'Your answers so far are saved. You\'ll see a summary of the round.', 'End round', 'Keep playing');
    if (ok && session === s) {
      s.endedEarly = true;
      finishSession();
    }
  }

  function finishSession() {
    const s = session;
    if (!s || s.over) return;
    s.over = true;
    clearTimers();
    if (s.mode === 'lightning') {
      s.isBest = s.score > 0 && s.score > store.best.lightning;
      store.best.lightning = Math.max(store.best.lightning, s.score);
      if (s.correct >= 10) unlock('lightning10');
    }
    if (s.mode === 'survival') {
      s.isBest = s.correct > 0 && s.correct > store.best.survival;
      store.best.survival = Math.max(store.best.survival, s.correct);
      if (s.correct >= 15) unlock('survival15');
    }
    if (s.mode === 'quick' && s.answered >= 10 && s.answered === s.queue.length && s.correct === s.answered) unlock('perfect');
    save();
    go('results');
  }

  // ─── Results ────────────────────────────────────────────────────────────────

  function renderResults() {
    const s = session;
    const acc = s.answered ? s.correct / s.answered : 0;
    const titles = {
      quick: 'Round complete',
      review: 'Review complete',
      lightning: s.endedEarly ? 'Round ended' : "Time's up!",
      survival: s.lives <= 0 ? 'Out of lives' : 'Run ended',
    };
    const stats = s.mode === 'lightning'
      ? [[fmtNum(s.score), 'points'], [s.correct, 'correct'], [`${pct(acc)}%`, 'accuracy'], [s.bestStreak, 'best streak']]
      : s.mode === 'survival'
        ? [[s.correct, 'survived'], [store.best.survival, 'personal best'], [`${pct(acc)}%`, 'accuracy'], [`+${s.xp}`, 'XP']]
        : [[`${s.correct}/${s.answered}`, 'correct'], [`${pct(acc)}%`, 'accuracy'], [`+${s.xp}`, 'XP'], [s.bestStreak, 'best streak']];
    let emoji = '📚', msg = 'Every miss is a lesson. Read the explanations below, then go again.';
    if (acc >= 0.9) { emoji = '🏆'; msg = 'Outstanding. You really know this material.'; }
    else if (acc >= CONFIG.passTarget) { emoji = '🎉'; msg = "Solid work. You're scoring at passing pace."; }
    else if (acc >= 0.5) { emoji = '💪'; msg = 'Getting there. Review the misses below and go again.'; }
    if (!s.answered) { emoji = '👋'; msg = 'No questions answered this time.'; }
    const lvl = levelFor(store.xp);

    app.innerHTML = `
      <div class="results">
        <div class="card result-hero">
          <div class="result-emoji" aria-hidden="true">${emoji}</div>
          <h1>${titles[s.mode]}</h1>
          ${s.isBest ? '<div class="badge best">🎉 New personal best!</div>' : ''}
          <p class="muted">${msg}</p>
          <div class="stat-row">${stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
          <div class="lvl-line">
            <span>Lv ${lvl.num} · ${esc(lvl.title)}${lvl.next ? ` · ${fmtNum(lvl.next.xp - store.xp)} XP to next rank` : ''}</span>
            <div class="xpbar"><span style="width:${pct(lvl.progress)}%"></span></div>
          </div>
          ${s.newAchievements.length ? `
            <div class="new-ach"><span class="eyebrow">Unlocked</span>
              ${s.newAchievements.map(a => `<span class="ach-pill">${a.icon} ${esc(a.name)}</span>`).join('')}
            </div>` : ''}
          <div class="btn-row">
            <button class="btn primary" data-action="again">Play again</button>
            ${s.missed.length ? `<button class="btn" data-action="retry-missed">Retry ${s.missed.length === 1 ? 'the miss' : `the ${s.missed.length} misses`}</button>` : ''}
            <button class="btn ghost" data-action="home">Home</button>
          </div>
        </div>
        ${s.missed.length
          ? `<h2 class="h-section">Review your misses</h2>
             <div class="review-list">${s.missed.map(m => reviewItem(m, true)).join('')}</div>`
          : s.answered ? '<p class="center muted">No misses this round. 🎯</p>' : ''}
      </div>`;
    if ((acc >= 0.9 && s.answered >= 5) || s.isBest) confetti();
  }

  function reviewItem({ q, order, picked }, open) {
    const correctPos = order.indexOf(q.answerIndex);
    const status = picked == null ? 'skip' : picked === correctPos ? 'good' : 'bad';
    const src = safeUrl(q.source);
    return `
      <details class="review-item ${status}" ${open ? 'open' : ''}>
        <summary><span class="ri-icon">${{ good: '✓', bad: '✗', skip: '–' }[status]}</span><span>${esc(q.question)}</span></summary>
        <div class="ri-body">
          <ol class="ri-choices">
            ${order.map((ci, pos) => {
              const isRight = pos === correctPos, isPicked = pos === picked;
              const cls = isRight ? 'right' : isPicked ? 'picked' : '';
              const note = isRight ? (isPicked ? 'Your answer' : 'Correct') : isPicked ? 'Your answer' : '';
              return `<li class="${cls}"><span class="key">${LETTERS[pos]}</span><span class="${looksLikeCode(q.choices[ci]) ? 'code' : ''}">${esc(q.choices[ci])}</span>${note ? `<em>${note}</em>` : ''}</li>`;
            }).join('')}
          </ol>
          ${picked == null ? '<p class="muted small">You left this one unanswered.</p>' : ''}
          <p class="ri-expl">${esc(q.explanation)}</p>
          <div class="ri-foot">
            <span class="muted">${esc(q.id)}${q.topic ? ` · ${esc(q.topic)}` : ''}</span>
            ${src ? `<a href="${esc(src)}" target="_blank" rel="noopener">📖 Docs</a>` : ''}
          </div>
        </div>
      </details>`;
  }

  // ─── Mock exam ──────────────────────────────────────────────────────────────

  function startMock() {
    const n = Math.min(CONFIG.mock.questions, bank.questions.length);
    const quota = allocate(n, bank.sections);
    let picks = [];
    for (const s of bank.sections) picks.push(...shuffle(bank.bySection.get(s.id)).slice(0, quota[s.id]));
    if (picks.length < n) {
      const taken = new Set(picks.map(q => q.id));
      picks.push(...shuffle(bank.questions.filter(q => !taken.has(q.id))).slice(0, n - picks.length));
    }
    picks = shuffle(picks);
    const now = Date.now();
    session = {
      mode: 'mock',
      items: picks.map(q => ({ q, order: shuffle(q.choices.map((_, i) => i)), picked: null, flagged: false })),
      index: 0,
      startedAt: now,
      deadline: now + CONFIG.mock.minutes * 60000,
      over: false,
      xp: 0,
      newAchievements: [],
    };
    sfx('start');
    go('mock');
  }

  function startMockClock() {
    const tick = () => {
      const s = session;
      if (!s || s.over) return;
      const left = (s.deadline - Date.now()) / 1000;
      const el = document.getElementById('mock-timer');
      if (el) {
        el.textContent = `⏱ ${fmtClock(left)}`;
        el.classList.toggle('low', left <= 300);
      }
      if (left <= 0) submitMock(true);
    };
    tick();
    every(tick, 1000);
  }

  function renderMock() {
    const s = session, it = s.items[s.index], q = it.q;
    const total = s.items.length;
    const answered = s.items.filter(x => x.picked !== null).length;
    const last = s.index === total - 1;
    const left = (s.deadline - Date.now()) / 1000;
    app.innerHTML = `
      <div class="play mock">
        <div class="session-bar">
          <button class="icon-btn" data-action="quit" aria-label="Leave exam" title="Leave exam (Esc)">✕</button>
          <div class="bar-mid">
            <div class="progress"><span style="width:${pct(answered / total)}%"></span></div>
            <div class="bar-label">${answered} / ${total} answered</div>
          </div>
          <div class="bar-stats">
            <span class="timer ${left <= 300 ? 'low' : ''}" id="mock-timer">⏱ ${fmtClock(left)}</span>
            <button class="btn small primary" data-action="mock-submit">Submit</button>
          </div>
        </div>
        <div class="mock-layout">
          <article class="card qcard">
            <div class="qmeta"><span class="tag">Question ${s.index + 1} of ${total}</span>${it.flagged ? '<span class="pill diff-medium">⚑ Flagged</span>' : ''}</div>
            <h1 class="qtext">${esc(q.question)}</h1>
            <div class="choices" role="radiogroup" aria-label="Answer choices">
              ${it.order.map((ci, pos) => `
                <button class="choice ${it.picked === pos ? 'selected' : ''}" role="radio" aria-checked="${it.picked === pos}" data-action="mock-pick" data-pos="${pos}">
                  <span class="key">${LETTERS[pos]}</span>
                  <span class="ctext ${looksLikeCode(q.choices[ci]) ? 'code' : ''}">${esc(q.choices[ci])}</span>
                </button>`).join('')}
            </div>
            <div class="mock-actions">
              <button class="btn ghost" data-action="mock-prev" ${s.index === 0 ? 'disabled' : ''}>← Previous</button>
              <button class="btn ghost flag ${it.flagged ? 'on' : ''}" data-action="mock-flag" aria-pressed="${it.flagged}">⚑ ${it.flagged ? 'Flagged' : 'Flag for review'}</button>
              <button class="btn ${last ? 'primary' : ''}" data-action="${last ? 'mock-submit' : 'mock-next'}">${last ? 'Review & submit' : 'Next →'}</button>
            </div>
          </article>
          <aside class="card navigator" aria-label="Question navigator">
            <div class="nav-head"><span>Questions</span><span class="muted">${s.items.filter(x => x.flagged).length} flagged</span></div>
            <div class="nav-grid">
              ${s.items.map((x, i) => `<button class="nav-cell ${x.picked !== null ? 'done' : ''} ${x.flagged ? 'flagged' : ''} ${i === s.index ? 'current' : ''}" data-action="mock-goto" data-i="${i}" aria-label="Question ${i + 1}${x.picked !== null ? ', answered' : ''}${x.flagged ? ', flagged' : ''}">${i + 1}</button>`).join('')}
            </div>
            <div class="legend"><span class="l-done">Answered</span><span class="l-todo">Unanswered</span><span class="l-flag">Flagged</span></div>
          </aside>
        </div>
        <p class="hint"><kbd>1</kbd>–<kbd>4</kbd> or <kbd>A</kbd>–<kbd>D</kbd> to choose · <kbd>←</kbd> <kbd>→</kbd> to move · <kbd>F</kbd> to flag</p>
      </div>`;
  }

  function mockGoto(i) {
    const s = session;
    if (!s || s.mode !== 'mock' || s.over || i < 0 || i >= s.items.length) return;
    s.index = i;
    renderMock();
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function mockPick(pos) {
    const s = session;
    const it = s.items[s.index];
    if (pos >= it.order.length) return;
    it.picked = pos;
    renderMock();
  }

  function mockFlag() {
    const it = session.items[session.index];
    it.flagged = !it.flagged;
    renderMock();
  }

  async function requestSubmitMock() {
    const s = session;
    if (!s || s.over) return;
    const unanswered = s.items.filter(it => it.picked === null).length;
    const flagged = s.items.filter(it => it.flagged).length;
    const parts = [];
    if (unanswered) parts.push(`${plural(unanswered, 'unanswered question')} (they count as wrong)`);
    if (flagged) parts.push(`${flagged} flagged for review`);
    const body = parts.length ? `You have ${parts.join(' and ')}.` : 'Every question is answered. Ready to see your score?';
    if (await confirmModal('Submit your exam?', body, 'Submit exam', 'Keep working')) submitMock(false);
  }

  function submitMock(timeUp) {
    const s = session;
    if (!s || s.over) return;
    s.over = true;
    clearTimers();
    dismissModal();
    const bySection = {};
    let correct = 0, xp = 0, redeemed = false;
    for (const it of s.items) {
      it.correct = it.picked === it.order.indexOf(it.q.answerIndex);
      const b = (bySection[it.q.section] = bySection[it.q.section] || { right: 0, total: 0 });
      b.total++;
      if (it.correct) {
        b.right++;
        correct++;
        xp += CONFIG.xp[it.q.difficulty] || CONFIG.xp.medium;
      }
      // Unanswered questions are scored as wrong but don't count against mastery.
      if (it.picked !== null && record(it.q, it.correct).redeemed) redeemed = true;
    }
    const total = s.items.length;
    const p = correct / total;
    const passed = p >= CONFIG.passTarget;
    s.result = {
      correct, total, pct: p, passed, timeUp, bySection,
      usedMs: Math.min(Date.now(), s.deadline) - s.startedAt,
      unanswered: s.items.filter(it => it.picked === null).length,
    };
    s.isBest = store.mocks.length > 0 && p > store.best.mock;
    store.mocks.push({ at: Date.now(), correct, total });
    if (store.mocks.length > 50) store.mocks.splice(0, store.mocks.length - 50);
    store.best.mock = Math.max(store.best.mock, p);
    addXP(xp + (passed ? CONFIG.xp.mockPass : 0));
    if (redeemed) unlock('redemption');
    if (passed) unlock('mockPass');
    if (p >= 0.9) unlock('mockAce');
    checkProgress();
    save();
    s.filter = 'wrong';
    go('mockResults');
    sfx(passed ? 'level' : 'wrong');
    if (passed) confetti();
  }

  function renderMockResults() {
    const s = session, r = s.result;
    const filter = s.filter;
    const counts = {
      wrong: s.items.filter(it => !it.correct).length,
      flagged: s.items.filter(it => it.flagged).length,
      all: s.items.length,
    };
    const shown = s.items.filter(it => filter === 'all' || (filter === 'flagged' ? it.flagged : !it.correct));
    const secs = bank.sections.filter(sec => r.bySection[sec.id]).map(sec => {
      const b = r.bySection[sec.id];
      return { ...sec, ...b, p: b.right / b.total };
    });
    const weakest = secs.slice().sort((a, b) => a.p - b.p)[0];
    const usedMin = Math.floor(r.usedMs / 60000), usedSec = Math.floor((r.usedMs % 60000) / 1000);

    app.innerHTML = `
      <div class="results">
        <div class="card result-hero">
          <div class="mock-score">
            ${ring(r.pct, 'score', r.passed ? 'pass' : 'fail')}
            <div>
              <span class="verdict ${r.passed ? 'pass' : 'fail'}">${r.passed ? 'Pass' : 'Not yet'}</span>
              ${s.isBest ? ' <span class="badge">New best</span>' : ''}
              <h1>${r.correct} of ${r.total} correct</h1>
              <p class="muted">Target ${pct(CONFIG.passTarget)}% · time used ${usedMin}m ${String(usedSec).padStart(2, '0')}s${r.unanswered ? ` · ${r.unanswered} unanswered` : ''}</p>
              ${r.timeUp ? '<p class="muted small">Time ran out, so the exam was submitted automatically.</p>' : ''}
              <p class="muted small">+${fmtNum(s.xp)} XP${r.passed ? ` (includes a ${CONFIG.xp.mockPass} XP pass bonus)` : ''}</p>
            </div>
          </div>
          ${s.newAchievements.length ? `
            <div class="new-ach"><span class="eyebrow">Unlocked</span>
              ${s.newAchievements.map(a => `<span class="ach-pill">${a.icon} ${esc(a.name)}</span>`).join('')}
            </div>` : ''}
          <div class="btn-row">
            <button class="btn primary" data-action="mode" data-mode="mock">New mock exam</button>
            <button class="btn ghost" data-action="home">Home</button>
          </div>
        </div>

        <h2 class="h-section">By section</h2>
        <div class="card mr-rows">
          ${secs.map(sec => `
            <div class="mr-row">
              <span class="sec-num">${esc(sec.id)}</span>
              <span>${esc(sec.name)}</span>
              <span class="bar ${sec.p >= CONFIG.passTarget ? 'ok' : 'low'}"><span style="width:${pct(sec.p)}%"></span></span>
              <b>${sec.right}/${sec.total}</b>
            </div>`).join('')}
        </div>
        ${weakest && weakest.p < 1 ? `
          <div class="card focus-tip">
            <span>Weakest area: <b>§${esc(weakest.id)} ${esc(weakest.name)}</b> (${pct(weakest.p)}%)</span>
            <button class="btn small" data-action="practice-section" data-section="${esc(weakest.id)}">Practice it →</button>
          </div>` : ''}

        <div class="filters">
          <h2 class="h-section">Review answers</h2>
          ${seg('mock-filter', filter, [['wrong', `Missed (${counts.wrong})`], ['flagged', `Flagged (${counts.flagged})`], ['all', `All (${counts.all})`]])}
        </div>
        <div class="review-list">
          ${shown.length ? shown.map(it => reviewItem(it, false)).join('') : '<p class="center muted">Nothing to show here.</p>'}
        </div>
      </div>`;
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  const ACTIONS = {
    'home': () => { session = null; go('home'); },
    'toggle-sound': () => {
      store.settings.sound = !store.settings.sound;
      save();
      if (store.settings.sound) sfx('correct');
      renderHome();
    },
    'mode': async el => {
      const mode = el.dataset.mode;
      if (mode === 'quick') return openSetup();
      if (mode === 'lightning') return startLightning();
      if (mode === 'survival') return startSurvival();
      if (mode === 'review') return startReview();
      if (mode === 'mock') {
        const ok = await confirmModal('Start a mock exam?',
          `${CONFIG.mock.questions} questions, ${CONFIG.mock.minutes} minutes on the clock. You can flag questions and change answers until you submit. Results come at the end.`,
          'Start exam', 'Not now');
        if (ok) startMock();
      }
    },
    'practice-section': el => startQuick({ sections: [el.dataset.section], difficulty: 'any', length: CONFIG.quickLengths[0], order: 'smart' }, false),
    'reset': async () => {
      const ok = await confirmModal('Reset all progress?', 'This clears your XP, mastery, achievements and history. It cannot be undone.', 'Reset everything', 'Cancel');
      if (!ok) return;
      const sound = store.settings.sound;
      store = defaultStore();
      store.settings.sound = sound;
      save();
      go('home');
    },
    'setup-sec': el => {
      const id = el.dataset.section;
      if (!id) setup.sections = [];
      else if (setup.sections.includes(id)) setup.sections = setup.sections.filter(x => x !== id);
      else setup.sections = [...setup.sections, id];
      if (setup.sections.length === bank.sections.length) setup.sections = [];
      renderSetup();
    },
    'setup-diff': el => { setup.difficulty = el.dataset.v; renderSetup(); },
    'setup-len': el => { setup.length = Number(el.dataset.v); renderSetup(); },
    'setup-order': el => { setup.order = el.dataset.v; renderSetup(); },
    'setup-start': () => startQuick({ ...setup, sections: [...setup.sections] }, true),
    'answer': el => answer(Number(el.dataset.pos)),
    'next': () => next(),
    'quit': () => quit(),
    'again': () => session && session.replay && session.replay(),
    'retry-missed': () => startReview(session.missed.map(m => m.q)),
    'mock-pick': el => mockPick(Number(el.dataset.pos)),
    'mock-prev': () => mockGoto(session.index - 1),
    'mock-next': () => mockGoto(session.index + 1),
    'mock-goto': el => mockGoto(Number(el.dataset.i)),
    'mock-flag': () => mockFlag(),
    'mock-submit': () => requestSubmitMock(),
    'mock-filter': el => { session.filter = el.dataset.v; renderMockResults(); },
  };

  app.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled || !app.contains(el)) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) fn(el, e);
  });

  function keyToPos(key) {
    if (/^[1-8]$/.test(key)) return Number(key) - 1;
    const i = LETTERS.toLowerCase().indexOf(key);
    return key.length === 1 && i >= 0 ? i : null;
  }

  document.addEventListener('keydown', e => {
    if (activeModal || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const s = session;

    if (screen === 'play' && s && !s.over && s.current) {
      if (key === 'escape') { e.preventDefault(); quit(); return; }
      if (s.current.picked === null) {
        const pos = keyToPos(key);
        if (pos !== null && pos < s.current.order.length) { e.preventDefault(); answer(pos); }
      } else if (key === 'enter' || key === ' ' || key === 'arrowright') {
        e.preventDefault();
        next();
      }
      return;
    }

    if (screen === 'mock' && s && !s.over) {
      if (key === 'escape') { e.preventDefault(); quit(); return; }
      if (key === 'arrowleft') { e.preventDefault(); mockGoto(s.index - 1); return; }
      if (key === 'arrowright' || key === 'enter') {
        e.preventDefault();
        if (s.index === s.items.length - 1) requestSubmitMock();
        else mockGoto(s.index + 1);
        return;
      }
      if (key === 'f') { e.preventDefault(); mockFlag(); return; }
      const pos = keyToPos(key);
      if (pos !== null && pos < s.items[s.index].order.length) { e.preventDefault(); mockPick(pos); }
    }
  });

  window.addEventListener('beforeunload', e => {
    if (session && !session.over && (session.mode === 'mock' || screen === 'play')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ─── Boot ───────────────────────────────────────────────────────────────────

  function startWith(data) {
    try {
      bank = prepareBank(data);
    } catch (err) {
      renderLoadError(err);
      return;
    }
    go('home');
  }

  function renderLoadError(err) {
    screen = 'load';
    app.innerHTML = `
      <div class="card load-card">
        <h1>🧱 Lakehouse Quest</h1>
        <p>Couldn't load <code>${esc(CONFIG.bankUrl)}</code>: ${esc(err && err.message ? err.message : err)}.</p>
        <p class="muted">Browsers block pages opened straight from disk from reading other files. Start a small web server in this folder:</p>
        <pre>python3 -m http.server 8000</pre>
        <p class="muted">then open <code>http://localhost:8000</code>. Or load the question file by hand:</p>
        <label class="btn primary file-btn">Choose questions.json<input type="file" accept=".json,application/json" id="bank-file" hidden></label>
      </div>`;
    document.getElementById('bank-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try { startWith(JSON.parse(await file.text())); } catch (er) { renderLoadError(er); }
    });
  }

  async function boot() {
    app.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading questions…</p></div>';
    try {
      const res = await fetch(CONFIG.bankUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startWith(await res.json());
    } catch (err) {
      renderLoadError(err);
    }
  }

  boot();
})();
