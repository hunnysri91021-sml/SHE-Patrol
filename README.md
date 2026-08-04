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

- **ยังไม่ตั้งค่า / เปิดจากที่อื่น** → **Demo Mode**: ข้อมูลเก็บใน `localStorage` ของ browser รวม 105 รายการ — 5 รายการเป็นข้อมูลจริงจากรอบตรวจ 24 มิ.ย. 2026 ที่ส่งมา ที่เหลือ 100 รายการสร้างขึ้นเพื่อสาธิต ครอบคลุม 5 เดือน (เม.ย.-ส.ค. 2026) ครบทั้ง 7 Shop กระจาย Grade/Category/สถานะ/อัตราปิดงานตรงเวลาให้สมจริง (ไม่ใช่ข้อมูลจริงของบริษัท) ใช้ปุ่มสลับบทบาทในหน้า `finding-detail.html` เพื่อทดสอบ workflow ของแต่ละบทบาท
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

## Provisioning script

`Create-SHEPatrolList.ps1` — PnP PowerShell script (idempotent) ที่สร้าง List/Library/Groups ทั้งหมด
ข้างต้นให้อัตโนมัติ รันด้วย:

```powershell
Install-Module -Name PnP.PowerShell -Scope CurrentUser   # ครั้งแรกเท่านั้น
./Create-SHEPatrolList.ps1 -SiteUrl "https://siammotors.sharepoint.com/sites/SHEPatrol"
```

สคริปต์จะพิมพ์หมายเหตุท้ายรันเกี่ยวกับข้อจำกัดของ SharePoint permission group ในการจำกัด
"เฉพาะแผนกตน" ของกลุ่ม SHE-Dept-Responsible พร้อมแนวทางแก้ (ดูรายละเอียดในตัวสคริปต์)

## Power Automate

ดูโฟลเดอร์ `power-automate/` — สเปกสร้าง flow ทั้ง 4 ตัวแบบทีละขั้นตอน (ใช้ standard connector
ล้วน ไม่มี premium) พร้อม JSON โครงสร้างอ้างอิงสำหรับ copy expression

## ที่ยังไม่ได้ทำในรอบนี้

- การรันจริงกับ SharePoint tenant ของ SML — ต้องรันจากเครื่องที่เข้าถึง tenant ได้ (ทำไม่ได้จาก sandbox ของ Claude Code)
- การสร้าง flow จริงใน Power Automate (มีแต่สเปก — ต้องสร้างเองในทีมที่มีสิทธิ์เข้า Power Automate ของ SML)
- Item-level permission scoping สำหรับ SHE-Dept-Responsible ตามแผนก (ดูหมายเหตุใน `Create-SHEPatrolList.ps1`)
