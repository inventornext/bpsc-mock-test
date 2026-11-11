// Exam screen: instructions, timer, autosave, palette, submit.
// Answers save to this browser instantly and to Firebase every few seconds,
// so a test can be resumed on another device.

import {
  requireUser, logout, loadProgress, saveProgress, clearProgress, saveAttempt, getPaper, friendlyError,
  addLeaderboardEntry,
} from "./fb.js";

const user = await requireUser();
const paperId = qs("paper");
const LETTERS = ["a", "b", "c", "d", "e"];

let paper = null;
let state = null;      // saved progress for this user + paper
let timerId = null;
let submitting = false;
const $ = (id) => document.getElementById(id);

const localKey = () => Keys.progress(user.uid, paperId);

/* ---------- saving ---------- */
const CLOUD_EVERY_MS = 15000;
let dirty = false, flushTimer = null, flushing = null;

function save() {
  state.updatedAt = Date.now();
  Store.set(localKey(), state);          // instant local backup
  dirty = true;
  setSaveLabel("Saving...");
  if (!flushTimer) flushTimer = setTimeout(flush, CLOUD_EVERY_MS);
}

async function flush() {
  clearTimeout(flushTimer); flushTimer = null;
  if (!dirty || !state || state.submitted) return;
  if (flushing) return flushing;
  dirty = false;
  flushing = saveProgress(user.uid, paperId, state)
    .then(() => setSaveLabel(dirty ? "Saving..." : "Saved"))
    .catch((e) => { dirty = true; setSaveLabel("Offline, saved here"); console.warn(e); })
    .finally(() => { flushing = null; });
  return flushing;
}

function setSaveLabel(t) { const el = $("saveState"); if (el) el.textContent = t; }

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
window.addEventListener("online", () => { dirty = true; flush(); });

(async function init() {
  renderTopbar(user, logout);
  if (!paperId) { location.replace("papers.html"); return; }

  try {
    paper = await getPaper(paperId);
  } catch (e) {
    $("instrTitle").textContent = "Could not load this paper: " + friendlyError(e);
    return;
  }
  if (!paper) {
    // locked (not paid) or doesn't exist
    location.replace(user.hasAccess ? "papers.html" : "buy.html");
    return;
  }
  document.title = `${paper.title} | ${SITE.name}`;

  // newest of: cloud copy, this browser's copy
  let cloud = null;
  try { cloud = await loadProgress(user.uid, paperId); } catch (e) { console.warn("cloud load failed", e); }
  const local = Store.get(localKey());
  state = [cloud, local].filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
  const resumable = state && !state.submitted && state.endsAt > Date.now();

  // time ran out while the tab was closed: submit what was saved
  if (state && !state.submitted && state.endsAt <= Date.now() && state.startedAt) {
    submit(true);
    return;
  }

  showInstructions(resumable);
})();

function showInstructions(resumable) {
  const n = paper.questions.length;
  $("instrTitle").textContent = paper.title;
  $("instrFacts").innerHTML = `
    <div class="fact"><b>${n}</b><span>Questions</span></div>
    <div class="fact"><b>${paper.duration} min</b><span>Duration</span></div>
    <div class="fact"><b>+${fmtNum(paper.marks ?? 1)}</b><span>Per correct answer</span></div>
    <div class="fact"><b>${paper.negative ? "-" + fmtNum(paper.negative) : "0"}</b><span>Per wrong answer</span></div>`;

  const agree = $("agree"), start = $("startBtn");
  if (resumable) {
    start.textContent = `Resume (${fmtClock((state.endsAt - Date.now()) / 1000)} left)`;
  }
  agree.onchange = () => (start.disabled = !agree.checked);
  start.onclick = () => {
    if (!resumable) {
      state = {
        paperId,
        answers: {},
        marked: {},
        visited: {},
        current: 0,
        startedAt: Date.now(),
        endsAt: Date.now() + paper.duration * 60 * 1000,
        submitted: false,
      };
      save();
      flush();
    }
    startExam();
  };
}

function startExam() {
  $("instrScreen").classList.add("hidden");
  $("examScreen").classList.remove("hidden");

  $("examBadge").textContent = SITE.short;
  $("examTitle").textContent = paper.title;
  $("avatar").textContent = initials(user.name);
  $("uname").textContent = user.name;
  $("usub").textContent = `${paper.questions.length} questions, ${paper.duration} min`;

  buildPalette();
  bindControls();
  go(state.current || 0);
  tick();
  timerId = setInterval(tick, 1000);
}

/* ---------- timer ---------- */
function tick() {
  const left = (state.endsAt - Date.now()) / 1000;
  $("timeLeft").textContent = fmtClock(left);
  $("timer").classList.toggle("warn", left <= 300);
  if (left <= 0 && !submitting) {
    clearInterval(timerId);
    submit(true);
  }
}

/* ---------- rendering ---------- */
function statusOf(q) {
  const ans = !!state.answers[q.id], mk = !!state.marked[q.id];
  if (ans && mk) return "answered-marked";
  if (mk) return "marked";
  if (ans) return "answered";
  if (state.visited[q.id]) return "not-answered";
  return "";
}

function buildPalette() {
  $("palette").innerHTML = paper.questions
    .map((q, i) => `<button class="st" data-i="${i}" title="Question ${i + 1}">${i + 1}</button>`)
    .join("");
  $("palette").onclick = (e) => {
    const b = e.target.closest("button[data-i]");
    if (b) { go(+b.dataset.i); $("side").classList.remove("open"); }
  };
}

function refreshPalette() {
  const counts = { "": 0, "not-answered": 0, answered: 0, marked: 0, "answered-marked": 0 };
  [...$("palette").children].forEach((btn, i) => {
    const q = paper.questions[i];
    const st = statusOf(q);
    counts[st]++;
    btn.className = `st ${st}${i === state.current ? " current" : ""}`;
  });
  $("legend").innerHTML = `
    <div><span class="st answered">${counts.answered}</span> Answered</div>
    <div><span class="st not-answered">${counts["not-answered"]}</span> Not answered</div>
    <div><span class="st">${counts[""]}</span> Not visited</div>
    <div><span class="st marked">${counts.marked}</span> Marked</div>
    <div class="wide"><span class="st answered-marked">${counts["answered-marked"]}</span> Answered and marked</div>`;
  return counts;
}

function go(i) {
  i = Math.max(0, Math.min(paper.questions.length - 1, i));
  state.current = i;
  const q = paper.questions[i];
  state.visited[q.id] = true;
  save();

  $("qNo").textContent = `Question ${i + 1} of ${paper.questions.length}`;
  $("qMarks").innerHTML = `Marks: <b class="pos">+${fmtNum(paper.marks ?? 1)}</b>${paper.negative ? ` &nbsp; <b class="neg">-${fmtNum(paper.negative)}</b>` : ""}`;
  $("qText").innerHTML = fmtQ(q.question);
  const pb = $("qPassage");
  if (q.passage) {
    if (pb.dataset.text !== q.passage) { pb.dataset.text = q.passage; $("qPassageText").innerHTML = fmtQ(q.passage); pb.scrollTop = 0; }
    pb.classList.remove("hidden");
  } else {
    pb.classList.add("hidden");
  }

  const chosen = state.answers[q.id];
  $("qOptions").innerHTML = q.options
    .map((opt, k) => {
      const L = LETTERS[k];
      return `
        <label class="option${chosen === L ? " selected" : ""}" data-l="${L}">
          <input type="radio" name="opt" value="${L}" ${chosen === L ? "checked" : ""}>
          <span class="letter">${L.toUpperCase()}</span>
          <span class="otext">${fmtQ(opt)}</span>
        </label>`;
    })
    .join("");

  $("prevBtn").disabled = i === 0;
  $("nextBtn").innerHTML = i === paper.questions.length - 1 ? "Save" : "Save &amp; Next &rarr;";
  $("qScroll").scrollTop = 0;
  refreshPalette();
}

function choose(letter) {
  const q = paper.questions[state.current];
  if (!q.options[LETTERS.indexOf(letter)]) return;
  state.answers[q.id] = letter;
  save();
  document.querySelectorAll(".option").forEach((el) => el.classList.toggle("selected", el.dataset.l === letter));
  refreshPalette();
}

/* ---------- controls ---------- */
function bindControls() {
  $("qOptions").onclick = (e) => {
    const el = e.target.closest(".option");
    if (el) { e.preventDefault(); choose(el.dataset.l); }
  };
  $("nextBtn").onclick = () => go(state.current + 1);
  $("prevBtn").onclick = () => go(state.current - 1);
  $("markBtn").onclick = () => {
    const q = paper.questions[state.current];
    state.marked[q.id] = !state.marked[q.id];
    save();
    if (state.current < paper.questions.length - 1) go(state.current + 1);
    else refreshPalette();
  };
  $("clearBtn").onclick = () => {
    const q = paper.questions[state.current];
    delete state.answers[q.id];
    save();
    go(state.current);
  };
  $("paletteToggle").onclick = () => $("side").classList.toggle("open");
  $("submitBtn").onclick = openSubmitModal;
  $("cancelSubmit").onclick = () => $("submitModal").classList.add("hidden");
  $("confirmSubmit").onclick = () => submit(false);

  document.addEventListener("keydown", (e) => {
    if (!$("submitModal").classList.contains("hidden")) {
      if (e.key === "Escape") $("submitModal").classList.add("hidden");
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const map = { a: "a", b: "b", c: "c", d: "d", e: "e", 1: "a", 2: "b", 3: "c", 4: "d", 5: "e" };
    if (map[k]) choose(map[k]);
    else if (k === "arrowright" || k === "n") go(state.current + 1);
    else if (k === "arrowleft" || k === "p") go(state.current - 1);
    else if (k === "m") $("markBtn").click();
  });
}

function openSubmitModal() {
  const c = refreshPalette();
  const answered = c.answered + c["answered-marked"];
  $("submitSummary").innerHTML = `
    <tr><td>Total questions</td><td>${paper.questions.length}</td></tr>
    <tr><td>Answered</td><td>${answered}</td></tr>
    <tr><td>Not answered</td><td>${paper.questions.length - answered}</td></tr>
    <tr><td>Marked for review</td><td>${c.marked + c["answered-marked"]}</td></tr>
    <tr><td>Time left</td><td>${fmtClock((state.endsAt - Date.now()) / 1000)}</td></tr>`;
  $("submitModal").classList.remove("hidden");
}

/* ---------- submit ---------- */

async function submit(auto) {
  if (submitting) return;
  submitting = true;
  if (timerId) clearInterval(timerId);
  clearTimeout(flushTimer);

  const btn = $("confirmSubmit");
  if (btn) { btn.disabled = true; btn.textContent = "Submitting..."; }

  const end = Math.min(Date.now(), state.endsAt);
  const s = scoreAttempt(paper, state.answers);
  const attempt = {
    id: state.attemptId || `${user.uid}_${paperId}_${Date.now()}`,
    uid: user.uid,
    name: user.name,
    email: user.email,
    paperId,
    title: paper.title,
    submittedAt: Date.now(),
    timeTaken: (end - state.startedAt) / 1000,
    autoSubmitted: !!auto,
    answers: state.answers,
    marked: state.marked,
    ...s,
  };
  // keep the same id if we have to retry, so it's never saved twice
  state.attemptId = attempt.id;
  Store.set(localKey(), state);

  try {
    await saveAttempt(attempt);
  } catch (e) {
    submitting = false;
    if (btn) { btn.disabled = false; btn.textContent = "Try again"; }
    showSubmitError(friendlyError(e));
    return;
  }

  await addLeaderboardEntry(attempt);   // counts only if it's the first attempt

  state.submitted = true;
  Store.remove(localKey());
  try { await clearProgress(user.uid, paperId); } catch (e) { console.warn(e); }
  location.replace(`result.html?attempt=${encodeURIComponent(attempt.id)}${auto ? "&auto=1" : ""}`);
}

function showSubmitError(text) {
  // make sure the modal is visible with a retry button, even for auto-submit
  if ($("examScreen").classList.contains("hidden")) {
    $("instrScreen").classList.add("hidden");
    $("examScreen").classList.remove("hidden");
  }
  $("submitModal").classList.remove("hidden");
  $("submitSummary").innerHTML = `<tr><td colspan="2" style="color:var(--red)">Couldn't submit: ${esc(text)}<br>Your answers are safe on this device. Check your internet and press Try again.</td></tr>`;
  $("cancelSubmit").classList.add("hidden");
  $("confirmSubmit").onclick = () => submit(true);
}
