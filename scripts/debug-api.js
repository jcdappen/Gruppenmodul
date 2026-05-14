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
  // Alle Gruppentypen + Rollen laden
  console.log('=== GET /groups/grouptypes ===');
  const gt = await get('/groups/grouptypes');
  console.log('Status:', gt.status);
  const types = gt.body?.data ?? gt.body ?? [];
  if (Array.isArray(types)) {
    types.forEach(t => {
      console.log(`\nTyp ${t.id}: ${t.name}`);
      (t.roles ?? []).forEach(r => {
        console.log(`  Rolle ${r.id}: ${r.name}  isLeader=${r.isLeader}  isDefault=${r.isDefault}`);
      });
    });
  } else {
    console.log(JSON.stringify(types, null, 2));
  }
}

main().catch(console.error);
