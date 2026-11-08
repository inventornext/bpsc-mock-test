"""
Convert a BPSC previous-year paper PDF (two-column, Oswaal style) into a JSON
file the exam website can load.

Usage (from the project root):
    python tools/parse_pdf.py pdfs/BPSC_Paper_1995.pdf --year 1995
    python tools/parse_pdf.py pdfs/BPSC_Paper_1995.pdf --year 1995 --title "BPSC Prelims 1995" --duration 120

Output:
    papers/<id>.json             the paper (kept on your computer, uploaded to
                                 Firebase by the Paper Manager's Publish button)
    review/<id>_review.txt       questions the parser was unsure about
"""

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
PAPERS_DIR = ROOT / "papers"          # not uploaded to GitHub (see .gitignore)
OLD_DATA_DIR = ROOT / "docs" / "data" # where papers used to live (public)
REVIEW_DIR = ROOT / "review"

# Lines to throw away (running headers, footers, page numbers)
NOISE_PATTERNS = [
    re.compile(r"OSWAAL", re.I),
    re.compile(r"previous years solved papers", re.I),
    re.compile(r"^\s*\d{1,4}\s*$"),          # bare page numbers / year header
    re.compile(r"^\s*ANSWERS?\s*(WITH)?\s*$", re.I),
    re.compile(r"^\s*EXPLANATIONS?\s*$", re.I),
]

ANSWER_START = re.compile(r"^\s*(\d{1,3})\s+Option\s*\(([a-dA-D])\)\s*is\s*correct\.?\s*(.*)$")
# dropped / bonus questions, e.g. "43 No option is correct. (Bonus)"
BONUS_START = re.compile(
    r"^\s*(\d{1,3})\s+(No option is correct|None of the options|.*\(Bonus\)|.*(deleted|dropped|cancelled))\.?\s*(.*)$",
    re.I,
)
ANSWER_SECTION_MARK = re.compile(r"Option\s*\([a-dA-D]\)\s*is\s*correct", re.I)
Q_START = re.compile(r"^\s*(\d{1,3})\s*(.*)$")
OPTION_MARK = re.compile(r"\(([a-d])\)")

# Lines in a question stem that should keep their own line (lists, tables, codes)
KEEP_BREAK = re.compile(
    r"^\s*(\(?\d+[.)]|\([A-Ea-e1-9]\)|[A-E]\.|Column|Codes?\b|Assertion|Reason|Select|"
    r"Statement|List|Choose|Consider|Which of the|A\s+B\s+C|[ivx]+[.)])",
    re.I,
)

# Running header strip at the top of every page (points). The book prints it
# several times over itself, so it can't be cleaned with text matching.
HEADER_BAND = 55
# Text this size or bigger is a section title, not question text
TITLE_SIZE = 11.5

BULLET_CHARS = "\u0084\uf0b7\uf0a7\uf076\uf0d8\u2022\uf0fc"


def find_column_split(page):
    """Return the x position of the empty gutter between the two columns."""
    width = page.width
    lo, hi = int(width * 0.40), int(width * 0.60)
    counts = {x: 0 for x in range(lo, hi)}
    for c in page.chars:
        for x in range(int(c["x0"]), int(c["x1"]) + 1):
            if x in counts:
                counts[x] += 1
    # widest run of the lowest counts, take its middle
    best = min(counts.values())
    xs = [x for x, n in counts.items() if n <= best + 1]
    runs, run = [], [xs[0]]
    for x in xs[1:]:
        if x == run[-1] + 1:
            run.append(x)
        else:
            runs.append(run)
            run = [x]
    runs.append(run)
    longest = max(runs, key=len)
    return (longest[0] + longest[-1]) / 2


def keep_char(obj):
    """Drop running headers and big section titles like 'ANSWERS WITH EXPLANATION'."""
    if obj.get("object_type") != "char":
        return True
    if obj["top"] <= HEADER_BAND:
        return False
    if obj.get("size", 0) >= TITLE_SIZE:
        return False
    return True


def page_columns_text(pdf_path):
    """Yield text of each column, left then right, page by page."""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page = page.filter(keep_char)
            page = page.dedupe_chars()   # bold text is often printed twice
            split = find_column_split(page)
            for box in [(0, 0, split, page.height), (split, 0, page.width, page.height)]:
                txt = page.crop(box).extract_text(x_tolerance=1.5, y_tolerance=3) or ""
                yield txt


def clean_lines(text):
    out = []
    for line in text.splitlines():
        line = line.rstrip()
        for b in BULLET_CHARS:
            line = line.replace(b, "•")
        if not line.strip():
            continue
        if any(p.search(line) for p in NOISE_PATTERNS):
            continue
        out.append(line)
    return out


def join_stem(lines):
    """Join wrapped lines but keep breaks before list items / table rows."""
    result = ""
    for i, line in enumerate(lines):
        s = line.strip()
        if i == 0:
            result = s
        elif KEEP_BREAK.match(s):
            result += "\n" + s
        else:
            # hyphenated word split across lines: "influ-" + "enced"
            if result.endswith("-") and s[:1].islower():
                result = result[:-1] + s
            else:
                result += " " + s
    return result.strip()


def split_options(block):
    """
    Given a question's full text, return (stem, [a, b, c, d]).
    Uses the LAST run of (a)...(b)...(c)...(d) so match-the-column tables
    inside the stem don't confuse it.
    """
    marks = list(OPTION_MARK.finditer(block))
    # search backwards for a d, then c, b, a before it
    for start in range(len(marks) - 1, -1, -1):
        if marks[start].group(1) != "a":
            continue
        seq = [marks[start]]
        want = "b"
        for m in marks[start + 1:]:
            if m.group(1) == want:
                seq.append(m)
                want = chr(ord(want) + 1)
                if want == "e":
                    break
        if len(seq) == 4:
            stem = block[: seq[0].start()]
            opts = []
            for i, m in enumerate(seq):
                end = seq[i + 1].start() if i < 3 else len(block)
                opts.append(" ".join(block[m.end():end].split()))
            return stem, opts
    return block, []


def parse_questions(lines):
    questions, current, expected = [], None, 1
    for line in lines:
        m = Q_START.match(line)
        if m and int(m.group(1)) == expected and not re.match(r"^\s*\d+\s*[.)]", line):
            if current:
                questions.append(current)
            current = {"num": expected, "lines": [m.group(2)] if m.group(2).strip() else []}
            expected += 1
        elif current:
            current["lines"].append(line)
    if current:
        questions.append(current)

    parsed = []
    for q in questions:
        raw = "\n".join(q["lines"])
        stem_raw, opts = split_options(raw)
        stem_lines = [l for l in stem_raw.splitlines() if l.strip()]
        parsed.append({
            "id": q["num"],
            "question": join_stem(stem_lines),
            "options": opts,
        })
    return parsed


def parse_answers(lines):
    answers, current, expected = {}, None, 1
    for line in lines:
        m = ANSWER_START.match(line)
        b = None if m else BONUS_START.match(line)
        if m and int(m.group(1)) == expected:
            if current:
                answers[current["num"]] = current
            current = {"num": expected, "answer": m.group(2).lower(), "lines": [m.group(3)]}
            expected += 1
        elif b and int(b.group(1)) == expected:
            if current:
                answers[current["num"]] = current
            current = {"num": expected, "answer": None, "bonus": True, "lines": [b.group(4) or ""]}
            expected += 1
        elif current:
            current["lines"].append(line)
    if current:
        answers[current["num"]] = current

    out = {}
    for num, a in answers.items():
        text = "\n".join(l.strip() for l in a["lines"] if l.strip())
        text = re.sub(r"^(\(Bonus\)\s*)?Explanation\s*:\s*", "", text, flags=re.I)
        # join wrapped lines, keep bullets on their own line
        paras = []
        for line in text.splitlines():
            if line.startswith("•") or not paras:
                paras.append(line)
            else:
                paras[-1] += " " + line
        out[num] = {
            "answer": a["answer"],
            "bonus": a.get("bonus", False),
            "explanation": "\n".join(paras).strip(),
        }
    return out


def migrate_old_layout(log=print):
    """Move papers from the old public docs/data folder into papers/ (one time)."""
    old = OLD_DATA_DIR / "papers"
    if not old.exists():
        return
    PAPERS_DIR.mkdir(exist_ok=True)
    for f in old.glob("*.json"):
        dest = PAPERS_DIR / f.name
        if not dest.exists():
            f.replace(dest)
            log(f"Moved {f.name} to papers/")
        else:
            f.unlink()
    import shutil
    shutil.rmtree(OLD_DATA_DIR, ignore_errors=True)


def paper_files():
    return sorted(f for f in PAPERS_DIR.glob("*.json") if not f.name.startswith(("_", ".")))


def rebuild_index():
    """List of papers (without questions) for the papers page."""
    PAPERS_DIR.mkdir(exist_ok=True)
    papers = []
    for f in paper_files():
        d = json.loads(f.read_text(encoding="utf-8"))
        if d.get("id") != f.stem:   # file name wins, so ids always match
            d["id"] = f.stem
            f.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
        papers.append({
            "id": d["id"],
            "title": d["title"],
            "year": d.get("year"),
            "duration": d["duration"],
            "count": len(d["questions"]),
            "marks": d.get("marks", 1),
            "negative": d.get("negative", 0),
            "free": bool(d.get("free", False)),
        })
    papers.sort(key=lambda p: (p.get("year") or 0), reverse=True)
    return papers


def check_question(q):
    """Return a list of reasons this question may need a hand fix."""
    issues = []
    opts = q.get("options") or []
    if len(opts) != 4:
        issues.append(f"found {len(opts)} options")
    if any(not str(o).strip() for o in opts):
        issues.append("empty option")
    if not q.get("answer") and not q.get("bonus"):
        issues.append("no answer")
    if q.get("checked"):
        return issues   # marked as checked in the Paper Manager: skip the soft warnings
    if len(q.get("question", "")) < 10:
        issues.append("very short question text")
    if re.search(r"Column|Codes?:|A\s+B\s+C\s+D", q.get("question", "")):
        issues.append("table/match question, check layout")
    if len(set(str(o).strip().lower() for o in opts)) < len(opts):
        issues.append("two options are the same")
    return issues


def convert(pdf_path, year, paper_id=None, title=None, duration=120, marks=1, negative=0, log=print):
    """Parse a PDF and write the paper JSON. Returns (paper, problems, out_file)."""
    pdf_path = Path(pdf_path)
    migrate_old_layout(log)
    paper_id = paper_id or f"bpsc_{year}"
    title = title or f"BPSC Prelims {year}"

    log(f"Reading {pdf_path.name} ...")
    q_lines, a_lines, in_answers = [], [], False
    for col in page_columns_text(pdf_path):
        if not in_answers and ANSWER_SECTION_MARK.search(col):
            # answers start inside this column; text before the first
            # "Option (x) is correct" line still belongs to questions
            in_answers = True
            lines = clean_lines(col)
            first = next((i for i, l in enumerate(lines) if ANSWER_START.match(l)), len(lines))
            q_lines += lines[:first]
            a_lines += lines[first:]
            continue
        (a_lines if in_answers else q_lines).extend(clean_lines(col))

    questions = parse_questions(q_lines)
    answers = parse_answers(a_lines)
    if not questions:
        raise ValueError("No questions found. Is this a text PDF in the usual two-column layout?")

    def fix(t):
        return re.sub(r"`\s*(?=\d)", "\u20b9", t)   # this font draws the rupee sign as `

    problems = []
    for q in questions:
        a = answers.get(q["id"])
        q["answer"] = a["answer"] if a else None
        q["explanation"] = a["explanation"] if a else ""
        q["question"] = fix(q["question"])
        q["options"] = [fix(o) for o in q["options"]]
        q["explanation"] = fix(q["explanation"])
        if a and a["bonus"]:
            q["bonus"] = True   # dropped question: everyone gets the marks
        issues = check_question(q)
        if issues:
            problems.append((q, issues))

    PAPERS_DIR.mkdir(parents=True, exist_ok=True)
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)

    paper = {
        "id": paper_id,
        "title": title,
        "year": year,
        "duration": duration,
        "marks": marks,
        "negative": negative,
        "free": False,
        "questions": questions,
    }
    out_file = PAPERS_DIR / f"{paper_id}.json"
    out_file.write_text(json.dumps(paper, indent=2, ensure_ascii=False), encoding="utf-8")

    review_file = REVIEW_DIR / f"{paper_id}_review.txt"
    with review_file.open("w", encoding="utf-8") as f:
        f.write(f"{title}: {len(problems)} question(s) to check by hand in {out_file.name}\n\n")
        for q, issues in problems:
            f.write(f"Q{q['id']}: {', '.join(issues)}\n{q['question']}\n")
            for letter, o in zip("abcd", q["options"]):
                f.write(f"   ({letter}) {o}\n")
            f.write(f"   answer: {q['answer']}\n\n")

    rebuild_index()
    log(f"Questions found : {len(questions)}")
    log(f"Answers found   : {len(answers)}")
    log(f"Need checking   : {len(problems)}  (see {review_file.relative_to(ROOT)})")
    log(f"Saved           : {out_file.relative_to(ROOT)}")
    return paper, problems, out_file


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", help="path to the paper PDF")
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--id", help="file id, default bpsc_<year>")
    ap.add_argument("--title", help='default "BPSC Prelims <year>"')
    ap.add_argument("--duration", type=int, default=120, help="minutes (default 120)")
    ap.add_argument("--marks", type=float, default=1, help="marks per correct answer")
    ap.add_argument("--negative", type=float, default=0, help="marks cut per wrong answer")
    args = ap.parse_args()

    if not Path(args.pdf).exists():
        sys.exit(f"File not found: {args.pdf}")
    try:
        convert(args.pdf, args.year, args.id, args.title, args.duration, args.marks, args.negative)
    except ValueError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
