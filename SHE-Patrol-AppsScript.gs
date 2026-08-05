/**
 * SHE Patrol Digital System — Google Apps Script backend
 * Siam Motors Logistics Co., Ltd. (SML)
 *
 * ทำหน้าที่แทน SharePoint + Power Automate เดิม เพื่อให้พนักงานที่ไม่มี license
 * Microsoft 365 ใช้งานได้เหมือนกันทุกคน — ไม่มีค่าใช้จ่ายเพิ่ม (Google Sheets/Apps Script
 * ฟรีสำหรับผู้เข้าถึงผ่าน Web App ที่ deploy แบบ "Anyone")
 *
 * โครงสร้างและเทคนิคยึดตาม WorkPermit-AppsScript.gs ของโปรเจกต์พี่น้อง (Safety-WorkPermit)
 * ที่ใช้งานจริงอยู่แล้ว — โดยเฉพาะ:
 *   - front-end ต้องส่ง Content-Type: text/plain (ไม่ใช่ application/json) กัน browser
 *     ยิง CORS preflight (OPTIONS) ซึ่ง Apps Script Web App ไม่รองรับ — ฝั่งนี้ parse
 *     เนื้อหาเป็น JSON ตามปกติจาก e.postData.contents
 *   - LockService กันข้อมูลชนกันตอนหลายคนบันทึกพร้อมกัน
 *   - DriveApp เก็บรูป ตั้งค่า ANYONE_WITH_LINK/VIEW ให้เปิดดูได้ตรงจาก <img src> เลย
 *     (ง่ายกว่าฝั่ง SharePoint เดิมที่ต้องมี action getPhoto แยกเพราะ SharePoint บังคับ auth)
 *
 * วิธี deploy:
 *   1. เปิด Google Sheet ใหม่ (ว่างเปล่า) → Extensions → Apps Script
 *   2. วางโค้ดไฟล์นี้ทั้งหมดแทนโค้ดเริ่มต้น → บันทึก
 *   3. รันฟังก์ชัน setupSheet() หนึ่งครั้ง (เลือกจาก dropdown ด้านบน แล้วกด Run) —
 *      จะสร้างชีต Findings / Users / Settings ให้อัตโนมัติ อนุญาตสิทธิ์ตามที่ถาม
 *   4. กรอกอีเมลต่างๆ ในชีต "Settings" (Frontend_Base_URL, Safety_Officer_Email, ฯลฯ)
 *   5. เพิ่มแถวแรกในชีต "Users" ด้วยตัวเอง (Admin คนแรก) — ดูหมายเหตุใน README
 *   6. Deploy → New deployment → เลือกประเภท "Web app"
 *        Execute as: Me
 *        Who has access: Anyone
 *      กด Deploy แล้วคัดลอก URL ที่ได้ (ลงท้ายด้วย /exec)
 *   7. นำ URL ไปใส่ใน APP_CONFIG.API_URL ของ index.html
 *   8. (ทำครั้งเดียว) ตั้ง time-driven trigger ให้ checkSlaEscalation() รันทุกวัน:
 *      Apps Script editor → รูปนาฬิกา (Triggers) → Add Trigger →
 *      Function: checkSlaEscalation, Event source: Time-driven, Day timer, 8-9am
 *   9. (แนะนำ ถ้าบัญชี Google ที่ใช้เป็นบัญชีส่วนตัว ไม่ใช่ M365 tenant ของบริษัท) กรอก
 *      MS365_Backup_Email ในแท็บ Settings เป็นอีเมล Outlook ของบริษัท แล้วตั้ง time-driven
 *      trigger อีกตัว: Function: backupToMS365Email, Event source: Time-driven, Week timer
 *      — จะได้ไฟล์สำรอง .xlsx ส่งเข้าอีเมล M365 ทุกสัปดาห์ ตั้ง Power Automate flow ตาม
 *      power-automate/Flow6-Backup-To-OneDrive.md เพิ่มถ้าอยากให้เซฟเข้า OneDrive อัตโนมัติด้วย
 */

const FINDINGS_SHEET_NAME = "Findings";
const USERS_SHEET_NAME = "Users";
const SETTINGS_SHEET_NAME = "Settings";
const PHOTOS_FOLDER_NAME = "SHE Patrol Photos";

const FINDINGS_HEADERS = [
  "Id", "PatrolDate", "Shop", "Place", "Description", "Grade", "Category",
  "PhotoBeforeUrl", "DueDate", "RootCause", "ActionResponsible", "Countermeasure",
  "PhotoAfterUrl", "Status", "VerifiedBy", "Rules_Confirmed_DateTime",
];
const USERS_HEADERS = ["Id", "Name", "Email", "Role", "Shop", "Active"];

const SLA_DAYS = { A: 7, B: 14, C: 30, Others: 30 };
const STATUS_OPEN = ["เปิดใหม่", "รอดำเนินการ", "ดำเนินการแล้ว", "รอตรวจสอบ"];

const DEFAULT_SETTINGS = [
  ["Key", "Value", "คำอธิบาย"],
  ["Frontend_Base_URL", "", "URL ของเว็บที่โฮสต์ index.html เช่น https://ชื่อบัญชี.github.io/SHE-Patrol/ — ใช้สร้าง deep link ในอีเมล"],
  ["Safety_Officer_Email", "", "รับแจ้งเตือนตอนมีรายการ 'รอตรวจสอบ'"],
  ["MGR_Email", "", "อีเมล MGR สำหรับ escalate Grade A/B ที่เลย/ใกล้กำหนด"],
  ["AGMGM_Email", "", "อีเมล AGM/GM สำหรับ escalate Grade A ที่เลย/ใกล้กำหนด"],
  ["Shop_Email_PDI", "", "อีเมลหัวหน้างาน PDI"],
  ["Shop_Email_Acc", "", "อีเมลหัวหน้างาน Acc"],
  ["Shop_Email_Yard", "", "อีเมลหัวหน้างาน Yard"],
  ["Shop_Email_Washing", "", "อีเมลหัวหน้างาน Washing"],
  ["Shop_Email_Touch up", "", "อีเมลหัวหน้างาน Touch up"],
  ["Shop_Email_Store", "", "อีเมลหัวหน้างาน Store"],
  ["Shop_Email_อื่นๆ", "", "อีเมลหัวหน้างาน อื่นๆ (ใช้เป็น fallback ด้วยถ้า Shop อื่นไม่ได้กรอกอีเมล)"],
  ["SLA_Escalation_Days_Before", "2", "แจ้งเตือนล่วงหน้ากี่วันก่อนถึงกำหนด (checkSlaEscalation รันทุกวัน)"],
  ["MS365_Backup_Email", "", "อีเมล Microsoft 365 (Outlook) ที่จะรับไฟล์สำรองข้อมูล .xlsx รายสัปดาห์ — เว้นว่างถ้ายังไม่ต้องการสำรอง (ดู backupToMS365Email + power-automate/Flow6-Backup-To-OneDrive.md)"],
];

// ---------------------------------------------------------------
// ติดตั้ง/อัปเดตโครงสร้างชีตทั้งหมด (รันซ้ำได้อย่างปลอดภัย)
// ---------------------------------------------------------------
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let findingsSheet = ss.getSheetByName(FINDINGS_SHEET_NAME);
  if (!findingsSheet) findingsSheet = ss.insertSheet(FINDINGS_SHEET_NAME);
  findingsSheet.getRange(1, 1, 1, FINDINGS_HEADERS.length).setValues([FINDINGS_HEADERS]).setFontWeight("bold");
  findingsSheet.setFrozenRows(1);
  // เก็บวันที่/เวลาเป็นข้อความล้วน กัน Sheets auto-parse เป็น Date แล้วรูปแบบเพี้ยน
  ["PatrolDate", "DueDate", "Rules_Confirmed_DateTime"].forEach(h => {
    const col = FINDINGS_HEADERS.indexOf(h) + 1;
    findingsSheet.getRange(1, col, 2000, 1).setNumberFormat("@");
  });

  let usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!usersSheet) usersSheet = ss.insertSheet(USERS_SHEET_NAME);
  usersSheet.getRange(1, 1, 1, USERS_HEADERS.length).setValues([USERS_HEADERS]).setFontWeight("bold");
  usersSheet.setFrozenRows(1);

  let settingsSheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!settingsSheet) settingsSheet = ss.insertSheet(SETTINGS_SHEET_NAME);
  const existingRows = settingsSheet.getLastRow();
  if (existingRows < DEFAULT_SETTINGS.length) {
    settingsSheet.getRange(existingRows + 1, 1, DEFAULT_SETTINGS.length - existingRows, 3)
      .setValues(DEFAULT_SETTINGS.slice(existingRows));
  }
  settingsSheet.getRange(1, 1, 1, 3).setFontWeight("bold");
  settingsSheet.setFrozenRows(1);
  settingsSheet.autoResizeColumns(1, 3);

  SpreadsheetApp.getUi().alert("ตั้งค่าชีตเรียบร้อย — ไปกรอกอีเมลในแท็บ Settings แล้วเพิ่ม Admin คนแรกในแท็บ Users ต่อได้เลย");
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("SHE Patrol")
    .addItem("ตั้งค่าชีต (Setup)", "setupSheet")
    .addItem("เช็ค SLA เลยกำหนด (ทดสอบ)", "checkSlaEscalation")
    .addItem("สำรองข้อมูลเข้า MS365 ตอนนี้ (ทดสอบ)", "backupToMS365Email")
    .addToUi();
}

function getSetting(key) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) return "";
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key) return values[i][1];
  }
  return "";
}

function shopLeadEmail_(shop) {
  return getSetting("Shop_Email_" + shop) || getSetting("Shop_Email_อื่นๆ");
}

// ---------------------------------------------------------------
// Settings — อ่าน/แก้ไขทั้งหมดผ่านแท็บ "ตั้งค่า" ในแอป (Admin เท่านั้น)
// แทนการเปิด Google Sheet ไปแก้ทีละแถวในแท็บ Settings เอง
// ---------------------------------------------------------------
function listSettings_() {
  const sheet = getSheet_(SETTINGS_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 3).getValues()
    .filter(row => row[0] !== "")
    .map(row => ({ Key: row[0], Value: row[1], Description: row[2] }));
}

function updateSettings_(values) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(SETTINGS_SHEET_NAME);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    Object.keys(values || {}).forEach(k => {
      const idx = keys.indexOf(k);
      if (idx !== -1) sheet.getRange(idx + 2, 2).setValue(values[k]);
    });
    return listSettings_();
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------
// Router — front-end (index.html) POST { action, ...payload } ทุกครั้ง
// (Content-Type: text/plain ฝั่ง front-end กัน CORS preflight — ดูหมายเหตุหัวไฟล์)
// ---------------------------------------------------------------
function doGet(e) {
  return ContentService.createTextOutput("SHE Patrol API is running. ใช้ POST พร้อม {action, ...} เท่านั้น")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }

  try {
    switch (data.action) {
      case "listFindings": return jsonResponse({ ok: true, data: listFindings_() });
      case "getFinding": return jsonResponse({ ok: true, data: getFinding_(data.id) });
      case "createFinding": return jsonResponse({ ok: true, data: createFinding_(data.fields || {}) });
      case "updateFinding": return jsonResponse({ ok: true, data: updateFinding_(data.id, data.fields || {}) });
      case "listUsers": return jsonResponse({ ok: true, data: listUsers_() });
      case "createUser": return jsonResponse({ ok: true, data: createUser_(data.fields || {}) });
      case "updateUser": return jsonResponse({ ok: true, data: updateUser_(data.id, data.fields || {}) });
      case "uploadPhoto": return jsonResponse({ ok: true, data: uploadPhoto_(data.findingId, data.stage, data.fileName, data.contentBase64) });
      case "listSettings": return jsonResponse({ ok: true, data: listSettings_() });
      case "updateSettings": return jsonResponse({ ok: true, data: updateSettings_(data.values || {}) });
      default: return jsonResponse({ ok: false, error: "ไม่รู้จัก action: " + data.action });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------
// Generic sheet-as-table helpers (ใช้ร่วมกันทั้ง Findings และ Users)
// ---------------------------------------------------------------
function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`ไม่พบชีต '${name}' — รัน setupSheet() ก่อน`);
  return sheet;
}

function readAllRows_(sheetName, headers) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .map(row => rowToObject_(headers, row))
    .filter(r => r.Id !== "" && r.Id !== null && r.Id !== undefined);
}

function rowToObject_(headers, rowValues) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = rowValues[i]; });
  return obj;
}

function findRowNumberById_(sheetName, headers, id) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const idCol = headers.indexOf("Id") + 1;
  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues().flat().map(Number);
  const idx = ids.indexOf(Number(id));
  return idx === -1 ? -1 : idx + 2;
}

function nextId_(sheetName, headers) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const idCol = headers.indexOf("Id") + 1;
  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues().flat().map(Number).filter(n => !isNaN(n));
  return ids.length ? Math.max.apply(null, ids) + 1 : 1;
}

// ---------------------------------------------------------------
// Findings CRUD
// ---------------------------------------------------------------
function listFindings_() {
  return readAllRows_(FINDINGS_SHEET_NAME, FINDINGS_HEADERS).sort((a, b) => b.Id - a.Id);
}

function getFinding_(id) {
  const row = readAllRows_(FINDINGS_SHEET_NAME, FINDINGS_HEADERS).find(r => r.Id === Number(id));
  if (!row) throw new Error("ไม่พบ finding รหัส " + id);
  return row;
}

function createFinding_(fields) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const id = nextId_(FINDINGS_SHEET_NAME, FINDINGS_HEADERS);
    const record = Object.assign({
      Id: id, PhotoBeforeUrl: "", PhotoAfterUrl: "", RootCause: "", ActionResponsible: "",
      Countermeasure: "", Status: "เปิดใหม่", VerifiedBy: "", Rules_Confirmed_DateTime: "",
    }, fields, { Id: id });
    const row = FINDINGS_HEADERS.map(h => (record[h] !== undefined && record[h] !== null) ? record[h] : "");
    getSheet_(FINDINGS_SHEET_NAME).appendRow(row);
    notifyNewFinding_(record);
    return record;
  } finally {
    lock.releaseLock();
  }
}

function updateFinding_(id, fields) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rowNum = findRowNumberById_(FINDINGS_SHEET_NAME, FINDINGS_HEADERS, id);
    if (rowNum === -1) throw new Error("ไม่พบ finding รหัส " + id);
    const sheet = getSheet_(FINDINGS_SHEET_NAME);
    const before = rowToObject_(FINDINGS_HEADERS, sheet.getRange(rowNum, 1, 1, FINDINGS_HEADERS.length).getValues()[0]);
    const after = Object.assign({}, before, fields, { Id: before.Id });
    const row = FINDINGS_HEADERS.map(h => (after[h] !== undefined && after[h] !== null) ? after[h] : "");
    sheet.getRange(rowNum, 1, 1, FINDINGS_HEADERS.length).setValues([row]);
    notifyFindingStatusChange_(before, after);
    return after;
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------
// Users CRUD
// ---------------------------------------------------------------
function listUsers_() {
  return readAllRows_(USERS_SHEET_NAME, USERS_HEADERS);
}

function createUser_(fields) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const id = nextId_(USERS_SHEET_NAME, USERS_HEADERS);
    const record = Object.assign({ Id: id, Active: true, Shop: "" }, fields, { Id: id });
    const row = USERS_HEADERS.map(h => (record[h] !== undefined && record[h] !== null) ? record[h] : "");
    getSheet_(USERS_SHEET_NAME).appendRow(row);
    return record;
  } finally {
    lock.releaseLock();
  }
}

function updateUser_(id, fields) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rowNum = findRowNumberById_(USERS_SHEET_NAME, USERS_HEADERS, id);
    if (rowNum === -1) throw new Error("ไม่พบผู้ใช้งานรหัส " + id);
    const sheet = getSheet_(USERS_SHEET_NAME);
    const before = rowToObject_(USERS_HEADERS, sheet.getRange(rowNum, 1, 1, USERS_HEADERS.length).getValues()[0]);
    const after = Object.assign({}, before, fields, { Id: before.Id });
    const row = USERS_HEADERS.map(h => (after[h] !== undefined && after[h] !== null) ? after[h] : "");
    sheet.getRange(rowNum, 1, 1, USERS_HEADERS.length).setValues([row]);
    return after;
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------
// รูปภาพ — เก็บใน Google Drive ตั้งค่าดูได้ตรงจากลิงก์เลย (ไม่ต้องมี auth)
// ---------------------------------------------------------------
function uploadPhoto_(findingId, stage, fileName, contentBase64) {
  const bytes = Utilities.base64Decode(contentBase64);
  const safeName = `${findingId}_${stage === "ก่อนแก้ไข" ? "before" : "after"}_${new Date().getTime()}.jpg`;
  const blob = Utilities.newBlob(bytes, "image/jpeg", safeName);
  const folder = getOrCreateFolder_(PHOTOS_FOLDER_NAME);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { fileUrl: `https://drive.google.com/uc?export=view&id=${file.getId()}` };
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

// ---------------------------------------------------------------
// การแจ้งเตือนทางอีเมล (แทน Power Automate Flow 1/2/4 เดิม)
// ---------------------------------------------------------------
function findingLink_(id) {
  const base = getSetting("Frontend_Base_URL");
  return base ? `${base.replace(/\/?$/, "/")}index.html?id=${id}` : "";
}

function notifyNewFinding_(record) {
  const to = shopLeadEmail_(record.Shop);
  if (!to) return; // ยังไม่ได้กรอกอีเมลใน Settings — ข้ามการแจ้งเตือน
  const link = findingLink_(record.Id);
  const subject = `[SHE Patrol] พบ Finding ใหม่ Grade ${record.Grade} - ${record.Shop}`;
  const body = [
    "พบ Finding ใหม่จากการตรวจ SHE Patrol", "",
    `Shop: ${record.Shop}`,
    `จุดที่พบ: ${record.Place || "-"}`,
    `รายละเอียด: ${record.Description || "-"}`,
    `Grade: ${record.Grade} | Category: ${record.Category || "-"}`,
    `กำหนดเสร็จ: ${record.DueDate}`, "",
    link ? `ดูรายละเอียดและอัปเดตมาตรการแก้ไข: ${link}` : "",
  ].join("\n");
  MailApp.sendEmail({ to: to, subject: subject, body: body });
}

function notifyFindingStatusChange_(before, after) {
  if (before.Status === after.Status) return; // ไม่เปลี่ยนสถานะ ไม่ต้องแจ้ง
  const link = findingLink_(after.Id);

  if (after.Status === "รอตรวจสอบ") {
    const to = getSetting("Safety_Officer_Email");
    if (!to) return;
    MailApp.sendEmail({
      to: to,
      subject: `[SHE Patrol] รอตรวจสอบ - ${after.Shop} / ${after.Place || "-"}`,
      body: [
        "หน่วยงานได้อัปเดตมาตรการแก้ไขและแนบรูปหลังแล้ว รอตรวจสอบและปิดงาน", "",
        `Shop: ${after.Shop} | Grade: ${after.Grade}`,
        `มาตรการแก้ไข: ${after.Countermeasure || "-"}`,
        `ผู้รับผิดชอบ: ${after.ActionResponsible || "-"}`, "",
        link ? `เปิดหน้าตรวจสอบและปิดงาน: ${link}` : "",
      ].join("\n"),
    });
  }

  if (after.Status === "ปิดงาน") {
    const to = shopLeadEmail_(after.Shop);
    if (!to) return;
    MailApp.sendEmail({
      to: to,
      subject: `[SHE Patrol] ปิดงานแล้ว - ${after.Shop} / ${after.Place || "-"}`,
      body: [
        "Finding นี้ถูกปิดงานเรียบร้อยแล้ว", "",
        `Grade: ${after.Grade} | Shop: ${after.Shop}`,
        `ผู้ตรวจยืนยัน: ${after.VerifiedBy || "-"}`,
        `เวลายืนยัน: ${after.Rules_Confirmed_DateTime || "-"}`, "",
        link ? `ดูรายละเอียด: ${link}` : "",
      ].join("\n"),
    });
  }
}

// ---------------------------------------------------------------
// เช็ค SLA เลยกำหนด/ใกล้กำหนดทุกวัน — ตั้ง time-driven trigger เรียกฟังก์ชันนี้
// (แทน Power Automate Flow 3 เดิม)
// ---------------------------------------------------------------
function checkSlaEscalation() {
  const daysBefore = Number(getSetting("SLA_Escalation_Days_Before")) || 2;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = listFindings_().filter(r => STATUS_OPEN.indexOf(r.Status) !== -1);
  rows.forEach(r => {
    const due = new Date(r.DueDate);
    due.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((due - today) / 86400000);
    if (daysLeft > daysBefore) return; // ยังไม่ใกล้กำหนด ข้าม

    const to = [];
    if (r.Grade === "A") {
      if (getSetting("MGR_Email")) to.push(getSetting("MGR_Email"));
      if (getSetting("AGMGM_Email")) to.push(getSetting("AGMGM_Email"));
    } else if (r.Grade === "B") {
      if (getSetting("MGR_Email")) to.push(getSetting("MGR_Email"));
    } else {
      const lead = shopLeadEmail_(r.Shop);
      if (lead) to.push(lead);
    }
    if (!to.length) return;

    const link = findingLink_(r.Id);
    const overdue = daysLeft < 0;
    MailApp.sendEmail({
      to: to.join(","),
      subject: `[SHE Patrol] ${overdue ? "เลยกำหนด" : "ใกล้กำหนด"} Grade ${r.Grade} - ${r.Shop}`,
      body: [
        `Finding Grade ${r.Grade} ที่ ${r.Shop} / ${r.Place || "-"}`,
        overdue ? `เลยกำหนดมาแล้ว ${Math.abs(daysLeft)} วัน` : `เหลืออีก ${daysLeft} วัน`,
        `สถานะปัจจุบัน: ${r.Status}`, "",
        link ? `เปิดหน้า Finding: ${link}` : "",
      ].join("\n"),
    });
  });
}

// ---------------------------------------------------------------
// สำรองข้อมูลเข้า Microsoft 365 — เพราะสเปรดชีตนี้ผูกกับบัญชี Google ส่วนตัว
// ไม่ใช่ M365 tenant ของบริษัท จึงส่งสำเนา .xlsx ทั้งไฟล์เข้าอีเมล M365 เป็นระยะ
// (ตั้ง time-driven trigger ให้ backupToMS365Email รันรายสัปดาห์ — ดู README)
//
// ฝั่ง Microsoft 365 ใช้ Power Automate flow มาตรฐาน (ไม่ใช่ premium — ต่างจาก Flow 5 เดิม)
// คอยดักอีเมลนี้แล้วเซฟไฟล์แนบเข้า OneDrive/SharePoint ให้อัตโนมัติ ดู
// power-automate/Flow6-Backup-To-OneDrive.md
// ---------------------------------------------------------------
function backupToMS365Email() {
  const to = getSetting("MS365_Backup_Email");
  if (!to) return; // ยังไม่ได้ตั้งค่า — ข้าม

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const exportUrl = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export?format=xlsx`;
  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(exportUrl, { headers: { Authorization: "Bearer " + token } });
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const blob = response.getBlob().setName(`SHE_Patrol_Backup_${dateStr}.xlsx`);

  MailApp.sendEmail({
    to: to,
    subject: `[SHE Patrol] สำรองข้อมูลรายสัปดาห์ ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy")}`,
    body: [
      "ไฟล์แนบคือสำเนาข้อมูล SHE Patrol ทั้งหมด (Findings + Users) ณ เวลาที่ส่งอีเมลนี้",
      "ส่งมาเพื่อสำรองข้อมูลไว้ใน Microsoft 365 เนื่องจากข้อมูลหลักอยู่ใน Google Sheets ที่ผูกกับ",
      "บัญชี Google ส่วนบุคคล ไม่ใช่ M365 tenant ของบริษัท",
      "",
      "ถ้าตั้งค่า Power Automate flow ตาม power-automate/Flow6-Backup-To-OneDrive.md ไว้แล้ว",
      "ไฟล์นี้จะถูกบันทึกเข้า OneDrive/SharePoint ให้อัตโนมัติ ไม่ต้องทำอะไรเพิ่ม",
    ].join("\n"),
    attachments: [blob],
  });
}
