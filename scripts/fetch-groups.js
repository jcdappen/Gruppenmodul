#!/usr/bin/env node
'use strict';

const BASE_URL  = 'https://gemeindekonkordia.church.tools';
const API_BASE  = `${BASE_URL}/api`;
const TOKEN     = process.env.CHURCHTOOLS_TOKEN;
const OUT_PATH  = require('path').join(__dirname, '..', 'data', 'gruppen.json');

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

async function getLeaderRoleIds() {
  try {
    const data = await apiGet('/group/roles');
    const items = data.data ?? [];
    return new Set(items.filter(r => r.type === 'leader').map(r => r.id));
  } catch {
    return new Set();
  }
}

async function getGroupLeaders(groupId, leaderRoleIds) {
  try {
    const data = await apiGet(`/groups/${groupId}/members`);
    const items = data.data ?? [];
    return items
      .filter(m => m.person && leaderRoleIds.has(m.groupTypeRoleId))
      .map(m => {
        const attrs = m.person.domainAttributes ?? {};
        const name  = `${attrs.firstName ?? ''} ${attrs.lastName ?? ''}`.trim();
        const imageUrl = m.person.imageUrl || null;
        return { name, imageUrl };
      })
      .filter(l => l.name);
  } catch {
    return [];
  }
}

async function main() {
  console.log('Lade Leiter-Rollen …');
  const leaderRoleIds = await getLeaderRoleIds();
  console.log(`Leiter-Rollen-IDs: ${[...leaderRoleIds].join(', ') || '(keine)'}\n`);

  console.log('Lade alle Gruppen …');
  const allGroups = await getAllPages('/groups');
  console.log(`${allGroups.length} Gruppen gefunden.\n`);

  const byId = new Map();
  for (const group of allGroups) {
    const id = group.id;
    process.stdout.write(`[${id}] ${group.name} … `);

    const details  = await getGroupDetails(id);
    const info     = details?.information ?? {};
    const settings = details?.settings ?? {};

    const imageUrl  = info.imageUrl || null;
    const isHidden  = settings.isHidden ?? false;
    const publicUrl = isHidden ? null : `${BASE_URL}/publicgroup/${id}`;
    const tags      = await getGroupTags(id);
    const leaders   = await getGroupLeaders(id, leaderRoleIds);

    byId.set(id, {
      id,
      name:          group.name,
      groupTypeId:   info.groupTypeId ?? group.information?.groupTypeId ?? null,
      parentGroupIds: [],
      description:   info.note || null,
      publicUrl,
      imageUrl,
      tags,
      leaders,
      settings: {
        isHidden: settings.isHidden ?? null,
        modules:  settings.modules  ?? [],
      },
      childGroupIds: [],
    });

    const tagStr     = tags.length    ? ` [${tags.join(', ')}]` : '';
    const leaderStr  = leaders.length ? ` (${leaders.map(l => l.name).join(', ')})` : '';
    console.log(imageUrl ? `OK (Bild)${tagStr}${leaderStr}` : `OK${tagStr}${leaderStr}`);
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

  const result = [...byId.values()];
  const output = { generatedAt: new Date().toISOString(), groups: result };
  require('fs').writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Gespeichert: ${OUT_PATH} (${result.length} Gruppen)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
