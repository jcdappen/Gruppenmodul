#!/usr/bin/env node
'use strict';

// Diagnose-Script: zeigt die rohe API-Antwort für Gruppen-Hierarchie
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
  const text = await res.text();
  return { status: res.status, url: url.toString(), body: JSON.parse(text) };
}

async function main() {
  // 1. Rohe Felder eines einzelnen Gruppenobjekts (Liste)
  console.log('\n=== GET /api/groups (erste Gruppe, alle Felder) ===');
  const list = await apiGet('/groups', { limit: 1 });
  const firstGroup = list.body?.data?.[0] ?? list.body?.[0];
  console.log(JSON.stringify(firstGroup, null, 2));

  // 2. Detailseite einer Gruppe (Leben mit Gott = 296)
  console.log('\n=== GET /api/groups/296 (alle Felder) ===');
  const detail = await apiGet('/groups/296');
  console.log(JSON.stringify(detail.body?.data ?? detail.body, null, 2));

  // 3. Kinder-Abfrage mit parentGroupId
  console.log('\n=== GET /api/groups?parentGroupId=296 ===');
  const children1 = await apiGet('/groups', { parentGroupId: 296 });
  console.log('Status:', children1.status);
  console.log('Anzahl:', (children1.body?.data ?? children1.body)?.length ?? 0);
  console.log(JSON.stringify(children1.body, null, 2).slice(0, 1000));

  // 4. Alternativ: Untergruppen-Endpunkt
  console.log('\n=== GET /api/groups/296/subgroups (falls vorhanden) ===');
  const sub = await apiGet('/groups/296/subgroups').catch(e => ({ error: e.message }));
  console.log(JSON.stringify(sub, null, 2).slice(0, 500));

  // 5. Gruppentypen abrufen
  console.log('\n=== GET /api/groupTypes ===');
  const types = await apiGet('/groupTypes');
  console.log(JSON.stringify(types.body, null, 2));
}

main().catch(console.error);
