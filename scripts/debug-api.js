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
  // Gruppen mit Mitgliedern suchen: bekannte Gruppen testen
  const testIds = [19, 16, 59, 321, 9, 8, 22]; // Audiotechnik, Beamertechnik, Begrüßung, Alpha-Kurs, ...

  for (const id of testIds) {
    const r = await get(`/groups/${id}/members`);
    const items = r.body?.data ?? r.body ?? [];
    const count = Array.isArray(items) ? items.length : '?';
    if (count > 0) {
      console.log(`\n=== Gruppe ${id}: ${count} Mitglieder ===`);
      console.log(JSON.stringify(items.slice(0, 2), null, 2));
      break; // Ersten Treffer zeigen reicht
    } else {
      console.log(`Gruppe ${id}: keine Mitglieder`);
    }
  }
}

main().catch(console.error);
