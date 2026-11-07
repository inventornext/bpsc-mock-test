# BPSC Mock Test

A website for practising BPSC previous-year papers in real exam mode: login, timer, question palette, autosave and resume, then a scored result with every answer and explanation.

Python turns the PDFs into question files, and the website is plain HTML/JS hosted free on GitHub Pages.

```
bpsc-mock-test/
├── docs/                  <- the website (GitHub Pages serves this folder)
│   ├── index.html         login
│   ├── papers.html        paper list + attempt history
│   ├── exam.html          exam screen
│   ├── result.html        score + answer review
│   ├── css/style.css
│   ├── js/config.js       site name and users  <- edit this
│   ├── js/common.js
│   ├── js/exam.js
│   └── data/
│       ├── papers.json    list of papers (built automatically)
│       └── papers/        one JSON per paper
├── tools/
│   ├── parse_pdf.py       PDF -> JSON
│   ├── add_user.py        makes a login line for config.js
│   └── serve.py           preview the site locally
├── pdfs/                  put your PDFs here (not uploaded to GitHub)
├── review/                parser's list of questions to check by hand
└── requirements.txt
```

## 1. Open in PyCharm

1. Unzip, then in PyCharm choose **File > Open** and select the `bpsc-mock-test` folder.
2. Set up a virtual environment when PyCharm asks (or under **Settings > Project > Python Interpreter > Add Interpreter > Virtualenv**).
3. In PyCharm's **Terminal** tab:
   ```
   pip install -r requirements.txt
   ```

## 2. Add a paper

Put the PDF in `pdfs/` and run:

```
python tools/parse_pdf.py pdfs/BPSC_Paper_1995.pdf --year 1995
```

Options:

| option | default | meaning |
|---|---|---|
| `--year` | required | paper year |
| `--title` | `BPSC Prelims <year>` | name shown on the site |
| `--duration` | `120` | minutes |
| `--marks` | `1` | marks per correct answer |
| `--negative` | `0` | marks cut per wrong answer (e.g. `0.33`) |
| `--id` | `bpsc_<year>` | file name; use different ids for two papers from the same year |

It prints how many questions and answers it found, writes `docs/data/papers/bpsc_1995.json`, and rebuilds the paper list.

### Check the review file

`review/bpsc_1995_review.txt` lists questions the parser was unsure about (match-the-column tables, missing options, missing answers). Open the JSON in PyCharm, press **Ctrl+F**, search for `"id": 8,` and fix the text by hand. Each question looks like this:

```json
{
  "id": 1,
  "question": "Select the first ruler of Vijaynagar who captured Goa from Bahmani?",
  "options": ["Harihar", "Harihar II", "Bukka", "Devraya II"],
  "answer": "b",
  "explanation": "Harihara-II was the first ruler ..."
}
```

- `\n` inside `question` starts a new line (used for lists and tables).
- Dropped/bonus questions have `"answer": null, "bonus": true`, and everyone gets the marks.
- Re-running `parse_pdf.py` on the same paper **overwrites your hand fixes**, so fix the JSON only after you're happy with the parse.

The parser is tuned for the Oswaal "20 previous years solved papers" layout: two columns, questions first, then `12 Option (c) is correct.` with an explanation. PDFs from a different book or a scanned PDF (no selectable text) will need changes to the patterns at the top of `parse_pdf.py`.

## 3. Preview on your computer

```
python tools/serve.py
```

Your browser opens at http://localhost:8000. Default login: **student / bpsc@123**.

(Opening `docs/index.html` directly by double-clicking won't load the papers, because browsers block that. Always use `serve.py`.)

## 4. Users and passwords

```
python tools/add_user.py ganesh "Ganesh Pandey"
```

Type a password, then paste the printed line into `USERS` in `docs/js/config.js`. Delete the default `student` line before going live.

**Be aware:** on a static site, login only keeps casual visitors out. Anyone who opens the page source can bypass it, and the paper JSON files can be downloaded directly. Results are saved in each user's own browser, so they don't follow you to another device.

## 5. Put it on GitHub Pages

1. Create a new repository on GitHub, e.g. `bpsc-mock-test`.
2. In PyCharm: **VCS > Enable Version Control Integration > Git**, then **Git > Commit** (tick all files), then **Git > Push** and add your GitHub repo as the remote. Or in the terminal:
   ```
   git init
   git add .
   git commit -m "BPSC mock test site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/bpsc-mock-test.git
   git push -u origin main
   ```
3. On GitHub: **Settings > Pages > Build and deployment > Source: Deploy from a branch**, Branch: `main`, Folder: `/docs`, then **Save**.
4. After about a minute the site is live at `https://<your-username>.github.io/bpsc-mock-test/`.

To add more papers later: run `parse_pdf.py`, fix the review items, then commit and push. The site updates in about a minute.

**Copyright:** a GitHub Pages site is public even when you don't share the link, and the explanations in these PDFs belong to the publisher. For personal practice this is low risk, but if you plan to share the site widely, write your own explanations or keep only the questions and answer keys (official BPSC papers).

## Exam features

- Timer that keeps running if you close the tab, and auto-submits at zero
- Answers save instantly in the browser; reopening resumes where you left off
- Palette colours: not visited, not answered, answered, marked for review, answered + marked
- Keyboard: A-D or 1-4 to choose, arrow keys to move, M to mark
- Results: score, accuracy, time taken, filters (correct / wrong / not answered / marked), explanations
- Attempt history and best score per paper
- Works on phones (palette opens from the menu button)
