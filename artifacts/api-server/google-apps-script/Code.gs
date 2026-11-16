const SECRET = "여기에-충분히-긴-임의의-문자열을-넣으세요";
const SCORE_SHEET_NAME = "점수";
const QUESTION_SHEET_NAME = "문제";
const SETTINGS_SHEET_NAME = "설정";
const MAX_QUESTIONS = 200;
const MAX_CHOICES = 5;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) {
      return json({ ok: false, error: "unauthorized" });
    }

    if (data.action === "getQuestions") {
      return json({ ok: true, ...getQuestions() });
    }
    if (data.action === "saveQuestions") {
      return json(saveQuestions(data));
    }
    return json(saveScore(data));
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheetName = e.range.getSheet().getName();
  if (sheetName !== QUESTION_SHEET_NAME && sheetName !== SETTINGS_SHEET_NAME) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const settings = ensureSettingsSheet(e.source);
    setSetting(settings, "version", String(Date.now()));
  } finally {
    lock.releaseLock();
  }
}

function getQuestions() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ensureQuestionSheet(spreadsheet);
    const settings = ensureSettingsSheet(spreadsheet);
    const values = sheet.getDataRange().getValues();
    const questions = values.slice(1).filter((row) => row[0]).map((row) => ({
      id: String(row[0]),
      text: String(row[1]),
      choices: JSON.parse(String(row[2])),
      answer: Number(row[3]),
      explanation: String(row[4] || ""),
    }));
    const settingValues = settings.getDataRange().getValues();
    const count = Number(findSetting(settingValues, "count")) || 0;
    const version = findSetting(settingValues, "version") || "1";
    return { questions, count, version };
  } finally {
    lock.releaseLock();
  }
}

function saveQuestions(data) {
  if (!Array.isArray(data.questions) || data.questions.length === 0 || data.questions.length > MAX_QUESTIONS) {
    return { ok: false, error: "invalid questions" };
  }
  const count = Number(data.count);
  if (!Number.isInteger(count) || count < 0 || count > data.questions.length) {
    return { ok: false, error: "invalid count" };
  }

  const seen = {};
  const rows = [];
  for (const question of data.questions) {
    if (!question || typeof question !== "object") return { ok: false, error: "invalid question" };
    const id = String(question.id || "").slice(0, 40);
    const text = String(question.text || "").trim().slice(0, 500);
    const choices = question.choices;
    const answer = Number(question.answer);
    const explanation = String(question.explanation || "").trim().slice(0, 500);
    if (
      !id || seen[id] || !text || !Array.isArray(choices)
      || choices.length < 2 || choices.length > MAX_CHOICES
      || choices.some((choice) => !String(choice || "").trim())
      || !Number.isInteger(answer) || answer < 0 || answer >= choices.length
    ) {
      return { ok: false, error: "invalid question" };
    }
    seen[id] = true;
    rows.push([
      id,
      text,
      JSON.stringify(choices.map((choice) => String(choice).trim().slice(0, 200))),
      answer,
      explanation,
    ]);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ensureQuestionSheet(spreadsheet);
    const settings = ensureSettingsSheet(spreadsheet);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, 5).setValues([["문제ID", "문제", "보기(JSON)", "정답(0부터)", "해설"]]);
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
    sheet.setFrozenRows(1);
    setSetting(settings, "count", String(count));
    setSetting(settings, "version", String(Date.now()));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function saveScore(data) {
  const name = String(data.name || "").trim().slice(0, 30);
  const score = Number(data.score);
  const total = Number(data.total);
  if (!name || !Number.isInteger(score) || !Number.isInteger(total) || total < 1 || score < 0 || score > total) {
    return { ok: false, error: "invalid score" };
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SCORE_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SCORE_SHEET_NAME);
    sheet.appendRow(["제출시각", "이름", "점수", "총문항", "비율(%)", "고른 답(문제ID:번호)"]);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    new Date(),
    name,
    score,
    total,
    Math.round((score / total) * 100),
    String(data.picked || ""),
  ]);
  return { ok: true };
}

function ensureQuestionSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(QUESTION_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(QUESTION_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["문제ID", "문제", "보기(JSON)", "정답(0부터)", "해설"]);
    sheet.getRange(2, 1, 3, 5).setValues([
      ["q1", "3 + 4 는 얼마일까요?", JSON.stringify(["5", "6", "7", "8"]), 2, "3에 4를 더하면 7입니다."],
      ["q2", "우리나라의 수도는 어디일까요?", JSON.stringify(["부산", "서울", "대전", "광주"]), 1, "대한민국의 수도는 서울입니다."],
      ["q3", "물이 얼면 무엇이 될까요?", JSON.stringify(["수증기", "얼음", "구름", "비"]), 1, "물이 0℃ 이하로 내려가면 얼음이 됩니다."],
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureSettingsSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SETTINGS_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["설정", "값"]);
  }
  if (!findSetting(sheet.getDataRange().getValues(), "count")) setSetting(sheet, "count", "0");
  if (!findSetting(sheet.getDataRange().getValues(), "version")) setSetting(sheet, "version", "1");
  sheet.setFrozenRows(1);
  return sheet;
}

function findSetting(rows, key) {
  const row = rows.find((item) => String(item[0]) === key);
  return row ? String(row[1]) : "";
}

function setSetting(sheet, key, value) {
  const rows = sheet.getDataRange().getValues();
  const index = rows.findIndex((row) => String(row[0]) === key);
  if (index >= 0) {
    sheet.getRange(index + 1, 2).setValue(value);
  } else {
    sheet.appendRow([key, value]);
  }
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON
  );
}
