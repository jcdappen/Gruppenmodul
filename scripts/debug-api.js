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
  // Rollen mit groupTypeId-Filter versuchen (groupTypeId=2 = Dienst)
  for (const gtId of [1, 2, 3, 4, 5]) {
    const r = await get(`/groups/roles?groupTypeId=${gtId}`);
    const items = r.body?.data ?? [];
    if (items.length) {
      console.log(`\n=== Rollen für groupTypeId=${gtId} ===`);
      items.forEach(x => console.log(`  ID ${x.id}: "${x.name}" type="${x.type}" isLeader=${x.isLeader}`));
    }
  }

  // Masterdata-Endpunkt versuchen
  console.log('\n=== /masterdata (Gruppen-Rollen) ===');
  const md = await get('/masterdata');
  const roles = md.body?.data?.groupTypeRoles ?? md.body?.groupTypeRoles ?? [];
  if (roles.length) {
    roles.forEach(r => console.log(`  ID ${r.id}: "${r.name}" groupTypeId=${r.groupTypeId} isLeader=${r.isLeader}`));
  } else {
    console.log('(nicht gefunden, Status:', md.status, ')');
  }
}

main().catch(console.error);
