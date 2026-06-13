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
  if (action === 'batch') {
    for (var i = 0; i < body.entries.length; i++) upsert_(body.entries[i]);
    return json({ ok: true, upserted: body.entries.length });
  }
  upsert_(body); // default: upsert a single entry
  return json({ ok: true });
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
