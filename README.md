# Gorilla

Krafttraining in Sekunden protokollieren, auch ohne Netz im Studio. Die App läuft als Web-App (PWA) auf dem Handy-Homescreen. Datenbasis ist ein Google Sheet.

- **Training:** Trainingstag antippen, pro Satz Gewicht, Wiederholungen und RIR eintragen. Die Werte vom letzten Mal stehen als Vorschlag im Feld, ein Tipp auf ✓ übernimmt sie. Danach läuft automatisch die Satzpause.
- **Hinweise:** Ausführungshinweis, Alternative und Video-Link aus dem Plan direkt an der Übung. Dazu ein Vorschlag nach doppelter Progression („Heute 62,5 kg versuchen“) und Deload-Hinweise.
- **Überspringen:** Übung mit Grund überspringen (Gerät belegt, Schmerzen …). Die Werte der Vorwoche bleiben trotzdem sichtbar.
- **Nachtragen:** Trainings für jedes vergangene Datum erfassen oder später bearbeiten.
- **Verlauf:** Einheiten nach Woche und Deload-Zyklus, Fortschritt pro Übung als Kurve.
- **Körpergewicht:** Einträge mit Datum, Kurve mit 7-Tage-Schnitt.
- **Offline:** Alles wird sofort auf dem Gerät gespeichert und synchronisiert, sobald wieder Netz da ist.

## Aufbau

| Datei | Zweck |
| --- | --- |
| `index.html`, `app.css`, `app.js` | Die App, reines HTML/CSS/JS ohne Build-Schritt |
| `sw.js` | Service Worker: lädt die App sofort aus dem Gerätespeicher, auch offline |
| `manifest.webmanifest`, `icons/` | Name und Gorilla-Icon für den Homescreen |
| `apps-script/Code.gs` | Schnittstelle im Google Sheet, inklusive Übernahme der Daten aus der alten Trainings-App |

## Das Sheet

| Tab | Inhalt |
| --- | --- |
| **Plan** | `Tag · Übung · Sätze · Wdh · RIR · Richtgewicht · Alternative · Hinweis · Pause · Video`. Pflegst du im Sheet, die App liest ihn bei jedem Sync. `Pause` in Sekunden (leer = 90). Mehrere Alternativen mit `/` trennen. |
| **Log** | Eine Zeile pro Satz: `Datum · Tag · Übung · Satz · Gewicht · Wdh · RIR · Status · Variante · Notiz · Einheit · Pos`. Status ist `erledigt` oder `übersprungen`. |
| **Einheiten** | Eine Zeile pro Training mit Notiz |
| **Körpergewicht** | `Datum · Gewicht · Notiz · id` |
| **Gorilla** | Zugangsschlüssel (B2), Zykluslänge (B3), Trainingsstart (B4) |

Datumswerte stehen als Text `JJJJ-MM-TT`, Gewicht und Wiederholungen als echte Zahlen, ein Satz pro Zeile. Deshalb kann Google Sheets daraus kein Datum mehr machen.
Übungen werden über ihren Namen zugeordnet. Benennst du eine Übung im Plan um, beginnt ihr Verlauf neu.

## Einrichtung

### 1. App veröffentlichen (GitHub Pages)

1. Im Repository: **Settings → Pages**.
2. Bei „Source“ **Deploy from a branch** wählen, Branch `main`, Ordner `/ (root)`, speichern.
3. Nach etwa einer Minute ist die App unter `https://fmbaechle.github.io/Gorilla/` erreichbar.

### 2. Google Sheet anbinden

Am besten mit einer **Kopie** deines bisherigen Trainings-Sheets. Dann läuft die alte App unverändert weiter, bis du umgestiegen bist.

1. Altes Sheet öffnen, **Datei → Kopie erstellen**, z. B. „Gorilla“.
2. In der Kopie **Erweiterungen → Apps Script** öffnen. Den alten Code (`Code.gs`, `Index.html` usw.) löschen, den Inhalt von [`apps-script/Code.gs`](apps-script/Code.gs) einfügen und speichern.
3. Oben die Funktion **`setup`** auswählen und **Ausführen** klicken. Den Zugriff erlauben.
   - Findet `setup` das alte Log, übernimmt es alle Trainings: Werte wie `60/60/57,5` werden in einzelne Sätze zerlegt, Wiederholungen, die Sheets in ein Datum verwandelt hatte (`8/8/2008`), werden zurückgewonnen. Was geprüft werden sollte, steht im neuen Tab **Migration**.
   - Die alten Tabs bleiben als „Log (alt)“, „Plan (alt)“ und „Körpergewicht (alt)“ erhalten.
   - Der Cardio-Tag, der in der alten App fest im Code stand, wird in den Tab Plan geschrieben.
   - Der Trainingsstart für den Deload-Zyklus wird auf den Montag deines ersten Trainings festgelegt.
4. **Bereitstellen → Neue Bereitstellung**, Typ **Web-App**:
   - Ausführen als: **Ich**
   - Zugriff: **Jeder**
   Dann **Bereitstellen** klicken und die Web-App-URL kopieren (endet auf `/exec`).
5. Den Zugangsschlüssel aus dem Tab **Gorilla**, Zelle B2, kopieren.
6. In der App unter **Einstellungen → Google Sheet** URL und Schlüssel eintragen und auf **Verbinden** tippen.

„Zugriff: Jeder“ ist nötig, damit die App ohne Google-Login zugreifen kann. Geschützt ist die Schnittstelle durch den Zugangsschlüssel. Ist er bekannt geworden, erzeugt die Funktion `neuerSchluessel` einen neuen.

Wenn du `Code.gs` später änderst: **Bereitstellen → Bereitstellungen verwalten**, Stift-Symbol, Version „Neue Version“. So bleibt die URL gleich.

### 3. Auf den Homescreen legen

- **iPhone:** die App-Adresse in Safari öffnen, **Teilen → Zum Home-Bildschirm**.
- **Android:** in Chrome über das Menü **App installieren** oder über den Button in den Einstellungen der App.

## Lokal ausprobieren

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```
