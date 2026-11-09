// Paper Manager front end.

const $ = (id) => document.getElementById(id);
const LETTERS = ["a", "b", "c", "d"];

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  let data = {};
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error(data.error || `Error ${r.status}`), { status: r.status, data });
  return data;
}

function setMsg(el, text, ok) {
  el.textContent = text;
  el.className = ok === undefined ? "" : ok ? "msg-ok" : "msg-err";
}

/* =================== HOME =================== */

let chosenFile = null;

function pickFile(f) {
  if (!f) return;
  if (!f.name.toLowerCase().endsWith(".pdf")) { setMsg($("convertMsg"), "That's not a PDF.", false); return; }
  chosenFile = f;
  $("dropText").innerHTML = `<b>${esc(f.name)}</b> (${(f.size / 1024 / 1024).toFixed(1)} MB) &middot; click to change`;
  // guess the year from the file name, e.g. BPSC_Paper_1995.pdf
  const m = f.name.match(/(19[5-9]\d|20\d\d)/);
  if (m && !$("year").value) { $("year").value = m[1]; fillDefaults(); }
  setMsg($("convertMsg"), "");
}

function fillDefaults() {
  const y = $("year").value;
  $("title").placeholder = y ? `BPSC Prelims ${y}` : "BPSC Prelims 1995";
  $("pid").placeholder = y ? `bpsc_${y}` : "bpsc_1995";
}

$("pdf").onchange = (e) => pickFile(e.target.files[0]);
$("year").oninput = fillDefaults;
const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => pickFile(e.dataTransfer.files[0]));

async function convert(overwrite = false) {
  const msg = $("convertMsg"), log = $("convertLog"), btn = $("convertBtn");
  if (!chosenFile) return setMsg(msg, "Choose a PDF first.", false);
  if (!$("year").value) return setMsg(msg, "Enter the year.", false);

  const fd = new FormData();
  fd.append("pdf", chosenFile);
  ["year", "duration", "marks", "negative", "title"].forEach((k) => fd.append(k, $(k).value));
  fd.append("id", $("pid").value.trim());
  if (overwrite) fd.append("overwrite", "1");

  btn.disabled = true;
  setMsg(msg, "Converting... (large PDFs take up to a minute)");
  log.classList.add("hidden");
  try {
    const r = await api("/api/convert", { method: "POST", body: fd });
    log.textContent = r.log.join("\n");
    log.classList.remove("hidden");
    setMsg(msg, `Done: ${r.questions} questions, ${r.answers} answers, ${r.problems} to check.`, true);
    await loadPapers();
    if (r.problems) {
      if (confirm(`${r.problems} question(s) need checking. Open the editor now?`)) openEditor(r.id, true);
    }
  } catch (e) {
    if (e.status === 409 && e.data.exists) {
      setMsg(msg, "");
      if (confirm(`${e.message}\n\nReplace it? Any fixes you made to that paper will be lost.`)) return convert(true);
    } else {
      setMsg(msg, e.message, false);
      if (e.data && e.data.log && e.data.log.length) { log.textContent = e.data.log.join("\n"); log.classList.remove("hidden"); }
    }
  } finally {
    btn.disabled = false;
  }
}
$("convertBtn").onclick = () => convert(false);

async function loadPapers() {
  const box = $("papers");
  try {
    const papers = await api("/api/papers");
    if (!papers.length) { box.innerHTML = `<div class="empty">No papers yet. Add one above.</div>`; return; }
    box.innerHTML = `
      <div style="overflow-x:auto"><table class="history">
        <thead><tr><th>Paper</th><th>Type</th><th>Year</th><th>Questions</th><th>Free</th><th>Status</th><th></th></tr></thead>
        <tbody>${papers.map((p) => `
          <tr>
            <td><b>${esc(p.title)}</b><span class="muted" style="display:block;color:var(--muted);font-size:12px">${esc(p.id)}.json</span></td>
            <td>${p.category === "mock" ? "Mock test" : "Previous year"}</td>
            <td>${esc(p.year ?? "")}</td>
            <td>${p.count}</td>
            <td><input type="checkbox" data-free="${esc(p.id)}" ${p.free ? "checked" : ""} title="Free for everyone"></td>
            <td>${p.issues ? `<span class="warn-badge">${p.issues} to check</span>` : `<span class="ok-badge">Ready</span>`}
                ${p.unpublished ? `<span class="warn-badge" style="background:#eef4ff;color:var(--accent)">not published</span>` : ""}</td>
            <td style="white-space:nowrap">
              <button class="btn" data-edit="${esc(p.id)}">Check &amp; edit</button>
              <a class="btn" href="/exam.html?paper=${encodeURIComponent(p.id)}" target="_blank">Preview</a>
              <button class="btn" data-del="${esc(p.id)}" style="color:var(--red)">Delete</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>`;
  } catch (e) {
    box.innerHTML = `<div class="empty">Could not load papers: ${esc(e.message)}</div>`;
  }
  loadGit();
}

$("papers").addEventListener("change", async (e) => {
  const f = e.target.closest("[data-free]");
  if (!f) return;
  await api(`/api/paper/${f.dataset.free}/free`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ free: f.checked }),
  });
  loadPapers();
});

$("papers").onclick = async (e) => {
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if (ed) openEditor(ed.dataset.edit, false);
  if (del) {
    if (!confirm(`Delete ${del.dataset.del}? It disappears from the site after you publish.`)) return;
    await api(`/api/paper/${del.dataset.del}`, { method: "DELETE" });
    loadPapers();
  }
};

async function loadGit() {
  const fb = $("fbStatus"), el = $("gitStatus");
  try {
    const st = await api("/api/status");
    if (!st.firebase) {
      fb.innerHTML = `<span class="msg-err">Not connected to Firebase.</span> Put <b>serviceAccount.json</b> in the project folder (see README), then reload this page.`;
    } else {
      const n = st.pending.upload.length + st.pending.delete.length;
      fb.innerHTML = `Firebase project <b>${esc(st.project || "")}</b>: ` + (n || st.pending.never_synced
        ? `<span class="warn-badge">${n || "all"} paper change(s) to upload</span> <span style="font-size:13px">${[...st.pending.upload, ...st.pending.delete.map((x) => x + " (delete)")].map(esc).join(", ")}</span>`
        : `<span class="ok-badge">papers up to date</span>`);
    }
    const g = st.git;
    if (!g.ok) { el.innerHTML = `<span class="msg-err">${esc(g.message)}</span>`; return; }
    el.innerHTML = "GitHub: " + (g.changed.length
      ? `<span class="warn-badge">${g.changed.length} code file(s) to push</span> <span style="font-size:13px">${g.changed.slice(0, 8).map(esc).join(", ")}${g.changed.length > 8 ? "..." : ""}</span>`
      : `<span class="ok-badge">website code up to date</span>`);
  } catch (e) { el.textContent = ""; }
}

$("publishBtn").onclick = async () => {
  const btn = $("publishBtn"), msg = $("publishMsg"), log = $("publishLog");
  btn.disabled = true;
  setMsg(msg, "Publishing...");
  try {
    const r = await api("/api/publish", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: $("commitMsg").value }),
    });
    log.textContent = r.steps.map(([cmd, out]) => `> ${cmd}\n${out}`).join("\n\n");
    log.classList.remove("hidden");
    if (r.ok) setMsg(msg, r.message || "Published.", true);
    else setMsg(msg, "Publishing failed. See the details below.", false);
  } catch (e) {
    setMsg(msg, e.message, false);
  } finally {
    btn.disabled = false;
    loadGit();
  }
};

/* =================== EDITOR =================== */

let paper = null, cur = 0, dirty = false;

function markDirty() { dirty = true; $("saveMsg").textContent = "Unsaved changes"; }

async function openEditor(id, onlyFlagged) {
  paper = await api(`/api/paper/${id}`);
  $("eTitle").value = paper.title;
  $("eYear").value = paper.year ?? "";
  $("eDuration").value = paper.duration;
  $("eMarks").value = paper.marks;
  $("eNegative").value = paper.negative;
  $("eFree").checked = !!paper.free;
  $("eCategory").value = paper.category === "mock" ? "mock" : "pyq";
  $("onlyFlagged").checked = onlyFlagged;
  dirty = false;
  $("saveMsg").textContent = "";
  $("home").classList.add("hidden");
  $("editor").classList.remove("hidden");
  const first = paper.questions.findIndex((q) => q._issues.length);
  showQ(onlyFlagged && first >= 0 ? first : 0);
  window.scrollTo(0, 0);
}

function localIssues(q) {
  // same checks as tools/parse_pdf.py check_question()
  const out = [];
  const opts = q.options || [];
  if (opts.length !== 4) out.push(`found ${opts.length} options`);
  if (opts.some((o) => !String(o).trim())) out.push("empty option");
  if (!q.answer && !q.bonus) out.push("no answer");
  if (q.checked) return out;
  if ((q.question || "").length < 10) out.push("very short question text");
  if (/Column|Codes?:|A\s+B\s+C\s+D/.test(q.question || "")) out.push("table/match question, check layout");
  if (new Set(opts.map((o) => String(o).trim().toLowerCase())).size < opts.length) out.push("two options are the same");
  return out;
}

function drawGrid() {
  const only = $("onlyFlagged").checked;
  let flagged = 0;
  $("qgrid").innerHTML = paper.questions.map((q, i) => {
    q._issues = localIssues(q);
    if (q._issues.length) flagged++;
    if (only && !q._issues.length && i !== cur) return "";
    const cls = !q.answer && !q.bonus ? "noans" : q._issues.length ? "flag" : "";
    return `<button class="qbtn ${cls} ${i === cur ? "cur" : ""}" data-i="${i}">${i + 1}</button>`;
  }).join("");
  $("flagCount").textContent = flagged ? `${flagged} of ${paper.questions.length} questions to check` : `All ${paper.questions.length} questions look fine`;
}

function showQ(i) {
  cur = Math.max(0, Math.min(paper.questions.length - 1, i));
  const q = paper.questions[cur];
  while (q.options.length < 4) q.options.push("");
  $("eQno").textContent = `Question ${cur + 1} of ${paper.questions.length}`;
  $("eQuestion").value = q.question;
  $("eExplanation").value = q.explanation || "";
  $("eBonus").checked = !!q.bonus;
  $("eChecked").checked = !!q.checked;
  $("eOptions").innerHTML = q.options.map((o, k) => `
    <div class="opt-row">
      <input type="radio" name="ans" value="${LETTERS[k]}" ${q.answer === LETTERS[k] ? "checked" : ""} title="Correct answer">
      <span class="l">${LETTERS[k].toUpperCase()}</span>
      <input type="text" data-k="${k}" value="${esc(o)}">
    </div>`).join("");
  $("prevQ").disabled = cur === 0;
  $("nextQ").disabled = cur === paper.questions.length - 1;
  refreshQ();
}

function refreshQ() {
  const q = paper.questions[cur];
  q._issues = localIssues(q);
  const box = $("eIssues");
  box.classList.toggle("hidden", !q._issues.length);
  box.textContent = q._issues.length ? "Check: " + q._issues.join(", ") : "";
  $("ePreview").innerHTML = `${esc(q.question)}\n\n${q.options.map((o, k) =>
    `${q.answer === LETTERS[k] ? "✅" : "○"} (${LETTERS[k]}) ${esc(o)}`).join("\n")}`;
  drawGrid();
}

// edits
$("eQuestion").oninput = (e) => { paper.questions[cur].question = e.target.value; markDirty(); refreshQ(); };
$("eExplanation").oninput = (e) => { paper.questions[cur].explanation = e.target.value; markDirty(); };
$("eOptions").addEventListener("input", (e) => {
  const q = paper.questions[cur];
  if (e.target.dataset.k !== undefined) q.options[+e.target.dataset.k] = e.target.value;
  markDirty(); refreshQ();
});
$("eOptions").addEventListener("change", (e) => {
  if (e.target.name === "ans") { paper.questions[cur].answer = e.target.value; markDirty(); refreshQ(); }
});
$("eBonus").onchange = (e) => {
  const q = paper.questions[cur];
  q.bonus = e.target.checked;
  if (q.bonus) { q.answer = null; document.querySelectorAll("input[name=ans]").forEach((r) => (r.checked = false)); }
  markDirty(); refreshQ();
};
$("eChecked").onchange = (e) => { paper.questions[cur].checked = e.target.checked; markDirty(); refreshQ(); };
["eTitle", "eYear", "eDuration", "eMarks", "eNegative"].forEach((id) => ($(id).oninput = markDirty));
$("eFree").onchange = markDirty;
$("eCategory").onchange = markDirty;

$("qgrid").onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) showQ(+b.dataset.i); };
$("onlyFlagged").onchange = drawGrid;
$("prevQ").onclick = () => showQ(cur - 1);
$("nextQ").onclick = () => {
  if ($("onlyFlagged").checked) {
    const next = paper.questions.findIndex((q, i) => i > cur && q._issues.length);
    if (next >= 0) return showQ(next);
  }
  showQ(cur + 1);
};
$("delQ").onclick = () => {
  if (!confirm(`Delete question ${cur + 1}? The questions after it will be renumbered.`)) return;
  paper.questions.splice(cur, 1);
  markDirty();
  showQ(Math.min(cur, paper.questions.length - 1));
};

async function save() {
  const btn = $("saveBtn");
  btn.disabled = true;
  $("saveMsg").textContent = "Saving...";
  try {
    const body = {
      title: $("eTitle").value, year: $("eYear").value, duration: $("eDuration").value,
      marks: $("eMarks").value, negative: $("eNegative").value, free: $("eFree").checked, category: $("eCategory").value, questions: paper.questions,
    };
    paper = await api(`/api/paper/${paper.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    dirty = false;
    $("saveMsg").innerHTML = `<span class="msg-ok">Saved.</span> Publish from the main page when you're done.`;
    showQ(cur);
  } catch (e) {
    $("saveMsg").innerHTML = `<span class="msg-err">${esc(e.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}
$("saveBtn").onclick = save;

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !$("editor").classList.contains("hidden")) {
    e.preventDefault(); save();
  }
});

$("backBtn").onclick = () => {
  if (dirty && !confirm("You have unsaved changes. Leave without saving?")) return;
  $("editor").classList.add("hidden");
  $("home").classList.remove("hidden");
  loadPapers();
};
window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

fillDefaults();
loadPapers();
