"""
Make a login line for docs/js/config.js.

Usage:
    python tools/add_user.py ganesh "Ganesh Pandey"
It asks for the password (hidden) and prints a line to paste into USERS.
"""

import getpass
import hashlib
import json
import sys


def make_hash(username, password):
    # must match sha256Hex(username + ":" + password) in docs/js/common.js
    return hashlib.sha256(f"{username.lower()}:{password}".encode("utf-8")).hexdigest()


def main():
    if len(sys.argv) < 2:
        sys.exit('Usage: python tools/add_user.py <username> "<Full Name>"')
    username = sys.argv[1].strip().lower()
    name = sys.argv[2] if len(sys.argv) > 2 else username.title()
    pw = getpass.getpass("Password: ")
    if pw != getpass.getpass("Repeat password: "):
        sys.exit("Passwords do not match.")
    line = {"username": username, "name": name, "hash": make_hash(username, pw)}
    print("\nPaste this line into USERS in docs/js/config.js:\n")
    print("  " + json.dumps(line, ensure_ascii=False).replace('"username"', 'username')
          .replace('"name"', 'name').replace('"hash"', 'hash') + ",")


if __name__ == "__main__":
    main()
