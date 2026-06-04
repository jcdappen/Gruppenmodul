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
  // Alle Gruppen laden und erste Gruppe mit vollem information-Objekt ausgeben
  console.log('=== GET /groups?page=1&limit=5 ===');
  const list = await get('/groups?page=1&limit=5');
  const groups = list.body?.data ?? [];
  console.log(`${groups.length} Gruppen (erste Seite, max 5)\n`);

  if (groups.length === 0) { console.log('Keine Gruppen gefunden.'); return; }

  // Für die ersten 3 Gruppen: Detaildaten + information ausgeben
  for (const g of groups.slice(0, 3)) {
    console.log(`\n=== GET /groups/${g.id} (${g.name}) ===`);
    const detail = await get(`/groups/${g.id}`);
    const info = detail.body?.data?.information ?? detail.body?.information ?? {};
    console.log('information:', JSON.stringify(info, null, 2));
  }
}

main().catch(console.error);
