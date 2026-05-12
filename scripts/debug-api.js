#!/usr/bin/env node
'use strict';

const BASE_URL = 'https://gemeindekonkordia.church.tools';
const API_BASE = `${BASE_URL}/api`;
const TOKEN    = process.env.CHURCHTOOLS_TOKEN;
if (!TOKEN) { console.error('CHURCHTOOLS_TOKEN fehlt'); process.exit(1); }

async function get(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Login ${TOKEN}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: res.status, body };
}

async function main() {
  // Bild-Download für Alpha-Kurs (321) testen
  const imageUrl = 'https://gemeindekonkordia.church.tools/images/931/0f9213a292188bed8dbde85e7c17076c8f746d7db419a0beb5ffece631f4d6bc';

  console.log('=== Bild-Download Test (Alpha-Kurs) ===');
  console.log('URL:', imageUrl);

  // Mit Auth-Header
  const r1 = await fetch(imageUrl, { headers: { Authorization: `Login ${TOKEN}` } });
  console.log('Mit Auth-Header → Status:', r1.status, r1.headers.get('content-type'));

  // Ohne Auth-Header
  const r2 = await fetch(imageUrl);
  console.log('Ohne Auth-Header → Status:', r2.status, r2.headers.get('content-type'));
}

main().catch(console.error);
