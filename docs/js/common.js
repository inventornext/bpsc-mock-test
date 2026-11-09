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
