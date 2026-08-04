# SHE Patrol Digital System

ระบบติดตามผลการตรวจความปลอดภัย (SES / F-PES) แบบดิจิทัล สำหรับบริษัท สยามกลการโลจิสติกส์ จำกัด (SML)
ทดแทน Excel workbook เดิม (`Update_SHE_Committee_Patrol_report.xlsx`) ที่สร้าง sheet ใหม่ทุกเดือนและฝังรูปในเซลล์
ทำให้ไฟล์ใหญ่ขึ้นเรื่อยๆ แก้ไขพร้อมกันหลายคนไม่ได้ และไม่มี audit trail

## สถาปัตยกรรม

- **SharePoint List** `SHE_Patrol_Findings` — ฐานข้อมูลหลัก (16 คอลัมน์ ดูด้านล่าง)
- **SharePoint List** `SHE_Patrol_Users` — รายชื่อผู้ใช้งาน + บทบาท (Admin เป็นผู้กำหนด)
- **SharePoint Document Library** `SHE_Patrol_Photos` — เก็บรูปก่อน/หลังแก้ไข
- **Power Automate** (standard connector เท่านั้น — ห้ามใช้ premium) — 4 flow แจ้งเตือน/escalate ตาม SLA
  ทางอีเมล + **Flow 5 = API Gateway** ที่ทำให้หน้าเว็บใช้งานได้แม้ผู้ใช้ไม่มีบัญชี Microsoft 365 (ดูด้านล่าง)
- **หน้าเว็บ front-end** — **ไฟล์เดียว** (`index.html`) แบบ single-page app โฮสต์ที่ไหนก็ได้
  (ไม่จำเป็นต้องอยู่ใน SharePoint site อีกต่อไป — ดูสถาปัตยกรรม API Gateway)
- **Export Excel** — ยังคง export ให้ผู้บริหารดูได้ (แท็บ "รายงานผู้บริหาร" ในแอป)

ห้ามใช้ Premium Connector ตลอดทั้งระบบ ตามข้อจำกัดของ SML

## สำคัญ: ใช้งานได้ทั้งคนมี/ไม่มีบัญชี Microsoft 365

พนักงาน SML ที่ไม่มี license M365 **ใช้งานได้ทุกอย่างเหมือนคนอื่น** (สร้าง finding, แก้ไขมาตรการ,
ปิดงาน) เพราะ browser **ไม่เคยคุยกับ SharePoint ตรงๆ เลย** — คุยผ่าน **Power Automate Flow 5
(API Gateway)** ซึ่งมี connection ของตัวเองไปยัง SharePoint เสมอ ไม่ว่าใครจะเป็นคนเรียกก็ตาม
(ดู `power-automate/Flow5-API-Gateway.md` สำหรับรายละเอียดวิธีสร้าง)

**ข้อแลกเปลี่ยนที่ต้องรู้**: เมื่อ browser ไม่ต้อง login SharePoint เอง สิทธิ์การเข้าถึงจึงย้ายจากระดับ
SharePoint permission group (บังคับจริงโดย SharePoint) มาอยู่ที่ระดับแอป + `SHE_Patrol_Users`
แทน — ใครก็ตามที่มี URL ของ Flow 5 เรียก API ตรงได้โดยไม่ผ่านหน้าเว็บ เป็นการยอมรับความเสี่ยงแบบ
เดียวกับที่ระบบพี่น้อง (Work Permit) ใช้กับ endpoint สาธารณะสำหรับผู้รับเหมาภายนอกอยู่แล้ว — อ่านหัวข้อ
"ข้อควรระวังด้านความปลอดภัย" ใน `Flow5-API-Gateway.md` ก่อน deploy จริง

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

### เรื่องรูปภาพในโหมด Live

รูปเก็บใน SharePoint Document Library ซึ่งปกติต้อง login SharePoint ถึงจะเปิดได้ — เพื่อให้คนไม่มี
M365 ดูรูปได้ด้วย หน้าเว็บจะ**ไม่เปิดรูปตรงจาก SharePoint URL** แต่เรียก Flow 5 (action `getPhoto`)
ให้ไปดึงไฟล์มาแปลงเป็น base64 ส่งกลับมาแทน — ทำงานอัตโนมัติตอนเปิดดูรายละเอียด finding ไม่ต้องตั้งค่าอะไรเพิ่ม

### เรื่องผู้ใช้งาน/สิทธิ์ (ตอบโจทย์ "กำหนดชื่อคนเข้าใช้งานได้ โดยมี Admin กำหนดบทบาทให้")

- ผู้ใช้ **เลือกชื่อตัวเอง** จากรายชื่อ ไม่ได้เลือก Role เอง — Role/Shop มาจากสิ่งที่ Admin ตั้งไว้ในเมนู
  "จัดการผู้ใช้งาน" เท่านั้น
- Admin เพิ่มชื่อใครก็ได้ในองค์กร (ไม่ต้องมีบัญชี Microsoft 365 มาก่อน) — พิมพ์ชื่อ+อีเมล เลือก Role
- **สำคัญ — bootstrap รอบแรก**: หลังรัน provisioning script ครั้งแรก List `SHE_Patrol_Users` จะว่างเปล่า
  ยังไม่มีใคร login ได้ ต้องเพิ่มแถวแรก (Admin คนแรก) ด้วยตัวเองผ่านหน้า SharePoint List โดยตรง
  (ใส่ Name/Email/Role=SHE-Safety-Admin/Active=Yes) หลังจากนั้น Admin คนนั้นเพิ่มคนอื่นต่อผ่านแอปได้เลย
- ข้อจำกัดที่ต้องรู้: การ "login" นี้เป็นการระบุตัวตนระดับ UX เท่านั้น (ไม่ใช่รหัสผ่าน/SSO จริง) —
  ไม่มีอะไรกัน browser จากการปลอมชื่อ/role ถ้ามีคนแก้โค้ด client ฝั่งตัวเอง (ดูข้อควรระวังด้านบน)
  การอัปเกรดเป็น Microsoft 365 SSO (Azure AD / MSAL.js) เป็นขั้นถัดไปที่แนะนำเมื่อพร้อม (ดูแนวทาง
  เดียวกันในโปรเจกต์พี่น้อง `FireCheck`) ซึ่งจะทำให้กลับไปใช้ SharePoint permission group บังคับสิทธิ์
  จริงได้อีกครั้ง — แต่จะตัดผู้ใช้ที่ไม่มี M365 ออกจากระบบไปด้วย จึงเป็น trade-off ที่ต้องเลือก
- Dept-Responsible แต่ละคนผูกกับ **Shop เดียว** (ตั้งตอนเพิ่มผู้ใช้) — แก้ไข finding ได้เฉพาะ Shop ของตัวเอง

### เรื่องอีเมล (ตอบโจทย์ "ส่ง Mail ได้")

หน้าเว็บ **ไม่มีปุ่มส่งอีเมล** เพราะ browser ส่งอีเมลเองไม่ได้และไม่ควรฝัง credential อีเมลไว้ใน
client-side JS — การแจ้งเตือนทั้งหมด (finding ใหม่ / ส่งตรวจสอบ / เลยกำหนด SLA / ปิดงาน) ทำงาน
อัตโนมัติฝั่ง **Power Automate (Flow 1-4)** ทันทีที่มีการเปลี่ยนแปลงข้อมูลใน SharePoint List — ดูโฟลเดอร์
`power-automate/`

## Demo Mode vs Live Mode

`index.html` เช็ค `APP_CONFIG.API_URL`:

- **ว่างเปล่า (ค่าเริ่มต้น)** → **Demo Mode**: ข้อมูลเก็บใน `localStorage` ของ browser
  — Findings 105 รายการ (5 รายการเป็นข้อมูลจริงจากรอบตรวจ 24 มิ.ย. 2026 ที่ส่งมา ที่เหลือสร้างขึ้นเพื่อสาธิต
  ครอบคลุม 5 เดือน ครบ 7 Shop) และผู้ใช้ตัวอย่าง 6 คน (โดเมนสมมติ `@example-sml.co.th` — ไม่ใช่พนักงานจริง)
  ครบทั้ง 4 บทบาทให้ login ทดสอบได้ทันที
- **ตั้งค่าแล้ว** → **Live Mode**: ทุก action (list/create/update/upload/getPhoto) เรียกผ่าน Flow 5
  แทนการต่อ SharePoint ตรง

### ขั้นตอนไป Live

1. รัน `Create-SHEPatrolList.ps1` กับ site จริง (สร้าง List/Library/Groups)
2. เพิ่ม Admin คนแรกใน `SHE_Patrol_Users` ด้วยตัวเอง (ดู bootstrap ด้านบน)
3. สร้าง Power Automate Flow 5 ตาม `power-automate/Flow5-API-Gateway.md` แล้วคัดลอก HTTP URL ที่ได้
4. แก้ `APP_CONFIG.API_URL` ใน `index.html` ให้เป็น URL นั้น
5. อัปโหลด `index.html` ไปที่ไหนก็ได้ (SharePoint Site Page, Document Library, หรือแม้แต่ hosting
   ภายนอกอย่าง GitHub Pages — ไม่ผูกกับ SharePoint site อีกต่อไปเพราะ Flow 5 เป็นตัวกลางให้แล้ว)
6. สร้าง Flow 1-4 ตามสเปกใน `power-automate/` เพื่อเปิดใช้การแจ้งเตือนทางอีเมล

## SharePoint List: SHE_Patrol_Findings (16 คอลัมน์)

`PatrolDate` (Date) · `Shop` (Choice: PDI/Acc/Yard/Washing/Touch up/Store/อื่นๆ) · `Place` (Text) ·
`Description` (Note) · `Grade` (Choice: A/B/C/Others) · `Category` (Choice: F/S/EES/5S) ·
`PhotoBeforeUrl` (URL — เก็บ server-relative path จาก Flow 5 ไม่ใช่ URL เปิดตรงได้) · `DueDate` (Date) ·
`RootCause` (Note) · `ActionResponsible` (Person) · `Countermeasure` (Note) ·
`PhotoAfterUrl` (URL — เหมือน PhotoBeforeUrl) ·
`Status` (Choice: เปิดใหม่/รอดำเนินการ/ดำเนินการแล้ว/รอตรวจสอบ/ปิดงาน) ·
`VerifiedBy` (Person) · `Rules_Confirmed_DateTime` (DateTime)

## SharePoint List: SHE_Patrol_Users (5 คอลัมน์)

`Name` (Text) · `Email` (Text) · `Role` (Choice: SHE-Auditor/SHE-Dept-Responsible/SHE-Safety-Admin/SHE-Executive-Viewer) ·
`Shop` (Choice — เฉพาะ Dept-Responsible) · `Active` (Yes/No)

## SLA ตาม Grade

| Grade | กำหนดเสร็จ | Escalate เมื่อเลยกำหนด |
|---|---|---|
| A | 7 วัน | MGR + AGM/GM ทันที |
| B | 14 วัน | MGR |
| C / Others | 30 วัน | หัวหน้างาน |

ฟอร์ม "บันทึกรายการตรวจใหม่" คำนวณ `DueDate` ให้อัตโนมัติจาก `PatrolDate + SLA วัน` ตาม Grade ที่เลือก

## Permission Groups (SharePoint — ยังใช้สำหรับผู้ที่เข้าดู List ตรงๆ ผ่าน SharePoint UI/Excel export)

1. **SHE-Auditor** (Contribute)
2. **SHE-Dept-Responsible** (Contribute)
3. **SHE-Safety-Admin** (Full Control)
4. **SHE-Executive-Viewer** (Read only)

หมายเหตุ: กลุ่มเหล่านี้**ไม่ใช่ตัวบังคับสิทธิ์ของหน้าเว็บอีกต่อไป** (ดูหัวข้อ API Gateway ด้านบน) —
ยังมีประโยชน์สำหรับคนที่เข้าไปดู/export List ตรงจาก SharePoint เอง (ปกติคือ Admin/IT)

## Provisioning script

`Create-SHEPatrolList.ps1` — PnP PowerShell script (idempotent) สร้าง List `SHE_Patrol_Findings`,
List `SHE_Patrol_Users`, Library `SHE_Patrol_Photos`, และ 4 permission groups ทั้งหมดให้อัตโนมัติ:

```powershell
Install-Module -Name PnP.PowerShell -Scope CurrentUser   # ครั้งแรกเท่านั้น
./Create-SHEPatrolList.ps1 -SiteUrl "https://siammotor.sharepoint.com/sites/Chosiya_Server"
```

## Power Automate

ดูโฟลเดอร์ `power-automate/` — 5 flow ทั้งหมด (ใช้ standard connector ล้วน ไม่มี premium):

| ไฟล์ | หน้าที่ |
|---|---|
| `Flow5-API-Gateway.md` | **สร้างก่อนอันอื่นทั้งหมด** — ทำให้หน้าเว็บอ่าน/เขียนข้อมูลได้โดยไม่ต้อง login SharePoint |
| `Flow1-New-Finding-Notify-Dept.md` | แจ้งหัวหน้างาน/แผนกที่ถูกตรวจพบทันที |
| `Flow2-Countermeasure-Notify-Verify.md` | แจ้ง Safety Officer มา verify เมื่อ Status เป็น "รอตรวจสอบ" |
| `Flow3-Daily-SLA-Escalation.md` | เช็ค DueDate ใกล้/เลยกำหนดทุกวัน → escalate ตาม SLA |
| `Flow4-Close-Verify-Stamp.md` | audit safety-net ตอนปิดงาน + แจ้งปิดงาน |

deep link ในอีเมลของ Flow 1-4 ชี้ไปที่ `index.html?id=<ItemID>` ซึ่งจะเปิดหน้ารายละเอียด finding นั้นให้อัตโนมัติ

## ที่ยังไม่ได้ทำในรอบนี้

- การรันจริงกับ SharePoint tenant ของ SML และการสร้าง flow ทั้ง 5 ตัวจริงใน Power Automate — มีแต่สเปก
  ต้องสร้างเองในทีมที่มีสิทธิ์เข้าถึง (ทำไม่ได้จาก sandbox ของ Claude Code)
- Microsoft 365 SSO จริง (ปัจจุบัน login เป็นการเลือกชื่อจากรายชื่อที่ Admin ตั้งไว้ ไม่ใช่รหัสผ่าน/SSO)
- การป้องกัน Flow 5 เพิ่มเติม (SAS key / validation ฝั่ง flow) — ดูหัวข้อ "ข้อควรระวังด้านความปลอดภัย"
  ใน `Flow5-API-Gateway.md`
