#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const BASE_URL = 'https://gemeindekonkordia.church.tools';
const API_BASE = `${BASE_URL}/api`;
const TOKEN    = process.env.CHURCHTOOLS_TOKEN;

if (!TOKEN) {
  console.error('Fehler: CHURCHTOOLS_TOKEN ist nicht gesetzt.');
  process.exit(1);
}

async function apiGet(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Login ${TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${url}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function getAllPages(endpoint, params = {}) {
  const results = [];
  let page = 1;
  while (true) {
    const data = await apiGet(endpoint, { ...params, page, limit: 100 });
    const items = data.data ?? data;
    if (!Array.isArray(items) || items.length === 0) break;
    results.push(...items);
    const meta = data.meta?.pagination;
    if (!meta || page >= meta.lastPage) break;
    page++;
  }
  return results;
}

async function getGroupMembers(groupId) {
  try {
    const data = await apiGet(`/groups/${groupId}/members`);
    return data.data ?? data ?? [];
  } catch {
    return [];
  }
}

async function getPerson(personId) {
  try {
    const data = await apiGet(`/persons/${personId}`);
    return data.data ?? data;
  } catch {
    return null;
  }
}

async function getGroupDetails(groupId) {
  try {
    const data = await apiGet(`/groups/${groupId}`);
    return data.data ?? data;
  } catch {
    return null;
  }
}

async function main() {
  console.log('Lade alle Gruppen...');
  const groups = await getAllPages('/groups');
  console.log(`${groups.length} Gruppen gefunden.`);

  const personCache = {};

  async function fetchPerson(personId) {
    if (personCache[personId] !== undefined) return personCache[personId];
    const person = await getPerson(personId);
    personCache[personId] = person;
    return person;
  }

  const result = [];

  for (const group of groups) {
    const groupId = group.id;
    process.stdout.write(`Verarbeite Gruppe ${groupId}: ${group.name} ... `);

    const details = await getGroupDetails(groupId);
    const info    = details?.information ?? {};
    const settings = details?.settings ?? {};

    // Öffentliche Homepage-URL
    const homepageHash = info.groupHomepage ?? details?.groupHomepage;
    const publicUrl    = homepageHash
      ? `${BASE_URL}/grouphomepages/${homepageHash}`
      : null;

    // Mitglieder & Leiter
    const members = await getGroupMembers(groupId);
    const leaders = [];
    for (const member of members) {
      const isLeader = member.groupTypeRoleId != null && member.isLeader === true;
      if (!isLeader) continue;
      const person = await fetchPerson(member.personId);
      if (person) {
        leaders.push({
          id:        person.id,
          firstName: person.firstName,
          lastName:  person.lastName,
          imageUrl:  person.imageUrl ?? null,
        });
      }
    }

    // Untergruppen-IDs (werden aus der Gruppenliste gefiltert)
    // wird nach dem Loop aufgelöst
    result.push({
      id:            groupId,
      name:          group.name,
      groupTypeId:   group.groupTypeId,
      parentGroupId: group.parentGroupId ?? info.parentGroupId ?? null,
      description:   info.note ?? null,
      publicUrl,
      settings: {
        allowChildGroupRegistration: settings.allowChildGroupRegistration ?? null,
        isHidden:                    settings.isHidden ?? null,
        modules:                     settings.modules ?? [],
      },
      leaders,
      childGroupIds: [], // filled below
    });

    console.log('OK');
  }

  // Untergruppen-IDs eintragen
  for (const g of result) {
    if (g.parentGroupId) {
      const parent = result.find(p => p.id === g.parentGroupId);
      if (parent) parent.childGroupIds.push(g.id);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    groups: result,
  };

  const outPath = path.join(__dirname, '..', 'data', 'gruppen.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nGespeichert: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
