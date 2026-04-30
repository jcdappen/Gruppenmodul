#!/usr/bin/env node
'use strict';

const BASE_URL = 'https://gemeindekonkordia.church.tools';
const API_BASE = `${BASE_URL}/api`;
const TOKEN    = process.env.CHURCHTOOLS_TOKEN;
if (!TOKEN) { console.error('CHURCHTOOLS_TOKEN fehlt'); process.exit(1); }

async function get(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Login ${TOKEN}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: res.status, body };
}

async function main() {
  // 1. /groups/296/children
  console.log('=== GET /api/groups/296/children ===');
  const r1 = await get(`${API_BASE}/groups/296/children`);
  console.log('Status:', r1.status);
  console.log(JSON.stringify(r1.body).slice(0, 500));

  // 2. Alle verfügbaren Unter-Endpunkte von /groups/296
  for (const sub of ['children', 'subgroups', 'tree', 'hierarchy', 'members', 'tags']) {
    const r = await get(`${API_BASE}/groups/296/${sub}`);
    console.log(`\n/groups/296/${sub} → Status: ${r.status} | ${JSON.stringify(r.body).slice(0, 150)}`);
  }

  // 3. Schaue ob Leben mit Gott (296) irgendwo als parentGroup auftaucht
  console.log('\n=== Suche nach parentGroup=296 in allen Feldern ===');
  const allRes = await get(`${API_BASE}/groups?limit=100`);
  const groups = allRes.body?.data ?? [];
  groups.forEach(g => {
    const str = JSON.stringify(g);
    if (str.includes('296') && g.id !== 296) {
      console.log(`Gruppe ${g.id} ${g.name} enthält 296:`, str.slice(0, 300));
    }
  });
}

main().catch(console.error);
