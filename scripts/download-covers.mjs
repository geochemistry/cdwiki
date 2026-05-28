// Download CD covers via MusicBrainz + Cover Art Archive (using local proxy)
// Usage: node scripts/download-covers.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'src/data/recordings.json');
const COVERS_DIR = path.join(ROOT, 'public/covers');

const UA = 'CDWiki/1.0 (https://github.com/cdwiki)';
const PROXY = 'http://127.0.0.1:7890';
const agent = new ProxyAgent(PROXY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.mkdirSync(COVERS_DIR, { recursive: true });

const recordings = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

async function fetchJSON(url) {
  const res = await undiciFetch(url, {
    dispatcher: agent,
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

async function searchMB(performer, year) {
  // Use more specific search: quoted title + artist filter
  const performerQ = performer.replace(/\s+/g, '+');
  const url = `https://musicbrainz.org/ws/2/release/?query=%22goldberg+variations%22+AND+artist:${encodeURIComponent(performerQ)}&fmt=json&limit=10`;
  const data = await fetchJSON(url);
  if (!data) return null;
  const releases = data.releases || [];
  if (releases.length === 0) {
    // Fallback: broader search
    const url2 = `https://musicbrainz.org/ws/2/release/?query=goldberg+variations+${encodeURIComponent(performerQ)}&fmt=json&limit=10`;
    const data2 = await fetchJSON(url2);
    if (!data2) return null;
    const releases2 = data2.releases || [];
    return findBestMatch(releases2, performer, year);
  }
  return findBestMatch(releases, performer, year);
}

function findBestMatch(releases, performer, year) {
  const pLower = performer.toLowerCase();
  // Prefer: exact name match + year match
  for (const r of releases) {
    const artists = (r['artist-credit'] || []).map(c => c.name.toLowerCase());
    const yearMatch = r.date?.startsWith(String(year));
    const nameMatch = artists.some(a => pLower.includes(a) || a.includes(pLower));
    if (nameMatch && yearMatch) return r.id;
  }
  // Then: name match only
  for (const r of releases) {
    const artists = (r['artist-credit'] || []).map(c => c.name.toLowerCase());
    const nameMatch = artists.some(a => pLower.includes(a) || a.includes(pLower));
    if (nameMatch) return r.id;
  }
  return releases[0]?.id || null;
}

async function downloadCover(mbid, destFile) {
  const url = `https://coverartarchive.org/release/${mbid}/front-500`;
  try {
    const res = await undiciFetch(url, {
      dispatcher: agent,
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('image')) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return false;
    fs.writeFileSync(destFile, buf);
    return true;
  } catch (e) {
    console.error(`    Error: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('=== Downloading CD covers (via proxy) ===\n');
  let downloaded = 0, skipped = 0, failed = 0;

  for (const rec of recordings) {
    const dest = path.join(COVERS_DIR, `${rec.id}.jpg`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`  SKIP ${rec.id}`);
      skipped++;
      continue;
    }

    process.stdout.write(`  ${rec.performer} (${rec.year})... `);

    const mbid = await searchMB(rec.performer, rec.year);
    if (!mbid) {
      console.log('NOT FOUND');
      failed++;
      await sleep(1200);
      continue;
    }

    await sleep(1100); // MusicBrainz rate limit

    const ok = await downloadCover(mbid, dest);
    if (ok) {
      console.log(`OK (${mbid})`);
      downloaded++;
    } else {
      console.log(`NO COVER (mbid: ${mbid})`);
      failed++;
    }
    await sleep(500);
  }

  console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
}

main().catch(console.error);
