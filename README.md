# Gruppenmodul – Gemeinde in der Konkordia

Automatisch aktualisiertes Gruppenverzeichnis. Holt Gruppen-Daten aus ChurchTools und stellt sie als statische Webseite bereit.

---

## Datenfluss

```
ChurchTools API
    ↓ (täglich automatisch, 04:00 Uhr UTC)
scripts/fetch-groups.js
    ↓ schreibt
data/gruppen.json  ←  Einzige Wahrheitsquelle
    ↓ wird geladen von
gruppenfinder.html / index.html / embed.html
```

---

## Dateien

| Datei | Rolle |
|---|---|
| `scripts/fetch-groups.js` | Holt alle Gruppen von der ChurchTools-API, lädt die Gruppenbilder nach `assets/images/`, baut die Hierarchie auf und speichert alles in `gruppen.json` |
| `data/gruppen.json` | Alle Gruppen-Daten (Name, Beschreibung, Bild, Hierarchie) |
| `gruppenfinder.html` | **Gruppenfinder für Gäste** – Suche, die vier Visionsbereiche, Filter, Detailansicht. Empfohlene Version für die Homepage |
| `index.html` | Einfache Listenansicht mit Suchfunktion |
| `embed.html` | Einbettbare, gebrandete Version mit Tabs und Hierarchie – Produktiv-Version |
| `preview-design.html` | Design-Entwurf, noch nicht live |
| `.github/workflows/fetch-groups.yml` | Startet täglich den Sync automatisch |
| `.github/workflows/debug-api.yml` | Manuelle Diagnose bei API-Problemen |

---

## Gruppen-Datenstruktur

```json
{
  "generatedAt": "2026-05-13T06:43:36.286Z",
  "groups": [
    {
      "id": 321,
      "name": "Alpha-Kurs - 2026",
      "groupTypeId": 4,
      "parentGroupIds": [351],
      "childGroupIds": [],
      "description": "...",
      "publicUrl": "...",
      "imageUrl": "assets/images/group-321.jpg",
      "tags": ["Einsteiger"],
      "meeting": { "weekday": "Dienstag", "time": "19:00 Uhr", "targetGroup": null, "ageGroups": null },
      "settings": { "isHidden": false }
    }
  ]
}
```

Gruppen bilden eine Baumstruktur über `parentGroupIds` / `childGroupIds`.

---

## Gruppenfinder – Pflege in ChurchTools

Alles, was Gäste im Gruppenfinder sehen, wird in ChurchTools gepflegt. Am nächsten Morgen (Sync 04:00 UTC) ist es online.

| Was | Wo in ChurchTools |
|---|---|
| **Bereich** | Die Gruppe unter einen der vier Visionsbereiche (Gruppentyp *Visionsbereich*) hängen – direkt oder über eine Zwischengruppe wie „Kurse“. Mehrere Bereiche sind möglich. |
| **Dabei sein / Mitarbeiten** | Gruppentyp *Teams / Dienste* erscheint unter „Mitarbeiten“, alle anderen unter „Dabei sein“. Ausnahme per Tag `Angebot` bzw. `Mitarbeit` (z. B. Frauenarbeit, Senioren, Konkordia Kids → Tag `Angebot`). |
| **Für-wen-Filter** | Tags an der Gruppe, z. B. `Einsteiger`, `Familie & Kinder`, `Jugend`, `Frauen`, `Männer`, `Senioren`. Jeder Tag wird automatisch zu einem Filter-Knopf. |
| **Text** | Gruppenbeschreibung (Notiz). `**fett**`, Listen mit `- ` und Links `[Text](https://…)` werden dargestellt. |
| **Bild** | Gruppenbild – wird beim Sync heruntergeladen und von hier aus ausgeliefert. |
| **Wann / Für wen** | Felder Wochentag, Uhrzeit, Zielgruppe, Altersgruppe der Gruppe (optional). |
| **Kontakt / Anmeldung** | Öffentliche ChurchTools-Gruppenseite (`publicgroup/{id}`). |

Eine Gruppe erscheint nur, wenn sie **eine Beschreibung hat**, **nicht versteckt** ist und **unter einem der vier Bereiche** hängt. Zwischengruppen ohne Beschreibung (z. B. „Kurse“, „Gebet“) dienen nur der Sortierung.

**Einbettung** (gleiches Resize-Snippet wie bei `embed.html`):

```html
<iframe data-gidk src="https://jcdappen.github.io/Gruppenmodul/gruppenfinder.html"
  width="100%" height="0" frameborder="0" scrolling="no"
  style="border:none;width:100%;display:block;overflow:hidden;"></iframe>
```

Parameter: `?v=leben-mit-gott` (bzw. `leben-in-transformation`, `leben-in-gemeinschaft`, `leben-in-der-welt`) wählt einen Bereich vor, `?typ=mitarbeit` öffnet „Mitarbeiten“, `#gruppe-321` öffnet eine Gruppe direkt.

### Datenschutz (DSGVO)

- Keine Leiter-/Personendaten in `gruppen.json` – Kontakt läuft über die ChurchTools-Gruppenseite.
- Gruppenbilder und Schriften werden selbst ausgeliefert; der Gruppenfinder lädt nichts von Drittanbietern, setzt keine Cookies und nutzt kein Tracking.
- Hinweis für die Datenschutzerklärung: Beim Hosting über GitHub Pages wird die IP-Adresse der Besucher an GitHub (USA, EU-US Data Privacy Framework) übermittelt. Alternative: den Ordner auf dem eigenen Webspace ausliefern – die Seiten sind rein statisch.

---

## Funktionen

### index.html
- Lädt `gruppen.json` und rendert alle Gruppen als Karten-Grid
- Echtzeit-Suche nach Name und Beschreibung
- Markdown-Lite in Beschreibungen: `**fett**`, Absätze, Zeilenumbrüche

### embed.html
- Einbettbar per iFrame auf externen Seiten
- URL-Parameter `?v=Gebet` filtert auf einen Visionsbereich
- Tabs für Untergruppen des Visionsbereichs
- Eigene Schriftarten (Gothic720, Gothic725, GrotesqueSC)
- Sendet per `postMessage` die aktuelle Höhe an den Eltern-Frame (automatisches Resize)
- Fallback-Bild (`assets/images/fallback.svg`) bei fehlenden Gruppenbildern

### embed.html?v=Gebet – Beispiel
```
Visionsbereich "Gebet"
 ├── Tab: Gebetskreis
 │    └── Gruppe A, Gruppe B
 └── Tab: Morgengebet
      └── Gruppe C
```

---

## ChurchTools API

**Base URL:** `https://gemeindekonkordia.church.tools/api`  
**Auth:** `Authorization: Login {TOKEN}` (als GitHub Secret `CHURCHTOOLS_TOKEN`)

| Endpoint | Zweck |
|---|---|
| `GET /groups` | Alle Gruppen paginiert (100/Seite) |
| `GET /groups/{id}` | Details: Bild, Beschreibung, Typ |
| `GET /groups/{id}/children` | Direkte Untergruppen-IDs |

---

## Deployment

- **Hosting:** GitHub Pages
- **Daten-Update:** Automatisch täglich via GitHub Actions
- **Kein Backend:** Alles statisch; Daten werden als JSON versioniert
