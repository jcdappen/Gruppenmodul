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
index.html / embed.html
```

---

## Dateien

| Datei | Rolle |
|---|---|
| `scripts/fetch-groups.js` | Holt alle Gruppen von der ChurchTools-API, baut die Hierarchie auf und speichert alles in `gruppen.json` |
| `data/gruppen.json` | Alle Gruppen-Daten (Name, Beschreibung, Bild, Hierarchie) |
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
      "imageUrl": "...",
      "settings": { "isHidden": false },
      "leaders": []
    }
  ]
}
```

Gruppen bilden eine Baumstruktur über `parentGroupIds` / `childGroupIds`.

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
