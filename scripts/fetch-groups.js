#!/usr/bin/env node
'use strict';

const BASE_URL  = 'https://gemeindekonkordia.church.tools';
const API_BASE  = `${BASE_URL}/api`;
const TOKEN     = process.env.CHURCHTOOLS_TOKEN;
const fs        = require('fs');
const path      = require('path');
const OUT_PATH  = path.join(__dirname, '..', 'data', 'gruppen.json');

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

async function getGroupDetails(groupId) {
  try {
    const data = await apiGet(`/groups/${groupId}`);
    return data.data ?? data;
  } catch {
    return null;
  }
}

async function getGroupTags(groupId) {
  try {
    const data = await apiGet(`/groups/${groupId}/tags`);
    const items = data.data ?? data ?? [];
    if (!Array.isArray(items)) return [];
    return items.map(t => t.name).filter(Boolean);
  } catch {
    return [];
  }
}

// Gruppenbild mit Auth herunterladen und lokal ablegen, damit Besucher
// keine Verbindung zu church.tools aufbauen müssen (DSGVO).
const IMG_DIR = path.join(__dirname, '..', 'assets', 'images');
const IMG_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

async function downloadImage(groupId, url) {
  // Bei einem Fehler das zuletzt gespeicherte Bild behalten
  const previous = () => fs.readdirSync(IMG_DIR).find(f => f.startsWith(`group-${groupId}.`)) || null;
  try {
    const res = await fetch(url, { headers: { Authorization: `Login ${TOKEN}` } });
    if (!res.ok) return previous();
    const ext = IMG_EXT[(res.headers.get('content-type') || '').split(';')[0].trim()];
    if (!ext) return previous();
    const buf  = Buffer.from(await res.arrayBuffer());
    const file = `group-${groupId}.${ext}`;
    const full = path.join(IMG_DIR, file);
    if (!fs.existsSync(full) || !buf.equals(fs.readFileSync(full))) fs.writeFileSync(full, buf);
    return file;
  } catch {
    return previous();
  }
}

// Bilder von Gruppen entfernen, die es nicht mehr gibt oder die kein Bild mehr haben
function pruneImages(keep) {
  for (const file of fs.readdirSync(IMG_DIR)) {
    if (/^group-\d+\.\w+$/.test(file) && !keep.has(file)) fs.unlinkSync(path.join(IMG_DIR, file));
  }
}

// Feld aus ChurchTools kann String, Objekt ({ name / nameTranslated }) oder Liste sein.
// Reine IDs (Zahlen) sind für Gäste nicht lesbar und werden ignoriert.
function label(value) {
  if (value == null || value === '' || typeof value === 'number' || /^\d+$/.test(value)) return null;
  if (Array.isArray(value)) {
    const list = value.map(label).filter(Boolean);
    return list.length ? list.join(', ') : null;
  }
  if (typeof value === 'object') return value.nameTranslated || value.name || null;
  return String(value).trim() || null;
}

async function main() {
  console.log('Lade alle Gruppen …');
  const allGroups = await getAllPages('/groups');
  console.log(`${allGroups.length} Gruppen gefunden.\n`);

  const byId = new Map();
  const images = new Set();
  for (const group of allGroups) {
    const id = group.id;
    process.stdout.write(`[${id}] ${group.name} … `);

    const details  = await getGroupDetails(id);
    const info     = details?.information ?? {};
    const settings = details?.settings ?? {};

    const imageFile = info.imageUrl ? await downloadImage(id, info.imageUrl) : null;
    if (imageFile) images.add(imageFile);
    const imageUrl  = imageFile ? `assets/images/${imageFile}` : null;
    const isHidden  = settings.isHidden ?? false;
    const publicUrl = isHidden ? null : `${BASE_URL}/publicgroup/${id}`;
    const tags      = await getGroupTags(id);

    byId.set(id, {
      id,
      name:          group.name,
      groupTypeId:   info.groupTypeId ?? group.information?.groupTypeId ?? null,
      parentGroupIds: [],
      description:   info.note || null,
      publicUrl,
      imageUrl,
      tags,
      // Treffpunkt-Infos für Gäste – keine personenbezogenen Daten
      meeting: {
        weekday:     label(info.weekday),
        time:        label(info.meetingTime),
        targetGroup: label(info.targetGroup),
        ageGroups:   label(info.ageGroups),
      },
      settings: {
        isHidden: settings.isHidden ?? null,
        modules:  settings.modules  ?? [],
      },
      childGroupIds: [],
    });

    const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';
    console.log(imageUrl ? `OK (Bild)${tagStr}` : `OK${tagStr}`);
  }

  console.log('\nBaue Hierarchie über /children …');
  let linkedCount = 0;
  for (const [parentId, parentGroup] of byId) {
    const childIds = await getChildren(parentId);
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) continue;
      if (!child.parentGroupIds.includes(parentId)) {
        child.parentGroupIds.push(parentId);
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

  pruneImages(images);

  const result = [...byId.values()];
  const output = { generatedAt: new Date().toISOString(), groups: result };
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Gespeichert: ${OUT_PATH} (${result.length} Gruppen)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
