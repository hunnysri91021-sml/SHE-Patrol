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
  const DEMO_SEED_VERSION = "2026-08-v2";

  function seedDemoData() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = [
      // ข้อมูลจริงจากรอบตรวจ 24 มิ.ย. 2026 (SES/F-PES) — คงคำอธิบายเดิมไว้เป็นตัวอย่าง
      { PatrolDate: "2026-06-24", Shop: "Acc", Place: "line Acc.", Description: "พบขยะอยู่นอกถังและป้ายมีการชำรุด ไม่ชัดเจน", Grade: "Others", Category: "5S", RootCause: "พบขยะอยู่นอกถัง ป้ายชำรุด", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "แยกขยะให้ถูกประเภท", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-27T09:10:00" },
      { PatrolDate: "2026-06-24", Shop: "Acc", Place: "line Acc.", Description: "พบขยะอยู่ที่ใต้โต๊ะติดตั้งเบาะ", Grade: "Others", Category: "5S", RootCause: "พบขยะอยูู่ใต้โต๊ะเบาะติดตั้ง และเบาะรองขาดชำรุด", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "เน้นย้ำการตรวจสอบอุปกรณ์และทำกิจกรรม5ส.", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-06-24", Shop: "Acc", Place: "line Acc.", Description: "อุปกรณ์ชำรุด อยู่ระหว่างจัดซื้อ", Grade: "C", Category: "EES", Countermeasure: "ชำรุด อยู่ระหว่างการใบสั่งซื้ออุปกรณ์แก้ไข", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-06-24", Shop: "Acc", Place: "line Acc.", Description: "พบข้าวอยู่ที่โต๊ะทำงานและเปิดพัดลมทิ้งไว้", Grade: "Others", Category: "5S", RootCause: "พบการนำอาหารมารับประทานและวางไว้บนโต๊ะทำงาน รวมถึงเปิดพัดลมทิ้งไว้เมื่อไม่มีผู้ใช้งาน", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "ประชาสัมพันธ์และเน้นย้ำพนักงาน ไม่รับประทานอาหารในพื้นที่ทำงาน และให้ปิดอุปกรณ์ไฟฟ้าทุกครั้งหลังใช้งาน พร้อมตรวจสอบเป็นประจำ", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-26T14:20:00" },
      { PatrolDate: "2026-06-24", Shop: "Acc", Place: "line Acc.", Description: "ไม่มีสัญลักษณ์เตือน", Grade: "C", Category: "S", RootCause: "ไม่มีสัญญลักษณ์เตือน อาจทำให้เดินชนได้", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "ตรวจสอบเทปให้อยู่สภาพพร้อมใช้งาน", Status: "รอตรวจสอบ" },
      // ข้อมูลตัวอย่างเพิ่มเติม เม.ย.-ส.ค. 2026 ครบทั้ง 7 Shop (สร้างเพื่อสาธิต dashboard/รายงาน
      // ไม่ใช่ข้อมูลจริง — สุ่มแบบ deterministic ให้กระจาย Grade/Category/สถานะ/SLA สมจริง)
      { PatrolDate: "2026-04-27", Shop: "PDI", Place: "PDI Line 2", Description: "เศษวัสดุตกค้างหลังเลิกงาน", Grade: "Others", Category: "5S", RootCause: "ไม่ตรวจสอบพื้นที่ก่อนเลิกกะ", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "เพิ่ม checklist ตรวจพื้นที่ก่อนเลิกกะ", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-08T10:43:00" },
      { PatrolDate: "2026-04-06", Shop: "PDI", Place: "คลังอะไหล่ PDI", Description: "เครื่องจักรมีเสียงผิดปกติ ยังไม่ได้ตรวจซ่อม", Grade: "C", Category: "EES", RootCause: "ไม่มีรอบ preventive maintenance", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "แจ้งซ่อมและวางแผน PM ประจำเครื่อง", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-27T16:01:00" },
      { PatrolDate: "2026-04-09", Shop: "PDI", Place: "PDI Line 1", Description: "พนักงานไม่สวมใส่ PPE ครบตามข้อกำหนด", Grade: "C", Category: "S", RootCause: "พนักงานใหม่ไม่ทราบข้อกำหนด PPE", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "อบรม PPE ซ้ำ พร้อมสุ่มตรวจรายวัน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-11T13:12:00" },
      { PatrolDate: "2026-04-04", Shop: "Acc", Place: "จุดประกอบอุปกรณ์เสริม", Description: "ไม่มีการ์ดครอบเครื่องจักรจุดหมุน", Grade: "Others", Category: "S", RootCause: "การ์ดครอบชำรุดหรือถูกถอดออก", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "ติดตั้ง/ซ่อมการ์ดครอบให้ครบ ระงับใช้เครื่องจนกว่าจะแก้ไข", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-26T14:07:00" },
      { PatrolDate: "2026-04-06", Shop: "Acc", Place: "จุดประกอบอุปกรณ์เสริม", Description: "ไม่มีการ์ดครอบเครื่องจักรจุดหมุน", Grade: "C", Category: "S", RootCause: "การ์ดครอบชำรุดหรือถูกถอดออก", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "ติดตั้ง/ซ่อมการ์ดครอบให้ครบ ระงับใช้เครื่องจนกว่าจะแก้ไข", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-19T10:31:00" },
      { PatrolDate: "2026-04-14", Shop: "Acc", Place: "จุดประกอบอุปกรณ์เสริม", Description: "ไม่มีสัญลักษณ์เตือนจุดอันตราย", Grade: "C", Category: "S", RootCause: "ไม่มีสัญลักษณ์เตือน อาจทำให้เดินชนได้", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "ติดเทปเหลือง-ดำเพิ่มการมองเห็น", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-01T15:22:00" },
      { PatrolDate: "2026-04-16", Shop: "Yard", Place: "ทางเข้ารับรถ", Description: "อุปกรณ์ทำความสะอาดวางกีดขวางทางเดิน", Grade: "C", Category: "5S", RootCause: "ไม่มีจุดจัดเก็บอุปกรณ์ทำความสะอาด", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "จัดทำชั้นวางอุปกรณ์ทำความสะอาดเฉพาะจุด", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-24T14:31:00" },
      { PatrolDate: "2026-04-14", Shop: "Yard", Place: "จุดจอดรถบรรทุก", Description: "ทางออกฉุกเฉินมีสิ่งกีดขวาง", Grade: "Others", Category: "F", RootCause: "ใช้พื้นที่หน้าทางออกฉุกเฉินวางของชั่วคราว", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "เคลียร์พื้นที่และตีเส้นห้ามวางของถาวร", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-05T10:47:00" },
      { PatrolDate: "2026-04-26", Shop: "Yard", Place: "จุดจอดรถบรรทุก", Description: "วัสดุไวไฟวางใกล้แหล่งความร้อน", Grade: "C", Category: "F", RootCause: "ไม่มีจุดจัดเก็บวัสดุไวไฟเฉพาะ", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "ย้ายวัสดุไวไฟไปตู้เก็บที่ได้มาตรฐาน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-05T15:26:00" },
      { PatrolDate: "2026-04-10", Shop: "Washing", Place: "ทางเดินพนักงานล้างรถ", Description: "อุปกรณ์ไฟฟ้าชำรุด สายไฟเปลือย", Grade: "A", Category: "EES", RootCause: "อุปกรณ์ใช้งานเกินอายุ ไม่มีรอบเปลี่ยน", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "เปลี่ยนอุปกรณ์ไฟฟ้าที่ชำรุดทันที", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-16T10:59:00" },
      { PatrolDate: "2026-04-24", Shop: "Washing", Place: "จุดล้างรถ", Description: "สายไฟพาดผ่านทางเดิน เสี่ยงสะดุด", Grade: "Others", Category: "S", RootCause: "เดินสายไฟชั่วคราวไม่เก็บเข้าราง", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "เก็บสายไฟเข้าท่อร้อยสาย ติดป้ายเตือน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-25T16:57:00" },
      { PatrolDate: "2026-04-22", Shop: "Washing", Place: "ทางเดินพนักงานล้างรถ", Description: "ถังสารเคมีไม่มีฝาปิดหลังใช้งาน", Grade: "B", Category: "EES", RootCause: "พนักงานลืมปิดฝาถังหลังใช้งาน", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "ทำ checklist ปิดฝาถังก่อนเลิกกะ", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-29T09:08:00" },
      { PatrolDate: "2026-04-07", Shop: "Touch up", Place: "จุดเตรียมสี", Description: "วัสดุไวไฟวางใกล้แหล่งความร้อน", Grade: "B", Category: "F", RootCause: "ไม่มีจุดจัดเก็บวัสดุไวไฟเฉพาะ", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "ย้ายวัสดุไวไฟไปตู้เก็บที่ได้มาตรฐาน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-19T11:58:00" },
      { PatrolDate: "2026-04-03", Shop: "Touch up", Place: "ห้องอบสี", Description: "พื้นลื่น ไม่มีป้ายเตือนพื้นลื่น", Grade: "Others", Category: "S", RootCause: "ไม่มีป้ายเตือนถาวรบริเวณจุดเปียก", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "ติดตั้งป้ายเตือนพื้นลื่นถาวร", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-04-05", Shop: "Touch up", Place: "จุดเตรียมสี", Description: "ป้ายทางหนีไฟไม่ชัดเจน", Grade: "A", Category: "F", RootCause: "ป้ายซีดจางจากการใช้งานนาน", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "เปลี่ยนป้ายทางหนีไฟใหม่แบบสะท้อนแสง", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-07T16:49:00" },
      { PatrolDate: "2026-04-15", Shop: "Store", Place: "ชั้นวางสินค้า A", Description: "ไม่มีสัญลักษณ์เตือนจุดอันตราย", Grade: "C", Category: "S", RootCause: "ไม่มีสัญลักษณ์เตือน อาจทำให้เดินชนได้", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "ติดเทปเหลือง-ดำเพิ่มการมองเห็น", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-16T13:04:00" },
      { PatrolDate: "2026-04-04", Shop: "Store", Place: "ชั้นวางสินค้า A", Description: "ไม่มีการ์ดครอบเครื่องจักรจุดหมุน", Grade: "Others", Category: "S", RootCause: "การ์ดครอบชำรุดหรือถูกถอดออก", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "ติดตั้ง/ซ่อมการ์ดครอบให้ครบ ระงับใช้เครื่องจนกว่าจะแก้ไข", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-30T16:37:00" },
      { PatrolDate: "2026-04-25", Shop: "Store", Place: "จุดรับสินค้า", Description: "วัสดุไวไฟวางใกล้แหล่งความร้อน", Grade: "C", Category: "F", RootCause: "ไม่มีจุดจัดเก็บวัสดุไวไฟเฉพาะ", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "ย้ายวัสดุไวไฟไปตู้เก็บที่ได้มาตรฐาน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-29T11:14:00" },
      { PatrolDate: "2026-04-24", Shop: "อื่นๆ", Place: "ลานจอดรถพนักงาน", Description: "พื้นลื่น ไม่มีป้ายเตือนพื้นลื่น", Grade: "C", Category: "S", RootCause: "ไม่มีป้ายเตือนถาวรบริเวณจุดเปียก", ActionResponsible: "หัวหน้างาน อื่นๆ", Countermeasure: "ติดตั้งป้ายเตือนพื้นลื่นถาวร", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-20T13:32:00" },
      { PatrolDate: "2026-04-18", Shop: "อื่นๆ", Place: "โรงอาหาร", Description: "ทางออกฉุกเฉินมีสิ่งกีดขวาง", Grade: "Others", Category: "F", RootCause: "ใช้พื้นที่หน้าทางออกฉุกเฉินวางของชั่วคราว", ActionResponsible: "หัวหน้างาน อื่นๆ", Countermeasure: "เคลียร์พื้นที่และตีเส้นห้ามวางของถาวร", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-04-23T10:55:00" },
      { PatrolDate: "2026-05-06", Shop: "PDI", Place: "คลังอะไหล่ PDI", Description: "เครื่องจักรมีเสียงผิดปกติ ยังไม่ได้ตรวจซ่อม", Grade: "Others", Category: "EES", RootCause: "ไม่มีรอบ preventive maintenance", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "แจ้งซ่อมและวางแผน PM ประจำเครื่อง", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-07T16:45:00" },
      { PatrolDate: "2026-05-06", Shop: "PDI", Place: "PDI Line 2", Description: "เศษวัสดุตกค้างหลังเลิกงาน", Grade: "Others", Category: "5S", RootCause: "ไม่ตรวจสอบพื้นที่ก่อนเลิกกะ", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "เพิ่ม checklist ตรวจพื้นที่ก่อนเลิกกะ", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-18T14:23:00" },
      { PatrolDate: "2026-05-09", Shop: "PDI", Place: "PDI Line 1", Description: "พนักงานไม่สวมใส่ PPE ครบตามข้อกำหนด", Grade: "Others", Category: "S", RootCause: "พนักงานใหม่ไม่ทราบข้อกำหนด PPE", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "อบรม PPE ซ้ำ พร้อมสุ่มตรวจรายวัน", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-05-28", Shop: "Acc", Place: "line Acc.", Description: "พบขยะสะสมบริเวณจุดตรวจ", Grade: "Others", Category: "5S", RootCause: "ไม่มีรอบเก็บขยะที่ชัดเจน", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "จัดรอบเก็บขยะและติดป้ายแยกประเภท", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-17T14:15:00" },
      { PatrolDate: "2026-05-20", Shop: "Acc", Place: "line Acc.", Description: "อุปกรณ์ทำความสะอาดวางกีดขวางทางเดิน", Grade: "C", Category: "5S", RootCause: "ไม่มีจุดจัดเก็บอุปกรณ์ทำความสะอาด", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "จัดทำชั้นวางอุปกรณ์ทำความสะอาดเฉพาะจุด", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-21T12:21:00" },
      { PatrolDate: "2026-05-09", Shop: "Acc", Place: "โต๊ะตรวจสอบ Acc", Description: "ไม่มี MSDS ประจำจุดใช้งานสารเคมี", Grade: "Others", Category: "EES", RootCause: "MSDS เดิมสูญหาย", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "จัดพิมพ์ MSDS ใหม่ติดประจำจุด", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-05-15", Shop: "Yard", Place: "ทางเข้ารับรถ", Description: "ของใช้วางไม่เป็นระเบียบบนโต๊ะทำงาน", Grade: "C", Category: "5S", RootCause: "ไม่มี standard การจัดวางของ", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "ทำ 5ส. และกำหนดจุดวางของให้ชัดเจน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-11T11:22:00" },
      { PatrolDate: "2026-05-11", Shop: "Yard", Place: "ทางเข้ารับรถ", Description: "พบขยะสะสมบริเวณจุดตรวจ", Grade: "Others", Category: "5S", RootCause: "ไม่มีรอบเก็บขยะที่ชัดเจน", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "จัดรอบเก็บขยะและติดป้ายแยกประเภท", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-05-20", Shop: "Yard", Place: "ลานจอดรถรอส่งมอบ", Description: "สายไฟพาดผ่านทางเดิน เสี่ยงสะดุด", Grade: "Others", Category: "S", RootCause: "เดินสายไฟชั่วคราวไม่เก็บเข้าราง", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "เก็บสายไฟเข้าท่อร้อยสาย ติดป้ายเตือน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-23T16:33:00" },
      { PatrolDate: "2026-05-03", Shop: "Washing", Place: "จุดล้างรถ", Description: "พนักงานไม่สวมใส่ PPE ครบตามข้อกำหนด", Grade: "C", Category: "S", RootCause: "พนักงานใหม่ไม่ทราบข้อกำหนด PPE", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "อบรม PPE ซ้ำ พร้อมสุ่มตรวจรายวัน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-06T13:36:00" },
      { PatrolDate: "2026-05-06", Shop: "Washing", Place: "ทางเดินพนักงานล้างรถ", Description: "เครื่องจักรมีเสียงผิดปกติ ยังไม่ได้ตรวจซ่อม", Grade: "Others", Category: "EES", RootCause: "ไม่มีรอบ preventive maintenance", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "แจ้งซ่อมและวางแผน PM ประจำเครื่อง", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-03T12:17:00" },
      { PatrolDate: "2026-05-09", Shop: "Washing", Place: "บ่อดักไขมัน", Description: "ของใช้วางไม่เป็นระเบียบบนโต๊ะทำงาน", Grade: "C", Category: "5S", RootCause: "ไม่มี standard การจัดวางของ", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "ทำ 5ส. และกำหนดจุดวางของให้ชัดเจน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-15T15:22:00" },
      { PatrolDate: "2026-05-22", Shop: "Touch up", Place: "ห้องพ่นสี", Description: "อุปกรณ์ไฟฟ้าชำรุด สายไฟเปลือย", Grade: "A", Category: "EES", RootCause: "อุปกรณ์ใช้งานเกินอายุ ไม่มีรอบเปลี่ยน", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "เปลี่ยนอุปกรณ์ไฟฟ้าที่ชำรุดทันที", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-26T14:39:00" },
      { PatrolDate: "2026-05-07", Shop: "Touch up", Place: "จุดเตรียมสี", Description: "ถังดับเพลิงหมดอายุ ไม่ได้ตรวจสอบ", Grade: "C", Category: "F", RootCause: "ไม่มีระบบแจ้งเตือนวันหมดอายุ", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "จัดทำทะเบียนวันหมดอายุถังดับเพลิงทุกจุด", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-08T09:52:00" },
      { PatrolDate: "2026-05-25", Shop: "Touch up", Place: "จุดเตรียมสี", Description: "ถังดับเพลิงหมดอายุ ไม่ได้ตรวจสอบ", Grade: "Others", Category: "F", RootCause: "ไม่มีระบบแจ้งเตือนวันหมดอายุ", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "จัดทำทะเบียนวันหมดอายุถังดับเพลิงทุกจุด", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-05-24", Shop: "Store", Place: "คลังอะไหล่", Description: "อุปกรณ์ทำความสะอาดวางกีดขวางทางเดิน", Grade: "C", Category: "5S", RootCause: "ไม่มีจุดจัดเก็บอุปกรณ์ทำความสะอาด", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "จัดทำชั้นวางอุปกรณ์ทำความสะอาดเฉพาะจุด", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-27T16:21:00" },
      { PatrolDate: "2026-05-16", Shop: "Store", Place: "จุดรับสินค้า", Description: "ทางออกฉุกเฉินมีสิ่งกีดขวาง", Grade: "Others", Category: "F", RootCause: "ใช้พื้นที่หน้าทางออกฉุกเฉินวางของชั่วคราว", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "เคลียร์พื้นที่และตีเส้นห้ามวางของถาวร", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-31T10:23:00" },
      { PatrolDate: "2026-05-23", Shop: "Store", Place: "ชั้นวางสินค้า A", Description: "ไม่มีสัญลักษณ์เตือนจุดอันตราย", Grade: "C", Category: "S", RootCause: "ไม่มีสัญลักษณ์เตือน อาจทำให้เดินชนได้", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "ติดเทปเหลือง-ดำเพิ่มการมองเห็น", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-24T11:22:00" },
      { PatrolDate: "2026-05-05", Shop: "อื่นๆ", Place: "ลานจอดรถพนักงาน", Description: "พื้นลื่น ไม่มีป้ายเตือนพื้นลื่น", Grade: "C", Category: "S", RootCause: "ไม่มีป้ายเตือนถาวรบริเวณจุดเปียก", ActionResponsible: "หัวหน้างาน อื่นๆ", Countermeasure: "ติดตั้งป้ายเตือนพื้นลื่นถาวร", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-05-27T13:32:00" },
      { PatrolDate: "2026-05-15", Shop: "อื่นๆ", Place: "ลานจอดรถพนักงาน", Description: "พื้นลื่น ไม่มีป้ายเตือนพื้นลื่น", Grade: "C", Category: "S", RootCause: "ไม่มีป้ายเตือนถาวรบริเวณจุดเปียก", ActionResponsible: "หัวหน้างาน อื่นๆ", Countermeasure: "ติดตั้งป้ายเตือนพื้นลื่นถาวร", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-05T11:02:00" },
      { PatrolDate: "2026-06-08", Shop: "PDI", Place: "PDI Line 1", Description: "พนักงานไม่สวมใส่ PPE ครบตามข้อกำหนด", Grade: "C", Category: "S", RootCause: "พนักงานใหม่ไม่ทราบข้อกำหนด PPE", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "อบรม PPE ซ้ำ พร้อมสุ่มตรวจรายวัน", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-06-08", Shop: "PDI", Place: "PDI Line 2", Description: "ไม่มีป้ายชี้บ่งพื้นที่จัดเก็บ", Grade: "A", Category: "5S", RootCause: "ป้ายเดิมหลุด/ชำรุด", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "จัดทำป้ายชี้บ่งใหม่ติดถาวร", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-06-12", Shop: "PDI", Place: "PDI Line 2", Description: "ของใช้วางไม่เป็นระเบียบบนโต๊ะทำงาน", Grade: "Others", Category: "5S", RootCause: "ไม่มี standard การจัดวางของ", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "ทำ 5ส. และกำหนดจุดวางของให้ชัดเจน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-07-06T14:07:00" },
      { PatrolDate: "2026-06-04", Shop: "Acc", Place: "จุดประกอบอุปกรณ์เสริม", Description: "ไม่มีการ์ดครอบเครื่องจักรจุดหมุน", Grade: "C", Category: "S", RootCause: "การ์ดครอบชำรุดหรือถูกถอดออก", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "ติดตั้ง/ซ่อมการ์ดครอบให้ครบ ระงับใช้เครื่องจนกว่าจะแก้ไข", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-06-07", Shop: "Acc", Place: "โต๊ะตรวจสอบ Acc", Description: "อุปกรณ์ไฟฟ้าชำรุด สายไฟเปลือย", Grade: "Others", Category: "EES", RootCause: "อุปกรณ์ใช้งานเกินอายุ ไม่มีรอบเปลี่ยน", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "เปลี่ยนอุปกรณ์ไฟฟ้าที่ชำรุดทันที", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-07-01T10:35:00" },
      { PatrolDate: "2026-06-05", Shop: "Acc", Place: "โต๊ะตรวจสอบ Acc", Description: "ถังสารเคมีไม่มีฝาปิดหลังใช้งาน", Grade: "Others", Category: "EES", RootCause: "พนักงานลืมปิดฝาถังหลังใช้งาน", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "ทำ checklist ปิดฝาถังก่อนเลิกกะ", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-16T09:20:00" },
      { PatrolDate: "2026-06-16", Shop: "Yard", Place: "จุดจอดรถบรรทุก", Description: "ถังดับเพลิงหมดอายุ ไม่ได้ตรวจสอบ", Grade: "C", Category: "F", RootCause: "ไม่มีระบบแจ้งเตือนวันหมดอายุ", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "จัดทำทะเบียนวันหมดอายุถังดับเพลิงทุกจุด", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-06-17", Shop: "Yard", Place: "ทางเข้ารับรถ", Description: "ของใช้วางไม่เป็นระเบียบบนโต๊ะทำงาน", Grade: "Others", Category: "5S", RootCause: "ไม่มี standard การจัดวางของ", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "ทำ 5ส. และกำหนดจุดวางของให้ชัดเจน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-24T14:07:00" },
      { PatrolDate: "2026-06-07", Shop: "Yard", Place: "จุดจอดรถบรรทุก", Description: "ทางออกฉุกเฉินมีสิ่งกีดขวาง", Grade: "A", Category: "F", RootCause: "ใช้พื้นที่หน้าทางออกฉุกเฉินวางของชั่วคราว", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "เคลียร์พื้นที่และตีเส้นห้ามวางของถาวร", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-06-06", Shop: "Washing", Place: "จุดล้างรถ", Description: "สายไฟพาดผ่านทางเดิน เสี่ยงสะดุด", Grade: "Others", Category: "S", RootCause: "เดินสายไฟชั่วคราวไม่เก็บเข้าราง", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "เก็บสายไฟเข้าท่อร้อยสาย ติดป้ายเตือน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-07-05T12:57:00" },
      { PatrolDate: "2026-06-11", Shop: "Washing", Place: "บ่อดักไขมัน", Description: "ไม่มีป้ายชี้บ่งพื้นที่จัดเก็บ", Grade: "C", Category: "5S", RootCause: "ป้ายเดิมหลุด/ชำรุด", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "จัดทำป้ายชี้บ่งใหม่ติดถาวร", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-06-20", Shop: "Washing", Place: "บ่อดักไขมัน", Description: "เศษวัสดุตกค้างหลังเลิกงาน", Grade: "Others", Category: "5S", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-06-13", Shop: "Touch up", Place: "ห้องพ่นสี", Description: "ไม่มี MSDS ประจำจุดใช้งานสารเคมี", Grade: "C", Category: "EES", RootCause: "MSDS เดิมสูญหาย", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "จัดพิมพ์ MSDS ใหม่ติดประจำจุด", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-06-21", Shop: "Touch up", Place: "ห้องพ่นสี", Description: "เครื่องจักรมีเสียงผิดปกติ ยังไม่ได้ตรวจซ่อม", Grade: "Others", Category: "EES", RootCause: "ไม่มีรอบ preventive maintenance", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "แจ้งซ่อมและวางแผน PM ประจำเครื่อง", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-07-05T12:57:00" },
      { PatrolDate: "2026-06-09", Shop: "Touch up", Place: "ห้องอบสี", Description: "พื้นลื่น ไม่มีป้ายเตือนพื้นลื่น", Grade: "C", Category: "S", RootCause: "ไม่มีป้ายเตือนถาวรบริเวณจุดเปียก", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "ติดตั้งป้ายเตือนพื้นลื่นถาวร", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-06-17", Shop: "Store", Place: "คลังอะไหล่", Description: "ไม่มีป้ายชี้บ่งพื้นที่จัดเก็บ", Grade: "C", Category: "5S", RootCause: "ป้ายเดิมหลุด/ชำรุด", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "จัดทำป้ายชี้บ่งใหม่ติดถาวร", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-06-19", Shop: "Store", Place: "คลังอะไหล่", Description: "พบขยะสะสมบริเวณจุดตรวจ", Grade: "Others", Category: "5S", RootCause: "ไม่มีรอบเก็บขยะที่ชัดเจน", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "จัดรอบเก็บขยะและติดป้ายแยกประเภท", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-06-29T10:15:00" },
      { PatrolDate: "2026-06-05", Shop: "Store", Place: "ชั้นวางสินค้า A", Description: "ไม่มีการ์ดครอบเครื่องจักรจุดหมุน", Grade: "C", Category: "S", RootCause: "การ์ดครอบชำรุดหรือถูกถอดออก", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "ติดตั้ง/ซ่อมการ์ดครอบให้ครบ ระงับใช้เครื่องจนกว่าจะแก้ไข", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-06-18", Shop: "อื่นๆ", Place: "โรงอาหาร", Description: "วัสดุไวไฟวางใกล้แหล่งความร้อน", Grade: "C", Category: "F", RootCause: "ไม่มีจุดจัดเก็บวัสดุไวไฟเฉพาะ", ActionResponsible: "หัวหน้างาน อื่นๆ", Countermeasure: "ย้ายวัสดุไวไฟไปตู้เก็บที่ได้มาตรฐาน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-07-06T15:22:00" },
      { PatrolDate: "2026-06-04", Shop: "อื่นๆ", Place: "โรงอาหาร", Description: "วัสดุไวไฟวางใกล้แหล่งความร้อน", Grade: "C", Category: "F", RootCause: "ไม่มีจุดจัดเก็บวัสดุไวไฟเฉพาะ", ActionResponsible: "หัวหน้างาน อื่นๆ", Countermeasure: "ย้ายวัสดุไวไฟไปตู้เก็บที่ได้มาตรฐาน", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-07-25", Shop: "PDI", Place: "จุดตรวจสอบคุณภาพ PDI", Description: "วัสดุไวไฟวางใกล้แหล่งความร้อน", Grade: "Others", Category: "F", RootCause: "ไม่มีจุดจัดเก็บวัสดุไวไฟเฉพาะ", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "ย้ายวัสดุไวไฟไปตู้เก็บที่ได้มาตรฐาน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-08-21T15:50:00" },
      { PatrolDate: "2026-07-15", Shop: "PDI", Place: "จุดตรวจสอบคุณภาพ PDI", Description: "วัสดุไวไฟวางใกล้แหล่งความร้อน", Grade: "C", Category: "F", RootCause: "ไม่มีจุดจัดเก็บวัสดุไวไฟเฉพาะ", ActionResponsible: "หัวหน้างาน PDI", Countermeasure: "ย้ายวัสดุไวไฟไปตู้เก็บที่ได้มาตรฐาน", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-07-05", Shop: "PDI", Place: "จุดตรวจสอบคุณภาพ PDI", Description: "วัสดุไวไฟวางใกล้แหล่งความร้อน", Grade: "B", Category: "F", Status: "เปิดใหม่" },
      { PatrolDate: "2026-07-10", Shop: "Acc", Place: "โต๊ะตรวจสอบ Acc", Description: "เครื่องจักรมีเสียงผิดปกติ ยังไม่ได้ตรวจซ่อม", Grade: "C", Category: "EES", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-07-11", Shop: "Acc", Place: "line Acc.", Description: "พบขยะสะสมบริเวณจุดตรวจ", Grade: "Others", Category: "5S", RootCause: "ไม่มีรอบเก็บขยะที่ชัดเจน", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "จัดรอบเก็บขยะและติดป้ายแยกประเภท", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-08-11T11:30:00" },
      { PatrolDate: "2026-07-19", Shop: "Acc", Place: "โต๊ะตรวจสอบ Acc", Description: "ไม่มี MSDS ประจำจุดใช้งานสารเคมี", Grade: "C", Category: "EES", RootCause: "MSDS เดิมสูญหาย", ActionResponsible: "หัวหน้างาน Acc", Countermeasure: "จัดพิมพ์ MSDS ใหม่ติดประจำจุด", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-07-22", Shop: "Yard", Place: "ทางเข้ารับรถ", Description: "ไม่มีป้ายชี้บ่งพื้นที่จัดเก็บ", Grade: "A", Category: "5S", RootCause: "ป้ายเดิมหลุด/ชำรุด", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "จัดทำป้ายชี้บ่งใหม่ติดถาวร", Status: "รอตรวจสอบ" },
      { PatrolDate: "2026-07-16", Shop: "Yard", Place: "ลานจอดรถรอส่งมอบ", Description: "สายไฟพาดผ่านทางเดิน เสี่ยงสะดุด", Grade: "Others", Category: "S", RootCause: "เดินสายไฟชั่วคราวไม่เก็บเข้าราง", ActionResponsible: "หัวหน้างาน Yard", Countermeasure: "เก็บสายไฟเข้าท่อร้อยสาย ติดป้ายเตือน", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-07-25", Shop: "Yard", Place: "ลานจอดรถรอส่งมอบ", Description: "พนักงานไม่สวมใส่ PPE ครบตามข้อกำหนด", Grade: "C", Category: "S", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-07-20", Shop: "Washing", Place: "บ่อดักไขมัน", Description: "ของใช้วางไม่เป็นระเบียบบนโต๊ะทำงาน", Grade: "Others", Category: "5S", RootCause: "ไม่มี standard การจัดวางของ", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "ทำ 5ส. และกำหนดจุดวางของให้ชัดเจน", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-07-19", Shop: "Washing", Place: "บ่อดักไขมัน", Description: "อุปกรณ์ทำความสะอาดวางกีดขวางทางเดิน", Grade: "C", Category: "5S", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-07-09", Shop: "Washing", Place: "จุดล้างรถ", Description: "พนักงานไม่สวมใส่ PPE ครบตามข้อกำหนด", Grade: "C", Category: "S", RootCause: "พนักงานใหม่ไม่ทราบข้อกำหนด PPE", ActionResponsible: "หัวหน้างาน Washing", Countermeasure: "อบรม PPE ซ้ำ พร้อมสุ่มตรวจรายวัน", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-07-26", Shop: "Touch up", Place: "จุดเตรียมสี", Description: "ทางออกฉุกเฉินมีสิ่งกีดขวาง", Grade: "C", Category: "F", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-07-22", Shop: "Touch up", Place: "ห้องอบสี", Description: "บันไดชำรุด ขั้นบันไดหลวม", Grade: "C", Category: "S", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-07-14", Shop: "Touch up", Place: "จุดเตรียมสี", Description: "ทางออกฉุกเฉินมีสิ่งกีดขวาง", Grade: "Others", Category: "F", RootCause: "ใช้พื้นที่หน้าทางออกฉุกเฉินวางของชั่วคราว", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "เคลียร์พื้นที่และตีเส้นห้ามวางของถาวร", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-07-25T10:55:00" },
      { PatrolDate: "2026-07-16", Shop: "Store", Place: "ชั้นวางสินค้า A", Description: "ไม่มีการ์ดครอบเครื่องจักรจุดหมุน", Grade: "Others", Category: "S", RootCause: "การ์ดครอบชำรุดหรือถูกถอดออก", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "ติดตั้ง/ซ่อมการ์ดครอบให้ครบ ระงับใช้เครื่องจนกว่าจะแก้ไข", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-07-16", Shop: "Store", Place: "จุดรับสินค้า", Description: "ทางออกฉุกเฉินมีสิ่งกีดขวาง", Grade: "Others", Category: "F", Status: "เปิดใหม่" },
      { PatrolDate: "2026-07-09", Shop: "Store", Place: "จุดรับสินค้า", Description: "วัสดุไวไฟวางใกล้แหล่งความร้อน", Grade: "Others", Category: "F", RootCause: "ไม่มีจุดจัดเก็บวัสดุไวไฟเฉพาะ", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "ย้ายวัสดุไวไฟไปตู้เก็บที่ได้มาตรฐาน", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-07-27T11:50:00" },
      { PatrolDate: "2026-07-21", Shop: "อื่นๆ", Place: "ลานจอดรถพนักงาน", Description: "พื้นลื่น ไม่มีป้ายเตือนพื้นลื่น", Grade: "Others", Category: "S", RootCause: "ไม่มีป้ายเตือนถาวรบริเวณจุดเปียก", ActionResponsible: "หัวหน้างาน อื่นๆ", Countermeasure: "ติดตั้งป้ายเตือนพื้นลื่นถาวร", Status: "ปิดงาน", VerifiedBy: "จนท.ความปลอดภัย", Rules_Confirmed_DateTime: "2026-08-12T09:20:00" },
      { PatrolDate: "2026-07-08", Shop: "อื่นๆ", Place: "สำนักงาน", Description: "ของใช้วางไม่เป็นระเบียบบนโต๊ะทำงาน", Grade: "Others", Category: "5S", RootCause: "ไม่มี standard การจัดวางของ", ActionResponsible: "หัวหน้างาน อื่นๆ", Countermeasure: "ทำ 5ส. และกำหนดจุดวางของให้ชัดเจน", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-08-03", Shop: "PDI", Place: "PDI Line 2", Description: "เศษวัสดุตกค้างหลังเลิกงาน", Grade: "Others", Category: "5S", Status: "เปิดใหม่" },
      { PatrolDate: "2026-08-03", Shop: "PDI", Place: "PDI Line 2", Description: "อุปกรณ์ทำความสะอาดวางกีดขวางทางเดิน", Grade: "C", Category: "5S", Status: "เปิดใหม่" },
      { PatrolDate: "2026-08-03", Shop: "PDI", Place: "PDI Line 2", Description: "ไม่มีป้ายชี้บ่งพื้นที่จัดเก็บ", Grade: "A", Category: "5S", Status: "เปิดใหม่" },
      { PatrolDate: "2026-08-03", Shop: "Acc", Place: "จุดประกอบอุปกรณ์เสริม", Description: "ไม่มีการ์ดครอบเครื่องจักรจุดหมุน", Grade: "Others", Category: "S", Status: "เปิดใหม่" },
      { PatrolDate: "2026-08-03", Shop: "Acc", Place: "โต๊ะตรวจสอบ Acc", Description: "อุปกรณ์ไฟฟ้าชำรุด สายไฟเปลือย", Grade: "Others", Category: "EES", Status: "เปิดใหม่" },
      { PatrolDate: "2026-08-03", Shop: "Acc", Place: "line Acc.", Description: "อุปกรณ์ทำความสะอาดวางกีดขวางทางเดิน", Grade: "C", Category: "5S", Status: "เปิดใหม่" },
      { PatrolDate: "2026-08-03", Shop: "Yard", Place: "ลานจอดรถรอส่งมอบ", Description: "พนักงานไม่สวมใส่ PPE ครบตามข้อกำหนด", Grade: "Others", Category: "S", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-08-03", Shop: "Yard", Place: "ทางเข้ารับรถ", Description: "เศษวัสดุตกค้างหลังเลิกงาน", Grade: "B", Category: "5S", Status: "เปิดใหม่" },
      { PatrolDate: "2026-08-03", Shop: "Yard", Place: "ทางเข้ารับรถ", Description: "อุปกรณ์ทำความสะอาดวางกีดขวางทางเดิน", Grade: "C", Category: "5S", Status: "เปิดใหม่" },
      { PatrolDate: "2026-08-03", Shop: "Washing", Place: "บ่อดักไขมัน", Description: "พบขยะสะสมบริเวณจุดตรวจ", Grade: "Others", Category: "5S", Status: "เปิดใหม่" },
      { PatrolDate: "2026-08-03", Shop: "Washing", Place: "ทางเดินพนักงานล้างรถ", Description: "ไม่มี MSDS ประจำจุดใช้งานสารเคมี", Grade: "B", Category: "EES", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-08-03", Shop: "Washing", Place: "ทางเดินพนักงานล้างรถ", Description: "อุปกรณ์ไฟฟ้าชำรุด สายไฟเปลือย", Grade: "C", Category: "EES", Status: "เปิดใหม่" },
      { PatrolDate: "2026-08-03", Shop: "Touch up", Place: "ห้องอบสี", Description: "บันไดชำรุด ขั้นบันไดหลวม", Grade: "Others", Category: "S", RootCause: "ไม่มีรอบตรวจสอบบันไดประจำ", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "ซ่อมบันไดและเพิ่มรอบตรวจสอบรายเดือน", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-08-03", Shop: "Touch up", Place: "ห้องพ่นสี", Description: "เครื่องจักรมีเสียงผิดปกติ ยังไม่ได้ตรวจซ่อม", Grade: "Others", Category: "EES", RootCause: "ไม่มีรอบ preventive maintenance", ActionResponsible: "หัวหน้างาน Touch up", Countermeasure: "แจ้งซ่อมและวางแผน PM ประจำเครื่อง", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-08-03", Shop: "Touch up", Place: "ห้องพ่นสี", Description: "ไม่มี MSDS ประจำจุดใช้งานสารเคมี", Grade: "C", Category: "EES", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-08-03", Shop: "Store", Place: "คลังอะไหล่", Description: "เศษวัสดุตกค้างหลังเลิกงาน", Grade: "B", Category: "5S", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-08-03", Shop: "Store", Place: "จุดรับสินค้า", Description: "ป้ายทางหนีไฟไม่ชัดเจน", Grade: "Others", Category: "F", RootCause: "ป้ายซีดจางจากการใช้งานนาน", ActionResponsible: "หัวหน้างาน Store", Countermeasure: "เปลี่ยนป้ายทางหนีไฟใหม่แบบสะท้อนแสง", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-08-03", Shop: "Store", Place: "คลังอะไหล่", Description: "ของใช้วางไม่เป็นระเบียบบนโต๊ะทำงาน", Grade: "C", Category: "5S", Status: "รอดำเนินการ" },
      { PatrolDate: "2026-08-03", Shop: "อื่นๆ", Place: "สำนักงาน", Description: "อุปกรณ์ทำความสะอาดวางกีดขวางทางเดิน", Grade: "C", Category: "5S", RootCause: "ไม่มีจุดจัดเก็บอุปกรณ์ทำความสะอาด", ActionResponsible: "หัวหน้างาน อื่นๆ", Countermeasure: "จัดทำชั้นวางอุปกรณ์ทำความสะอาดเฉพาะจุด", Status: "ดำเนินการแล้ว" },
      { PatrolDate: "2026-08-03", Shop: "อื่นๆ", Place: "โรงอาหาร", Description: "ทางออกฉุกเฉินมีสิ่งกีดขวาง", Grade: "Others", Category: "F", Status: "เปิดใหม่" },
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
