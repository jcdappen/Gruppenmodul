'use strict';

// Auswahl-Logik für das PDF – entspricht der des Gruppenfinders (gruppenfinder.html):
// gleiche Visionsbereiche, gleiche Unterscheidung Angebot / Mitarbeit.

const BEREICHE = [
  { slug: 'leben-mit-gott',          match: 'mit gott',       name: 'Leben mit Gott',          color: '#c9a21c' },
  { slug: 'leben-in-transformation', match: 'transformation', name: 'Leben in Transformation', color: '#1a9c8f' },
  { slug: 'leben-in-gemeinschaft',   match: 'gemeinschaft',   name: 'Leben in Gemeinschaft',   color: '#677d46' },
  { slug: 'leben-in-der-welt',       match: 'welt',           name: 'Leben in der Welt',       color: '#bb2232' },
];

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const TEAM_GROUP_TYPE = 2;

function prepare(groups) {
  const byId = new Map(groups.map(g => [g.id, g]));
  const vbIds = new Map();
  for (const g of groups) {
    if (g.groupTypeId !== 5) continue;
    const b = BEREICHE.find(b => norm(g.name).includes(b.match));
    if (b) vbIds.set(g.id, b.slug);
  }

  function bereicheOf(g) {
    const found = new Set(), seen = new Set(), stack = [...(g.parentGroupIds || [])];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      if (vbIds.has(id)) found.add(vbIds.get(id));
      const p = byId.get(id);
      if (p) stack.push(...(p.parentGroupIds || []));
    }
    return BEREICHE.map(b => b.slug).filter(s => found.has(s));
  }

  const visible = g => g.groupTypeId !== 5 && g.description && g.publicUrl && !g.settings?.isHidden;
  const typOf = g => {
    const tags = (g.tags || []).map(norm);
    return tags.includes('angebot') ? 'angebot'
         : tags.includes('mitarbeit') ? 'mitarbeit'
         : g.groupTypeId === TEAM_GROUP_TYPE ? 'mitarbeit' : 'angebot';
  };
  const card = g => ({
    id: g.id,
    name: g.name.trim(),
    description: g.description,
    url: g.publicUrl,
    image: g.imageUrl && !/^https?:/i.test(g.imageUrl) ? g.imageUrl : null,
    meeting: g.meeting || {},
    bereiche: bereicheOf(g),
    typ: typOf(g),
  });
  return { byId, visible, card };
}

const byName = (a, b) => a.name.localeCompare(b.name, 'de');

// Teams: jedes Team einzeln (wie im Gruppenfinder unter "Mitarbeiten")
function selectTeams(groups) {
  const { visible, card } = prepare(groups);
  return groups.filter(visible).map(card).filter(g => g.bereiche.length && g.typ === 'mitarbeit').sort(byName);
}

// Angebote: nur die Übergruppen. Eine Gruppe, deren Elterngruppe denselben Gruppentyp hat
// (z. B. jede einzelne Kleingruppe unter der Übergruppe "Kleingruppen"), wird nicht einzeln
// gelistet – die Elterngruppe steht stellvertretend für alle.
function selectAngebote(groups) {
  const { byId, visible, card } = prepare(groups);
  const cards = new Map(groups.filter(visible).map(g => [g.id, card(g)]));
  const result = new Map();
  const sameTypeParent = g => (g.parentGroupIds || []).map(id => byId.get(id)).find(p => p && p.groupTypeId === g.groupTypeId && visible(p));

  for (const g of groups.filter(visible)) {
    const c = cards.get(g.id);
    if (c.typ !== 'angebot') continue;
    let top = g;
    for (let p = sameTypeParent(top); p; p = sameTypeParent(top)) top = p;
    const tc = cards.get(top.id);
    if (top !== g && !tc.bereiche.length) tc.bereiche = c.bereiche;
    // Übergruppe ohne Visionsbereich in ChurchTools (z. B. "Kleingruppen"): unter Gemeinschaft einsortieren
    if (top !== g && !tc.bereiche.length) tc.bereiche = ['leben-in-gemeinschaft'];
    if (tc.typ === 'angebot' && tc.bereiche.length) result.set(top.id, tc);
  }
  return [...result.values()].sort(byName);
}

module.exports = { BEREICHE, selectTeams, selectAngebote };
