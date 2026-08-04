# SHE Patrol Digital System

ระบบติดตามผลการตรวจความปลอดภัย (SES / F-PES) แบบดิจิทัล สำหรับบริษัท สยามกลการโลจิสติกส์ จำกัด (SML)
ทดแทน Excel workbook เดิม (`Update_SHE_Committee_Patrol_report.xlsx`) ที่สร้าง sheet ใหม่ทุกเดือนและฝังรูปในเซลล์
ทำให้ไฟล์ใหญ่ขึ้นเรื่อยๆ แก้ไขพร้อมกันหลายคนไม่ได้ และไม่มี audit trail

## สถาปัตยกรรม

- **SharePoint List** `SHE_Patrol_Findings` — ฐานข้อมูลหลัก (16 คอลัมน์ ดูด้านล่าง)
- **SharePoint Document Library** `SHE_Patrol_Photos` — เก็บรูปก่อน/หลังแก้ไข
- **Power Automate** (standard connector เท่านั้น — ห้ามใช้ premium) — แจ้งเตือน/escalate ตาม SLA
- **หน้าเว็บ front-end** (ไฟล์นี้) — single-file HTML ต่อหน้า เชื่อมต่อผ่าน SharePoint REST API
- **Export Excel** — ยังคง export ให้ผู้บริหารดูได้ (ดูหน้า `executive-report.html`)

ห้ามใช้ Premium Connector ตลอดทั้งระบบ ตามข้อจำกัดของ SML

## หน้าเว็บทั้งหมด

| ไฟล์ | ใช้งานโดย | คำอธิบาย |
|---|---|---|
| `index.html` | ทุกคน | หน้าแรก เลือกเมนู |
| `new-finding.html` | SHE-Auditor | บันทึก finding ใหม่ระหว่างเดินตรวจ พร้อมรูปก่อนแก้ไข และคำนวณ DueDate อัตโนมัติตาม SLA ของ Grade |
| `findings.html` | ทุกคน (ตามสิทธิ์ SharePoint) | รายการ findings ทั้งหมด กรองตามเดือน/Shop/Grade/สถานะ พร้อม KPI สรุป |
| `finding-detail.html` | SHE-Dept-Responsible, SHE-Safety-Admin | ดูรายละเอียด กรอกมาตรการแก้ไข+รูปหลัง (Dept) และตรวจสอบ/ปิดงาน (Admin) — **บังคับแนบรูปหลังแก้ไขก่อนปิดงาน** |
| `dashboard.html` | ทุกคน | กราฟ Grade / Category / อัตราปิดงานตรงเวลารายเดือน / พื้นที่ปัญหาซ้ำ |
| `executive-report.html` | SHE-Executive-Viewer, SHE-Safety-Admin | รายงานรูปแบบ SES/F-PES เดิม พิมพ์เป็น PDF หรือ export CSV |
| `api.js` | (shared) | ชั้นเชื่อมต่อ SharePoint REST API ทั้งหมด |
| `style.css` | (shared) | ธีมสี/ฟอนต์ร่วมกันทุกหน้า (Noto Sans Thai / IBM Plex Sans Thai) |

## Demo Mode vs Live Mode

`api.js` ตรวจจับอัตโนมัติว่าเปิดหน้าเว็บจากภายใน SharePoint site จริงหรือไม่ (`SP_CONFIG.SITE_URL`):

- **ยังไม่ตั้งค่า / เปิดจากที่อื่น** → **Demo Mode**: ข้อมูลเก็บใน `localStorage` ของ browser พร้อมข้อมูลตัวอย่างจากรอบตรวจจริง (24 มิ.ย. 2026) ผสมกับตัวอย่างเดือนอื่นๆ ให้ dashboard มีข้อมูลสาธิตครบ ใช้ปุ่มสลับบทบาทในหน้า `finding-detail.html` เพื่อทดสอบ workflow ของแต่ละบทบาท
- **Live Mode**: เมื่อรัน `Create-SHEPatrolList.ps1` (ยังไม่ได้แนบในรอบนี้ — จะส่งตามหลังพร้อม Power Automate flow JSON) แล้วแก้ `SP_CONFIG.SITE_URL` ใน `api.js` ให้ตรงกับ SharePoint site จริง และเปิดหน้าเว็บจากภายใน site นั้น (เช่น อัปโหลดเป็น Site Page หรือ embed ใน SharePoint) ระบบจะอ่าน/เขียนข้อมูลจริงผ่าน REST API ทันที โดยสิทธิ์การเข้าถึงจะถูกบังคับโดย SharePoint permission groups อยู่แล้ว (ไม่ต้องมี login form แยก)

## SharePoint List: SHE_Patrol_Findings (16 คอลัมน์)

`PatrolDate` (Date) · `Shop` (Choice: PDI/Acc/Yard/Washing/Touch up/Store/อื่นๆ) · `Place` (Text) ·
`Description` (Note) · `Grade` (Choice: A/B/C/Others) · `Category` (Choice: F/S/EES/5S) ·
`PhotoBeforeUrl` (URL) · `DueDate` (Date) · `RootCause` (Note) · `ActionResponsible` (Person) ·
`Countermeasure` (Note) · `PhotoAfterUrl` (URL) · `Status` (Choice: เปิดใหม่/รอดำเนินการ/ดำเนินการแล้ว/รอตรวจสอบ/ปิดงาน) ·
`VerifiedBy` (Person) · `Rules_Confirmed_DateTime` (DateTime)

## SLA ตาม Grade

| Grade | กำหนดเสร็จ | Escalate เมื่อเลยกำหนด |
|---|---|---|
| A | 7 วัน | MGR + AGM/GM ทันที |
| B | 14 วัน | MGR |
| C / Others | 30 วัน | หัวหน้างาน |

`new-finding.html` คำนวณ `DueDate` ให้อัตโนมัติจาก `PatrolDate + SLA วัน` ตาม Grade ที่เลือก (แก้ไขเองได้)

## Permission Groups (บังคับโดย SharePoint ไม่ใช่หน้าเว็บ)

1. **SHE-Auditor** (Contribute) — สร้าง finding ใหม่
2. **SHE-Dept-Responsible** (Contribute, จำกัดแผนกตน) — อัปเดตมาตรการแก้ไข/รูปหลัง
3. **SHE-Safety-Admin** (Full Control) — แก้ไข Grade, ปิดงาน, ดู dashboard รวม
4. **SHE-Executive-Viewer** (Read only) — ดู dashboard/รายงานเท่านั้น

## ที่ยังไม่ได้ทำในรอบนี้

- `Create-SHEPatrolList.ps1` (PnP provisioning script สร้าง List/Library/Groups จริง) — จะทำต่อในรอบถัดไป
- Power Automate flow ทั้ง 4 ตัว (JSON template สำหรับ import) — จะทำต่อในรอบถัดไป
- การรันจริงกับ SharePoint tenant ของ SML — ต้องรันจากเครื่องที่เข้าถึง tenant ได้ (ทำไม่ได้จาก sandbox ของ Claude Code)
