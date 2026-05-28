// Fetch Goldberg Variations recordings from MusicBrainz and download cover art
// Usage: node scripts/fetch-data.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'src/data/recordings.json');
const COVERS_DIR = path.join(ROOT, 'public/covers');

const USER_AGENT = 'CDWiki/1.0 (https://github.com/cdwiki)';
const MB_BASE = 'https://musicbrainz.org/ws/2';
const CAA_BASE = 'https://coverartarchive.org/release';

// Rate limit: 1 request per second for MusicBrainz
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function searchReleases(offset = 0, limit = 100) {
  const url = `${MB_BASE}/release/?query=goldberg+variations+bach&fmt=json&limit=${limit}&offset=${offset}`;
  return fetchJSON(url);
}

function extractPerformer(release) {
  const credits = release['artist-credit'] || [];
  // Filter out Bach himself
  const performers = credits
    .filter(c => {
      const id = c.artist?.id;
      return id !== '24f1766e-9635-4d58-a4d4-9413f9f98a4c'; // Bach's MBID
    })
    .map(c => c.name || c.artist?.name)
    .filter(Boolean);

  return performers.join(', ') || 'Unknown';
}

function extractYear(release) {
  const date = release.date || release['release-events']?.[0]?.date;
  if (!date) return null;
  const match = date.match(/^(\d{4})/);
  return match ? parseInt(match[1]) : null;
}

function extractLabel(release) {
  const labelInfo = release['label-info'] || [];
  if (labelInfo.length === 0) return 'Unknown';
  return labelInfo[0].label?.name || 'Unknown';
}

function extractCatalogNumber(release) {
  const labelInfo = release['label-info'] || [];
  return labelInfo[0]['catalog-number'] || '';
}

function extractFormat(release) {
  const media = release.media || [];
  if (media.length === 0) return 'Unknown';
  return media.map(m => m.format).filter(Boolean).join(' / ') || 'Unknown';
}

function extractCountry(release) {
  return release.country || release['release-events']?.[0]?.area?.name || '';
}

function makeId(performer, year) {
  return performer
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + (year ? `-${year}` : '');
}

async function downloadCover(mbid, id) {
  const destPath = path.join(COVERS_DIR, `${id}.jpg`);
  if (fs.existsSync(destPath)) return true;

  try {
    const res = await fetch(`${CAA_BASE}/${mbid}/front-500`, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    if (!res.ok) return false;

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`  Downloaded cover: ${id}.jpg`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('Fetching Goldberg Variations recordings from MusicBrainz...\n');

  // Load existing data
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {}
  const existingIds = new Set(existing.map(r => r.id));

  // Fetch all pages
  let allReleases = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    console.log(`Fetching page at offset ${offset}...`);
    const data = await searchReleases(offset, pageSize);
    const releases = data.releases || [];
    allReleases.push(...releases);
    console.log(`  Got ${releases.length} releases (total: ${allReleases.length} / ${data.count})`);

    if (releases.length < pageSize || allReleases.length >= 500) break;
    offset += pageSize;
    await sleep(1100); // Rate limit
  }

  console.log(`\nTotal releases found: ${allReleases.length}`);

  // Filter and process
  // Only keep official releases with keyboard instrument media
  const seen = new Set();
  const newRecordings = [];

  for (const release of allReleases) {
    if (release.status !== 'Official') continue;

    const performer = extractPerformer(release);
    const year = extractYear(release);
    if (!year) continue;

    const id = makeId(performer, year);
    if (seen.has(id) || existingIds.has(id)) continue;
    seen.add(id);

    const recording = {
      id,
      performer,
      year,
      label: extractLabel(release),
      catalogNumber: extractCatalogNumber(release),
      format: extractFormat(release),
      instrument: 'Piano', // Default, manual review needed
      country: extractCountry(release),
      notes: '',
      coverUrl: `/covers/${id}.jpg`,
      isLandmark: false,
      musicbrainzId: release.id,
    };

    newRecordings.push(recording);
  }

  console.log(`\nNew unique recordings: ${newRecordings.length}`);

  // Download covers for new recordings (top 50 to avoid rate limits)
  console.log('\nDownloading cover art...');
  let coversDownloaded = 0;
  for (const rec of newRecordings.slice(0, 50)) {
    if (rec.musicbrainzId) {
      const got = await downloadCover(rec.musicbrainzId, rec.id);
      if (got) coversDownloaded++;
      await sleep(500);
    }
  }
  console.log(`Downloaded ${coversDownloaded} covers.`);

  // Merge and save
  const merged = [...existing, ...newRecordings].sort((a, b) => a.year - b.year);
  fs.writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nSaved ${merged.length} total recordings to ${DATA_FILE}`);
}

main().catch(console.error);
