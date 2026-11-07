// Firebase layer: login and cloud storage for progress and results.
//
// Firestore layout
//   users/{uid}                   { name, email, createdAt }
//   users/{uid}/progress/{paper}  in-progress test (answers, timer)
//   attempts/{attemptId}          submitted test, with uid, name, email
//   admins/{uid}                  exists = this user is an admin (create it in the console)

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updateProfile, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs,
  serverTimestamp, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { firebaseConfig, ALLOW_SIGNUP } from "./firebase-config.js";

export { ALLOW_SIGNUP };

export const configured = !String(firebaseConfig.apiKey || "").startsWith("PASTE");

const app = initializeApp(configured ? firebaseConfig : { apiKey: "x", projectId: "demo-bpsc", appId: "x" });
const auth = getAuth(app);
const db = getFirestore(app);

// Local testing with the Firebase emulator: open any page with ?emulator=1 once.
if (new URLSearchParams(location.search).has("emulator")) sessionStorage.setItem("bpsc_emulator", "1");
if (sessionStorage.getItem("bpsc_emulator") === "1" && ["localhost", "127.0.0.1"].includes(location.hostname)) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/* ---------------- auth ---------------- */

let cachedUser;
// Resolves with the logged-in user (with name and admin flag) or null.
export function currentUser() {
  if (cachedUser !== undefined) return Promise.resolve(cachedUser);
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, async (u) => {
      stop();
      cachedUser = u ? await buildUser(u) : null;
      resolve(cachedUser);
    });
  });
}

async function buildUser(u) {
  let isAdmin = false, name = u.displayName;
  try {
    const [a, p] = await Promise.all([getDoc(doc(db, "admins", u.uid)), getDoc(doc(db, "users", u.uid))]);
    isAdmin = a.exists();
    if (p.exists() && p.data().name) name = p.data().name;
  } catch (e) {
    console.warn("profile load failed", e);
  }
  return { uid: u.uid, email: u.email, name: name || u.email.split("@")[0], isAdmin };
}

// For protected pages: sends visitors to the login page.
// While redirecting it returns a promise that never resolves, so the page stops quietly.
export async function requireUser({ admin = false } = {}) {
  const stop = (to) => { location.replace(to); return new Promise(() => {}); };
  if (!configured) return stop("index.html");
  const u = await currentUser();
  if (!u) return stop("index.html");
  if (admin && !u.isAdmin) return stop("papers.html");
  return u;
}

export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signup(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, "users", cred.user.uid), {
    name, email: cred.user.email, createdAt: serverTimestamp(),
  });
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logout() {
  await signOut(auth);
  location.href = "index.html";
}

// Turn Firebase error codes into plain sentences.
export function friendlyError(e) {
  const code = (e && e.code) || "";
  const map = {
    "auth/invalid-credential": "Wrong email or password.",
    "auth/wrong-password": "Wrong email or password.",
    "auth/user-not-found": "No account with that email.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/email-already-in-use": "An account with this email already exists. Try logging in.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
    "auth/network-request-failed": "No internet connection.",
    "auth/unauthorized-domain": "This website isn't allowed in Firebase yet. Add it under Authentication > Settings > Authorized domains.",
    "auth/operation-not-allowed": "Email/password login isn't turned on in Firebase (Authentication > Sign-in method).",
    "permission-denied": "Permission denied. Check that the Firestore rules were published.",
  };
  return map[code] || (e && e.message) || "Something went wrong.";
}

/* ---------------- progress (in-progress tests) ---------------- */

const progressRef = (uid, paperId) => doc(db, "users", uid, "progress", paperId);

export async function loadProgress(uid, paperId) {
  const s = await getDoc(progressRef(uid, paperId));
  return s.exists() ? s.data() : null;
}

export async function saveProgress(uid, paperId, state) {
  await setDoc(progressRef(uid, paperId), { ...state, updatedAt: Date.now() });
}

export async function clearProgress(uid, paperId) {
  await deleteDoc(progressRef(uid, paperId));
}

export async function listProgress(uid) {
  const s = await getDocs(collection(db, "users", uid, "progress"));
  const out = {};
  s.forEach((d) => (out[d.id] = d.data()));
  return out;
}

/* ---------------- attempts (submitted tests) ---------------- */

export async function saveAttempt(attempt) {
  await setDoc(doc(db, "attempts", attempt.id), attempt);
}

export async function getAttempt(id) {
  const s = await getDoc(doc(db, "attempts", id));
  return s.exists() ? s.data() : null;
}

export async function myAttempts(uid) {
  const s = await getDocs(query(collection(db, "attempts"), where("uid", "==", uid)));
  return s.docs.map((d) => d.data()).sort((a, b) => b.submittedAt - a.submittedAt);
}

// Admin only (the security rules block everyone else)
export async function allAttempts() {
  const s = await getDocs(collection(db, "attempts"));
  return s.docs.map((d) => d.data()).sort((a, b) => b.submittedAt - a.submittedAt);
}

export async function allUsers() {
  const s = await getDocs(collection(db, "users"));
  return s.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function deleteAttempt(id) {
  await deleteDoc(doc(db, "attempts", id));
}
