// Shared helpers: login session, local storage, small utilities.

const Store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn("save failed", e); }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  },
};

// local backup of in-progress tests (cloud copy is in Firestore)
const Keys = {
  progress: (uid, paperId) => `bpsc_progress_${uid}_${paperId}`,
};

async function loadJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return r.json();
}

function qs(name) { return new URLSearchParams(location.search).get(name); }

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Question text: escapes HTML, then __text__ becomes underlined text
function fmtQ(text) {
  return esc(text).replace(/__(.+?)__/g, "<u>$1</u>");
}

// ---- Hindi / English switch ----
// A question can carry question_hi, options_hi, explanation_hi and passage_hi.
// Options keep the same order in both languages, so saved answers (a-e) never change.
const LANG_KEY = "bpsc_lang";
function getLang() { try { return localStorage.getItem(LANG_KEY) === "hi" ? "hi" : "en"; } catch (e) { return "en"; } }
function setLang(l) { try { localStorage.setItem(LANG_KEY, l === "hi" ? "hi" : "en"); } catch (e) {} }
function hasHindi(paper) { return !!(paper && (paper.questions || []).some((q) => q.question_hi)); }
function tr(q, lang) {
  if (lang !== "hi" || !q.question_hi) return q;
  const oh = Array.isArray(q.options_hi) && q.options_hi.length === q.options.length ? q.options_hi : q.options;
  return { ...q, question: q.question_hi, options: oh,
    explanation: q.explanation_hi || q.explanation, passage: q.passage_hi || q.passage };
}
function langSwitchHTML(lang) {
  return `<span class="lang-switch" role="group" aria-label="Language">` +
    `<button type="button" data-lang="en" class="${lang === "en" ? "on" : ""}">English</button>` +
    `<button type="button" data-lang="hi" class="${lang === "hi" ? "on" : ""}">हिंदी</button></span>`;
}

function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function fmtDuration(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function initials(name) {
  return (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function fmtNum(n) { return Number.isInteger(n) ? String(n) : n.toFixed(2); }

// Subscription length; config.js can override with PAYMENT.validityDays
function planDays() { return (typeof PAYMENT !== "undefined" && PAYMENT.validityDays) || 365; }
function planLabel() {
  const d = planDays();
  return d % 365 === 0 ? (d === 365 ? "1 year" : `${d / 365} years`) : d % 30 === 0 ? `${d / 30} months` : `${d} days`;
}
function fmtDay(ts) { return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
function daysLeft(ts) { return Math.ceil((ts - Date.now()) / 86400000); }

// Exam cards styled like question booklets. `href(exam)` gives each card's link.
function examStats(papers, examId) {
  const list = papers.filter((p) => (p.exam || "cce") === examId);
  return {
    pyq: list.filter((p) => p.category !== "mock").length,
    mock: list.filter((p) => p.category === "mock").length,
    free: list.filter((p) => p.free).length,
    total: list.length,
  };
}

function examGridHTML(exams, papers, href) {
  const withPapers = exams.filter((e) => examStats(papers, e.id).total);
  const soon = exams.filter((e) => !examStats(papers, e.id).total);
  const card = (e) => {
    const st = examStats(papers, e.id);
    const counts = [st.pyq && `${st.pyq} previous year paper${st.pyq > 1 ? "s" : ""}`, st.mock && `${st.mock} mock test${st.mock > 1 ? "s" : ""}`].filter(Boolean);
    return st.total ? `
      <a class="booklet" href="${href(e)}" style="--c:${esc(e.color || "#1F2F86")}">
        <span class="booklet-spine" aria-hidden="true"></span>
        <span class="booklet-body">
          <span class="booklet-code">${esc(e.short)}</span>
          <span class="booklet-name">${esc(e.name)}</span>
          ${e.about ? `<span class="booklet-about">${esc(e.about)}</span>` : ""}
          <span class="booklet-counts">${counts.map(esc).join("<br>")}</span>
          ${st.free ? `<span class="booklet-free">${st.free} free to try</span>` : ""}
        </span>
      </a>` : `
      <div class="booklet soon" style="--c:${esc(e.color || "#1F2F86")}">
        <span class="booklet-spine" aria-hidden="true"></span>
        <span class="booklet-body">
          <span class="booklet-code">${esc(e.short)}</span>
          <span class="booklet-name">${esc(e.name)}</span>
          <span class="booklet-counts">Papers coming soon</span>
        </span>
      </div>`;
  };
  return withPapers.map(card).join("") + soon.map(card).join("");
}

// Previous year papers: newest first. Mock tests: Mock Test 1, 2, ... 10 in order.
function sortPapers(list) {
  return [...list].sort((a, b) =>
    (a.category === "mock" && b.category === "mock")
      ? String(a.title).localeCompare(String(b.title), undefined, { numeric: true })
      : (b.year || 0) - (a.year || 0) || String(a.title).localeCompare(String(b.title), undefined, { numeric: true }));
}

function renderTopbar(user, onLogout) {
  const el = document.getElementById("topbar");
  if (!el) return;
  el.innerHTML = `
    <a class="brand" href="papers.html"><span class="brand-badge">${esc(SITE.short)}</span><span class="full">${esc(SITE.name)}</span></a>
    <div class="user">
      <a class="btn btn-ghost" href="leaderboard.html">Toppers</a>
      ${user.isAdmin ? `<a class="btn btn-ghost" href="admin.html">Admin</a>` : ""}
      <span>${esc(user.name)}</span>
      <button class="btn btn-ghost" id="logoutBtn">Log out</button>
    </div>`;
  document.getElementById("logoutBtn").onclick = onLogout;
}

function showFatal(el, msg) {
  el.innerHTML = `<div class="empty">${esc(msg)}</div>`;
}

// Score an attempt. Bonus (dropped) questions give full marks to everyone.
function scoreAttempt(paper, answers) {
  const marks = paper.marks ?? 1, neg = paper.negative ?? 0;
  let correct = 0, wrong = 0, skipped = 0, bonus = 0;
  for (const q of paper.questions) {
    const a = answers[q.id];
    if (q.bonus) { bonus++; continue; }
    if (!a) skipped++;
    else if (a === q.answer) correct++;
    else wrong++;
  }
  const score = (correct + bonus) * marks - wrong * neg;
  const max = paper.questions.length * marks;
  const attempted = correct + wrong;
  return {
    correct, wrong, skipped, bonus, score, max,
    accuracy: attempted ? (correct / attempted) * 100 : 0,
  };
}
