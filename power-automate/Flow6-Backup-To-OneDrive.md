# Flow 6 — เซฟไฟล์สำรองเข้า OneDrive/SharePoint อัตโนมัติ

Connector: **Office 365 Outlook** (standard) + **OneDrive for Business** (standard). **ไม่มี premium
เลย** ต่างจาก Flow 5 เดิม (ที่ trigger HTTP request ต้อง license เพิ่ม) — flow นี้ใช้แค่ trigger/action
มาตรฐานที่รวมอยู่ใน M365 Business Basic แล้ว ไม่มีค่าใช้จ่ายเพิ่ม

## ทำไมต้องมี flow นี้

ข้อมูลหลักของระบบตอนนี้อยู่ใน Google Sheets ที่ผูกกับบัญชี Google ส่วนตัว ไม่ใช่ M365 tenant ของ SML
— `SHE-Patrol-AppsScript.gs` มีฟังก์ชัน `backupToMS365Email()` ที่ export ข้อมูลทั้งหมดเป็นไฟล์ .xlsx
แล้วส่งเข้าอีเมล Outlook ของบริษัทเป็นระยะ (ตั้ง time-driven trigger ให้รันรายสัปดาห์) — flow นี้ทำหน้าที่
ต่อจากตรงนั้น: **ดักอีเมลที่มีไฟล์แนบชื่อ `SHE_Patrol_Backup_*.xlsx` แล้วเซฟเข้า OneDrive/SharePoint
ให้อัตโนมัติ** จะได้ไม่ต้องมานั่งเซฟเองทุกสัปดาห์ และมีสำเนาข้อมูลอยู่ใน M365 tenant ของบริษัทจริงๆ
เผื่อบัญชี Google เข้าถึงไม่ได้ในอนาคต

## ขั้นตอนสร้างใน Power Automate

วิธีที่เร็วที่สุด: Power Automate มี **template สำเร็จรูป** ชื่อ "Save email attachments to OneDrive
for Business" — ค้นหาคำนี้ในหน้า Templates ใช้ได้เลยแล้วปรับ 2 จุดตามด้านล่าง หรือสร้างเองทีละ action
ตามนี้:

1. **Create → Automated cloud flow** ตั้งชื่อ `SHE Patrol - 6 - Backup to OneDrive`
2. Trigger: **Office 365 Outlook — When a new email arrives (V3)**
   - To: (อีเมลที่ตั้งไว้ใน `MS365_Backup_Email`)
   - Subject Filter: `[SHE Patrol] สำรองข้อมูลรายสัปดาห์`
   - Has Attachment: `Yes`
   - Only With Attachment: `Yes`
3. เพิ่ม **Apply to each** ครอบ `Attachments`
4. ใน loop เพิ่ม **Condition**: `Attachments Name` **ends with** `.xlsx`
5. ถ้าจริง (Yes branch) → **OneDrive for Business — Create file**
   - Folder Path: `/SHE Patrol Backups` (สร้างโฟลเดอร์นี้ใน OneDrive ก่อน หรือเปลี่ยนเป็น path อื่น
     เช่นโฟลเดอร์ที่ sync กับ SharePoint library ก็ได้ถ้าต้องการให้ทีมอื่นเห็นด้วย)
   - File Name: `@{items('Apply_to_each')?['Name']}`
   - File Content: `@{items('Apply_to_each')?['ContentBytes']}`

เท่านี้ก็ครบ — ไม่ต้องมี Condition ตรวจ Status เปลี่ยนแบบ Flow 2/4 เพราะ trigger นี้เป็นอีเมลใหม่ตรงๆ
ไม่มีความเสี่ยง trigger ซ้ำ

## JSON โครงสร้างอ้างอิง

```json
{
  "trigger": {
    "type": "OpenApiConnectionWebhook",
    "connector": "shared_office365",
    "operation": "OnNewEmailV3",
    "parameters": {
      "folderPath": "Inbox",
      "to": "<MS365_Backup_Email>",
      "subjectFilter": "[SHE Patrol] สำรองข้อมูลรายสัปดาห์",
      "importance": "Any",
      "fetchOnlyWithAttachment": true
    }
  },
  "actions": [
    {
      "type": "Foreach",
      "foreach": "@triggerBody()?['attachments']",
      "actions": [
        {
          "type": "If",
          "expression": { "endsWith": ["@items('Apply_to_each')?['name']", ".xlsx"] },
          "actions": [
            {
              "type": "OpenApiConnection",
              "connector": "shared_onedriveforbusiness",
              "operation": "CreateFile",
              "parameters": {
                "folderPath": "/SHE Patrol Backups",
                "name": "@items('Apply_to_each')?['name']",
                "body": "@items('Apply_to_each')?['contentBytes']"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

## หมายเหตุ

- อยากให้เก็บใน SharePoint document library แทน OneDrive ส่วนตัว ก็เปลี่ยน action เป็น
  **SharePoint — Create file** แทน OneDrive for Business ได้เลย (ก็เป็น standard connector เหมือนกัน)
  — วิธีนี้เก็บสำเนาไว้ใน `SHE_Patrol_Photos`/library อื่นที่มีอยู่แล้วก็ได้ ไม่ต้องสร้าง library ใหม่
- ไฟล์สำรองนี้เป็น**สแนปช็อตข้อมูลทั้งหมด ณ เวลาที่ export** ไม่ใช่ live sync — ถ้าต้องการดูข้อมูลล่าสุด
  จริงๆ ยังต้องเปิดผ่านแอป (`index.html`) ซึ่งอ่านจาก Google Sheets ตรง ไฟล์ .xlsx นี้มีไว้เป็น
  หลักฐานสำรอง/กู้คืนข้อมูลเท่านั้น
