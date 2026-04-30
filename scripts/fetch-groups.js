#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const BASE_URL  = 'https://gemeindekonkordia.church.tools';
const API_BASE  = `${BASE_URL}/api`;
const TOKEN     = process.env.CHURCHTOOLS_TOKEN;
const IMG_DIR   = path.join(__dirname, '..', 'assets', 'images');
const OUT_PATH  = path.join(__dirname, '..', 'data', 'gruppen.json');

if (!TOKEN) {
  console.error('Fehler: CHURCHTOOLS_TOKEN ist nicht gesetzt.');
  process.exit(1);
}

fs.mkdirSync(IMG_DIR, { recursive: true });

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

// Bild herunterladen und lokal speichern; gibt relativen Pfad zurück oder null
async function downloadImage(groupId, imageUrl) {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl, {
      headers: { Authorization: `Login ${TOKEN}` },
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    const ext = contentType.includes('png') ? 'png'
               : contentType.includes('gif') ? 'gif'
               : 'jpg';
    const filename = `group-${groupId}.${ext}`;
    const localPath = path.join(IMG_DIR, filename);

    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localPath, buf);
    return `assets/images/${filename}`;
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

async function main() {
  console.log('Lade alle Gruppen …');
  const groups = await getAllPages('/groups');
  console.log(`${groups.length} Gruppen gefunden.\n`);

  const personCache = {};

  async function fetchPerson(personId) {
    if (personCache[personId] !== undefined) return personCache[personId];
    const p = await getPerson(personId);
    personCache[personId] = p;
    return p;
  }

  const result = [];

  for (const group of groups) {
    const id = group.id;
    process.stdout.write(`[${id}] ${group.name} … `);

    const details  = await getGroupDetails(id);
    const info     = details?.information ?? {};
    const settings = details?.settings ?? {};

    // Öffentliche Homepage-URL
    const hash      = info.groupHomepage ?? details?.groupHomepage ?? null;
    const publicUrl = hash ? `${BASE_URL}/grouphomepages/${hash}` : null;

    // Gruppenbild herunterladen
    const imageUrl   = info.imageUrl ?? details?.imageUrl ?? null;
    const localImage = await downloadImage(id, imageUrl);

    // Leiter ermitteln
    const members = await getGroupMembers(id);
    const leaders = [];
    for (const m of members) {
      if (!m.isLeader) continue;
      const person = await fetchPerson(m.personId);
      if (person) {
        leaders.push({
          id:        person.id,
          firstName: person.firstName,
          lastName:  person.lastName,
          // kein Foto – DSGVO; nur Name für internen Gebrauch
        });
      }
    }

    result.push({
      id,
      name:          group.name,
      groupTypeId:   group.groupTypeId,
      parentGroupId: group.parentGroupId ?? info.parentGroupId ?? null,
      description:   info.note ?? null,
      publicUrl,
      localImage,
      settings: {
        isHidden: settings.isHidden ?? null,
        modules:  settings.modules  ?? [],
      },
      leaders,
      childGroupIds: [],
    });

    console.log(localImage ? `OK (Bild gespeichert)` : 'OK');
  }

  // childGroupIds befüllen
  for (const g of result) {
    if (g.parentGroupId) {
      const parent = result.find(p => p.id === g.parentGroupId);
      if (parent) parent.childGroupIds.push(g.id);
    }
  }

  const output = { generatedAt: new Date().toISOString(), groups: result };
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nGespeichert: ${OUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
