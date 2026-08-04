# SHE Patrol Digital System

ระบบติดตามผลการตรวจความปลอดภัย (SES / F-PES) แบบดิจิทัล สำหรับบริษัท สยามกลการโลจิสติกส์ จำกัด (SML)
ทดแทน Excel workbook เดิม (`Update_SHE_Committee_Patrol_report.xlsx`) ที่สร้าง sheet ใหม่ทุกเดือนและฝังรูปในเซลล์
ทำให้ไฟล์ใหญ่ขึ้นเรื่อยๆ แก้ไขพร้อมกันหลายคนไม่ได้ และไม่มี audit trail

## สถาปัตยกรรม

- **SharePoint List** `SHE_Patrol_Findings` — ฐานข้อมูลหลัก (16 คอลัมน์ ดูด้านล่าง)
- **SharePoint List** `SHE_Patrol_Users` — รายชื่อผู้ใช้งาน + บทบาท (Admin เป็นผู้กำหนด)
- **SharePoint Document Library** `SHE_Patrol_Photos` — เก็บรูปก่อน/หลังแก้ไข
- **Power Automate** (standard connector เท่านั้น — ห้ามใช้ premium) — แจ้งเตือน/escalate ตาม SLA ทางอีเมล
- **หน้าเว็บ front-end** — **ไฟล์เดียว** (`index.html`) แบบ single-page app เชื่อมต่อผ่าน SharePoint REST API
- **Export Excel** — ยังคง export ให้ผู้บริหารดูได้ (แท็บ "รายงานผู้บริหาร" ในแอป)

ห้ามใช้ Premium Connector ตลอดทั้งระบบ ตามข้อจำกัดของ SML

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
- Admin เพิ่มชื่อใครก็ได้ในองค์กร (ไม่ต้องมีบัญชี Microsoft 365 มาก่อน) — พิมพ์ชื่อ+อีเมล เลือก Role
- **สำคัญ — bootstrap รอบแรก**: หลังรัน provisioning script ครั้งแรก List `SHE_Patrol_Users` จะว่างเปล่า
  ยังไม่มีใคร login ได้ ต้องเพิ่มแถวแรก (Admin คนแรก) ด้วยตัวเองผ่านหน้า SharePoint List โดยตรง
  (ใส่ Name/Email/Role=SHE-Safety-Admin/Active=Yes) หลังจากนั้น Admin คนนั้นเพิ่มคนอื่นต่อผ่านแอปได้เลย
- ข้อจำกัดที่ต้องรู้: การ "login" นี้เป็นการระบุตัวตนระดับ UX เท่านั้น (ไม่ใช่รหัสผ่าน/SSO จริง) — สิทธิ์
  แก้ไขข้อมูลจริงยังถูกบังคับอีกชั้นด้วย **SharePoint permission groups** (ดูด้านล่าง) ผ่าน REST API
  เสมอ ต่อให้ front-end ถูก bypass สิทธิ์จริงก็ยังปลอดภัยอยู่ที่ SharePoint การอัปเกรดเป็น Microsoft 365
  SSO (Azure AD / MSAL.js) เป็นขั้นถัดไปที่แนะนำ (ดูแนวทางเดียวกันในโปรเจกต์พี่น้อง `FireCheck`)
- Dept-Responsible แต่ละคนผูกกับ **Shop เดียว** (ตั้งตอนเพิ่มผู้ใช้) — แก้ไข finding ได้เฉพาะ Shop
  ของตัวเอง (บังคับที่ระดับ UI; ระดับ SharePoint ยังเป็น Contribute รวมตาม note ใน
  `Create-SHEPatrolList.ps1`)

### เรื่องอีเมล (ตอบโจทย์ "ส่ง Mail ได้")

หน้าเว็บ **ไม่มีปุ่มส่งอีเมล** เพราะ browser ส่งอีเมลเองไม่ได้และไม่ควรฝัง credential อีเมลไว้ใน
client-side JS — การแจ้งเตือนทั้งหมด (finding ใหม่ / ส่งตรวจสอบ / เลยกำหนด SLA / ปิดงาน) ทำงาน
อัตโนมัติฝั่ง **Power Automate** ทันทีที่มีการเปลี่ยนแปลงข้อมูลใน SharePoint List — ดูโฟลเดอร์
`power-automate/` สำหรับสเปกสร้าง flow ทั้ง 4 ตัว

## Demo Mode vs Live Mode

สคริปต์ใน `index.html` ตรวจจับอัตโนมัติว่าเปิดจากภายใน SharePoint site จริงหรือไม่ (`SP_CONFIG.SITE_URL`):

- **ยังไม่ตั้งค่า / เปิดจากที่อื่น** → **Demo Mode**: ข้อมูลเก็บใน `localStorage` ของ browser
  — Findings 105 รายการ (5 รายการเป็นข้อมูลจริงจากรอบตรวจ 24 มิ.ย. 2026 ที่ส่งมา ที่เหลือสร้างขึ้นเพื่อสาธิต
  ครอบคลุม 5 เดือน ครบ 7 Shop) และผู้ใช้ตัวอย่าง 6 คน (โดเมนสมมติ `@example-sml.co.th` — ไม่ใช่พนักงานจริง)
  ครบทั้ง 4 บทบาทให้ login ทดสอบได้ทันที
- **Live Mode**: หลังรัน `Create-SHEPatrolList.ps1` กับ site จริง + เพิ่ม Admin คนแรกใน
  `SHE_Patrol_Users` ด้วยตัวเอง (ดูหัวข้อ bootstrap ด้านบน) แล้วแก้ `SP_CONFIG.SITE_URL` ใน
  `index.html` ให้ตรงกับ site จริง จากนั้นอัปโหลดไฟล์เข้า site นั้น (Site Page หรือ Document Library)
  — ระบบจะอ่าน/เขียนข้อมูลจริงผ่าน REST API ทันที

## SharePoint List: SHE_Patrol_Findings (16 คอลัมน์)

`PatrolDate` (Date) · `Shop` (Choice: PDI/Acc/Yard/Washing/Touch up/Store/อื่นๆ) · `Place` (Text) ·
`Description` (Note) · `Grade` (Choice: A/B/C/Others) · `Category` (Choice: F/S/EES/5S) ·
`PhotoBeforeUrl` (URL) · `DueDate` (Date) · `RootCause` (Note) · `ActionResponsible` (Person) ·
`Countermeasure` (Note) · `PhotoAfterUrl` (URL) · `Status` (Choice: เปิดใหม่/รอดำเนินการ/ดำเนินการแล้ว/รอตรวจสอบ/ปิดงาน) ·
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

## Permission Groups (บังคับโดย SharePoint ไม่ใช่หน้าเว็บ)

1. **SHE-Auditor** (Contribute) — สร้าง finding ใหม่
2. **SHE-Dept-Responsible** (Contribute) — อัปเดตมาตรการแก้ไข/รูปหลัง (จำกัดเฉพาะแผนกตนที่ระดับ UI ผ่าน `Shop` ใน `SHE_Patrol_Users`)
3. **SHE-Safety-Admin** (Full Control) — แก้ไข Grade, ปิดงาน, ดู dashboard รวม, จัดการผู้ใช้งาน
4. **SHE-Executive-Viewer** (Read only) — ดู dashboard/รายงานเท่านั้น

## Provisioning script

`Create-SHEPatrolList.ps1` — PnP PowerShell script (idempotent) สร้าง List `SHE_Patrol_Findings`,
List `SHE_Patrol_Users`, Library `SHE_Patrol_Photos`, และ 4 permission groups ทั้งหมดให้อัตโนมัติ:

```powershell
Install-Module -Name PnP.PowerShell -Scope CurrentUser   # ครั้งแรกเท่านั้น
./Create-SHEPatrolList.ps1 -SiteUrl "https://siammotor.sharepoint.com/sites/Chosiya_Server"
```

สคริปต์จะพิมพ์หมายเหตุท้ายรันเกี่ยวกับข้อจำกัดของ SharePoint permission group ในการจำกัด
"เฉพาะแผนกตน" ของกลุ่ม SHE-Dept-Responsible พร้อมแนวทางแก้ (ดูรายละเอียดในตัวสคริปต์) — ปัจจุบัน
front-end จัดการเรื่องนี้แทนผ่าน `SHE_Patrol_Users.Shop`

## Power Automate

ดูโฟลเดอร์ `power-automate/` — สเปกสร้าง flow ทั้ง 4 ตัวแบบทีละขั้นตอน (ใช้ standard connector
ล้วน ไม่มี premium) พร้อม JSON โครงสร้างอ้างอิงสำหรับ copy expression — deep link ในอีเมลชี้ไปที่
`index.html?id=<ItemID>` ซึ่งจะเปิดหน้ารายละเอียด finding นั้นให้อัตโนมัติ

## ที่ยังไม่ได้ทำในรอบนี้

- การรันจริงกับ SharePoint tenant ของ SML — ต้องรันจากเครื่องที่เข้าถึง tenant ได้ (ทำไม่ได้จาก sandbox ของ Claude Code)
- การสร้าง flow จริงใน Power Automate (มีแต่สเปก — ต้องสร้างเองในทีมที่มีสิทธิ์เข้า Power Automate ของ SML)
- Microsoft 365 SSO จริง (ปัจจุบัน login เป็นการเลือกชื่อจากรายชื่อที่ Admin ตั้งไว้ ไม่ใช่รหัสผ่าน/SSO)
- Item-level permission scoping ระดับ SharePoint สำหรับ SHE-Dept-Responsible ตามแผนก (ตอนนี้บังคับที่ระดับ UI เท่านั้น ดูหมายเหตุใน `Create-SHEPatrolList.ps1`)
