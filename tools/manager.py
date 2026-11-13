"""
Paper Manager: add, fix and publish question papers from your browser.

    python tools/manager.py

Opens http://localhost:8000/manager/ . Your site is also served at
http://localhost:8000/ so you can preview papers before publishing.
Press Ctrl+C in the terminal to stop.
"""

import json
import re
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory, abort

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parse_pdf as P  # noqa: E402
import cloud  # noqa: E402

ROOT = P.ROOT
DOCS = ROOT / "docs"
PDFS = ROOT / "pdfs"
UI = Path(__file__).resolve().parent / "manager_ui"
PORT = 8000   # keep 8000: the Firebase key restriction allows localhost:8000

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

ID_RE = re.compile(r"^[a-z0-9_\-]{1,60}$")


def paper_path(pid):
    if not ID_RE.match(pid or ""):
        abort(400, "Bad paper id")
    return P.PAPERS_DIR / f"{pid}.json"


def with_flags(paper):
    for q in paper["questions"]:
        q["_issues"] = P.check_question(q)
    return paper


def clean_question(q, i):
    """Validate one question coming back from the editor."""
    opts = [str(o).strip() for o in (q.get("options") or [])][:5]
    ans = q.get("answer")
    out = {
        "id": i + 1,
        "question": str(q.get("question", "")).strip(),
        "options": opts,
        "answer": ans if ans in ("a", "b", "c", "d", "e")[:len(opts)] else None,
        "explanation": str(q.get("explanation", "")).strip(),
    }
    if str(q.get("passage") or "").strip():
        out["passage"] = str(q["passage"]).strip()
    # optional Hindi version (options must stay in the same order as the English ones)
    for k in ("question_hi", "explanation_hi", "passage_hi"):
        if str(q.get(k) or "").strip():
            out[k] = str(q[k]).strip()
    hi_opts = [str(o).strip() for o in (q.get("options_hi") or [])]
    if hi_opts and len(hi_opts) >= len(opts):
        out["options_hi"] = hi_opts[:len(opts)]
    if q.get("bonus"):
        out["bonus"] = True
        out["answer"] = None
    if q.get("checked"):
        out["checked"] = True
    return out


def read_paper(pid):
    path = paper_path(pid)
    if not path.exists():
        abort(404)
    return json.loads(path.read_text(encoding="utf-8"))


def write_paper(paper):
    paper_path(paper["id"]).write_text(json.dumps(paper, indent=2, ensure_ascii=False), encoding="utf-8")


def git(*args):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).rstrip()


# ---------------- pages ----------------

@app.get("/manager/")
def manager_page():
    return send_from_directory(UI, "index.html")


@app.get("/manager/<path:f>")
def manager_files(f):
    return send_from_directory(UI, f)


@app.get("/")
def site_root():
    return send_from_directory(DOCS, "index.html")


@app.get("/<path:f>")
def site_files(f):
    resp = send_from_directory(DOCS, f)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


# ---------------- api ----------------

@app.get("/api/papers")
def api_papers():
    papers = P.rebuild_index()
    todo = cloud.pending()
    for p in papers:
        data = read_paper(p["id"])
        p["issues"] = sum(1 for q in data["questions"] if P.check_question(q))
        p["unpublished"] = p["id"] in todo["upload"]
    return jsonify(papers)


# Local preview: the site (served by this manager on localhost) reads papers
# from here instead of Firebase, so you can try edits before publishing.
@app.get("/api/preview/papers")
def api_preview_index():
    return jsonify(P.rebuild_index())


@app.get("/api/preview/paper/<pid>")
def api_preview_paper(pid):
    paper = read_paper(pid)
    for q in paper["questions"]:
        q.pop("checked", None)
    return jsonify(paper)


@app.post("/api/paper/<pid>/free")
def api_set_free(pid):
    paper = read_paper(pid)
    paper["free"] = bool((request.get_json(silent=True) or {}).get("free"))
    write_paper(paper)
    return jsonify(ok=True, free=paper["free"])


@app.post("/api/convert")
def api_convert():
    f = request.files.get("pdf")
    if not f or not f.filename.lower().endswith(".pdf"):
        return jsonify(error="Choose a PDF file."), 400
    try:
        year = int(request.form["year"])
    except (KeyError, ValueError):
        return jsonify(error="Enter the year, e.g. 1995."), 400
    pid = (request.form.get("id") or f"bpsc_{year}").strip().lower()
    if not ID_RE.match(pid):
        return jsonify(error="Paper id can only use a-z, 0-9, _ and -."), 400
    if paper_path(pid).exists() and request.form.get("overwrite") != "1":
        return jsonify(error=f"A paper with id '{pid}' already exists.", exists=True), 409

    PDFS.mkdir(exist_ok=True)
    safe_name = re.sub(r"[^A-Za-z0-9_.\-]+", "_", Path(f.filename).name)
    saved = PDFS / safe_name
    f.save(saved)

    logs = []
    try:
        paper, problems, _ = P.convert(
            saved, year, pid,
            (request.form.get("title") or "").strip() or None,
            int(request.form.get("duration") or 120),
            float(request.form.get("marks") or 1),
            float(request.form.get("negative") or 0),
            log=logs.append,
        )
    except Exception as e:  # show any parse error in the page
        return jsonify(error=f"Could not read this PDF: {e}", log=logs), 400

    answered = sum(1 for q in paper["questions"] if q.get("answer") or q.get("bonus"))
    return jsonify(id=pid, questions=len(paper["questions"]), answers=answered,
                   problems=len(problems), log=logs)


@app.get("/api/paper/<pid>")
def api_get_paper(pid):
    return jsonify(with_flags(read_paper(pid)))


@app.put("/api/paper/<pid>")
def api_save_paper(pid):
    path = paper_path(pid)
    if not path.exists():
        abort(404)
    data = request.get_json(force=True)
    try:
        paper = {
            "id": pid,
            "title": str(data["title"]).strip() or pid,
            "year": int(data["year"]) if str(data.get("year", "")).strip() else None,
            "duration": int(data["duration"]),
            "marks": float(data["marks"]),
            "negative": float(data["negative"]),
            "free": bool(data.get("free", False)),
            "category": data.get("category") if data.get("category") in ("pyq", "mock") else "pyq",
            "exam": data.get("exam") if data.get("exam") in P.exam_ids() else P.exam_ids()[0],
            "questions": [clean_question(q, i) for i, q in enumerate(data["questions"])],
        }
    except (KeyError, ValueError, TypeError) as e:
        return jsonify(error=f"Invalid data: {e}"), 400
    for k in ("marks", "negative"):
        if paper[k] == int(paper[k]):
            paper[k] = int(paper[k])
    write_paper(paper)
    return jsonify(with_flags(paper))


@app.delete("/api/paper/<pid>")
def api_delete_paper(pid):
    path = paper_path(pid)
    if path.exists():
        path.unlink()
    review = P.REVIEW_DIR / f"{pid}_review.txt"
    if review.exists():
        review.unlink()
    return jsonify(ok=True)


@app.get("/api/status")
def api_status():
    out = {"firebase": cloud.available(), "project": cloud.project_id(), "pending": cloud.pending()}
    code, txt = git("status", "--porcelain")
    if code != 0:
        out["git"] = {"ok": False, "message": "This folder isn't a git repository, or git isn't installed."}
    else:
        out["git"] = {"ok": True, "changed": [l[3:].strip('"') for l in txt.splitlines() if len(l) > 3]}
    return jsonify(out)


@app.post("/api/publish")
def api_publish():
    msg = ((request.get_json(silent=True) or {}).get("message") or "Update site").strip()
    steps = []

    # 1. papers -> Firebase
    if not cloud.available():
        steps.append(("Firebase", "serviceAccount.json not found in the project folder. "
                                  "See README: 'Connect the Paper Manager to Firebase'."))
        return jsonify(ok=False, steps=steps)
    logs = []
    try:
        cloud.sync(log=logs.append)
    except Exception as e:
        logs.append(f"Upload failed: {e}")
        steps.append(("Upload papers to Firebase", "\n".join(logs)))
        return jsonify(ok=False, steps=steps)
    steps.append(("Upload papers to Firebase", "\n".join(logs)))

    # 2. website code -> GitHub (only if something changed)
    code, out = git("status", "--porcelain")
    if code != 0:
        steps.append(("git", "This folder isn't a git repository, so the website code wasn't pushed."))
        return jsonify(ok=True, steps=steps, message="Papers are live. (Website code not pushed: no git repository.)")
    # safety: never push the Firebase admin key
    code, _ = git("check-ignore", "-q", "serviceAccount.json")
    if code != 0:
        steps.append(("Safety check", "serviceAccount.json is not listed in .gitignore, so nothing was pushed. "
                                      "Add the line  serviceAccount.json  to .gitignore and try again."))
        return jsonify(ok=False, steps=steps)
    if out.strip():
        code, out = git("add", "-A")
        steps.append(("git add -A", out))
        code, out = git("commit", "-m", msg)
        steps.append((f'git commit -m "{msg}"', out))
        if code:
            return jsonify(ok=False, steps=steps)
    code, out = git("pull", "--rebase", "--autostash")
    steps.append(("git pull --rebase", out))
    if code:
        git("rebase", "--abort")
        return jsonify(ok=False, steps=steps)
    code, out = git("push")
    steps.append(("git push", out))
    if code:
        return jsonify(ok=False, steps=steps)
    return jsonify(ok=True, steps=steps, message="Published. Papers are live now; website changes take about a minute.")


if __name__ == "__main__":
    P.migrate_old_layout()
    url = f"http://localhost:{PORT}/manager/"
    print(f"Paper Manager running at {url}  (Ctrl+C to stop)")
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=PORT, debug=False)
