# Power Automate — SHE Patrol (5 flows, standard connectors only)

> ⚠️ **โฟลเดอร์นี้ถูกแทนที่ด้วย `SHE-Patrol-AppsScript.gs` แล้ว** — Flow 5 (API Gateway) ต้องใช้
> Power Automate license แบบ per-user ที่มีค่าใช้จ่าย ไม่รวมอยู่ใน M365 Business Basic ที่ SML ใช้อยู่
> จึงย้าย backend ไปที่ Google Apps Script Web App แทน (ฟรี ทำหน้าที่เดียวกันทุกอย่าง) ดูรายละเอียด
> ที่ README หลักของรีโป หัวข้อ "สถาปัตยกรรม" — ไฟล์ในโฟลเดอร์นี้ยังเก็บไว้เผื่อ SML ตัดสินใจซื้อ
> license เพิ่มหรืออยากกลับมาใช้ SharePoint เป็น backend ในอนาคต

ทุก flow ในโฟลเดอร์นี้ใช้เฉพาะ connector มาตรฐาน (ไม่มี premium) **ยกเว้น Flow 5 ที่ trigger
"When a HTTP request is received" ถูกจัดเป็นฟีเจอร์ premium ของ Power Automate เอง (คนละเงื่อนไข
จาก "premium connector" ที่ SML ห้าม — เป็นเรื่อง license ของตัว trigger)**:

- **SharePoint** (built-in, standard) — trigger + get/update items + "Send an HTTP request to SharePoint"
- **Office 365 Outlook** (standard) — Send an email (V2)
- **Schedule** (built-in, ไม่ใช่ connector ด้วยซ้ำ — มากับ Power Automate ทุก license) — Recurrence
- **Request/Response** (built-in) — HTTP trigger สำหรับ Flow 5

## ⚠️ สร้าง Flow 5 ก่อนอันอื่นทั้งหมด

`Flow5-API-Gateway.md` ไม่ใช่แค่ตัวเลือกเสริม — **หน้าเว็บ (`index.html`) ต้องมี URL ของ flow นี้
ถึงจะทำงานแบบ Live ได้เลย** เพราะ browser ไม่คุยกับ SharePoint ตรงอีกต่อไป (ดูเหตุผลใน README หลัก
หัวข้อ "ใช้งานได้ทั้งคนมี/ไม่มีบัญชี Microsoft 365") — สร้าง Flow 5 เสร็จก่อน ค่อยไปสร้าง Flow 1-4
(เรื่องแจ้งเตือนอีเมล) ทีหลังได้

## ทำไมไม่ใช่ไฟล์ .zip นำเข้าคลิกเดียว

Power Automate นำเข้า flow แบบสมบูรณ์ได้จากไฟล์ solution `.zip` เท่านั้น ซึ่งต้องผูกกับ
`connections.json` / `connectionreferences` ที่อ้าง connection ID เฉพาะของแต่ละ tenant —
สร้างล่วงหน้าแบบทั่วไปไม่ได้เพราะไม่มี tenant จริงให้เชื่อมตอนนี้

แต่ละไฟล์ในนี้จึงให้ **สเปกสร้างทีละขั้นตอน** (เปิด Power Automate → Create → ทำตามได้เลย
ใช้เวลา ~10-15 นาทีต่อ flow) พร้อม **JSON โครงสร้าง trigger/action อ้างอิง** (Workflow Definition
Language) ท้ายไฟล์ เพื่อ copy expression ไปวางในแต่ละ action ได้ตรงๆ ไม่ต้องเดา syntax เอง

## ต้องเตรียมก่อนสร้าง flow

1. รัน `Create-SHEPatrolList.ps1` ให้ List/Library มีอยู่จริงก่อน
2. เตรียมตาราง mapping **Shop → อีเมลหัวหน้างาน/แผนก** (ใช้ใน Flow 1/3/4 ที่ส่งอีเมล) เช่น:

   | Shop | อีเมลหัวหน้างาน |
   |---|---|
   | PDI | pdi.lead@sml.co.th |
   | Acc | acc.lead@sml.co.th |
   | Yard | yard.lead@sml.co.th |
   | Washing | washing.lead@sml.co.th |
   | Touch up | touchup.lead@sml.co.th |
   | Store | store.lead@sml.co.th |
   | อื่นๆ | safety@sml.co.th |

   (อีเมลด้านบนเป็นตัวอย่าง — แก้เป็นอีเมลจริงของ SML ตอนสร้าง flow)

3. เตรียมอีเมล **MGR / AGM-GM / เจ้าหน้าที่ความปลอดภัย (Safety Officer)** สำหรับ escalation ตาม Grade
4. รู้ URL หน้าเว็บ front-end จริง (หลังอัปโหลด — ที่ไหนก็ได้ ไม่ต้องอยู่ใน SharePoint) เพื่อใส่ deep
   link ในอีเมล รูปแบบ: `<FRONTEND_BASE_URL>/index.html?id=<ItemID>`

## รายการ flow

| ไฟล์ | Trigger | ทำอะไร |
|---|---|---|
| `Flow5-API-Gateway.md` | HTTP request | **สร้างก่อนอันอื่น** — ทำให้ browser (ทุกคนไม่ว่าจะมี M365 หรือไม่) อ่าน/เขียน/อัปโหลดรูป/ดูรูปได้ผ่าน flow นี้แทนการต่อ SharePoint ตรง |
| `Flow1-New-Finding-Notify-Dept.md` | SharePoint: item created | แจ้งหัวหน้างาน/แผนกที่ถูกตรวจพบทันที |
| `Flow2-Countermeasure-Notify-Verify.md` | SharePoint: item created or modified | เมื่อ Status เปลี่ยนเป็น "รอตรวจสอบ" แจ้ง Safety Officer ให้มา verify |
| `Flow3-Daily-SLA-Escalation.md` | Schedule: รายวัน | เช็ค DueDate ใกล้/เลยกำหนด → escalate ตาม SLA ของ Grade |
| `Flow4-Close-Verify-Stamp.md` | SharePoint: item created or modified | เมื่อ Status เปลี่ยนเป็น "ปิดงาน" บันทึก VerifiedBy/Rules_Confirmed_DateTime ถ้ายังไม่มี และแจ้งปิดงาน |

Flow 1-4 ทริกเกอร์จากการเปลี่ยนแปลงใน SharePoint List โดยตรง (ทำงานอัตโนมัติไม่ว่าการเปลี่ยนแปลง
นั้นจะมาจาก Flow 5 หรือจากคนที่แก้ไข List ตรงๆ ก็ตาม) — ส่วน Flow 5 ทริกเกอร์จาก HTTP request ที่
หน้าเว็บเรียกเข้ามา คนละแบบกัน ไม่ทับซ้อนกัน

## เทคนิคสำคัญ: ป้องกัน flow วนซ้ำ/แจ้งซ้ำ

Flow 2 และ Flow 4 ทริกเกอร์จาก "item created or modified" แต่ต้องแจ้งเตือน **เฉพาะตอนที่ Status
เปลี่ยนมาเป็นค่านั้นจริงๆ** ไม่ใช่ทุกครั้งที่มีการแก้ไข field อื่น — ทั้งสอง flow จึงใช้ action มาตรฐาน
**"Get changes for an item or a file (properties only)"** ของ SharePoint connector ตรวจว่าคอลัมน์
`Status` เปลี่ยนจริงในรอบนี้หรือไม่ (ตาม Microsoft's recommended pattern) ก่อนส่งอีเมล — วิธีนี้เป็น
standard connector ล้วน ไม่ต้องพึ่ง premium
