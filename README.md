# SHE Patrol Digital System

ระบบติดตามผลการตรวจความปลอดภัย (SES / F-PES) แบบดิจิทัล สำหรับบริษัท สยามกลการโลจิสติกส์ จำกัด (SML)
ทดแทน Excel workbook เดิม (`Update_SHE_Committee_Patrol_report.xlsx`) ที่สร้าง sheet ใหม่ทุกเดือนและฝังรูปในเซลล์
ทำให้ไฟล์ใหญ่ขึ้นเรื่อยๆ แก้ไขพร้อมกันหลายคนไม่ได้ และไม่มี audit trail

## สถาปัตยกรรม (ปัจจุบัน — Google Sheets + Apps Script)

- **Google Sheet** — ฐานข้อมูลหลัก มี 3 แท็บ: `Findings` (16 คอลัมน์), `Users` (รายชื่อ+บทบาท),
  `Settings` (อีเมลแจ้งเตือน/ค่าคอนฟิก)
- **Google Drive** (โฟลเดอร์ `SHE Patrol Photos`) — เก็บรูปก่อน/หลังแก้ไข แชร์แบบ "Anyone with the
  link can view" ให้เปิดดูได้ตรงจาก `<img>` โดยไม่ต้อง login
- **Google Apps Script Web App** (`SHE-Patrol-AppsScript.gs`) — API เดียวที่ front-end คุยด้วย
  ทำ CRUD ทั้งหมด + ส่งอีเมลแจ้งเตือน (แทน Power Automate เดิม) — **ฟรี 100% ไม่มีค่าใช้จ่าย**
  ไม่ว่าจะมีกี่คนเรียกใช้ก็ตาม
- **หน้าเว็บ front-end** — ไฟล์เดียว (`index.html`) แบบ single-page app โฮสต์ที่ไหนก็ได้
- **Export Excel/CSV** — export ให้ผู้บริหารดูได้ (แท็บ "รายงานผู้บริหาร" ในแอป)

> **ทำไมเปลี่ยนจาก SharePoint + Power Automate**: ออกแบบไว้ตอนแรกให้ front-end คุยกับ SharePoint
> REST ตรงๆ ผ่าน session ของผู้ใช้เอง ทำให้พนักงานที่ไม่มี license Microsoft 365 (ไม่มีบัญชีในระบบ
> บริษัทเลย) เข้าใช้งานไม่ได้เลยแม้แต่จะดู ทางแก้ที่ยังอยู่ใน M365/SharePoint (Power Automate HTTP
> trigger เป็นตัวกลาง) ต้องใช้ Power Automate license แบบ per-user ที่มีค่าใช้จ่าย ไม่รวมอยู่ใน M365
> Business Basic ที่ SML ใช้อยู่ — ย้ายมาที่ Google Apps Script Web App แทน เพราะให้ endpoint สาธารณะ
> ฟรีแบบเดียวกัน โดยไม่มีเงื่อนไข license ผูกกับจำนวนผู้ใช้ ตามแนวทางเดียวกับที่ระบบพี่น้อง (Work
> Permit) ใช้อยู่แล้วจริงสำหรับผู้รับเหมาภายนอก
>
> **ของเดิมยังอยู่ ไม่ได้ลบทิ้ง**: SharePoint List/Library/Groups ที่ provision ไปแล้วบน tenant ของ
> SML (ผ่าน `Create-SHEPatrolList.ps1`) และสเปก Power Automate 5 flow (โฟลเดอร์ `power-automate/`)
> ยังอยู่ในรีโปนี้เผื่อใช้อ้างอิง/กลับมาใช้ในอนาคต (เช่นถ้า SML ตัดสินใจซื้อ license เพิ่มทีหลัง หรือ
> อยากมี mirror ข้อมูลไว้ใน SharePoint สำหรับดูอย่างเดียว) แต่**ไม่ใช่ backend ที่แอปเชื่อมต่ออยู่แล้ว**

## `index.html` — single-page app

ทุกอย่างอยู่ในไฟล์เดียว (แนวเดียวกับ Work Permit / FireCheck ของทีมนี้เอง): หน้า Login →
หน้าหลัก (รายการ + KPI) → Dashboard (กราฟ) → รายงานผู้บริหาร (SES/F-PES) → จัดการผู้ใช้งาน (Admin)
สลับกันด้วยแท็บ ไม่มีการโหลดหน้าใหม่

| ส่วน | ใช้งานโดย | คำอธิบาย |
|---|---|---|
| Login | ทุกคน | เลือกชื่อตัวเองจากรายชื่อที่ Admin เพิ่มไว้ — **ไม่ใช่การสมัครสมาชิกเอง** |
| หน้าหลัก | ทุกคน (สิทธิ์แก้ไขต่างกันตาม Role) | รายการ findings กรองตามเดือน/Shop/Grade/สถานะ, ปุ่ม "+ บันทึกรายการตรวจใหม่" (Auditor/Admin), เปิดดูรายละเอียด/แก้ไข (Dept/Admin), Export CSV |
| Dashboard | ทุกคน | กราฟ Grade / Category / อัตราปิดงานตรงเวลารายเดือน / พื้นที่ปัญหาซ้ำ |
| รายงานผู้บริหาร | ทุกคน | รูปแบบ SES/F-PES เดิม พิมพ์เป็น PDF หรือ export CSV |
| จัดการผู้ใช้งาน | เฉพาะ Safety Admin | เพิ่ม/แก้ไขผู้ใช้งาน — พิมพ์ชื่อ-อีเมลใครก็ได้ ไม่ต้องมีบัญชีมาก่อน กำหนด Role/Shop ให้แต่ละคน |

การปิดงาน **บังคับแนบรูปหลังแก้ไขก่อน** — ปุ่มปิดงานจะเปลี่ยนสถานะไม่ได้จนกว่าจะมีรูป และระบบบันทึก
ชื่อผู้ปิดงาน + เวลาอัตโนมัติจากบัญชีที่ login อยู่ (ไม่ต้องพิมพ์ชื่อเอง — กันการสวมรอย)

### เรื่องผู้ใช้งาน/สิทธิ์ (ตอบโจทย์ "กำหนดชื่อคนเข้าใช้งานได้ โดยมี Admin กำหนดบทบาทให้")

- ผู้ใช้ **เลือกชื่อตัวเอง** จากรายชื่อ ไม่ได้เลือก Role เอง — Role/Shop มาจากสิ่งที่ Admin ตั้งไว้ในเมนู
  "จัดการผู้ใช้งาน" เท่านั้น
- Admin เพิ่มชื่อใครก็ได้ในองค์กร (ไม่ต้องมีบัญชีอะไรมาก่อนเลย) — พิมพ์ชื่อ+อีเมล เลือก Role
- **สำคัญ — bootstrap รอบแรก**: Google Sheet ที่สร้างใหม่ แท็บ `Users` จะว่างเปล่า ยังไม่มีใคร login
  ได้ ต้องเพิ่มแถวแรก (Admin คนแรก) ด้วยตัวเองในชีตโดยตรง (Id=1, Name, Email, Role=SHE-Safety-Admin,
  Active=TRUE) หลังจากนั้น Admin คนนั้นเพิ่มคนอื่นต่อผ่านแอปได้เลย
- ข้อจำกัดที่ต้องรู้: การ "login" นี้เป็นการระบุตัวตนระดับ UX เท่านั้น (ไม่ใช่รหัสผ่านจริง) — ใครก็ตาม
  ที่รู้ URL ของ Apps Script Web App เรียก API ตรงได้โดยไม่ผ่านหน้าเว็บ เป็นการยอมรับความเสี่ยงแบบ
  เดียวกับที่ Work Permit ใช้กับ endpoint สาธารณะสำหรับผู้รับเหมาภายนอกอยู่แล้ว ถ้าต้องการป้องกันเพิ่ม
  ทำได้โดยเพิ่ม token ลับใน request แล้วเช็คใน `doPost()` ก่อนทำงาน (ยังไม่ได้ทำในรอบนี้)
- Dept-Responsible แต่ละคนผูกกับ **Shop เดียว** (ตั้งตอนเพิ่มผู้ใช้) — แก้ไข finding ได้เฉพาะ Shop ของตัวเอง

### เรื่องอีเมล (ตอบโจทย์ "ส่ง Mail ได้")

หน้าเว็บ **ไม่มีปุ่มส่งอีเมล** เพราะ browser ส่งอีเมลเองไม่ได้และไม่ควรฝัง credential อีเมลไว้ใน
client-side JS — การแจ้งเตือนทั้งหมด (finding ใหม่ / รอตรวจสอบ / เลยกำหนด SLA / ปิดงาน) ทำงาน
อัตโนมัติจาก `SHE-Patrol-AppsScript.gs` เอง (ใช้ `MailApp.sendEmail` ของ Google — ฟรี ไม่ต้องตั้งค่า
SMTP) ทันทีที่มีการเปลี่ยนแปลงข้อมูล อีเมลผู้รับตั้งค่าได้ในแท็บ `Settings` ของ Google Sheet ไม่ต้อง
แก้โค้ด

### เรื่องรูปภาพ

รูปเก็บใน Google Drive โฟลเดอร์ `SHE Patrol Photos` แชร์แบบ "Anyone with the link can view" —
เปิดดูได้ตรงจาก URL ที่ได้กลับมาทันที ไม่ต้อง login และไม่ต้องมี round-trip พิเศษเหมือนตอนใช้ SharePoint

## Demo Mode vs Live Mode

`index.html` เช็ค `APP_CONFIG.API_URL`:

- **ว่างเปล่า (ค่าเริ่มต้น)** → **Demo Mode**: ข้อมูลเก็บใน `localStorage` ของ browser
  — Findings 105 รายการ (5 รายการเป็นข้อมูลจริงจากรอบตรวจ 24 มิ.ย. 2026 ที่ส่งมา ที่เหลือสร้างขึ้นเพื่อสาธิต
  ครอบคลุม 5 เดือน ครบ 7 Shop) และผู้ใช้ตัวอย่าง 6 คน (โดเมนสมมติ `@example-sml.co.th` — ไม่ใช่พนักงานจริง)
  ครบทั้ง 4 บทบาทให้ login ทดสอบได้ทันที
- **ตั้งค่าแล้ว** → **Live Mode**: ทุก action เรียกผ่าน Google Apps Script Web App

### ขั้นตอนไป Live

1. เปิด **Google Sheets** → สร้างสเปรดชีตใหม่ (ว่างเปล่า)
2. เมนู **Extensions → Apps Script** → ลบโค้ดเริ่มต้นทิ้ง → วางเนื้อหาไฟล์ `SHE-Patrol-AppsScript.gs`
   ทั้งหมดแทน → บันทึก (Ctrl+S)
3. เลือกฟังก์ชัน `setupSheet` จาก dropdown ด้านบน → กด **Run** → อนุญาตสิทธิ์ตามที่ถาม (ครั้งแรกจะมี
   คำเตือน "Google hasn't verified this app" เพราะเป็นสคริปต์ของเราเอง กด Advanced → ไปต่อได้ปกติ)
4. กลับไปที่ Google Sheet จะเห็นแท็บ `Findings`, `Users`, `Settings` ถูกสร้างแล้ว — กรอกอีเมลต่างๆ
   ในแท็บ `Settings` (Safety_Officer_Email, MGR_Email, Shop_Email_PDI ฯลฯ)
5. เพิ่ม Admin คนแรกในแท็บ `Users` ด้วยตัวเอง (ดู bootstrap ด้านบน)
6. **Deploy → New deployment** → เลือกประเภท **Web app** → Execute as: **Me** → Who has access:
   **Anyone** → Deploy → คัดลอก URL ที่ได้ (ลงท้ายด้วย `/exec`)
7. แก้ `APP_CONFIG.API_URL` ใน `index.html` ให้เป็น URL นั้น
8. อัปโหลด `index.html` ไปโฮสต์ที่ไหนก็ได้ (GitHub Pages ของรีโปนี้เอง, Google Sites, หรือที่อื่น —
   ไม่ผูกกับ Google/Microsoft แล้ว)
9. (ทำครั้งเดียว) ตั้ง time-driven trigger: Apps Script editor → ไอคอนนาฬิกา (Triggers) → **Add
   Trigger** → Function: `checkSlaEscalation`, Event source: Time-driven, Day timer, ช่วง 8-9 โมงเช้า
   → Save

## Google Sheet: แท็บ Findings (16 คอลัมน์)

`Id` (auto) · `PatrolDate` · `Shop` (PDI/Acc/Yard/Washing/Touch up/Store/อื่นๆ) · `Place` ·
`Description` · `Grade` (A/B/C/Others) · `Category` (F/S/EES/5S) · `PhotoBeforeUrl` · `DueDate` ·
`RootCause` · `ActionResponsible` · `Countermeasure` · `PhotoAfterUrl` ·
`Status` (เปิดใหม่/รอดำเนินการ/ดำเนินการแล้ว/รอตรวจสอบ/ปิดงาน) · `VerifiedBy` · `Rules_Confirmed_DateTime`

## Google Sheet: แท็บ Users

`Id` (auto) · `Name` · `Email` · `Role` (SHE-Auditor/SHE-Dept-Responsible/SHE-Safety-Admin/SHE-Executive-Viewer) ·
`Shop` (เฉพาะ Dept-Responsible) · `Active` (TRUE/FALSE)

## SLA ตาม Grade

| Grade | กำหนดเสร็จ | Escalate เมื่อเลยกำหนด |
|---|---|---|
| A | 7 วัน | MGR + AGM/GM ทันที |
| B | 14 วัน | MGR |
| C / Others | 30 วัน | หัวหน้างาน |

ฟอร์ม "บันทึกรายการตรวจใหม่" คำนวณ `DueDate` ให้อัตโนมัติจาก `PatrolDate + SLA วัน` ตาม Grade ที่เลือก
`checkSlaEscalation()` (time trigger รายวัน) แจ้งเตือนล่วงหน้าตาม `SLA_Escalation_Days_Before` ในแท็บ
`Settings` (ค่าเริ่มต้น 2 วัน) รวมถึงรายการที่เลยกำหนดแล้ว

## PDPA — ข้อควรพิจารณา

หน้าเว็บมีปุ่ม "🔒 ความเป็นส่วนตัว" ทั้งที่หน้า login และในแอป เปิดดูนโยบายที่สรุปข้อมูลที่เก็บ/
วัตถุประสงค์/สิทธิของเจ้าของข้อมูลได้ทุกเมื่อ — ใช้ฐาน **"หน้าที่ตามกฎหมาย/ประโยชน์โดยชอบด้วยกฎหมาย
ของนายจ้าง"** ในการดูแลความปลอดภัยอาชีวอนามัย ไม่ใช่ฐานความยินยอม (consent) เพราะเป็นข้อมูลที่จำเป็น
ต่อการปฏิบัติหน้าที่ ไม่ใช่ทางเลือกของพนักงาน (แนวทางเดียวกับที่ใช้ในโปรเจกต์พี่น้อง `FireCheck`)

**ข้อมูลส่วนบุคคลที่ระบบเก็บ**: ชื่อ-นามสกุล/อีเมล (แท็บ `Users`), ชื่อผู้รับผิดชอบแก้ไข/ชื่อผู้ตรวจ
ยืนยันปิดงาน (แท็บ `Findings`), รูปถ่ายสภาพพื้นที่ (อาจติดบุคคลได้หากไม่ระวัง)

**ความเสี่ยงใหม่ที่เกิดจากการย้ายมา Google (สำคัญ ต้องตัดสินใจ)**: เดิมข้อมูลอยู่ใน SharePoint ของ
บริษัทเอง (M365 tenant ที่ SML ควบคุม) ตอนนี้ย้ายมาอยู่ใน Google Sheets/Drive ซึ่ง**ผูกกับบัญชี Google
ที่ใช้สร้างระบบ** — ถ้าบัญชีนั้นเป็น**บัญชีส่วนตัว**ของพนักงานคนใดคนหนึ่ง (เช่น Gmail ส่วนตัว) หมายความว่า
ข้อมูลพนักงานทุกคนในระบบ (ชื่อ/อีเมล/ประวัติการทำงาน) ตอนนี้อยู่ใต้การควบคุมของบัญชีส่วนบุคคลนั้น ไม่ใช่
ของบริษัท — เป็นความเสี่ยงด้าน data governance ที่ควรแก้โดยเร็ว:

- ควรใช้ **Google Workspace account ของบริษัท** (ถ้า SML มี) แทนบัญชีส่วนตัว หรือ
- ถ้าต้องใช้ Gmail ส่วนตัวไปก่อน ให้จำกัดการแชร์สเปรดชีตให้แคบที่สุด (Restricted — เฉพาะคนที่ระบุ)
  และวางแผนย้ายไปบัญชีบริษัทเมื่อพร้อม
- **✅ ทำแล้ว และทดสอบผ่านแล้ว (end-to-end) — แผนสำรองข้อมูลเข้า M365**: `backupToMS365Email()`
  ใน `SHE-Patrol-AppsScript.gs` export ข้อมูลทั้งหมดเป็น .xlsx ส่งเข้าอีเมล Outlook ของบริษัท
  รายสัปดาห์ (ตั้งค่า `MS365_Backup_Email` ในแท็บ Settings + time-driven trigger แล้ว — ดูคอมเมนต์
  หัวไฟล์ .gs) ต่อด้วย Power Automate flow ตาม `power-automate/Flow6-Backup-To-OneDrive.md`
  (standard connector ล้วน ไม่มี premium) คอยเซฟไฟล์แนบนั้นเข้าโฟลเดอร์ `SHE Patrol Backups` ใน
  OneDrive ให้อัตโนมัติ — ทดสอบจริงแล้วว่าไฟล์ .xlsx ไปโผล่ใน OneDrive ได้สำเร็จ ถ้าบัญชี Google
  เข้าถึงไม่ได้ในอนาคต ยังมีสำเนาข้อมูลอยู่ใน M365 tenant ของบริษัทเอง

**สิทธิ์การเข้าถึงสเปรดชีตต้นทาง**: ตัว Web App (API) เปิดสาธารณะโดยเจตนา (ให้ทุกคนใช้แอปได้) แต่
**สเปรดชีต Google Sheets เองต้องไม่แชร์แบบ "Anyone with the link"** — ควรตั้งเป็น Restricted และ
ให้สิทธิ์เฉพาะคนที่จำเป็นต้องดูข้อมูลดิบ (เช่น Admin/IT) เพราะใครก็ตามที่มีลิงก์ตรงของสเปรดชีต
(ไม่ผ่านแอป) จะเห็นข้อมูลทุกคอลัมน์รวมถึงอีเมลทั้งหมดได้ทันที

**การเปิดเผยชื่อในหน้า login**: หน้าจอเลือกชื่อก่อน login แสดง **ชื่อ + บทบาท** ของผู้ใช้ทุกคนให้ใคร
ก็ตามที่เปิดหน้าเว็บเห็นได้ (จำเป็นสำหรับ UX เลือกชื่อตัวเอง) — **ไม่แสดงอีเมล** อีเมลจะเห็นได้เฉพาะใน
เมนู "จัดการผู้ใช้งาน" ซึ่งจำกัดเฉพาะ Safety Admin เท่านั้น

**รูปภาพ**: หลีกเลี่ยงถ่ายให้ติดใบหน้าบุคคลโดยไม่จำเป็นตอนบันทึก finding

**สิทธิของเจ้าของข้อมูล (DSAR)**: ยังไม่มีกลไกอัตโนมัติสำหรับขอเข้าถึง/แก้ไข/ลบข้อมูลของตนเอง — ต้อง
ติดต่อ Safety Admin หรือ DPO ของบริษัทโดยตรง (ตามที่ระบุในนโยบายความเป็นส่วนตัวในแอป)

## ส่วนที่ยังอยู่แต่ไม่ใช่ backend หลักแล้ว (SharePoint / Power Automate)

รอบก่อนหน้าได้ provision List/Library/Groups บน SharePoint site จริงของ SML ไปแล้ว และเขียนสเปก
Power Automate ไว้ครบ — ไฟล์เหล่านี้ยังเก็บไว้ในรีโปเผื่อใช้อ้างอิงหรือกลับมาใช้ในอนาคต:

- `Create-SHEPatrolList.ps1` — PnP PowerShell script สร้าง SharePoint List/Library/Groups (idempotent)
- `power-automate/` — สเปก 5 flow (Flow5-API-Gateway.md คือทางออกฝั่ง SharePoint ที่ต้องใช้ Power
  Automate license แบบมีค่าใช้จ่าย เพิ่งค้นพบว่าไม่ฟรีในแผน M365 Business Basic ที่ SML ใช้ จึงย้ายมาใช้
  Google Apps Script Web App แทนตามที่อธิบายด้านบน)

## ที่ยังไม่ได้ทำในรอบนี้

- การ deploy จริงบน Google account ของ SML และการรัน `setupSheet()`/`Deploy` จริง — ต้องทำจากเครื่อง/
  บัญชีของ SML เอง (ทำไม่ได้จาก sandbox ของ Claude Code)
- การป้องกัน Apps Script Web App เพิ่มเติม (secret token ใน request) — ดูหัวข้อ "เรื่องผู้ใช้งาน/สิทธิ์" ด้านบน
- Microsoft 365 SSO จริง (ปัจจุบัน login เป็นการเลือกชื่อจากรายชื่อที่ Admin ตั้งไว้ ไม่ใช่รหัสผ่าน/SSO)
