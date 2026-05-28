#!/bin/bash
# Download CD covers from Cover Art Archive
# Run this script when you have good network connectivity
# Usage: bash scripts/download-covers.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_FILE="$SCRIPT_DIR/../src/data/recordings.json"
COVERS_DIR="$SCRIPT_DIR/../public/covers"

mkdir -p "$COVERS_DIR"

echo "=== Goldberg Variations CD Cover Downloader ==="
echo ""
echo "This script searches MusicBrainz for each recording and downloads"
echo "the cover art from Cover Art Archive."
echo ""
echo "NOTE: MusicBrainz rate limits to 1 request/second. For 25 recordings,"
echo "this will take about 2-3 minutes."
echo ""

# Extract recording data and search MusicBrainz
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$DATA_FILE', 'utf-8'));
data.forEach(r => {
  console.log(JSON.stringify({id: r.id, performer: r.performer, year: r.year}));
});
" | while IFS= read -r line; do
  id=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  performer=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['performer'])")
  year=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['year'])")
  dest="$COVERS_DIR/${id}.jpg"

  if [ -f "$dest" ]; then
    echo "SKIP: $id (already exists)"
    continue
  fi

  echo -n "Searching: $performer ($year)... "

  # Search MusicBrainz
  query=$(echo "goldberg variations $performer" | sed 's/ /+/g')
  result=$(curl -s -A "CDWiki/1.0" \
    "https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json&limit=5" 2>/dev/null || echo '{}')

  mbid=$(echo "$result" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for r in data.get('releases', []):
    artists = [c['name'] for c in r.get('artist-credit', [])]
    for a in artists:
        if '$performer'.lower() in a.lower() or a.lower() in '$performer'.lower():
            print(r['id'])
            sys.exit(0)
# Fallback: take first result
releases = data.get('releases', [])
if releases:
    print(releases[0]['id'])
" 2>/dev/null || echo "")

  if [ -z "$mbid" ]; then
    echo "NOT FOUND"
    sleep 1
    continue
  fi

  # Download cover art
  http_code=$(curl -s -o "$dest" -w "%{http_code}" \
    "https://coverartarchive.org/release/${mbid}/front-500" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ]; then
    echo "OK ($mbid)"
  else
    rm -f "$dest"
    echo "NO COVER ($http_code)"
  fi

  sleep 1
done

echo ""
echo "Done! Check $COVERS_DIR for downloaded covers."
