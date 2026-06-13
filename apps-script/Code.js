// Google Apps Script web app — the live source for the Sheet-bound script.
// Managed with clasp: edit here, then `clasp push` and redeploy to the
// existing deployment (`clasp deploy -i <id>`) to keep the /exec URL stable.
// Deployed as a web app: execute as the deploying user, access ANYONE_ANONYMOUS.

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.action === 'delete') return handleDelete(body);
  return handleAppend(body);
}

function handleAppend(entry) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow([
    entry.timestamp,
    entry.weight == null ? '' : entry.weight,
    entry.color,
    entry.chicken || '',
  ]);
  return json({ ok: true });
}

// Delete every row whose timestamp (column A) matches the given ISO string.
// Timestamps are unique per egg, so this targets a single row in practice.
function handleDelete(body) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var values = sheet.getDataRange().getValues();
  var deleted = 0;
  // Walk bottom-up (skip the header at row 0) so indices stay valid as we go.
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === String(body.timestamp)) {
      sheet.deleteRow(i + 1); // sheet rows are 1-indexed
      deleted++;
    }
  }
  return json({ ok: true, deleted: deleted });
}

// Lets the frontend fetch all rows for graphs/history.
function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rows = sheet.getDataRange().getValues();
  return json(rows);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
