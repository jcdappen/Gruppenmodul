#!/usr/bin/env node
'use strict';

const BASE_URL = 'https://gemeindekonkordia.church.tools';
const API_BASE = `${BASE_URL}/api`;
const TOKEN    = process.env.CHURCHTOOLS_TOKEN;

if (!TOKEN) { console.error('CHURCHTOOLS_TOKEN fehlt'); process.exit(1); }

async function get(url, params = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Login ${TOKEN}`, Accept: 'application/json' },
    redirect: 'manual',
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text.slice(0, 300) }; }
}

async function main() {
  // Hash von "Leben mit Gott" (296) aus den Daten
  const hash = 'qsuiTU17as1fT5QswK5TPG2BEyA5XHWP';

  // 1. Konfiguration (was wir schon kennen)
  console.log('=== GET /api/grouphomepages/{hash} ===');
  const cfg = await get(`${API_BASE}/grouphomepages/${hash}`);
  console.log('parentGroup:', cfg.body?.data?.parentGroup);
  console.log('depth:', cfg.body?.data?.depth);

  // 2. Gruppen-Endpunkt der Homepage
  console.log('\n=== GET /api/grouphomepages/{hash}/groups ===');
  const r2 = await get(`${API_BASE}/grouphomepages/${hash}/groups`);
  console.log('Status:', r2.status);
  console.log(JSON.stringify(r2.body).slice(0, 1000));

  // 3. Mit parentGroupId als Query (von der Homepage-Config)
  const parentGroupId = cfg.body?.data?.parentGroup;
  console.log(`\n=== GET /api/groups?parentGroupId=${parentGroupId}&limit=5 ===`);
  const r3 = await get(`${API_BASE}/groups`, { parentGroupId, limit: 5 });
  console.log('Total:', r3.body?.meta?.pagination?.total);
  console.log(JSON.stringify(r3.body).slice(0, 500));

  // 4. Suche nach Gruppen-Suchendpunkt
  console.log('\n=== GET /api/search?query=&domainTypes[]=group&groupHomepageHash={hash} ===');
  const r4 = await get(`${API_BASE}/search`, {
    query: '',
    'domainTypes[]': 'group',
    groupHomepageHash: hash,
  });
  console.log('Status:', r4.status);
  console.log(JSON.stringify(r4.body).slice(0, 1000));

  // 5. Direkte Suche über den globalen Such-Endpunkt
  console.log('\n=== GET /api/globalsearch?query=Leben ===');
  const r5 = await get(`${API_BASE}/globalsearch`, { query: 'Leben', limit: 10 });
  console.log('Status:', r5.status);
  console.log(JSON.stringify(r5.body).slice(0, 1000));
}

main().catch(console.error);
