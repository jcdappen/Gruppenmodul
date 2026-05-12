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
  // Vollständige API-Antwort für Alpha-Kurs (321) – Bildfeld finden
  console.log('=== GET /api/groups/321 (Alpha-Kurs) ===');
  const r = await get(`${API_BASE}/groups/321`);
  const info = r.body?.data?.information ?? r.body?.information ?? {};
  console.log('Status:', r.status);
  console.log('information:', JSON.stringify(info, null, 2));

  // Gebetsteam (62) zum Vergleich
  console.log('\n=== GET /api/groups/62 (Gebetsteam) ===');
  const r2 = await get(`${API_BASE}/groups/62`);
  const info2 = r2.body?.data?.information ?? r2.body?.information ?? {};
  console.log('Status:', r2.status);
  console.log('information:', JSON.stringify(info2, null, 2));
}

main().catch(console.error);
