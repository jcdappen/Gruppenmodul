#!/usr/bin/env node
'use strict';

const BASE_URL = 'https://gemeindekonkordia.church.tools';
const API_BASE = `${BASE_URL}/api`;
const TOKEN    = process.env.CHURCHTOOLS_TOKEN;

if (!TOKEN) { console.error('CHURCHTOOLS_TOKEN fehlt'); process.exit(1); }

async function apiGet(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Login ${TOKEN}`, Accept: 'application/json' },
  });
  return res.json();
}

async function main() {
  // 1. Gesamtanzahl aller Gruppen (ohne Filter)
  console.log('\n=== Alle Gruppen: Gesamtanzahl ===');
  const all = await apiGet('/groups', { limit: 1 });
  console.log('Total (ohne Filter):', all?.meta?.pagination?.total ?? '?');

  // 2. parentGroupId=296 – wie viele total?
  console.log('\n=== ?parentGroupId=296: Gesamtanzahl + erste Namen ===');
  const byParent = await apiGet('/groups', { parentGroupId: 296, limit: 100 });
  const byParentTotal = byParent?.meta?.pagination?.total ?? byParent?.data?.length ?? '?';
  console.log('Total:', byParentTotal);
  (byParent?.data ?? []).forEach(g => console.log(' -', g.id, g.name));

  // 3. Alternative Parameter testen
  console.log('\n=== ?groupTypeId=5 (Visionsbereich-Typ) ===');
  const byType5 = await apiGet('/groups', { groupTypeId: 5, limit: 100 });
  console.log('Total groupTypeId=5:', byType5?.meta?.pagination?.total ?? byType5?.data?.length ?? '?');
  (byType5?.data ?? []).forEach(g => console.log(' -', g.id, g.name, '| groupTypeId:', g.information?.groupTypeId));

  // 4. Alle groupTypeIds aus allen Gruppen auflisten
  console.log('\n=== Alle vorhandenen groupTypeIds ===');
  const allGroups = await apiGet('/groups', { limit: 100 });
  const typeMap = {};
  for (const g of allGroups?.data ?? []) {
    const tid = g.information?.groupTypeId ?? 'unknown';
    if (!typeMap[tid]) typeMap[tid] = [];
    typeMap[tid].push(g.name);
  }
  for (const [tid, names] of Object.entries(typeMap).sort()) {
    console.log(`groupTypeId ${tid}: ${names.join(', ')}`);
  }

  // 5. Mitglieder von "Leben mit Gott" (id 296)
  console.log('\n=== Mitglieder von "Leben mit Gott" (296) ===');
  const members = await apiGet('/groups/296/members');
  (members?.data ?? members ?? []).slice(0, 5).forEach(m =>
    console.log(' -', JSON.stringify(m).slice(0, 200))
  );
}

main().catch(console.error);
