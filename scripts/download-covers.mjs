// Download CD covers by searching MusicBrainz and fetching from Cover Art Archive
// Usage: node scripts/download-covers.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'src/data/recordings.json');
const COVERS_DIR = path.join(ROOT, 'public/covers');

const UA = 'CDWiki/1.0 (https://github.com/cdwiki)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.mkdirSync(COVERS_DIR, { recursive: true });

const recordings = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

async function searchMB(performer, year) {
  const q = encodeURIComponent(`goldberg variations ${performer}`);
  const url = `https://musicbrainz.org/ws/2/release/?query=${q}&fmt=json&limit=10`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const data = await res.json();
  const releases = data.releases || [];

  // Find best match: prefer exact performer name match and close year
  const performerLower = performer.toLowerCase();
  for (const r of releases) {
    const artists = (r['artist-credit'] || []).map(c => c.name.toLowerCase());
    const yearMatch = r.date?.startsWith(String(year));
    const nameMatch = artists.some(a => performerLower.includes(a) || a.includes(performerLower));
    if (nameMatch || yearMatch) return r.id;
  }
  return releases[0]?.id || null;
}

async function downloadCover(mbid, destFile) {
  const url = `https://coverartarchive.org/release/${mbid}/front-500`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('image')) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return false; // too small, probably error
    fs.writeFileSync(destFile, buf);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const rec of recordings) {
    const dest = path.join(COVERS_DIR, `${rec.id}.jpg`);
    if (fs.existsSync(dest)) {
      const stat = fs.statSync(dest);
      if (stat.size > 1000) {
        console.log(`  SKIP ${rec.id} (exists)`);
        skipped++;
        continue;
      }
    }

    process.stdout.write(`  ${rec.performer} (${rec.year})... `);

    const mbid = await searchMB(rec.performer, rec.year);
    if (!mbid) {
      console.log('NOT FOUND');
      failed++;
      await sleep(1200);
      continue;
    }

    await sleep(1200); // rate limit

    const ok = await downloadCover(mbid, dest);
    if (ok) {
      console.log(`OK (${mbid})`);
      downloaded++;
    } else {
      console.log('NO COVER');
      failed++;
    }
    await sleep(500);
  }

  console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
}

main().catch(console.error);
