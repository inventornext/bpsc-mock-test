// Exam screen: instructions, timer, autosave, palette, submit.

const session = Auth.require();
const paperId = qs("paper");
const LETTERS = ["a", "b", "c", "d"];

let paper = null;
let state = null;      // saved progress for this user + paper
let timerId = null;
const $ = (id) => document.getElementById(id);

const progressKey = () => Keys.progress(session.username, paperId);
const save = () => Store.set(progressKey(), state);

(async function init() {
  renderTopbar(session);
  if (!paperId) { location.replace("papers.html"); return; }

  try {
    paper = await loadJSON(`data/papers/${encodeURIComponent(paperId)}.json`);
  } catch (e) {
    $("instrTitle").textContent = "Could not load this paper.";
    return;
  }
  document.title = `${paper.title} | ${SITE.name}`;

  state = Store.get(progressKey());
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
    }
    startExam();
  };
}

function startExam() {
  $("instrScreen").classList.add("hidden");
  $("examScreen").classList.remove("hidden");

  $("examBadge").textContent = SITE.short;
  $("examTitle").textContent = paper.title;
  $("avatar").textContent = initials(session.name);
  $("uname").textContent = session.name;
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
  if (left <= 0) {
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
  $("qText").textContent = q.question;

  const chosen = state.answers[q.id];
  $("qOptions").innerHTML = q.options
    .map((opt, k) => {
      const L = LETTERS[k];
      return `
        <label class="option${chosen === L ? " selected" : ""}" data-l="${L}">
          <input type="radio" name="opt" value="${L}" ${chosen === L ? "checked" : ""}>
          <span class="letter">${L.toUpperCase()}</span>
          <span class="otext">${esc(opt)}</span>
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
    const map = { a: "a", b: "b", c: "c", d: "d", 1: "a", 2: "b", 3: "c", 4: "d" };
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
function submit(auto) {
  if (timerId) clearInterval(timerId);
  const end = Math.min(Date.now(), state.endsAt);
  const s = scoreAttempt(paper, state.answers);
  const attempt = {
    id: `${paperId}_${Date.now()}`,
    paperId,
    title: paper.title,
    submittedAt: Date.now(),
    timeTaken: (end - state.startedAt) / 1000,
    autoSubmitted: !!auto,
    answers: state.answers,
    marked: state.marked,
    ...s,
  };
  const all = Store.get(Keys.attempts(session.username), []);
  all.push(attempt);
  Store.set(Keys.attempts(session.username), all);
  Store.remove(progressKey());
  location.replace(`result.html?attempt=${encodeURIComponent(attempt.id)}${auto ? "&auto=1" : ""}`);
}
