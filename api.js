/*
 * SHE Patrol Digital System — shared data layer
 * Siam Motors Logistics (SML)
 *
 * Talks to a SharePoint List (SHE_Patrol_Findings) + Document Library (SHE_Patrol_Photos)
 * over the SharePoint REST API using only standard, non-premium capabilities.
 *
 * DEMO MODE: until SP_CONFIG.SITE_URL is deployed for real and this page is opened
 * from inside that SharePoint site, every page here runs against localStorage with
 * seeded sample data — so the UI is fully clickable before provisioning is done.
 */

const SP_CONFIG = {
  // TODO: แก้เป็น URL จริงของ SharePoint site หลังรัน Create-SHEPatrolList.ps1
  SITE_URL: "https://siammotors.sharepoint.com/sites/SHEPatrol",
  LIST_NAME: "SHE_Patrol_Findings",
  LIBRARY_NAME: "SHE_Patrol_Photos",
};

const SLA_DAYS = { "A": 7, "B": 14, "C": 30, "Others": 30 };
const SLA_ESCALATE = {
  "A": "MGR + AGM/GM ทันทีเมื่อเลยกำหนด",
  "B": "MGR",
  "C": "หัวหน้างาน",
  "Others": "หัวหน้างาน",
};
const SHOP_OPTIONS = ["PDI", "Acc", "Yard", "Washing", "Touch up", "Store", "อื่นๆ"];
const GRADE_OPTIONS = ["A", "B", "C", "Others"];
const CATEGORY_OPTIONS = ["F", "S", "EES", "5S"];
const STATUS_OPTIONS = ["เปิดใหม่", "รอดำเนินการ", "ดำเนินการแล้ว", "รอตรวจสอบ", "ปิดงาน"];
const STATUS_OPEN = ["เปิดใหม่", "รอดำเนินการ", "ดำเนินการแล้ว", "รอตรวจสอบ"];

const ROLE_GROUPS = {
  "SHE-Auditor": "auditor",
  "SHE-Dept-Responsible": "dept",
  "SHE-Safety-Admin": "admin",
  "SHE-Executive-Viewer": "exec",
};

function pad(n, len) { return String(n).padStart(len, "0"); }

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function calcDueDate(patrolDate, grade) {
  const days = SLA_DAYS[grade] || 30;
  return addDays(patrolDate, days);
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function fmtThaiDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function findingCode(item) {
  const ym = (item.PatrolDate || "").slice(0, 7).replace("-", "");
  return `SHE-${ym}-${pad(item.Id, 3)}`;
}

/* ---------------------------------------------------------------------- */
/* Mode detection                                                          */
/* ---------------------------------------------------------------------- */

function isLiveMode() {
  try {
    const cfgHost = new URL(SP_CONFIG.SITE_URL).hostname;
    return location.hostname === cfgHost;
  } catch (e) {
    return false;
  }
}

const SheAPI = (function () {
  const LIVE = isLiveMode();
  let digestCache = null;

  /* ---- Demo (localStorage) backend -------------------------------- */

  const DEMO_KEY = "she_patrol_demo_findings";
  const DEMO_SEED_VERSION = "2026-08-v1";

  function seedDemoData() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = [
      // ข้อมูลจริงจากรอบตรวจ 24 มิ.ย. 2026 (SES/F-PES) — คงคำอธิบายเดิมไว้เป็นตัวอย่าง
      { PatrolDate: "2026-06-24", Shop: "Acc", Place: "line Acc.", Description: "พบขยะอยู่นอกถังและป้ายมีการชำรุด ไม่ชัดเจน", Grade: "Others", Category: "5S", RootCause: "พบขยะอยู่นอกถัง ป้ายชำรุด", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "แยกขยะให้ถูกประเภท", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-27T09:10:00" },
      { PatrolDate: "2026-06-24", Shop: "Acc", Place: "line Acc.", Description: "พบขยะอยู่ที่ใต้โต๊ะติดตั้งเบาะ", Grade: "Others", Category: "5S", RootCause: "พบขยะอยูู่ใต้โต๊ะเบาะติดตั้ง และเบาะรองขาดชำรุด", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "เน้นย้ำการตรวจสอบอุปกรณ์และทำกิจกรรม5ส.", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-06-24", Shop: "Acc", Place: "line Acc.", Description: "อุปกรณ์ชำรุด อยู่ระหว่างจัดซื้อ", Grade: "C", Category: "EES", Countermeasure: "ชำรุด อยู่ระหว่างการใบสั่งซื้ออุปกรณ์แก้ไข", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-06-24", Shop: "Acc", Place: "line Acc.", Description: "พบข้าวอยู่ที่โต๊ะทำงานและเปิดพัดลมทิ้งไว้", Grade: "Others", Category: "5S", RootCause: "พบการนำอาหารมารับประทานและวางไว้บนโต๊ะทำงาน รวมถึงเปิดพัดลมทิ้งไว้เมื่อไม่มีผู้ใช้งาน", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "ประชาสัมพันธ์และเน้นย้ำพนักงาน ไม่รับประทานอาหารในพื้นที่ทำงาน และให้ปิดอุปกรณ์ไฟฟ้าทุกครั้งหลังใช้งาน พร้อมตรวจสอบเป็นประจำ", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-26T14:20:00" },
      { PatrolDate: "2026-06-24", Shop: "Acc", Place: "line Acc.", Description: "ไม่มีสัญลักษณ์เตือน", Grade: "C", Category: "S", RootCause: "ไม่มีสัญญลักษณ์เตือน อาจทำให้เดินชนได้", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "ตรวจสอบเทปให้อยู่สภาพพร้อมใช้งาน", Status: "รอตรวจสอบ" },
      // ตัวอย่างเดือนก่อนหน้า/พื้นที่อื่น เพื่อให้ dashboard มีข้อมูลหลายเดือน/หลายจุดสำหรับสาธิต
      { PatrolDate: "2026-05-10", Shop: "PDI", Place: "PDI Line 2", Description: "สายไฟพาดผ่านทางเดิน เสี่ยงสะดุด", Grade: "A", Category: "S", RootCause: "เดินสายไฟชั่วคราวไม่เก็บเข้าราง", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "เก็บสายไฟเข้าท่อร้อยสาย ติดป้ายเตือน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-15T10:00:00" },
      { PatrolDate: "2026-05-10", Shop: "Yard", Place: "ลานจอดรถรอส่งมอบ", Description: "ไม่สวมใส่ safety shoes ขณะปฏิบัติงาน", Grade: "B", Category: "F", RootCause: "พนักงานใหม่ไม่ทราบข้อกำหนด PPE", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "อบรม PPE ซ้ำ + สุ่มตรวจรายวัน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-22T09:30:00" },
      { PatrolDate: "2026-05-18", Shop: "Washing", Place: "จุดล้างรถ", Description: "พื้นลื่นจากน้ำสบู่ ไม่มีป้ายเตือนพื้นลื่น", Grade: "B", Category: "S", RootCause: "ไม่มีป้ายเตือนถาวรบริเวณจุดล้างรถ", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "ติดตั้งป้ายเตือนพื้นลื่นถาวร", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-06-02", Shop: "Touch up", Place: "ห้องพ่นสี", Description: "ถังสารเคมีไม่มีฝาปิดหลังใช้งาน", Grade: "A", Category: "EES", RootCause: "พนักงานลืมปิดฝาถังหลังใช้งาน", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "ทำ checklist ปิดฝาถังก่อนเลิกกะ", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-06-15", Shop: "Store", Place: "คลังอะไหล่", Description: "วางของสูงเกินระดับที่กำหนด เสี่ยงล้มทับ", Grade: "C", Category: "5S", Status: "เปิดใหม่" },
      { PatrolDate: "2026-07-05", Shop: "Acc", Place: "line Acc.", Description: "ไม่มีการ์ดครอบใบมีดเครื่องตัด", Grade: "A", Category: "S", RootCause: "การ์ดครอบชำรุดหลุดหาย", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "สั่งซื้อการ์ดครอบใหม่ ระงับใช้เครื่องชั่วคราว", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-07-20", Shop: "PDI", Place: "PDI Line 1", Description: "ถังดับเพลิงหมดอายุ", Grade: "B", Category: "F", RootCause: "ไม่มีระบบแจ้งเตือนวันหมดอายุ", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "จัดทำทะเบียนวันหมดอายุถังดับเพลิงทุกจุด", Status: "รอดำเนินการ" },
      { PatrolDate: today, Shop: "Yard", Place: "ทางเข้ารับรถ", Description: "ไม่มีการตีเส้นแบ่งช่องทางรถ-คนเดิน", Grade: "C", Category: "S", Status: "เปิดใหม่" },
    ];
    const seeded = rows.map((r, i) => ({
      Id: i + 1,
      PhotoBeforeUrl: "",
      PhotoAfterUrl: "",
      DueDate: calcDueDate(r.PatrolDate, r.Grade),
      RootCause: "", ActionResponsible: "", Countermeasure: "",
      Status: "เปิดใหม่", VerifiedBy: "", Rules_Confirmed_DateTime: "",
      ...r,
    }));
    localStorage.setItem(DEMO_KEY, JSON.stringify(seeded));
    localStorage.setItem(DEMO_KEY + "_version", DEMO_SEED_VERSION);
    return seeded;
  }

  function demoRead() {
    if (localStorage.getItem(DEMO_KEY + "_version") !== DEMO_SEED_VERSION) return seedDemoData();
    try {
      return JSON.parse(localStorage.getItem(DEMO_KEY)) || seedDemoData();
    } catch (e) { return seedDemoData(); }
  }

  function demoWrite(rows) { localStorage.setItem(DEMO_KEY, JSON.stringify(rows)); }

  async function demoList() { return demoRead().sort((a, b) => b.Id - a.Id); }

  async function demoGet(id) {
    const row = demoRead().find(r => r.Id === Number(id));
    if (!row) throw new Error("ไม่พบข้อมูล finding รหัส " + id);
    return row;
  }

  async function demoCreate(fields) {
    const rows = demoRead();
    const nextId = rows.reduce((m, r) => Math.max(m, r.Id), 0) + 1;
    const row = { Id: nextId, PhotoBeforeUrl: "", PhotoAfterUrl: "", RootCause: "", ActionResponsible: "", Countermeasure: "", Status: "เปิดใหม่", VerifiedBy: "", Rules_Confirmed_DateTime: "", ...fields };
    rows.push(row);
    demoWrite(rows);
    return row;
  }

  async function demoUpdate(id, fields) {
    const rows = demoRead();
    const idx = rows.findIndex(r => r.Id === Number(id));
    if (idx === -1) throw new Error("ไม่พบข้อมูล finding รหัส " + id);
    rows[idx] = { ...rows[idx], ...fields };
    demoWrite(rows);
    return rows[idx];
  }

  async function demoUploadPhoto(file, findingId, stage) {
    // demo mode: read as data URL so the photo survives a page refresh via localStorage
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---- Live SharePoint REST backend -------------------------------- */

  function listUrl() {
    return `${SP_CONFIG.SITE_URL}/_api/web/lists/getbytitle('${SP_CONFIG.LIST_NAME}')`;
  }

  async function getDigest() {
    if (digestCache) return digestCache;
    const res = await fetch(`${SP_CONFIG.SITE_URL}/_api/contextinfo`, {
      method: "POST",
      headers: { "Accept": "application/json;odata=verbose" },
      credentials: "same-origin",
    });
    const data = await res.json();
    digestCache = data.d.GetContextWebInformation.FormDigestValue;
    return digestCache;
  }

  async function spFetch(url, opts = {}) {
    const headers = Object.assign({ "Accept": "application/json;odata=verbose" }, opts.headers || {});
    const res = await fetch(url, { credentials: "same-origin", ...opts, headers });
    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.error?.message?.value || msg; } catch (e) {}
      throw new Error(`SharePoint REST ${res.status}: ${msg}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function liveList(filterQuery) {
    const url = `${listUrl()}/items?$top=500&$orderby=PatrolDate desc` + (filterQuery ? `&${filterQuery}` : "");
    const data = await spFetch(url);
    return data.d.results;
  }

  async function liveGet(id) {
    const data = await spFetch(`${listUrl()}/items(${id})`);
    return data.d;
  }

  async function liveCreate(fields) {
    const digest = await getDigest();
    const data = await spFetch(`${listUrl()}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest },
      body: JSON.stringify({ __metadata: { type: await listItemType() }, ...fields }),
    });
    return data.d;
  }

  async function liveUpdate(id, fields) {
    const digest = await getDigest();
    await spFetch(`${listUrl()}/items(${id})`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;odata=verbose",
        "X-RequestDigest": digest,
        "X-HTTP-Method": "MERGE",
        "IF-MATCH": "*",
      },
      body: JSON.stringify({ __metadata: { type: await listItemType() }, ...fields }),
    });
    return liveGet(id);
  }

  let _itemTypeCache = null;
  async function listItemType() {
    if (_itemTypeCache) return _itemTypeCache;
    const data = await spFetch(`${listUrl()}?$select=ListItemEntityTypeFullName`);
    _itemTypeCache = data.d.ListItemEntityTypeFullName;
    return _itemTypeCache;
  }

  async function ensureUser(loginNameOrEmail) {
    const digest = await getDigest();
    const data = await spFetch(`${SP_CONFIG.SITE_URL}/_api/web/ensureuser`, {
      method: "POST",
      headers: { "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest },
      body: JSON.stringify({ logonName: loginNameOrEmail }),
    });
    return data.d; // { Id, LoginName, Title, Email }
  }

  async function liveUploadPhoto(file, findingId, stage) {
    const digest = await getDigest();
    const fileName = `${findingId}_${stage === "ก่อนแก้ไข" ? "before" : "after"}.jpg`;
    const folderUrl = `${SP_CONFIG.SITE_URL}/_api/web/lists/getbytitle('${SP_CONFIG.LIBRARY_NAME}')/RootFolder`;
    const folderData = await spFetch(`${folderUrl}?$select=ServerRelativeUrl`);
    const serverRelUrl = folderData.d.ServerRelativeUrl;
    const buf = await file.arrayBuffer();
    const uploadUrl = `${SP_CONFIG.SITE_URL}/_api/web/GetFolderByServerRelativeUrl('${encodeURIComponent(serverRelUrl)}')/Files/add(url='${encodeURIComponent(fileName)}',overwrite=true)`;
    const uploaded = await spFetch(uploadUrl, {
      method: "POST",
      headers: { "X-RequestDigest": digest },
      body: buf,
    });
    const fileServerRelUrl = uploaded.d.ServerRelativeUrl;
    // set FindingID + PhotoStage metadata on the library item
    const itemData = await spFetch(`${SP_CONFIG.SITE_URL}/_api/web/GetFileByServerRelativeUrl('${encodeURIComponent(fileServerRelUrl)}')/ListItemAllFields`);
    const itemType = itemData.d.__metadata.type;
    await spFetch(`${SP_CONFIG.SITE_URL}/_api/web/GetFileByServerRelativeUrl('${encodeURIComponent(fileServerRelUrl)}')/ListItemAllFields`, {
      method: "POST",
      headers: { "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest, "X-HTTP-Method": "MERGE", "IF-MATCH": "*" },
      body: JSON.stringify({ __metadata: { type: itemType }, FindingID: String(findingId), PhotoStage: stage }),
    });
    return `${SP_CONFIG.SITE_URL}${fileServerRelUrl}`;
  }

  async function liveCurrentUser() {
    const data = await spFetch(`${SP_CONFIG.SITE_URL}/_api/web/currentuser`);
    return data.d;
  }

  async function liveCurrentUserRole() {
    try {
      const data = await spFetch(`${SP_CONFIG.SITE_URL}/_api/web/currentuser/groups`);
      const titles = data.d.results.map(g => g.Title);
      for (const [group, role] of Object.entries(ROLE_GROUPS)) {
        if (titles.some(t => t.includes(group))) return role;
      }
    } catch (e) { /* fall through */ }
    return "viewer";
  }

  /* ---- public interface --------------------------------------------- */

  return {
    LIVE,
    async list(filterQuery) { return LIVE ? liveList(filterQuery) : demoList(); },
    async get(id) { return LIVE ? liveGet(id) : demoGet(id); },
    async create(fields) { return LIVE ? liveCreate(fields) : demoCreate(fields); },
    async update(id, fields) { return LIVE ? liveUpdate(id, fields) : demoUpdate(id, fields); },
    async uploadPhoto(file, findingId, stage) { return LIVE ? liveUploadPhoto(file, findingId, stage) : demoUploadPhoto(file, findingId, stage); },
    async ensureUser(login) { return LIVE ? ensureUser(login) : { Id: 0, Title: login, LoginName: login }; },
    async currentUserRole() { return LIVE ? liveCurrentUserRole() : (localStorage.getItem("she_demo_role") || "admin"); },
    setDemoRole(role) { localStorage.setItem("she_demo_role", role); },
  };
})();
