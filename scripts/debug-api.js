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
  // Alle Rollen laden (paginiert)
  console.log('=== Alle Gruppen-Rollen (/groups/roles) ===');
  let page = 1, allRoles = [];
  while (true) {
    const r = await get(`/groups/roles?limit=100&page=${page}`);
    const items = r.body?.data ?? [];
    if (!items.length) break;
    allRoles.push(...items);
    const lastPage = r.body?.meta?.pagination?.lastPage ?? 1;
    if (page >= lastPage) break;
    page++;
  }
  console.log(`${allRoles.length} Rollen gefunden:`);
  allRoles.forEach(r => console.log(`  ID ${r.id}: "${r.name}" type="${r.type}" groupTypeId=${r.groupTypeId} isLeader=${r.isLeader}`));

  // Mitglieder von Gruppe 19 mit roleId anzeigen
  console.log('\n=== Members Gruppe 19 (Audiotechnik) – alle Rollen-IDs ===');
  const m = await get('/groups/19/members');
  const members = m.body?.data ?? [];
  members.forEach(x => {
    const name = x.person?.domainAttributes?.firstName + ' ' + x.person?.domainAttributes?.lastName;
    console.log(`  ${name.trim()} → groupTypeRoleId: ${x.groupTypeRoleId}`);
  });
}

main().catch(console.error);
