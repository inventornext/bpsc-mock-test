# BPSC Mock Test

A website for practising BPSC previous-year papers in real exam mode: login, timer, question palette, autosave and resume, then a scored result with every answer and explanation.
https://inventornext.github.io/bpsc-mock-test/papers.html
Python turns the PDFs into question files. The website is plain HTML/JS hosted free on GitHub Pages. Logins and results are stored in Firebase (free plan), so students can use any device and the admin page shows everyone's scores.

```
bpsc-mock-test/
├── docs/                  <- the website (GitHub Pages serves this folder)
│   ├── index.html         login
│   ├── papers.html        paper list + attempt history
│   ├── exam.html          exam screen
│   ├── result.html        score + answer review
│   ├── admin.html         all students' results (admins only)
│   ├── css/style.css
│   ├── js/config.js       site name
│   ├── js/firebase-config.js   your Firebase keys  <- edit this
│   ├── js/fb.js           login + database code
│   ├── js/common.js
│   ├── js/exam.js
│   └── data/
│       ├── papers.json    list of papers (built automatically)
│       └── papers/        one JSON per paper
├── tools/
│   ├── parse_pdf.py       PDF -> JSON
│   └── serve.py           preview the site locally
├── pdfs/                  put your PDFs here (not uploaded to GitHub)
├── review/                parser's list of questions to check by hand
├── firestore.rules        database security rules (paste into Firebase)
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

## 3. Set up Firebase (one time, about 10 minutes)

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. **Create a project** (name it e.g. `bpsc-mock-test`). Google Analytics is not needed, turn it off. Stay on the free **Spark** plan.
3. **Turn on login:** left menu **Build > Authentication > Get started > Sign-in method > Email/Password > Enable > Save**.
4. **Allow your website:** still in Authentication, open **Settings > Authorized domains > Add domain** and add `inventornext.github.io` (`localhost` is already there).
5. **Create the database:** **Build > Firestore Database > Create database**. Pick location `asia-south1 (Mumbai)`, choose **Start in production mode**, then **Create**.
6. **Security rules:** in Firestore open the **Rules** tab, delete everything, paste the whole contents of `firestore.rules` from this project, click **Publish**.
7. **Get your keys:** click the gear icon > **Project settings > General**. Under "Your apps" click the **</>** (Web) icon, give it a nickname, don't tick Hosting, click **Register app**. Copy the values from the `firebaseConfig` it shows into `docs/js/firebase-config.js`, replacing the `PASTE_...` text.

These keys are meant to be public. The security rules are what protect the data: students can only read and write their own progress and results, and only admins can see everyone's.

### Make yourself admin

1. Open the site and **Sign up** with your own email.
2. In Firebase: **Authentication > Users**, copy your **User UID**.
3. **Firestore Database > Data > + Start collection**. Collection ID: `admins`. Document ID: paste your UID. Add any field, e.g. `name` = `Ganesh`. **Save**.
4. Log out and back in. An **Admin** link appears in the top bar.

Do the same to add another admin. To stop public sign-ups, set `ALLOW_SIGNUP = false` in `firebase-config.js` and add students yourself under **Authentication > Users > Add user**.

## 4. Preview on your computer

```
python tools/serve.py
```

Your browser opens at http://localhost:8000. (Opening `docs/index.html` by double-clicking won't work, because browsers block that. Always use `serve.py`.)

## Where data is stored

| what | where |
|---|---|
| Accounts and passwords | Firebase Authentication (passwords are never visible, not even to you) |
| Student names | Firestore `users` |
| Test in progress | Firestore `users/<uid>/progress`, saved about every 15 seconds and when the tab is closed; also backed up in the browser in case the internet drops |
| Submitted tests | Firestore `attempts` |
| Who is admin | Firestore `admins` |
| Question papers | `docs/data/papers/*.json` in this repo (public) |

Free plan limits: 50,000 reads and 20,000 writes a day, 1 GB storage. One full test uses roughly 10 to 30 writes, so that's around 1,000 tests a day. If a limit is hit, the database pauses until the next day; you are never charged on the Spark plan.

Note: the answer keys are inside the public paper JSON files, so a determined student could look them up. That's normal for a practice site.

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

- Email login with sign up and forgot password
- Timer that keeps running if you close the tab, and auto-submits at zero
- Answers save online; log in on another device to resume
- Admin page: every student, best and average score, all attempts, search, CSV download
- Palette colours: not visited, not answered, answered, marked for review, answered + marked
- Keyboard: A-D or 1-4 to choose, arrow keys to move, M to mark
- Results: score, accuracy, time taken, filters (correct / wrong / not answered / marked), explanations
- Attempt history and best score per paper, on any device
- Works on phones (palette opens from the menu button)
