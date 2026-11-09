#!/usr/bin/env node
'use strict';

// Baut das Gruppen-PDF (A4) aus data/gruppen.json:
//   Teil 1  "Dabei sein"   – Angebote als Übergruppen (z. B. "Kleingruppen"), je mit QR-Code
//   Teil 2  "Mitarbeiten"  – jedes Team einzeln mit Beschreibung, Leitung und QR-Code
//
// Aufruf:  node scripts/build-pdf.js        →  build/gruppen.pdf
// Leitung: wird aus data/leiter.private.json gelesen (scripts/fetch-leaders.js), falls vorhanden.
//          Mit  OHNE_LEITER=1  wird sie bewusst weggelassen.
//
// DSGVO: Alles lokal – Schriften, Bilder und QR-Codes. Keine Anfragen an Dritte.

const fs   = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { chromium } = require('playwright');
const { BEREICHE, selectTeams, selectAngebote } = require('./lib/gruppen');

const ROOT  = path.join(__dirname, '..');
const OUT   = path.join(ROOT, 'build');
const stand = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bereichOf = slug => BEREICHE.find(b => b.slug === slug);

// Markdown-light wie im Gruppenfinder; Links werden im Druck nur als Text gezeigt
function markdown(text) {
  return esc(text).split(/\n\s*\n/).map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const inline = l => l
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1');
    if (lines.length === 1 && /^#{1,6}\s/.test(lines[0])) return `<p><strong>${inline(lines[0].replace(/^#+\s*/, ''))}</strong></p>`;
    if (lines.length && lines.every(l => /^[-•]\s/.test(l))) {
      return '<ul>' + lines.map(l => `<li>${inline(l.replace(/^[-•]\s/, ''))}</li>`).join('') + '</ul>';
    }
    return `<p>${lines.map(l => inline(l.replace(/^#{1,6}\s+/, ''))).join('<br>')}</p>`;
  }).join('');
}

async function qr(url) {
  return QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
}

const shortUrl = u => u.replace(/^https?:\/\//, '');

function facts(g) {
  return [
    g.meeting.weekday && ['Wann', [g.meeting.weekday, g.meeting.time].filter(Boolean).join(', ')],
    !g.meeting.weekday && g.meeting.time && ['Wann', g.meeting.time],
    g.meeting.targetGroup && ['Für wen', g.meeting.targetGroup],
  ].filter(Boolean);
}

async function card(g, { leiter } = {}) {
  const b = bereichOf(g.bereiche[0]);
  const bereiche = g.bereiche.map(s => bereichOf(s).name).join(' · ');
  const f = facts(g).map(([k, v]) => `<div><span>${k}</span> ${esc(v)}</div>`).join('');
  const lead = leiter?.length ? `<div class="leitung"><span>Leitung</span> ${esc(leiter.join(', '))}</div>` : '';
  return `
  <article class="card" style="--c:${b.color}">
    <div class="head">
      <div class="eyebrow">${esc(bereiche)}</div>
      <h3>${esc(g.name)}</h3>
      ${lead}${f}
    </div>
    <div class="body">
      ${g.image ? `<img src="../${esc(g.image)}" alt="">` : ''}
      <div class="desc">${markdown(g.description)}</div>
    </div>
    <div class="qr">
      <div class="qrcode">${await qr(g.url)}</div>
      <div class="qrtext"><strong>Mehr erfahren &amp; anmelden</strong><br>${esc(shortUrl(g.url))}</div>
    </div>
  </article>`;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'gruppen.json'), 'utf8'));
  const angebote = selectAngebote(data.groups);
  const teams = selectTeams(data.groups);

  let leiter = {};
  const leiterFile = path.join(ROOT, 'data', 'leiter.private.json');
  if (!process.env.OHNE_LEITER && fs.existsSync(leiterFile)) leiter = JSON.parse(fs.readFileSync(leiterFile, 'utf8'));
  else console.log('Hinweis: keine Leitung im PDF (data/leiter.private.json fehlt oder OHNE_LEITER=1).');

  const bereichSeiten = BEREICHE.map(b => `
    <div class="vb" style="--c:${b.color}"><h3>${b.name}</h3>
    <p>${angebote.filter(a => a.bereiche.includes(b.slug)).length} Angebote · ${teams.filter(t => t.bereiche.includes(b.slug)).length} Teams</p></div>`).join('');

  const angeboteHtml = (await Promise.all(angebote.map(g => card(g)))).join('');
  const teamsHtml = (await Promise.all(teams.map(g => card(g, { leiter: leiter[g.id] })))).join('');

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Gruppen &amp; Teams – Gemeinde in der Konkordia</title>
<style>
@font-face { font-family:'GrotesqueSC'; src:url('../assets/fonts/GrotesqueRegSC.ttf'); }
@font-face { font-family:'Gothic720'; src:url('../assets/fonts/gothic720l.ttf'); font-weight:300; }
@font-face { font-family:'Gothic720'; src:url('../assets/fonts/gothic720li.ttf'); font-weight:300; font-style:italic; }
@font-face { font-family:'Gothic725'; src:url('../assets/fonts/gothic725b.ttf'); font-weight:700; }
@page { size: A4; margin: 14mm 14mm 16mm; }
:root { --rot:#bb2232; --rot-d:#70141e; --text:#1c1a18; --muted:#4d4d4d; --soft:#f6f5f3;
  --head:'GrotesqueSC','Arial Narrow',Arial,sans-serif; --body:'Gothic720','Segoe UI',Arial,sans-serif; --bold:'Gothic725','Segoe UI',Arial,sans-serif; }
* { box-sizing:border-box; margin:0; padding:0; }
html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:var(--body); font-weight:300; font-size:9.2pt; line-height:1.4; color:var(--text); }
strong { font-family:var(--bold); font-weight:700; }
h1,h2,h3 { font-family:var(--head); font-weight:normal; text-transform:uppercase; line-height:1.05; }
.page-break { break-before:page; }

/* Titel */
.cover { height:262mm; display:flex; flex-direction:column; justify-content:space-between; border-top:8mm solid var(--rot); padding-top:14mm; }
.cover .eyebrow { font-family:var(--head); letter-spacing:.14em; color:var(--rot); font-size:13pt; text-transform:uppercase; }
.cover h1 { font-size:54pt; margin:6mm 0 8mm; }
.cover p { font-size:13pt; max-width:120mm; color:var(--muted); }
.cover img { width:34mm; }
.cover .foot { display:flex; justify-content:space-between; align-items:flex-end; color:var(--muted); font-size:9pt; }
.vbs { display:grid; grid-template-columns:1fr 1fr; gap:5mm; margin-top:10mm; }
.vb { border-top:2.5mm solid var(--c); background:var(--soft); padding:4mm 5mm 5mm; break-inside:avoid; }
.vb h3 { font-size:15pt; color:var(--c); margin-bottom:1.5mm; }
.vb p { color:var(--muted); font-size:9.5pt; }

/* Abschnitte */
.section-head { border-bottom:1.2mm solid var(--rot); padding-bottom:3mm; margin-bottom:5mm; }
.section-head h2 { font-size:26pt; }
.section-head p { color:var(--muted); margin-top:1.5mm; max-width:150mm; }

.cards { display:flex; flex-direction:column; gap:5mm; }
.card { --c:var(--rot); break-inside:avoid; border:.3mm solid #d8d6d2; border-left:2.2mm solid var(--c); display:grid;
  grid-template-columns:1fr 34mm; grid-template-areas:"head qr" "body qr"; column-gap:5mm; padding:4mm 4mm 4mm 5mm; }
.head { grid-area:head; }
.body { grid-area:body; margin-top:2mm; display:flex; gap:4mm; align-items:flex-start; }
.body img { width:34mm; height:26mm; object-fit:cover; flex:none; }
.eyebrow { font-family:var(--head); font-size:8pt; letter-spacing:.1em; text-transform:uppercase; color:var(--c); }
.card h3 { font-size:15pt; margin:.5mm 0 1.5mm; }
.head div:not(.eyebrow) { font-size:9pt; color:var(--muted); }
.head span { font-family:var(--bold); font-weight:700; color:var(--text); margin-right:1.5mm; }
.leitung { font-size:9.5pt !important; color:var(--text) !important; margin-bottom:.5mm; }
.desc p { margin-bottom:1.6mm; } .desc ul { margin:0 0 1.6mm 4.2mm; } .desc li { margin-bottom:.4mm; }
.qr { grid-area:qr; align-self:start; text-align:center; }
.qrcode svg { width:30mm; height:30mm; display:block; margin:0 auto 1.5mm; }
.qrtext { font-size:6.6pt; color:var(--muted); line-height:1.3; word-break:break-all; }
.qrtext strong { color:var(--text); font-size:7.2pt; }
.legal { margin-top:8mm; font-size:7.5pt; color:var(--muted); }
</style></head><body>

<section class="cover">
  <div>
    <div class="eyebrow">Gemeinde in der Konkordia · Bühl</div>
    <h1>Gruppen<br>&amp; Teams</h1>
    <p>Hier findest du, wo du dabei sein kannst und wo du mitarbeiten kannst. QR-Code scannen – und du bist bei der Gruppe.</p>
    <div class="vbs">${bereichSeiten}</div>
  </div>
  <div class="foot"><div>Stand: ${stand}<br>Alle Angaben ohne Gewähr.</div><img src="../assets/logos/logo-icon.png" alt=""></div>
</section>

<section class="page-break">
  <div class="section-head"><h2>Dabei sein</h2><p>Unsere Angebote für dich. Zu manchen gibt es mehrere Gruppen, zum Beispiel Kleingruppen an verschiedenen Orten – über den QR-Code findest du die passende.</p></div>
  <div class="cards">${angeboteHtml}</div>
</section>

<section class="page-break">
  <div class="section-head"><h2>Mitarbeiten</h2><p>Unsere Teams. Jedes Team stellt sich vor – und freut sich über dich. Über den QR-Code kommst du direkt zum Team.</p></div>
  <div class="cards">${teamsHtml}</div>
  <p class="legal">Datenschutz: Dieses Dokument enthält nur die öffentlichen Gruppeninfos. Die QR-Codes führen zu ChurchTools; dort gelten die Datenschutzhinweise der Gemeinde.</p>
</section>
</body></html>`;

  fs.mkdirSync(OUT, { recursive: true });
  const htmlPath = path.join(OUT, 'gruppen-print.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  await page.goto('file://' + htmlPath);
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: path.join(OUT, 'gruppen.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:7pt;color:#777;padding:0 14mm;display:flex;justify-content:space-between"><span>Gemeinde in der Konkordia · Gruppen &amp; Teams</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  await browser.close();
  console.log(`PDF: ${path.join(OUT, 'gruppen.pdf')} (${angebote.length} Angebote, ${teams.length} Teams)`);
}

main().catch(err => { console.error(err); process.exit(1); });
