#!/usr/bin/env node
'use strict';

// Hilfsskript zum Befüllen von data/leitung-links.json.
// Sucht Personen und Gruppen in ChurchTools per Namensfragment und gibt Kandidaten mit ID aus.
// Aufruf: CHURCHTOOLS_TOKEN=... node scripts/lookup-churchtools-ids.js "Johannes"

const BASE_URL = 'https://gemeindekonkordia.church.tools';
const API_BASE = `${BASE_URL}/api`;
const TOKEN = process.env.CHURCHTOOLS_TOKEN;

if (!TOKEN) {
  console.error('Fehler: CHURCHTOOLS_TOKEN ist nicht gesetzt.');
  process.exit(1);
}

const query = process.argv[2];
if (!query) {
  console.error('Aufruf: node scripts/lookup-churchtools-ids.js "<Suchbegriff>"');
  process.exit(1);
}

async function apiGet(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Login ${TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${url}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function getAllPages(endpoint, params = {}) {
  const results = [];
  let page = 1;
  while (true) {
    const data = await apiGet(endpoint, { ...params, page, limit: 100 });
    const items = data.data ?? data;
    if (!Array.isArray(items) || items.length === 0) break;
    results.push(...items);
    const meta = data.meta?.pagination;
    if (!meta || page >= meta.lastPage) break;
    page++;
  }
  return results;
}

function normalize(str) {
  return (str || '').toLowerCase();
}

async function main() {
  const needle = normalize(query);

  console.log(`Suche Personen mit "${query}" …`);
  const persons = await getAllPages('/persons');
  const personMatches = persons.filter(p => {
    const full = `${p.firstName ?? ''} ${p.lastName ?? ''}`;
    return normalize(full).includes(needle);
  });
  if (personMatches.length === 0) {
    console.log('  keine Treffer');
  } else {
    personMatches.forEach(p => {
      console.log(`  person id=${p.id}  ${p.firstName ?? ''} ${p.lastName ?? ''}  -> ${BASE_URL}/person/${p.id}`);
    });
  }

  console.log(`\nSuche Gruppen mit "${query}" …`);
  const groups = await getAllPages('/groups');
  const groupMatches = groups.filter(g => normalize(g.name).includes(needle));
  if (groupMatches.length === 0) {
    console.log('  keine Treffer');
  } else {
    groupMatches.forEach(g => {
      console.log(`  group id=${g.id}  ${g.name}  -> ${BASE_URL}/publicgroup/${g.id}`);
    });
  }

  console.log('\nGefundene ID passend in data/leitung-links.json unter "links" eintragen, z.B.:');
  console.log('  "Anzeigename": { "type": "person", "id": 1234 }');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
