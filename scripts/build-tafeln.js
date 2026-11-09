#!/usr/bin/env node
'use strict';

// Baut das Sichttafel-PDF: genau 20 A4-Seiten (10 Sichttafeln, vorne und hinten).
// Aufbau und Layout folgen der Broschüre "Willkommen daheim" (v6); die Broschürenseiten sind
// A5 und werden auf 141,42 % auf A4 vergrößert. Teams und Kleingruppen sind im gleichen Stil gesetzt.
//
//   node scripts/build-tafeln.js     →  build/sichttafeln.pdf
//
// Leitung: aus data/leiter.private.json (scripts/fetch-leaders.js), falls vorhanden.
//          Mit OHNE_LEITER=1 wird sie bewusst weggelassen.
// DSGVO:   Schriften, Bilder und QR-Codes kommen aus dem Repo bzw. werden lokal erzeugt.

const fs   = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { chromium } = require('playwright');
const { BEREICHE } = require('./lib/gruppen');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'build');
const SEITEN_DIR = path.join(ROOT, 'design', 'broschuere', 'seiten');
const ZIEL_SEITEN = 20;
const TEAMS_PRO_SEITE_MAX = 3;

const URL_MITMACHEN = 'https://www.gemeinde-konkordia.de/mitmachen';
const URL_KAFFEE    = 'https://konkordia.youcanbook.me';

// Gruppen, die im Kiosk als Übergruppen gezeigt werden
const TEAMS_VERZEICHNIS = 'Teams Verzeichnis';
// Die Beschreibungen in ChurchTools sind für das Online-Formular geschrieben; im Druck stehen die Sätze aus der Broschüre (S. 10)
const KLEINGRUPPEN  = { match: /hauskreis|kleingruppe/i, label: 'Kleingruppen',
  text: 'In Kleingruppen treffen wir uns in kleiner Runde zu Hause – zum Essen, Bibellesen, Beten und Teilen, was uns im Alltag bewegt.' };
const JUENGERSCHAFT = { match: /jüngerschaftsgruppen/i,  label: 'Jüngerschaftsgruppen',
  text: 'Jüngerschaftsgruppen sind kleine, verbindliche Gruppen, in denen wir lernen, Jesus im Alltag nachzufolgen.' };
const SONSTIGE_PARENT   = 'Gruppen';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qr = url => QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
const strip = md => (md || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

// ── Beschreibung kürzen: "Warum" und "Du kannst mitmachen" ─────────────────
function sections(md) {
  const out = {};
  const parts = (md || '').split(/\n\s*\n/);
  let key = null;
  for (const p of parts) {
    const h = p.match(/^\s*\*\*([^*]+)\*\*\s*\n?([\s\S]*)$/) || p.match(/^\s*#{1,6}\s+([^\n]+)\n?([\s\S]*)$/);
    if (h) { key = h[1].trim().toLowerCase(); out[key] = (out[key] ? out[key] + '\n' : '') + h[2].trim(); }
    else if (key) out[key] += '\n' + p.trim();
  }
  return out;
}
function kurzText(md, max = 200) {
  md = (md || '').replace(/\s*\[?Deta(?:il|l)+ierte\s+Beschreibung[^\n]*/gi, '').replace(/\s*"?Gruppenbild[^\n]*/gi, '');   // Verweise auf Flyer/Gruppenbild gibt es im Druck nicht
  const s = sections(md);
  const warum = s['warum'];
  const mit   = s['du kannst mitmachen'];
  const clip = (t, n) => {
    const x = strip(t)
      .replace(/\(?\s*Detaillierte Beschreibung[^)\n]*\)?/gi, '')
      .replace(/^\s*[-•]\s*/, '')
      .replace(/\s*\n\s*[-•]\s*/g, ' · ')
      .replace(/\s+/g, ' ').trim();
    if (x.length <= n) return x;
    const cut = x.slice(0, n);
    return cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '))).replace(/[,;:]$/, '') + ' …';
  };
  if (warum || mit) return { warum: warum ? clip(warum, max) : '', mit: mit ? clip(mit, max) : '' };
  return { warum: clip(md, max * 1.6), mit: '' };
}

// ── Seiten ─────────────────────────────────────────────────────────────────
const A5 = html => `<div class="pg"><div class="a5">${html}</div></div>`;
const A4 = (html, bg = '#faf7f2') => `<div class="pg" style="background:${bg}">${html}</div>`;

async function broschuerenSeite(n) {
  let html = fs.readFileSync(path.join(SEITEN_DIR, `s${String(n).padStart(2, '0')}.html`), 'utf8');
  if (n === 15) {
    // Platzhalter für QR-Code "Kaffee mit unserem Pastor"
    const kaffee = await qr(URL_KAFFEE);
    html = html.replace(/<!--SLOT:v6-qr-kaffee-->/, `<div style="position:absolute;inset:1.2mm;background:#fff;">${kaffee}</div>`);
  }
  if (n === 16) {
    // QR + Adresse: alle weiteren Angebote auf der Mitmachen-Seite
    const mit = await qr(URL_MITMACHEN);
    html = html.replace(/<img src="[^"]*qr-lt\.jpg"[^>]*>/, mit.replace('<svg', '<svg style="width:100%;height:100%;display:block;"'))
               .replace('gemeinde-konkordia.de/lt', 'gemeinde-konkordia.de/mitmachen');
  }
  html = html.replace(/<!--SLOT:[^>]*-->/g, '');
  return A5(html);
}

const KREUZ = '../design/broschuere/assets/2026/kreuzmarke-farbig.png';
const kopf = (eyebrow, titel, text) => `
  <div class="kopf"><div class="bar"></div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(titel)}</h2>${text ? `<p class="lead">${esc(text)}</p>` : ''}</div>`;
const fuss = nr => `<div class="fuss"><img src="${KREUZ}" alt=""><span>${nr}</span></div>`;

async function karte(g, { leiter, label, color, text }) {
  const { warum, mit } = text ? { warum: text, mit: '' } : kurzText(g.description);
  return `
  <article class="k" style="--c:${color}">
    <div class="k-text">
      ${label ? `<div class="k-eyebrow">${esc(label)}</div>` : ''}
      <h3>${esc(g.name)}</h3>
      ${leiter?.length ? `<div class="leitung"><b>Leitung</b> ${esc(leiter.join(', '))}</div>` : ''}
      ${warum ? `<p>${esc(warum)}</p>` : ''}
      ${mit ? `<p class="mit"><b>Du kannst mitmachen:</b> ${esc(mit)}</p>` : ''}
    </div>
    <div class="k-qr"><div class="qrbox">${await qr(g.publicUrl)}</div><span>Scannen &amp; mehr erfahren</span></div>
  </article>`;
}

function bereichInfo(g, byId, vb) {
  const seen = new Set(), stack = [...(g.parentGroupIds || [])];
  while (stack.length) {
    const id = stack.pop(); if (seen.has(id)) continue; seen.add(id);
    if (vb.has(id)) return vb.get(id);
    const p = byId.get(id); if (p) stack.push(...(p.parentGroupIds || []));
  }
  return null;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'gruppen.json'), 'utf8'));
  const groups = data.groups;
  const byId = new Map(groups.map(g => [g.id, g]));
  const sichtbar = g => g && g.description && g.publicUrl && !g.settings?.isHidden;
  const kinder = g => (g?.childGroupIds || []).map(id => byId.get(id)).filter(sichtbar);

  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  const vb = new Map();
  for (const g of groups) {
    if (g.groupTypeId !== 5) continue;
    const b = BEREICHE.find(b => norm(g.name).includes(b.match));
    if (b) vb.set(g.id, b);
  }

  let leiter = {};
  const leiterFile = path.join(ROOT, 'data', 'leiter.private.json');
  if (!process.env.OHNE_LEITER && fs.existsSync(leiterFile)) leiter = JSON.parse(fs.readFileSync(leiterFile, 'utf8'));
  else console.log('Hinweis: ohne Leitung (data/leiter.private.json fehlt oder OHNE_LEITER=1).');

  // Teams = alle Gruppen unter "Teams Verzeichnis" (wie im Kiosk)
  const verzeichnis = groups.find(g => g.name.trim() === TEAMS_VERZEICHNIS);
  if (!verzeichnis) throw new Error(`Gruppe "${TEAMS_VERZEICHNIS}" nicht gefunden.`);
  const teams = kinder(verzeichnis).sort((a, b) => a.name.localeCompare(b.name, 'de'));

  // Teams auf Seiten verteilen: so gleichmäßig wie möglich, höchstens 3 pro Seite
  const teamSeiten = Math.ceil(teams.length / TEAMS_PRO_SEITE_MAX);
  const chunks = [];
  for (let i = 0, rest = teams.length, left = teamSeiten; left > 0; left--) {
    const n = Math.ceil(rest / left); chunks.push(teams.slice(i, i + n)); i += n; rest -= n;
  }

  const seiten = [];
  for (const n of [1, 2, 4, 6, 7, 12]) seiten.push(await broschuerenSeite(n));

  for (const [i, chunk] of chunks.entries()) {
    const karten = [];
    for (const t of chunk) {
      const b = bereichInfo(t, byId, vb);
      karten.push(await karte(t, { leiter: leiter[t.id], label: b?.name, color: b?.color || '#bb2232' }));
    }
    seiten.push(A4(`
      <div class="seite">${kopf('Du kannst mitmachen', 'Unsere Teams', '')}
      <div class="karten">${karten.join('')}</div>${fuss(seiten.length + 1)}</div>`));
  }

  // Kleine Gruppen finden: Kleingruppen und Jüngerschaft als Übergruppen
  const klein = groups.find(g => sichtbar(g) && KLEINGRUPPEN.match.test(g.name) && g.groupTypeId === 1 && !(g.parentGroupIds || []).some(p => KLEINGRUPPEN.match.test(byId.get(p)?.name || '')));
  const juenger = groups.find(g => sichtbar(g) && JUENGERSCHAFT.match.test(g.name));
  const uebergruppen = [];
  for (const [g, def, color] of [[klein, KLEINGRUPPEN, '#677d46'], [juenger, JUENGERSCHAFT, '#147067']]) {
    if (!g) throw new Error(`Übergruppe "${def.label}" nicht gefunden.`);
    uebergruppen.push(await karte({ ...g, name: def.label }, { color, text: def.text }));
  }
  seiten.push(A4(`<div class="seite">${kopf('Kleine Gruppen finden', 'Gemeinsam unterwegs', 'Glaube wächst am besten in Beziehungen. Scanne den QR-Code und finde eine Gruppe in deiner Nähe.')}
    <div class="karten">${uebergruppen.join('')}</div>${fuss(seiten.length + 1)}</div>`));

  // Sonstige Gruppen
  const sonstigeParent = groups.find(g => g.name.trim() === SONSTIGE_PARENT);
  const sonstige = (sonstigeParent ? kinder(sonstigeParent) : []).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const sKarten = [];
  for (const g of sonstige) sKarten.push(await karte(g, { leiter: leiter[g.id], label: 'Sonstige Gruppen', color: '#8e7629' }));
  seiten.push(A4(`<div class="seite">${kopf('Kleine Gruppen finden', 'Sonstige Gruppen', 'Für Frauen, Männer und Senioren.')}
    <div class="karten">${sKarten.join('')}</div>${fuss(seiten.length + 1)}</div>`));

  for (const n of [14, 15, 16]) seiten.push(await broschuerenSeite(n));

  if (seiten.length !== ZIEL_SEITEN) {
    throw new Error(`Es sind ${seiten.length} Seiten, erwartet werden genau ${ZIEL_SEITEN} (10 Sichttafeln). ` +
      `Teams: ${teams.length}, Sonstige Gruppen: ${sonstige.length}. Bitte Seitenauswahl in scripts/build-tafeln.js anpassen.`);
  }

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Willkommen daheim – Sichttafeln</title>
<style>
@font-face{font-family:'Archivo';src:url('../design/broschuere/fonts/Archivo-Variable.woff2') format('woff2');font-weight:100 900;font-style:normal}
@font-face{font-family:'Archivo';src:url('../design/broschuere/fonts/Archivo-Italic-Variable.woff2') format('woff2');font-weight:100 900;font-style:italic}
@font-face{font-family:'Archivo Expanded';src:url('../design/broschuere/fonts/ArchivoExpanded-Variable.woff2') format('woff2');font-weight:100 900;font-style:normal}
@page{size:210mm 297mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Archivo',Arial,sans-serif;color:#1f1a17}
.pg{width:210mm;height:297mm;position:relative;overflow:hidden;break-after:page;page-break-after:always}
.pg:last-child{break-after:auto;page-break-after:auto}
.a5{width:148.5mm;height:210mm;transform:scale(1.414213);transform-origin:0 0;display:flex}
.a5>div{flex:1;min-width:0}
.seite{height:100%;padding:13mm 14mm 17mm;display:flex;flex-direction:column;gap:5mm}
.kopf .bar{width:22mm;height:2.4mm;background:#bb2232;margin-bottom:4mm}
.eyebrow{font-family:'Archivo Expanded','Archivo',sans-serif;font-weight:800;font-size:9pt;letter-spacing:.14em;text-transform:uppercase;color:#bb2232}
.kopf h2{font-family:'Archivo Expanded','Archivo',sans-serif;font-weight:800;font-size:24pt;line-height:1;text-transform:uppercase;margin-top:3mm}
.lead{font-size:12pt;line-height:1.45;color:#6b625a;margin-top:4mm;max-width:150mm}
.karten{flex:1;display:flex;flex-direction:column;gap:5mm;min-height:0}
.k{flex:1;min-height:0;background:#fff;border-left:2.6mm solid var(--c);display:grid;grid-template-columns:minmax(0,1fr) 40mm;gap:7mm;padding:5mm 6mm 5mm 7mm;border-radius:0 2mm 2mm 0;box-shadow:0 0 0 .3mm #e6dfd3}
.k-eyebrow{font-family:'Archivo Expanded','Archivo',sans-serif;font-weight:800;font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase;color:var(--c)}
.k h3{font-family:'Archivo Expanded','Archivo',sans-serif;font-weight:800;font-size:17pt;line-height:1.1;text-transform:uppercase;margin:1.5mm 0 2.5mm}
.k p{font-size:10.5pt;line-height:1.45;margin-bottom:2.5mm;text-wrap:pretty}
.k .mit{color:#3c352f}
.k b{font-weight:800}
.leitung{font-size:10.5pt;margin-bottom:2.5mm;color:var(--c);font-weight:600}
.leitung b{color:#1f1a17;margin-right:1.5mm}
.k-qr{align-self:center;text-align:center}
.qrbox{width:40mm;height:40mm;background:#fff;padding:2mm;border:.4mm solid #e6dfd3}
.qrbox svg{width:100%;height:100%;display:block}
.k-qr span{display:block;font-size:8pt;color:#6b625a;margin-top:2mm}
.fuss{position:absolute;left:14mm;right:14mm;bottom:8mm;display:flex;justify-content:space-between;align-items:center;font-size:9pt;color:#6b625a}
.fuss img{width:6mm;height:6mm}
</style></head><body>
${seiten.join('\n')}
</body></html>`;

  fs.mkdirSync(OUT, { recursive: true });
  const htmlPath = path.join(OUT, 'sichttafeln.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  await page.goto('file://' + htmlPath);
  await page.evaluate(() => document.fonts.ready);
  // Nichts darf aus seiner Karte laufen
  const zuVoll = await page.evaluate(() => [...document.querySelectorAll('.k')]
    .filter(k => k.scrollHeight > k.clientHeight + 1).map(k => k.querySelector('h3').textContent));
  if (zuVoll.length) throw new Error('Text passt nicht in die Karte: ' + zuVoll.join(', ') + '. Bitte Texte in ChurchTools kürzen oder kurzText() anpassen.');
  const pdf = path.join(OUT, 'sichttafeln.pdf');
  await page.pdf({ path: pdf, width: '210mm', height: '297mm', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(`PDF: ${pdf} (${seiten.length} Seiten, ${teams.length} Teams in ${teamSeiten} Seiten, ${sonstige.length} sonstige Gruppen)`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
