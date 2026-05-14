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
  // Members von JG Johannes D. (ID 267)
  console.log('=== Members Gruppe 267 (JG Johannes D.) ===');
  const r = await get('/groups/267/members');
  const members = r.body?.data ?? [];
  members.forEach(m => {
    const attrs = m.person?.domainAttributes ?? {};
    const name = `${attrs.firstName ?? ''} ${attrs.lastName ?? ''}`.trim();
    const imageUrl = m.person?.imageUrl ?? 'null';
    console.log(`  ${name} → roleId: ${m.groupTypeRoleId}, imageUrl: ${imageUrl}`);
  });

  // Direkt Person-Endpunkt für ersten Member testen
  if (members.length > 0) {
    const personId = members[0].person?.domainIdentifier;
    if (personId) {
      console.log(`\n=== GET /persons/${personId} ===`);
      const p = await get(`/persons/${personId}`);
      const data = p.body?.data ?? {};
      console.log('imageUrl:', data.imageUrl ?? 'null');
      console.log('Status:', p.status);
    }
  }
}

main().catch(console.error);
