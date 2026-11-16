const SECRET = "여기에-충분히-긴-임의의-문자열을-넣으세요";
const SHEET_NAME = "점수";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) {
      return json({ ok: false, error: "unauthorized" });
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      sheet.appendRow(["제출시각", "이름", "점수", "총문항", "비율(%)", "고른 답(번호)"]);
      sheet.setFrozenRows(1);
    }

    const total = Number(data.total) || 0;
    const score = Number(data.score) || 0;
    sheet.appendRow([
      new Date(),
      String(data.name).slice(0, 30),
      score,
      total,
      total ? Math.round((score / total) * 100) : 0,
      String(data.picked || ""),
    ]);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON
  );
}
