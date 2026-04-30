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
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text.slice(0, 300) }; }
}

async function main() {
  // 1. Interne Legacy-API (churchtools-ajax)
  console.log('\n=== Legacy Ajax: getGroupTree ===');
  const tree = await get(`${BASE_URL}/index.php`, {
    q: 'churchservice/ajax',
    func: 'getGroupTree',
  });
  console.log('Status:', tree.status);
  console.log(JSON.stringify(tree.body).slice(0, 1000));

  // 2. Interne API: Gruppenstruktur
  console.log('\n=== Legacy Ajax: getAllGroupTypes ===');
  const types = await get(`${BASE_URL}/index.php`, {
    q: 'churchdb/ajax',
    func: 'getGroups',
  });
  console.log('Status:', types.status);
  console.log(JSON.stringify(types.body).slice(0, 1000));

  // 3. Neuer Endpunkt: /api/groups mit campusId oder anderen Feldern
  console.log('\n=== GET /api/groups – Meta-Felder von Leben mit Gott (296) ===');
  const g296 = await get(`${API_BASE}/groups/296`);
  // Alle Top-Level-Felder ausgeben
  const data = g296.body?.data ?? g296.body;
  console.log('Top-Level-Felder:', Object.keys(data ?? {}));
  console.log('information-Felder:', Object.keys(data?.information ?? {}));

  // 4. Versuche /api/groups?limit=100 und schau ob irgendein Feld parent enthält
  console.log('\n=== Suche nach parent-Feldern in Gruppenobjekten ===');
  const allGroups = await get(`${API_BASE}/groups`, { limit: 100 });
  const groups = allGroups.body?.data ?? [];
  const withParent = groups.filter(g => {
    const str = JSON.stringify(g).toLowerCase();
    return str.includes('parent') || str.includes('uber') || str.includes('ober');
  });
  if (withParent.length > 0) {
    console.log('Gruppen mit parent-Feldern:');
    withParent.forEach(g => console.log(g.id, g.name, '→', JSON.stringify(g).slice(0, 300)));
  } else {
    console.log('Keine parent-Felder in Gruppenobjekten gefunden.');
  }

  // 5. Versuche /api/v2/... oder andere API-Versionen
  console.log('\n=== GET /api/v2/groups (falls vorhanden) ===');
  const v2 = await get(`${BASE_URL}/api/v2/groups`, { limit: 5 });
  console.log('Status:', v2.status, '| Body:', JSON.stringify(v2.body).slice(0, 200));
}

main().catch(console.error);
