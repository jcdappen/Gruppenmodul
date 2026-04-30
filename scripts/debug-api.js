#!/usr/bin/env node
'use strict';

const BASE_URL = 'https://gemeindekonkordia.church.tools';
const API_BASE = `${BASE_URL}/api`;
const TOKEN    = process.env.CHURCHTOOLS_TOKEN;

if (!TOKEN) { console.error('CHURCHTOOLS_TOKEN fehlt'); process.exit(1); }

async function get(url, params = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Login ${TOKEN}`, Accept: 'application/json' },
    redirect: 'manual',
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text.slice(0, 500) }; }
}

async function main() {
  // 1. Vollständige Felder von Leben mit Gott (296)
  console.log('\n=== GET /api/groups/296 – alle Top-Level-Felder ===');
  const g296 = await get(`${API_BASE}/groups/296`);
  const data296 = g296.body?.data ?? g296.body;
  console.log('Top-Level-Keys:', Object.keys(data296 ?? {}));
  console.log('information-Keys:', Object.keys(data296?.information ?? {}));

  // 2. grouphomepages Endpunkt – zeigt Untergruppen?
  const hash = 'qsuiTU17as1fT5QswK5TPG2BEyA5XHWP';
  console.log(`\n=== GET /api/grouphomepages/${hash} ===`);
  const hp = await get(`${API_BASE}/grouphomepages/${hash}`);
  console.log('Status:', hp.status);
  console.log(JSON.stringify(hp.body).slice(0, 2000));

  // 3. Alle Gruppen – suche nach parent-ähnlichen Feldern (alle Keys)
  console.log('\n=== Suche parent-Felder in erstem Gruppenobjekt (alle Keys rekursiv) ===');
  const first = await get(`${API_BASE}/groups`, { limit: 1 });
  const firstGroup = first.body?.data?.[0];
  function findKeys(obj, prefix = '') {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) findKeys(v, path);
      else console.log(`  ${path}: ${JSON.stringify(v)}`);
    }
  }
  findKeys(firstGroup);

  // 4. Versuche grouphomepage für alle Visionsbereiche
  console.log('\n=== groupHomepageUrl aller groupTypeId=5 Gruppen ===');
  const allGroups = await get(`${API_BASE}/groups`, { limit: 100 });
  const vb = (allGroups.body?.data ?? []).filter(g => g.information?.groupTypeId === 5);
  for (const g of vb) {
    console.log(`${g.id} ${g.name}: ${g.information?.groupHomepageUrl ?? 'keine URL'}`);
  }

  // 5. Versuche /api/groups mit page=1&limit=100 – gibt meta.pagination.total?
  console.log('\n=== Pagination-Metadaten von /api/groups ===');
  console.log(JSON.stringify(allGroups.body?.meta ?? {}));
}

main().catch(console.error);
