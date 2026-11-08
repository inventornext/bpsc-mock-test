# BPSC Mock Test

A website for practising BPSC previous-year papers in real exam mode: login, timer, question palette, autosave and resume, then a scored result with every answer and explanation.

Python turns the PDFs into question files. The website is plain HTML/JS hosted free on GitHub Pages. Logins and results are stored in Firebase (free plan), so students can use any device and the admin page shows everyone's scores.

```
bpsc-mock-test/
├── docs/                  <- the website (GitHub Pages serves this folder)
│   ├── index.html         login
│   ├── papers.html        paper list + attempt history
│   ├── exam.html          exam screen
│   ├── result.html        score + answer review
│   ├── admin.html         all students' results, payment approvals (admins only)
│   ├── buy.html           unlock page (UPI QR / Razorpay link)
│   ├── css/style.css
│   ├── js/config.js       site name, price, UPI ID / Razorpay link  <- edit this
│   ├── js/firebase-config.js   your Firebase keys  <- edit this
│   ├── js/fb.js           login + database code
│   ├── js/common.js
│   ├── js/exam.js
├── tools/
│   ├── manager.py         Paper Manager (add, fix, publish papers in your browser)
│   ├── cloud.py           uploads papers to Firebase
│   ├── manager_ui/        Paper Manager page
│   ├── parse_pdf.py       PDF -> JSON (used by the manager, or run it directly)
│   └── serve.py           preview the site locally
├── pdfs/                  your PDFs (not uploaded to GitHub)
├── papers/                your papers as JSON (not uploaded to GitHub; Publish sends them to Firebase)
├── serviceAccount.json    your Firebase admin key (you add it; never uploaded)
├── review/                parser's list of questions to check by hand
├── firestore.rules        database security rules (paste into Firebase)
├── Paper Manager.bat      double-click to open the Paper Manager (Windows)
└── requirements.txt
```

## 1. Open in PyCharm

1. Unzip, then in PyCharm choose **File > Open** and select the `bpsc-mock-test` folder.
2. Set up a virtual environment when PyCharm asks (or under **Settings > Project > Python Interpreter > Add Interpreter > Virtualenv**).
3. In PyCharm's **Terminal** tab:
   ```
   pip install -r requirements.txt
   ```

## 2. Add papers with the Paper Manager

Double-click **`Paper Manager.bat`** in the project folder, or in PyCharm's terminal run:

```
python tools/manager.py
```

Your browser opens the Paper Manager at http://localhost:8000/manager/ . Keep the black terminal window open while you use it; close it (or press Ctrl+C) when done.

1. **Add a paper:** click **Browse for a PDF** (or drag one in). The year is filled in from the file name. Set the minutes and negative marking if needed, then click **Convert paper**.
2. **Check & edit:** it shows the questions that need checking in yellow (match-the-column tables, duplicate options, missing answers). Fix the text, tick the correct option, then tick **"I've checked this question"**. Press **Save paper** (or Ctrl+S).
3. **Preview:** the **Preview** button opens the paper on your local copy of the site (log in as usual).
4. **Publish:** type what changed and click **Publish**. It uploads changed papers to Firebase (live straight away), then pushes any website code changes to GitHub (`git add`, `commit`, `pull`, `push`).

You can also delete a paper (then Publish), or re-convert the same PDF. Re-converting replaces the paper and loses any edits you made to it, and the manager asks before doing that.

The PDF is copied into `pdfs/` and the paper is saved in `papers/`. Neither is uploaded to GitHub. Back up `papers/` somewhere safe: it holds your edits.

### Without the manager

```
python tools/parse_pdf.py pdfs/BPSC_Paper_1995.pdf --year 1995 --negative 0.33
```

Options: `--year` (required), `--title`, `--duration` (default 120), `--marks` (default 1), `--negative` (default 0), `--id` (default `bpsc_<year>`; use different ids for two papers from the same year). Questions to check are listed in `review/<id>_review.txt`.

The parser is tuned for the Oswaal "20 previous years solved papers" layout: two columns, questions first, then `12 Option (c) is correct.` with an explanation. PDFs from a different book or scanned PDFs (no selectable text) need changes to the patterns at the top of `parse_pdf.py`.

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

## Paid access (one-time payment, approved by you)

Papers live in Firebase, not on GitHub, so nobody can open a locked paper without paying.

- Tick **Free** in the Paper Manager for papers anyone can try after signing up.
- Every other paper is locked until you approve the student's payment.

### Set your price and payment method

Edit `docs/js/config.js`:

```js
const PAYMENT = {
  price: 99,
  upiId: "yourname@okaxis",     // your UPI ID (GPay/PhonePe/Paytm > profile)
  upiName: "BPSC Mock Test",
  razorpayLink: "",             // add later, e.g. "https://rzp.io/rzp/abc123"
  contact: "your@email.com",    // shown if a student needs help
};
```

UPI needs no account or KYC. Students scan the QR (or tap the button on their phone), pay, then type the **UPI transaction ID (UTR)** on the site.

To use Razorpay later: create an account, make a **Payment Page** or **Payment Link** for the price, and paste its URL into `razorpayLink`.

### Approving payments

1. Open **Admin**. New requests are at the top under **Payment requests**, with the reference the student typed.
2. Find that reference (UTR) and amount in your UPI app's history or bank SMS.
3. Click **Approve**. The student's papers unlock straight away (they may need to refresh). Click **Reject** if you can't find the payment.

You can also give or remove access for any student in the **Students** table.

### Connect the Paper Manager to Firebase (one time)

The Paper Manager uploads papers with a Firebase **service account key**. This key has full control of your Firebase project, so keep it private.

1. Firebase console: gear icon > **Project settings > Service accounts**.
2. Click **Generate new private key** > **Generate key**. A `.json` file downloads.
3. Rename it to `serviceAccount.json` and move it into the project folder (next to `README.md`).
4. Check `.gitignore` contains `serviceAccount.json` (it does by default). The Paper Manager refuses to push if it doesn't.

Never put this file in `docs/`, email it, or upload it anywhere.

## 4. Preview on your computer

While the Paper Manager is running, your site is at http://localhost:8000/ and shows your **local, unpublished** papers, so you can check edits before publishing. Or run `python tools/serve.py` on its own (that shows the published papers from Firebase). (Opening `docs/index.html` by double-clicking won't work, because browsers block that.)

## Where data is stored

| what | where |
|---|---|
| Accounts and passwords | Firebase Authentication (passwords are never visible, not even to you) |
| Student names | Firestore `users` |
| Test in progress | Firestore `users/<uid>/progress`, saved about every 15 seconds and when the tab is closed; also backed up in the browser in case the internet drops |
| Submitted tests | Firestore `attempts` |
| Who is admin | Firestore `admins` |
| Question papers | Firestore `papers` (free ones open to all logged-in users, the rest to paid students) |
| Paper list | Firestore `meta/papers` |
| Paid students | Firestore `access` (only admins can change it) |
| Payment requests | Firestore `payments` |
| Your local copies | `papers/` folder on your computer (back it up, e.g. to Google Drive) |

Free plan limits: 50,000 reads and 20,000 writes a day, 1 GB storage. One full test uses roughly 10 to 30 writes, so that's around 1,000 tests a day. If a limit is hit, the database pauses until the next day; you are never charged on the Spark plan.

Note: a logged-in student who can open a paper also receives its answer key in the background, so a determined student could find answers before submitting. That's normal for a practice site.

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
