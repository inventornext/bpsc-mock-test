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

const Auth = {
  KEY: "bpsc_session",
  current() { return Store.get(this.KEY); },
  async login(username, password) {
    username = username.trim().toLowerCase();
    const hash = await sha256Hex(`${username}:${password}`);
    const u = USERS.find((x) => x.username.toLowerCase() === username && x.hash === hash);
    if (!u) return null;
    const session = { username: u.username, name: u.name, at: Date.now() };
    Store.set(this.KEY, session);
    return session;
  },
  logout() { Store.remove(this.KEY); location.href = "index.html"; },
  // call at top of protected pages
  require() {
    const s = this.current();
    if (!s) { location.replace("index.html"); throw new Error("not logged in"); }
    return s;
  },
};

// keys are per user so two people on one computer don't mix results
const Keys = {
  progress: (user, paperId) => `bpsc_progress_${user}_${paperId}`,
  attempts: (user) => `bpsc_attempts_${user}`,
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

function renderTopbar(session) {
  const el = document.getElementById("topbar");
  if (!el) return;
  el.innerHTML = `
    <a class="brand" href="papers.html"><span class="brand-badge">${esc(SITE.short)}</span><span class="full">${esc(SITE.name)}</span></a>
    <div class="user">
      <span>${esc(session.name)}</span>
      <button class="btn btn-ghost" id="logoutBtn">Log out</button>
    </div>`;
  document.getElementById("logoutBtn").onclick = () => Auth.logout();
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

// SHA-256 as hex. Uses the browser's crypto when available,
// with a small fallback for pages opened as file:// on some browsers.
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256Fallback(data);
}

function sha256Fallback(bytes) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const l = bytes.length, bitLen = l * 8;
  const padLen = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(padLen);
  m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(padLen - 4, bitLen >>> 0); dv.setUint32(padLen - 8, Math.floor(bitLen / 2 ** 32));
  const W = new Uint32Array(64);
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = r(W[i-15], 7) ^ r(W[i-15], 18) ^ (W[i-15] >>> 3);
      const s1 = r(W[i-2], 17) ^ r(W[i-2], 19) ^ (W[i-2] >>> 10);
      W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H = H.map((v, i) => (v + [a, b, c, d, e, f, g, h][i]) >>> 0);
  }
  return H.map((v) => v.toString(16).padStart(8, "0")).join("");
}
