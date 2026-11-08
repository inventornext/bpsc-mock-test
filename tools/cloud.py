"""
Upload papers from papers/ to Firestore, using a Firebase service account.

The service account key (serviceAccount.json in the project folder) gives full
access to your Firebase project. It stays on your computer: .gitignore keeps it
out of GitHub. Never share it or put it in docs/.
"""

import hashlib
import json
from pathlib import Path

import parse_pdf as P

SERVICE_ACCOUNT = P.ROOT / "serviceAccount.json"
SYNC_FILE = P.PAPERS_DIR / ".synced.json"   # what was last uploaded (id -> file hash)

_db = None


def available():
    return SERVICE_ACCOUNT.exists()


def db():
    global _db
    if _db is None:
        import firebase_admin
        from firebase_admin import credentials, firestore
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(str(SERVICE_ACCOUNT)))
        _db = firestore.client()
    return _db


def project_id():
    try:
        return json.loads(SERVICE_ACCOUNT.read_text(encoding="utf-8")).get("project_id")
    except Exception:
        return None


def _hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_sync():
    try:
        return json.loads(SYNC_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def pending():
    """Which papers changed since the last upload."""
    synced = _load_sync()
    local = {f.stem: _hash(f) for f in P.paper_files()}
    upload = sorted(pid for pid, h in local.items() if synced.get(pid) != h)
    delete = sorted(pid for pid in synced if pid not in local)
    return {"upload": upload, "delete": delete, "never_synced": not SYNC_FILE.exists()}


def sync(log=print):
    """Upload changed papers, remove deleted ones, refresh the paper list."""
    todo = pending()
    if not (todo["upload"] or todo["delete"] or todo["never_synced"]):
        log("Firebase: papers already up to date.")
        return 0
    client = db()
    synced = _load_sync()

    for pid in todo["upload"]:
        path = P.PAPERS_DIR / f"{pid}.json"
        paper = json.loads(path.read_text(encoding="utf-8"))
        for q in paper["questions"]:
            q.pop("checked", None)          # editor-only flag
        paper["free"] = bool(paper.get("free", False))
        client.collection("papers").document(pid).set(paper)
        synced[pid] = _hash(path)
        log(f"Firebase: uploaded {pid} ({len(paper['questions'])} questions{', free' if paper['free'] else ''})")

    for pid in todo["delete"]:
        client.collection("papers").document(pid).delete()
        synced.pop(pid, None)
        log(f"Firebase: removed {pid}")

    index = P.rebuild_index()
    client.collection("meta").document("papers").set({"list": index})
    log(f"Firebase: paper list updated ({len(index)} papers)")

    SYNC_FILE.write_text(json.dumps(synced, indent=2), encoding="utf-8")
    return len(todo["upload"]) + len(todo["delete"])
