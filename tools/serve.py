"""
Preview the website on your computer before pushing to GitHub.

    python tools/serve.py

Then open http://localhost:8000 in your browser. Press Ctrl+C to stop.
"""

import functools
import http.server
import webbrowser
from pathlib import Path

PORT = 8000
DOCS = Path(__file__).resolve().parent.parent / "docs"

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DOCS))

if __name__ == "__main__":
    url = f"http://localhost:{PORT}"
    print(f"Serving {DOCS} at {url}  (Ctrl+C to stop)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()
