# Power Automate — SHE Patrol

> ⚠️ **Flow 1-5 ในโฟลเดอร์นี้ถูกแทนที่ด้วย `SHE-Patrol-AppsScript.gs` แล้ว** — Flow 5 (API Gateway)
> ต้องใช้ Power Automate license แบบ per-user ที่มีค่าใช้จ่าย ไม่รวมอยู่ใน M365 Business Basic ที่ SML
> ใช้อยู่ จึงย้าย backend ไปที่ Google Apps Script Web App แทน (ฟรี ทำหน้าที่เดียวกันทุกอย่าง รวมถึง
> การแจ้งเตือนอีเมลที่ Flow 1-4 เคยทำ) ดูรายละเอียดที่ README หลักของรีโป หัวข้อ "สถาปัตยกรรม" —
> ไฟล์ Flow 1-5 ยังเก็บไว้เผื่อ SML ตัดสินใจซื้อ license เพิ่มหรืออยากกลับมาใช้ SharePoint เป็น backend
> ในอนาคต
>
> **`Flow6-Backup-To-OneDrive.md` ยังใช้งานอยู่จริง** — เป็นคนละเรื่องกับ Flow 1-5 (ไม่เกี่ยวกับการเป็น
> backend หลัก) ใช้แค่รับไฟล์สำรองข้อมูลจาก Google เข้า OneDrive/SharePoint ของบริษัท เป็น standard
> connector ล้วน ไม่มี premium เลย

## รายการ flow

| ไฟล์ | สถานะ | Trigger | ทำอะไร |
|---|---|---|---|
| `Flow6-Backup-To-OneDrive.md` | ✅ **ใช้งานจริง** | Outlook: อีเมลใหม่ | เซฟไฟล์สำรอง .xlsx ที่ Apps Script ส่งมาเข้า OneDrive/SharePoint อัตโนมัติ (standard connector ล้วน) |
| `Flow5-API-Gateway.md` | ⚠️ เก็บไว้อ้างอิง (ไม่ได้ใช้) | HTTP request (premium) | เดิมใช้แทน SharePoint REST ตรง — แทนที่ด้วย Apps Script Web App แล้ว |
| `Flow1-New-Finding-Notify-Dept.md` | ⚠️ เก็บไว้อ้างอิง | SharePoint: item created | เดิมแจ้งหัวหน้างาน/แผนกที่ถูกตรวจพบ — ตอนนี้ทำโดย `notifyNewFinding_()` ใน .gs แทน |
| `Flow2-Countermeasure-Notify-Verify.md` | ⚠️ เก็บไว้อ้างอิง | SharePoint: item created or modified | เดิมแจ้ง Safety Officer ตอน "รอตรวจสอบ" — ตอนนี้ทำโดย `notifyFindingStatusChange_()` ใน .gs แทน |
| `Flow3-Daily-SLA-Escalation.md` | ⚠️ เก็บไว้อ้างอิง | Schedule: รายวัน | เดิม escalate ตาม SLA — ตอนนี้ทำโดย `checkSlaEscalation()` ใน .gs แทน |
| `Flow4-Close-Verify-Stamp.md` | ⚠️ เก็บไว้อ้างอิง | SharePoint: item created or modified | เดิม audit safety-net ตอนปิดงาน — ตอนนี้ทำโดย `notifyFindingStatusChange_()` ใน .gs แทน |

## Flow 6 — เตรียมก่อนสร้าง

1. ตั้งค่า `MS365_Backup_Email` ในแท็บ Settings ของ Google Sheet เป็นอีเมล Outlook ของบริษัทที่จะรับไฟล์สำรอง
2. ตั้ง time-driven trigger ให้ `backupToMS365Email()` รันรายสัปดาห์ (ดูคอมเมนต์หัวไฟล์ `SHE-Patrol-AppsScript.gs`)
3. สร้างโฟลเดอร์ `SHE Patrol Backups` ใน OneDrive (หรือเลือก library ปลายทางอื่นตามสะดวก)
4. สร้าง flow ตาม `Flow6-Backup-To-OneDrive.md` — ใช้ template สำเร็จรูป "Save email attachments to
   OneDrive for Business" ก็ได้ ปรับ filter ตามสเปกในไฟล์

ทุก connector ที่ใช้ (Office 365 Outlook, OneDrive for Business, SharePoint) เป็น **standard ทั้งหมด**
ไม่มี premium — รวมอยู่ใน M365 Business Basic แล้ว
