#!/usr/bin/env python3
"""Download CD covers from MusicBrainz + Cover Art Archive via proxy."""

import json
import os
import sys
import time
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, "src/data/recordings.json")
COVERS_DIR = os.path.join(ROOT, "public/covers")

PROXY = {"http": "http://127.0.0.1:7890", "https": "http://127.0.0.1:7890"}
HEADERS = {"User-Agent": "CDWiki/1.0 (https://github.com/cdwiki)"}

os.makedirs(COVERS_DIR, exist_ok=True)

with open(DATA_FILE, "r", encoding="utf-8") as f:
    recordings = json.load(f)


def search_musicbrainz(performer, year):
    """Search MusicBrainz for a release matching performer and year."""
    queries = [
        f'"goldberg variations" AND artist:{performer}',
        f"goldberg variations {performer}",
    ]
    for q in queries:
        try:
            resp = requests.get(
                "https://musicbrainz.org/ws/2/release/",
                params={"query": q, "fmt": "json", "limit": 10},
                headers=HEADERS,
                proxies=PROXY,
                timeout=15,
            )
            if resp.status_code != 200:
                continue
            releases = resp.json().get("releases", [])
            mbid = find_best_match(releases, performer, year)
            if mbid:
                return mbid
        except Exception as e:
            print(f"    (search error: {e})", end="")
        time.sleep(1.1)
    return None


def find_best_match(releases, performer, year):
    """Pick the best matching release from MusicBrainz results."""
    pl = performer.lower()
    # Priority 1: artist name + year match
    for r in releases:
        artists = [c["name"].lower() for c in r.get("artist-credit", [])]
        ym = r.get("date", "").startswith(str(year))
        nm = any(pl in a or a in pl for a in artists)
        if nm and ym:
            return r["id"]
    # Priority 2: artist name match
    for r in releases:
        artists = [c["name"].lower() for c in r.get("artist-credit", [])]
        if any(pl in a or a in pl for a in artists):
            return r["id"]
    # Priority 3: year match
    for r in releases:
        if r.get("date", "").startswith(str(year)):
            return r["id"]
    return releases[0]["id"] if releases else None


def download_cover(mbid, dest):
    """Download front cover from Cover Art Archive."""
    url = f"https://coverartarchive.org/release/{mbid}/front-500"
    try:
        resp = requests.get(
            url, headers=HEADERS, proxies=PROXY, timeout=20, allow_redirects=True
        )
        if resp.status_code != 200:
            return False
        ct = resp.headers.get("content-type", "")
        if "image" not in ct:
            return False
        if len(resp.content) < 1000:
            return False
        with open(dest, "wb") as f:
            f.write(resp.content)
        return True
    except Exception as e:
        print(f"    (download error: {e})", end="")
        return False


def main():
    print("=== Downloading CD covers (via proxy) ===\n")
    downloaded = skipped = failed = 0

    for rec in recordings:
        dest = os.path.join(COVERS_DIR, f"{rec['id']}.jpg")
        if os.path.exists(dest) and os.path.getsize(dest) > 1000:
            print(f"  SKIP {rec['id']}")
            skipped += 1
            continue

        print(f"  {rec['performer']} ({rec['year']})... ", end="", flush=True)

        mbid = search_musicbrainz(rec["performer"], rec["year"])
        if not mbid:
            print("NOT FOUND")
            failed += 1
            time.sleep(1.1)
            continue

        time.sleep(1.1)  # MusicBrainz rate limit

        ok = download_cover(mbid, dest)
        if ok:
            print(f"OK ({mbid})")
            downloaded += 1
        else:
            print("NO COVER")
            failed += 1
        time.sleep(0.3)

    print(f"\nDone: {downloaded} downloaded, {skipped} skipped, {failed} failed")


if __name__ == "__main__":
    main()
