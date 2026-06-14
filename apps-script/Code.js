// Google Apps Script web app — the live source for the Sheet-bound script.
// Managed with clasp: edit here, then `clasp push` and redeploy to the
// existing deployment (`clasp deploy -i <id>`) to keep the /exec URL stable.
// Deployed as a web app: execute as the deploying user, access ANYONE_ANONYMOUS.
//
// Sheet schema (row 1 = header): [id, timestamp, weight, color, chicken].
// `id` gives entries a stable identity so the frontend can upsert, delete, and
// dedupe rows across devices. All POSTs are text/plain (no CORS preflight).

var HEADER = ['id', 'timestamp', 'weight', 'color', 'chicken'];

function sheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
}

// GET → all entries as objects (header row skipped). Empty weight → null.
function doGet() {
  var sheet = sheet_();
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row[0] === '' && row[1] === '') continue; // skip blank rows
    out.push({
      id: String(row[0]),
      timestamp: row[1] instanceof Date ? row[1].toISOString() : String(row[1]),
      weight: row[2] === '' || row[2] == null ? null : Number(row[2]),
      color: row[3],
      chicken: row[4] === '' ? null : row[4],
    });
  }
  return json(out);
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var action = body.action || 'upsert';
  if (action === 'delete') return json({ ok: true, deleted: deleteById_(body.id) });
  if (action === 'clear') return json({ ok: true, cleared: clearAll_() });
  if (action === 'append') {
    return json({ ok: true, appended: appendRows_(body.entries) });
  }
  if (action === 'batch') {
    return json({ ok: true, upserted: batchUpsert_(body.entries) });
  }
  if (action === 'notify') {
    return json({ ok: true, sent: notify_(body) });
  }
  upsert_(body); // default: upsert a single entry
  return json({ ok: true });
}

// Fire a cross-device push via OneSignal when an egg is logged in real time. The
// client posts this only from the live-save path (never imports/backlog/sync).
//
// Gated on Script Properties: ONESIGNAL_API_KEY (the secret REST key) and
// ONESIGNAL_APP_ID. They're set on the PROD script only, so the debug script —
// running this same code — is a silent no-op. Returns 1 if a send was attempted.
//
// The sender is excluded by a tag filter: each opted-in device tags its OneSignal
// subscription `device=<deviceId>`, and we target everyone whose tag != the
// logging device's id. Best-effort: failures are swallowed so a notify can never
// break the (separate) data write.
function notify_(body) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('ONESIGNAL_API_KEY');
  var appId = props.getProperty('ONESIGNAL_APP_ID');
  if (!apiKey || !appId) return 0; // not provisioned (e.g. debug backend) → no-op

  var payload = {
    app_id: appId,
    target_channel: 'push',
    included_segments: ['Subscribed Users'],
    headings: { en: 'Eggo' },
    contents: { en: notifyText_(body) },
    url: 'https://www.davidtorosyan.com/eggo/',
  };
  if (body.deviceId) {
    payload.filters = [
      { field: 'tag', key: 'device', relation: '!=', value: String(body.deviceId) },
    ];
  }

  try {
    UrlFetchApp.fetch('https://api.onesignal.com/notifications', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Key ' + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    return 1;
  } catch (err) {
    return 0; // never let a push failure surface to the client
  }
}

// "🥚 A new <color> egg was logged" (+ hen when known).
function notifyText_(body) {
  var color = body.color ? String(body.color) : '';
  var who = body.chicken ? ' by ' + String(body.chicken) : '';
  var what = color ? 'A new ' + color + ' egg' : 'A new egg';
  return '🥚 ' + what + ' was logged' + who;
}

// Append new rows without scanning the sheet — O(rows), not O(total). The client
// only sends entries here that have never been sent, so there's nothing to dedupe
// (retries fall back to the upsert batch path, which is idempotent).
function appendRows_(items) {
  if (!items.length) return 0;
  var sheet = sheet_();
  ensureHeader_(sheet);
  var rows = [];
  for (var i = 0; i < items.length; i++) {
    var e = items[i];
    rows.push([e.id, e.timestamp, e.weight == null ? '' : e.weight, e.color, e.chicken || '']);
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  return rows.length;
}

// Bulk upsert: read the id column once, update existing rows in place, and append
// all new rows in a single setValues — O(n) sheet ops, not O(n^2). Keeps seeding
// large data fast.
function batchUpsert_(items) {
  var sheet = sheet_();
  ensureHeader_(sheet);
  var last = sheet.getLastRow();
  var idToRow = {};
  if (last >= 2) {
    var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) idToRow[String(ids[i][0])] = i + 2;
  }
  var append = [];
  for (var j = 0; j < items.length; j++) {
    var e = items[j];
    var row = [e.id, e.timestamp, e.weight == null ? '' : e.weight, e.color, e.chicken || ''];
    var existing = idToRow[String(e.id)];
    if (existing) {
      sheet.getRange(existing, 1, 1, row.length).setValues([row]);
    } else {
      append.push(row);
    }
  }
  if (append.length) {
    sheet.getRange(last + 1, 1, append.length, append[0].length).setValues(append);
  }
  return items.length;
}

// 1-based sheet row for the given id, or 0 if not present.
function rowForId_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

// Insert or overwrite the row with this entry's id (idempotent — safe to retry).
function upsert_(entry) {
  var sheet = sheet_();
  ensureHeader_(sheet);
  var values = [
    entry.id,
    entry.timestamp,
    entry.weight == null ? '' : entry.weight,
    entry.color,
    entry.chicken || '',
  ];
  var row = rowForId_(sheet, entry.id);
  if (row) {
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
}

function deleteById_(id) {
  var sheet = sheet_();
  var row = rowForId_(sheet, id);
  if (!row) return 0;
  sheet.deleteRow(row);
  return 1;
}

// Remove every data row; keep a correct header. Returns rows removed.
function clearAll_() {
  var sheet = sheet_();
  var last = sheet.getLastRow();
  var removed = Math.max(last - 1, 0);
  if (last > 1) sheet.deleteRows(2, last - 1);
  ensureHeader_(sheet);
  return removed;
}

function ensureHeader_(sheet) {
  var current = sheet.getRange(1, 1, 1, HEADER.length).getValues()[0];
  for (var i = 0; i < HEADER.length; i++) {
    if (current[i] !== HEADER[i]) {
      sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
      return;
    }
  }
}

// Run this once from the editor (Run ▸ authorize) on a fresh script to grant the
// Spreadsheet permission that an anonymous "execute as me" web app needs.
function authorize() {
  SpreadsheetApp.getActiveSpreadsheet().getName();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
