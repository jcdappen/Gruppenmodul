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
  console.log('=== Members Gruppe 19 (Audiotechnik) – alle Rollen-IDs ===');
  const m = await get('/groups/19/members');
  const members = m.body?.data ?? [];
  members.forEach(x => {
    const name = `${x.person?.domainAttributes?.firstName ?? ''} ${x.person?.domainAttributes?.lastName ?? ''}`.trim();
    console.log(`  ${name} → groupTypeRoleId: ${x.groupTypeRoleId}`);
  });
}

main().catch(console.error);
