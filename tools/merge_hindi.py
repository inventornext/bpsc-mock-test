"""Merge a Hindi translation into an English paper, so one test gets a Hindi/English switch.

Usage (from the project folder):
    python tools/merge_hindi.py papers/bihar_history_mock_2.json path/to/bihar_history_mock_2_hi.json

The Hindi file must have the same questions in the same order, with the options in the
same order as the English file (so answer letters match). The script checks this, then adds
question_hi / options_hi / explanation_hi / passage_hi to each English question.
Keep the Hindi file OUTSIDE papers/, or it will show up as a separate test.
"""
import json
import sys
from pathlib import Path


def main(en_path, hi_path):
    en_path, hi_path = Path(en_path), Path(hi_path)
    en = json.loads(en_path.read_text(encoding="utf-8"))
    hi = json.loads(hi_path.read_text(encoding="utf-8"))
    eq, hq = en["questions"], hi["questions"]
    if len(eq) != len(hq):
        sys.exit(f"Question counts differ: English {len(eq)}, Hindi {len(hq)}")
    problems = []
    for n, (e, h) in enumerate(zip(eq, hq), 1):
        if e.get("answer") != h.get("answer"):
            problems.append(f"Q{n}: answer {e.get('answer')} (English) vs {h.get('answer')} (Hindi)")
        if len(e.get("options", [])) != len(h.get("options", [])):
            problems.append(f"Q{n}: {len(e['options'])} English options vs {len(h['options'])} Hindi options")
    if problems:
        sys.exit("Not merged, fix these first (options must be in the same order):\n" + "\n".join(problems))
    for e, h in zip(eq, hq):
        e["question_hi"] = h["question"]
        e["options_hi"] = h["options"]
        if h.get("explanation"):
            e["explanation_hi"] = h["explanation"]
        if h.get("passage"):
            e["passage_hi"] = h["passage"]
    en_path.write_text(json.dumps(en, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Merged Hindi into {en_path.name} ({len(eq)} questions). Now publish from the Paper Manager.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
