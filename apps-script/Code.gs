/**
 * Gorilla – Schnittstelle zwischen der Trainings-App und dem Google Sheet.
 *
 * Einrichtung (einmalig):
 *  1. Im Google Sheet: Erweiterungen → Apps Script, diesen Code einfügen, speichern.
 *  2. Oben die Funktion „setup“ auswählen und „Ausführen“ klicken, Zugriff erlauben.
 *     Findet setup Daten der alten Trainings-App (Tab „Log“ mit Gewicht | Wdh | RIR),
 *     werden sie automatisch übernommen. Die alten Tabs bleiben als „… (alt)“ erhalten.
 *     Danach steht der Zugangsschlüssel im Tab „Gorilla“ (Zelle B2).
 *  3. Bereitstellen → Neue Bereitstellung → Typ „Web-App“
 *     Ausführen als: „Ich“, Zugriff: „Jeder“ → Bereitstellen, Web-App-URL kopieren.
 *  4. In der App unter Einstellungen → Google Sheet: URL und Zugangsschlüssel eintragen.
 *
 * Tabs:
 *  Plan          Tag | Übung | Sätze | Wdh | RIR | Richtgewicht | Alternative | Hinweis | Pause | Video
 *                (pflegst du hier im Sheet; die App liest ihn bei jedem Sync)
 *  Log           eine Zeile pro Satz: Datum | Tag | Übung | Satz | Gewicht | Wdh | RIR | Status | Variante | Notiz | Einheit | Pos
 *  Einheiten     eine Zeile pro Training: id | Datum | Tag | Notiz | Geändert
 *  Körpergewicht Datum | Gewicht | Notiz | id
 *  Gorilla       Zugangsschlüssel, Zykluslänge (Deload), Trainingsstart
 *
 * Alle Datumswerte stehen als Text im Format JJJJ-MM-TT. Gewicht, Wdh und RIR sind echte Zahlen,
 * pro Satz eine Zeile. Dadurch kann Google Sheets nichts mehr in ein Datum umwandeln.
 */

var DEF = {
  plan: { name: 'Plan', cols: ['Tag', 'Übung', 'Sätze', 'Wdh', 'RIR', 'Richtgewicht', 'Alternative', 'Hinweis', 'Pause', 'Video'],
          text: ['Tag', 'Übung', 'Sätze', 'Wdh', 'RIR', 'Richtgewicht', 'Alternative', 'Hinweis', 'Video'] },
  log:  { name: 'Log', cols: ['Datum', 'Tag', 'Übung', 'Satz', 'Gewicht', 'Wdh', 'RIR', 'Status', 'Variante', 'Notiz', 'Einheit', 'Pos'],
          text: ['Datum', 'Tag', 'Übung', 'Status', 'Variante', 'Notiz', 'Einheit'] },
  ses:  { name: 'Einheiten', cols: ['id', 'Datum', 'Tag', 'Notiz', 'Geändert'], text: ['id', 'Datum', 'Tag', 'Notiz'] },
  bw:   { name: 'Körpergewicht', cols: ['Datum', 'Gewicht', 'Notiz', 'id'], text: ['Datum', 'Notiz', 'id'] }
};
var INFO = 'Gorilla';
var DEFAULT_CYCLE = 7;  // 6 Wochen normal + 1 Woche Deload

var CARDIO = [
  ['Zone-2-Cardio (locker)', '1', '25–35 min', '—', '—', 'Zügiger Lauf / Rad / Spazieren', 'Lockeres Dauer-Cardio in einem Tempo, bei dem du dich noch unterhalten könntest (Puls ca. 120–140). Rad, zügiges Gehen, Crosstrainer oder Rudergerät – gleichmäßig und entspannt, nicht außer Atem.', '', ''],
  ['Intervalle (30 s/90 s)', '1', '8–10×', '—', '—', 'Sprints / Treppen / Burpees', '30 s schnell/intensiv (Sprint, schnelles Radfahren oder Burpees), dann 90 s locker zur Erholung (gehen / lockeres Radfahren). 8–10× wiederholen. Die 30 s so intensiv, dass du danach deutlich außer Atem bist.', '', ''],
  ['Plank', '3', '30–45 s', '0–1', 'BW', '', 'Unterarmstütz: Ellenbogen unter den Schultern, Körper gerade wie ein Brett, Bauch und Po fest anspannen, nicht durchhängen. Zeit halten.', '60', ''],
  ['Side-Plank (je Seite)', '3', '20–30 s', '0–1', 'BW', '', 'Seitlicher Unterarmstütz, Hüfte oben halten, Körper in einer Linie. Beide Seiten gleich lang.', '60', ''],
  ['Hanging Leg Raises', '3', '12–15', '0–1', 'BW', '', 'An der Stange hängen, Beine kontrolliert anheben (gestreckt oder mit angewinkelten Knien), nicht schwingen, langsam senken.', '90', '']
];
var SAMPLE_PLAN = [
  ['Tag A – Oberkörper', 'Bankdrücken', '3', '6–8', '1–2', '60 kg', 'Kurzhantel-Bankdrücken', 'Schulterblätter zusammen und nach unten, Füße fest am Boden. Stange kontrolliert zur unteren Brust, kurz absetzen, explosiv hoch.', '150', ''],
  ['Tag A – Oberkörper', 'Rudern am Kabel', '3', '8–10', '1–2', '50 kg', 'Kurzhantel-Rudern', 'Brust raus, Ellenbogen eng am Körper nach hinten ziehen, oben kurz halten. Kein Schwung aus dem Rücken.', '120', ''],
  ['Tag B – Unterkörper', 'Kniebeuge', '3', '6–8', '1–2', '70 kg', 'Beinpresse', 'Knie in Richtung Fußspitzen, Rücken neutral, mindestens bis parallel. Gewicht über dem Mittelfuß.', '180', ''],
  ['Tag B – Unterkörper', 'Rumänisches Kreuzheben', '3', '8–10', '2', '60 kg', 'Hip Thrust', 'Hüfte nach hinten schieben, Stange nah an den Beinen, Rücken gerade. Dehnung in der hinteren Oberschenkelmuskulatur spüren.', '150', '']
].concat(CARDIO.map(function (r) { return ['Cardio & Core'].concat(r); }));

/* ---------- Einrichtung ---------- */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var migrated = isOldLog_(ss.getSheetByName('Log')) ? migrieren_(ss) : null;
  Object.keys(DEF).forEach(function (k) { ensureSheet_(k); });
  var plan = ss.getSheetByName(DEF.plan.name);
  if (plan.getLastRow() < 2) plan.getRange(2, 1, SAMPLE_PLAN.length, 10).setValues(SAMPLE_PLAN);

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) { token = Utilities.getUuid().replace(/-/g, ''); props.setProperty('TOKEN', token); }
  var info = ss.getSheetByName(INFO) || ss.insertSheet(INFO);
  var cur = info.getRange('B3:B4').getValues();
  info.getRange('A1:B5').setValues([
    ['Gorilla-Schnittstelle', ''],
    ['Zugangsschlüssel', token],
    ['Zyklus (Wochen inkl. Deload)', cur[0][0] || DEFAULT_CYCLE],
    ['Trainingsstart (JJJJ-MM-TT)', cur[1][0] instanceof Date ? day_(cur[1][0]) : (cur[1][0] || '')],
    ['Hinweis', 'Schlüssel in der App unter Einstellungen → Google Sheet eintragen. Nicht weitergeben. Jede Zyklus-Woche mit der Nummer = Zykluslänge ist eine Deload-Woche.']
  ]);
  info.getRange('B4').setNumberFormat('@');
  if (migrated && migrated.start) info.getRange('B4').setValue(migrated.start);
  info.getRange('A1').setFontWeight('bold');
  Logger.log('Zugangsschlüssel: ' + token);
  if (migrated) Logger.log('Übernommen: ' + migrated.sessions + ' Einheiten, ' + migrated.sets + ' Sätze. Details im Tab „Migration“.');
}

/** Neuen Schlüssel erzeugen, z. B. wenn der alte bekannt geworden ist. */
function neuerSchluessel() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  setup();
}

function ensureSheet_(k) {
  var ss = SpreadsheetApp.getActive(), def = DEF[k];
  var sh = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
  var w = def.cols.length;
  if (sh.getMaxColumns() < w) sh.insertColumnsAfter(sh.getMaxColumns(), w - sh.getMaxColumns());
  var head = sh.getRange(1, 1, 1, w).getValues()[0];
  def.cols.forEach(function (c, i) { if (!String(head[i]).trim()) head[i] = c; });
  sh.getRange(1, 1, 1, w).setValues([head]).setFontWeight('bold');
  sh.setFrozenRows(1);
  def.text.forEach(function (c) {
    sh.getRange(2, def.cols.indexOf(c) + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });
  return sh;
}

/* ---------- Web-App ---------- */
function doGet() {
  return ContentService.createTextOutput('Gorilla-Schnittstelle läuft.');
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || req.token !== token) return json_({ ok: false, error: 'unauthorized' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    applyOps_(req.ops || []);
    return json_({ ok: true, data: snapshot_(), serverTime: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Schreiben ---------- */
function applyOps_(ops) {
  if (!ops.length) return;
  var ses = {}, bw = {}, cfg = null;
  ops.forEach(function (o) {
    if (o.k === 'ses') ses[o.id] = o.op === 'del' ? null : o.d;
    else if (o.k === 'bw') bw[o.id] = o.op === 'del' ? null : o.d;
    else if (o.k === 'cfg') cfg = o.d;
  });
  var sesIds = Object.keys(ses);
  if (sesIds.length) {
    // Einheiten: Zeile ersetzen oder löschen
    var sRows = readRows_('ses').filter(function (r) { return !(String(r[0]) in ses); });
    sesIds.forEach(function (id) {
      var s = ses[id];
      if (s) sRows.push([s.id, s.date, txt_(s.day), txt_(s.note), new Date(s.u || Date.now())]);
    });
    sRows.sort(function (a, b) { return cmp_(day_(a[1]), day_(b[1])); });
    writeRows_('ses', sRows);

    // Log: alle Sätze der betroffenen Einheiten neu schreiben
    var lRows = readRows_('log').filter(function (r) { return !(String(r[10]) in ses); });
    sesIds.forEach(function (id) { if (ses[id]) lRows = lRows.concat(logRows_(ses[id])); });
    lRows.sort(function (a, b) {
      return cmp_(day_(a[0]), day_(b[0])) || cmp_(String(a[10]), String(b[10])) || (a[11] - b[11]) || ((Number(a[3]) || 0) - (Number(b[3]) || 0));
    });
    writeRows_('log', lRows);
  }
  if (Object.keys(bw).length) {
    var bRows = readRows_('bw').filter(function (r) { return !(String(r[3]) in bw); });
    Object.keys(bw).forEach(function (id) {
      var b = bw[id];
      if (b) bRows.push([b.date, Number(b.kg), txt_(b.note), b.id]);
    });
    bRows.sort(function (a, b) { return cmp_(day_(a[0]), day_(b[0])); });
    writeRows_('bw', bRows);
  }
  if (cfg) {
    var info = SpreadsheetApp.getActive().getSheetByName(INFO);
    if (info) {
      info.getRange('B3').setValue(Number(cfg.cycle) || DEFAULT_CYCLE);
      info.getRange('B4').setNumberFormat('@').setValue(cfg.start || '');
    }
  }
}

/** Eine Einheit in Log-Zeilen umwandeln: pro Satz eine Zeile, übersprungene Übungen als eine Zeile ohne Satz. */
function logRows_(s) {
  var out = [];
  (s.ex || []).forEach(function (x, pos) {
    var skip = x.st === 'skip';
    var sets = skip ? [] : (x.sets || []).filter(function (t) { return t && (t.w !== '' && t.w != null || t.r !== '' && t.r != null); });
    if (!skip && !sets.length && !x.note) return;           // nichts erfasst
    var base = [s.date, txt_(s.day), txt_(x.n)];
    var tail = [skip ? 'übersprungen' : 'erledigt', txt_(x.alt || ''), '', s.id, pos];
    if (!sets.length) { out.push(base.concat(['', '', '', ''], tail.slice(0, 2), [txt_(x.note || '')], tail.slice(3))); return; }
    sets.forEach(function (t, i) {
      out.push(base.concat([i + 1, numOrBlank_(t.w), numOrBlank_(t.r), numOrBlank_(t.rir)], tail.slice(0, 2), [i === 0 ? txt_(x.note || '') : ''], tail.slice(3)));
    });
  });
  return out;
}

function sheet_(k) {
  var sh = SpreadsheetApp.getActive().getSheetByName(DEF[k].name);
  return sh || ensureSheet_(k);
}
function readRows_(k) {
  var sh = sheet_(k), n = sh.getLastRow() - 1, w = DEF[k].cols.length;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, w).getValues().filter(function (r) { return r.some(function (v) { return v !== ''; }); });
}
function writeRows_(k, rows) {
  var sh = sheet_(k), w = DEF[k].cols.length, old = Math.max(sh.getLastRow() - 1, 0);
  if (old) sh.getRange(2, 1, old, w).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, w).setValues(rows);
}

/* ---------- Lesen ---------- */
function snapshot_() {
  fillIds_();
  var info = SpreadsheetApp.getActive().getSheetByName(INFO);
  var cfg = info ? info.getRange('B3:B4').getValues() : [[DEFAULT_CYCLE], ['']];

  // Plan über die Kopfzeile lesen, damit zusätzliche oder umsortierte Spalten nicht stören
  var psh = sheet_('plan'), pv = psh.getDataRange().getValues(), ph = pv.shift().map(function (h) { return String(h).trim().toLowerCase(); });
  var col = function (name) { return ph.indexOf(name.toLowerCase()); };
  var pc = { day: col('Tag'), name: col('Übung'), sets: col('Sätze'), reps: col('Wdh'), rir: col('RIR'), target: col('Richtgewicht'),
             alt: col('Alternative'), hint: col('Hinweis'), rest: col('Pause'), video: col('Video') };
  var plan = pv.filter(function (r) { return pc.name >= 0 && String(r[pc.name]).trim(); }).map(function (r) {
    var g = function (k) { return pc[k] >= 0 ? cellText_(r[pc[k]]) : ''; };
    return { day: g('day'), name: g('name'), sets: g('sets'), reps: g('reps'), rir: g('rir'), target: g('target'),
             alt: g('alt'), hint: g('hint'), rest: Number(g('rest')) || 0, video: g('video') };
  });

  var byId = {}, order = [];
  readRows_('ses').forEach(function (r) {
    var id = String(r[0]);
    byId[id] = { id: id, date: day_(r[1]), day: String(r[2]), note: String(r[3] || ''), u: r[4] instanceof Date ? r[4].getTime() : 0, ex: [] };
    order.push(id);
  });
  readRows_('log').forEach(function (r) {
    var id = String(r[10]);
    var s = byId[id];
    if (!s) { s = byId[id] = { id: id, date: day_(r[0]), day: String(r[1]), note: '', u: 0, ex: [] }; order.push(id); }
    var name = String(r[2]).trim(), pos = Number(r[11]) || 0, alt = String(r[8] || '');
    var x = s.ex.filter(function (e) { return e.n === name && e.pos === pos; })[0];
    if (!x) { x = { n: name, pos: pos, st: String(r[7]) === 'übersprungen' ? 'skip' : 'done', alt: alt, note: '', sets: [] }; s.ex.push(x); }
    if (r[9] !== '' && !x.note) x.note = String(r[9]);
    if (r[3] !== '' || r[4] !== '' || r[5] !== '') x.sets.push({ w: num_(r[4]), r: num_(r[5]), rir: num_(r[6]) });
  });
  var ses = order.map(function (id) {
    var s = byId[id];
    s.ex.sort(function (a, b) { return a.pos - b.pos; });
    s.ex.forEach(function (x) { delete x.pos; });
    return s;
  });

  var bw = readRows_('bw').map(function (r) {
    return { id: String(r[3]), date: day_(r[0]), kg: num_(r[1]), note: String(r[2] || '') };
  });
  return {
    plan: plan, ses: ses, bw: bw,
    cfg: { cycle: Number(cfg[0][0]) || DEFAULT_CYCLE, start: cfg[1][0] instanceof Date ? day_(cfg[1][0]) : String(cfg[1][0] || '') },
    url: SpreadsheetApp.getActive().getUrl()
  };
}

/** Von Hand im Sheet ergänzte Zeilen ohne id bekommen eine, damit die App sie bearbeiten kann. */
function fillIds_() {
  var b = readRows_('bw'), changed = false;
  b.forEach(function (r) { if (!String(r[3])) { r[3] = 'bw-' + Utilities.getUuid().slice(0, 8); changed = true; } });
  if (changed) writeRows_('bw', b);
  var l = readRows_('log'); changed = false;
  l.forEach(function (r) {
    if (!String(r[10]) && String(r[2]).trim()) { r[10] = 'h-' + day_(r[0]).replace(/-/g, '') + '-' + slug_(r[1]); changed = true; }
  });
  if (changed) writeRows_('log', l);
}

/* ---------- Übernahme aus der alten Trainings-App ---------- */
function isOldLog_(sh) {
  if (!sh) return false;
  var h = sh.getRange(1, 1, 1, 7).getValues()[0].map(function (v) { return String(v).trim(); });
  return h[0] === 'Datum' && h[2] === 'Übung' && h[3] === 'Gewicht' && h[4] === 'Wdh';
}

function migrieren_(ss) {
  var tz = ss.getSpreadsheetTimeZone(), us = /^en_US/.test(ss.getSpreadsheetLocale());
  var old = ss.getSheetByName('Log');
  var rows = old.getDataRange().getValues(); rows.shift();
  var report = [['Zeile', 'Datum', 'Übung', 'Hinweis']];
  var sessions = {}, logRows = [], posBy = {}, minDate = null;

  rows.forEach(function (r, i) {
    var ex = String(r[2] || '').trim(); if (!ex) return;
    var date = day_(r[0]); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { report.push([i + 2, String(r[0]), ex, 'Datum unlesbar, Zeile übersprungen']); return; }
    var tag = String(r[1] || '').trim();
    var sid = 'a-' + date.replace(/-/g, '') + '-' + slug_(tag);
    if (!sessions[sid]) { sessions[sid] = [sid, date, tag, '', new Date()]; posBy[sid] = {}; }
    if (!minDate || date < minDate) minDate = date;
    if (!(ex in posBy[sid])) posBy[sid][ex] = Object.keys(posBy[sid]).length;
    var notes = [], year = Number(date.slice(0, 4));
    var w = splitOld_(r[3], year, us, notes, 'Gewicht'), reps = splitOld_(r[4], year, us, notes, 'Wdh'), rir = splitOld_(r[5], year, us, notes, 'RIR');
    var n = Math.max(w.length, reps.length, rir.length);
    var note = String(r[6] == null ? '' : r[6]).trim();
    var keep = notes.filter(function (x) { return x.keep; }).map(function (x) { return x.text; });
    if (keep.length) note = (note ? note + ' ' : '') + '[alt: ' + keep.join(', ') + ']';
    notes.forEach(function (x) { report.push([i + 2, date, ex, x.text]); });
    var base = [date, tag, ex];
    if (!n) { logRows.push(base.concat(['', '', '', '', 'erledigt', '', txt_(note), sid, posBy[sid][ex]])); return; }
    for (var k = 0; k < n; k++) {
      var pick = function (a) { return a.length === 1 ? a[0] : (k < a.length ? a[k] : ''); };
      logRows.push(base.concat([k + 1, pick(w), pick(reps), pick(rir), 'erledigt', '', k === 0 ? txt_(note) : '', sid, posBy[sid][ex]]));
    }
  });

  // Alte Tabs als Sicherung behalten
  old.setName(uniqueName_(ss, 'Log (alt)'));
  var oldPlan = ss.getSheetByName('Plan');
  if (oldPlan) oldPlan.copyTo(ss).setName(uniqueName_(ss, 'Plan (alt)'));
  var oldBw = ss.getSheetByName('Körpergewicht');
  if (oldBw) oldBw.copyTo(ss).setName(uniqueName_(ss, 'Körpergewicht (alt)'));

  ensureSheet_('ses'); ensureSheet_('log');
  var ses = Object.keys(sessions).map(function (k) { return sessions[k]; }).sort(function (a, b) { return cmp_(a[1], b[1]); });
  logRows.sort(function (a, b) { return cmp_(a[0], b[0]) || cmp_(a[10], b[10]) || (a[11] - b[11]) || ((Number(a[3]) || 0) - (Number(b[3]) || 0)); });
  writeRows_('ses', ses);
  writeRows_('log', logRows);

  // Körpergewicht: id-Spalte ergänzen, Datum als Text
  if (oldBw) {
    var bv = oldBw.getDataRange().getValues(); bv.shift();
    var b = bv.filter(function (r) { return r[0] !== '' && r[1] !== ''; }).map(function (r) {
      return [day_(r[0]), num_(r[1]), txt_(String(r[2] || '')), 'bw-' + Utilities.getUuid().slice(0, 8)];
    });
    ensureSheet_('bw'); writeRows_('bw', b);
  }

  // Plan: Spalten Pause und Video ergänzen, Cardio-Tag aus der alten App übernehmen (war dort fest im Code)
  if (oldPlan) {
    ensureSheet_('plan');
    var pv = oldPlan.getDataRange().getValues(); pv.shift();
    var outPlan = [], cardioDone = {};
    pv.forEach(function (r) {
      if (!String(r[1]).trim()) return;
      var tag = String(r[0]).trim();
      if (/cardio/i.test(tag)) {
        if (!cardioDone[tag]) { cardioDone[tag] = true; CARDIO.forEach(function (c) { outPlan.push([tag].concat(c)); }); }
        return;
      }
      var row = [];
      for (var c = 0; c < 10; c++) row.push(c < r.length ? cellText_(r[c], us) : '');
      outPlan.push(row);
    });
    writeRows_('plan', outPlan);
  }

  var start = minDate ? mondayIso_(minDate) : '';
  var rep = ss.getSheetByName('Migration') || ss.insertSheet('Migration');
  rep.clear();
  if (report.length === 1) report.push(['', '', '', 'Alles ohne Auffälligkeiten übernommen.']);
  rep.getRange(1, 1, report.length, 4).setValues(report);
  rep.getRange(1, 1, 1, 4).setFontWeight('bold');
  return { sessions: ses.length, sets: logRows.length, start: start };
}

/**
 * Alte Zelle wie „60/60/57,5“ in einzelne Satzwerte zerlegen.
 * Hat Google Sheets die Eingabe schon in ein Datum verwandelt (z. B. „8/8/8“ → 8/8/2008), werden die Zahlen zurückgewonnen.
 */
function splitOld_(v, year, us, notes, label) {
  if (v === '' || v == null) return [];
  if (typeof v === 'number') return [v];
  if (v instanceof Date) {
    var y = v.getFullYear();
    if (y < 1901) { // Uhrzeit, z. B. „1:30“
      notes.push({ text: label + ' war als Uhrzeit gespeichert (' + v.getHours() + ':' + ('0' + v.getMinutes()).slice(-2) + '), bitte prüfen', keep: true });
      return [];
    }
    var a = us ? v.getMonth() + 1 : v.getDate(), b = us ? v.getDate() : v.getMonth() + 1;
    var parts = y === year ? [a, b] : [a, b, y % 100];
    notes.push({ text: label + ' war als Datum gespeichert, zurückgewonnen als ' + parts.join('/') + ' (bitte prüfen)', keep: false });
    return parts;
  }
  var s = String(v).trim();
  var bits = s.split(/\s*[\/;|]\s*|\s+/).filter(String);
  var nums = bits.map(function (x) { return toNum_(x); });
  if (nums.some(function (n) { return n === null; })) {
    notes.push({ text: label + ' „' + s + '“', keep: true });
    return nums.filter(function (n) { return n !== null; });
  }
  return nums;
}

/* ---------- Helfer ---------- */
function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }
/** Beliebigen Datumswert als JJJJ-MM-TT. Nutzt die Zeitzone des Sheets (nicht die des Skripts), damit sich kein Tag verschiebt. */
function day_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s.slice(0, 10);
}
function mondayIso_(iso) {
  var p = iso.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function toNum_(x) {
  var s = String(x).trim().replace(/kg$/i, '').replace(',', '.');
  if (s === '') return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}
function num_(v) {
  if (typeof v === 'number') return v;
  if (v === '' || v == null || v instanceof Date) return '';
  var n = toNum_(v);
  return n === null ? '' : n;
}
function numOrBlank_(v) {
  if (v === '' || v == null) return '';
  var n = Number(String(v).replace(',', '.'));
  return isFinite(n) ? n : '';
}
/** Zelleninhalt als Text, auch wenn Sheets daraus schon ein Datum gemacht hat (z. B. Wdh „8/8/8“ im Plan). */
function cellText_(v, us) {
  if (v instanceof Date) {
    if (v.getFullYear() < 1901) return v.getHours() + ':' + ('0' + v.getMinutes()).slice(-2);
    if (us === undefined) us = /^en_US/.test(SpreadsheetApp.getActive().getSpreadsheetLocale());
    return (us ? [v.getMonth() + 1, v.getDate()] : [v.getDate(), v.getMonth() + 1]).join('/');
  }
  return String(v == null ? '' : v).trim();
}
/** Text so schreiben, dass Sheets ihn nicht als Formel ausführt. */
function txt_(s) {
  s = String(s == null ? '' : s);
  return /^[=+]/.test(s) ? "'" + s : s;
}
function slug_(s) {
  return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}
function cmp_(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function uniqueName_(ss, name) {
  var n = name, i = 2;
  while (ss.getSheetByName(n)) n = name + ' ' + i++;
  return n;
}
