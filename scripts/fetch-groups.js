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

// Gruppentyp-IDs aus den Daten ableiten – kein fester Wert
// Visionsbereiche: groupTypeId der bekannten Visions-Gruppen (wird automatisch erkannt)

// Direkte Untergruppen einer Gruppe über /groups/{id}/children
async function getChildren(groupId) {
  try {
    const res = await apiGet(`/groups/${groupId}/children`);
    const items = res.data ?? res ?? [];
    if (!Array.isArray(items)) return [];
    return items.map(g => parseInt(g.domainIdentifier ?? g.id, 10)).filter(id => !isNaN(id));
  } catch {
    return [];
  }
}

// Bild herunterladen und lokal speichern
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
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(IMG_DIR, filename), buf);
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

async function main() {
  console.log('Lade alle Gruppen …');
  const allGroups = await getAllPages('/groups');
  console.log(`${allGroups.length} Gruppen gefunden.\n`);

  // Alle Gruppen als Map aufbauen (mit Details)
  const byId = new Map();
  for (const group of allGroups) {
    const id = group.id;
    process.stdout.write(`[${id}] ${group.name} … `);

    const details  = await getGroupDetails(id);
    const info     = details?.information ?? {};
    const settings = details?.settings ?? {};

    const imageUrl    = info.imageUrl || null;
    const localImage  = imageUrl ? await downloadImage(id, imageUrl) : null;
    const isHidden    = settings.isHidden ?? false;
    const publicUrl   = isHidden ? null : `${BASE_URL}/publicgroup/${id}`;

    byId.set(id, {
      id,
      name:             group.name,
      groupTypeId:      info.groupTypeId ?? group.information?.groupTypeId ?? null,
      parentGroupId:    null,    // wird über Homepage-Hierarchie gesetzt
      description:      info.note || null,
      publicUrl,
      localImage,
      settings: {
        isHidden: settings.isHidden ?? null,
        modules:  settings.modules  ?? [],
      },
      leaders:      [],
      childGroupIds: [],
    });

    console.log(localImage ? 'OK (Bild)' : 'OK');
  }

  // Hierarchie über /groups/{id}/children aufbauen
  console.log('\nBaue Hierarchie über /children …');
  let linkedCount = 0;
  for (const [parentId, parentGroup] of byId) {
    const childIds = await getChildren(parentId);
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) continue;
      if (child.parentGroupId === null) {
        child.parentGroupId = parentId;
        linkedCount++;
      }
      if (!parentGroup.childGroupIds.includes(childId)) {
        parentGroup.childGroupIds.push(childId);
      }
    }
    if (childIds.length > 0) {
      console.log(`  ${parentGroup.name} → ${childIds.length} Kinder`);
    }
  }
  console.log(`${linkedCount} Gruppen verknüpft.\n`);

  const result = [...byId.values()];
  const output = { generatedAt: new Date().toISOString(), groups: result };
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Gespeichert: ${OUT_PATH}`);
  console.log(`Gruppen mit Parent: ${result.filter(g => g.parentGroupId !== null).length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
