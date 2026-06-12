// Google Apps Script web app — paste into the Sheet's script editor
// (Extensions → Apps Script) and deploy as a web app (execute as Me,
// access: Anyone). This file is reference only; it doesn't run from the repo.

function doPost(e) {
  var entry = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow([
    entry.timestamp,
    entry.weight == null ? '' : entry.weight,
    entry.color,
    entry.chicken || '',
  ]);
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true }),
  ).setMimeType(ContentService.MimeType.JSON);
}

// Optional: lets the frontend fetch all rows for graphs/history.
function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rows = sheet.getDataRange().getValues();
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
