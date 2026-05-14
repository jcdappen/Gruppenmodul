#!/usr/bin/env node
'use strict';

const BASE_URL = 'https://gemeindekonkordia.church.tools';
const API_BASE = `${BASE_URL}/api`;
const TOKEN    = process.env.CHURCHTOOLS_TOKEN;
if (!TOKEN) { console.error('CHURCHTOOLS_TOKEN fehlt'); process.exit(1); }

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Login ${TOKEN}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return { status: res.status, body };
}

async function main() {
  // Erste paar Gruppen holen
  console.log('=== Gruppen laden ===');
  const groups = await get('/groups?limit=5&page=1');
  const items = groups.body?.data ?? [];
  console.log(`${items.length} Gruppen gefunden`);

  if (items.length === 0) { console.log(JSON.stringify(groups.body, null, 2)); return; }

  // Für die erste Gruppe: Members-Endpunkt testen
  const testGroup = items[0];
  console.log(`\n=== Members für Gruppe ${testGroup.id} (${testGroup.name}) ===`);
  const members = await get(`/groups/${testGroup.id}/members`);
  console.log('Status:', members.status);
  console.log(JSON.stringify(members.body, null, 2));

  // Zweite Gruppe falls verfügbar
  if (items.length > 1) {
    const g2 = items[1];
    console.log(`\n=== Members für Gruppe ${g2.id} (${g2.name}) ===`);
    const m2 = await get(`/groups/${g2.id}/members`);
    console.log('Status:', m2.status);
    console.log(JSON.stringify(m2.body?.data?.slice(0, 3) ?? m2.body, null, 2));
  }
}

main().catch(console.error);
