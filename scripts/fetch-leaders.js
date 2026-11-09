#!/usr/bin/env node
'use strict';

// Holt die Leitung der Teams aus ChurchTools und schreibt sie nach
// data/leiter.private.json.
//
// DSGVO: Diese Datei enthält Namen und wird NIE committet (siehe .gitignore).
// GitHub Pages veröffentlicht den ganzen Repo-Inhalt – Namen dürfen daher nur
// im Build-Job landen und von dort ausschließlich im PDF.
// Nur Vor- und Nachname, keine Kontaktdaten.

const BASE_URL = 'https://gemeindekonkordia.church.tools';
const API_BASE = `${BASE_URL}/api`;
const TOKEN    = process.env.CHURCHTOOLS_TOKEN;
const fs       = require('fs');
const path     = require('path');
const { selectTeams } = require('./lib/gruppen');

if (!TOKEN) {
  console.error('Fehler: CHURCHTOOLS_TOKEN ist nicht gesetzt.');
  process.exit(1);
}

async function apiGet(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Login ${TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`API ${res.status} ${endpoint}`);
  const json = await res.json();
  return json.data ?? json;
}

const asList = v => (Array.isArray(v) ? v : []);

async function leaderRoleIds(groupId) {
  const roles = asList(await apiGet(`/groups/${groupId}/roles`));
  return new Set(
    roles
      .filter(r => r.isLeader === true || /leit/i.test(r.name || r.nameTranslated || ''))
      .map(r => r.groupTypeRoleId ?? r.id)
  );
}

function personName(m) {
  const p = m.person || {};
  const full = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return (full || p.title || p.domainAttributes?.fullName || '').trim();
}

async function main() {
  const data  = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'gruppen.json'), 'utf8'));
  const teams = selectTeams(data.groups);
  const out   = {};

  for (const team of teams) {
    process.stdout.write(`[${team.id}] ${team.name} … `);
    try {
      const roleIds = await leaderRoleIds(team.id);
      const members = asList(await apiGet(`/groups/${team.id}/members?limit=200`));
      const names = members
        .filter(m => roleIds.has(m.groupTypeRoleId))
        .filter(m => !m.groupMemberStatus || m.groupMemberStatus === 'active')
        .map(personName)
        .filter(Boolean);
      if (names.length) out[team.id] = [...new Set(names)];
      console.log(names.length ? `${names.length} Leitung` : 'keine Leitung gefunden');
    } catch (err) {
      console.log(`übersprungen (${err.message})`);
    }
  }

  fs.writeFileSync(path.join(__dirname, '..', 'data', 'leiter.private.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n${Object.keys(out).length} von ${teams.length} Teams mit Leitung.`);
}

main().catch(err => { console.error(err); process.exit(1); });
