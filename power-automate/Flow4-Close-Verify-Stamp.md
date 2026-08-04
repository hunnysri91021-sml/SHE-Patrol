# Flow 4 — Safety Officer ปิดงาน → บันทึก VerifiedBy + timestamp

Connector: SharePoint (standard) + Office 365 Outlook (standard). ไม่มี premium.

Front-end (`index.html`) เซ็ต `VerifiedBy` (ชื่อผู้ใช้ที่ login อยู่) และ `Rules_Confirmed_DateTime` ให้อยู่แล้วตอนกดปิดงาน
ผ่าน SharePoint REST โดยตรง — flow นี้เป็น **audit safety-net**: กันกรณีมีคนไปแก้ `Status` เป็น
"ปิดงาน" ตรงๆ จากมุมมอง SharePoint list (ไม่ผ่านหน้าเว็บ) แล้วลืมกรอกสองคอลัมน์นี้ พร้อมส่งอีเมลแจ้ง
ปิดงานอย่างเป็นทางการ

## ขั้นตอนสร้างใน Power Automate

1. **Create → Automated cloud flow** ตั้งชื่อ `SHE Patrol - 4 - Close Verify Stamp`
2. Trigger: **SharePoint — When an item is created or modified**
   - Site Address / List Name: `SHE_Patrol_Findings`
3. เพิ่ม action **SharePoint — Get changes for an item or a file (properties only)**
   - Id: `ID` (จาก trigger) · Since: `triggerOutputs()?['body/{TriggerWindowStartToken}']`
   - ติ๊กเลือกคอลัมน์ **Status**
4. เพิ่ม **Condition A**:
   - `Status Changed` **is equal to** `true`
   - **AND** `Status` (จาก trigger) **is equal to** `ปิดงาน`
5. ถ้าจริง (Yes branch) → เพิ่ม **Condition B** (เช็คว่า audit fields ยังว่างอยู่ไหม):
   - `empty(triggerBody()?['VerifiedBy'])` **is equal to** `true`
   - **OR** `empty(triggerBody()?['Rules_Confirmed_DateTime'])` **is equal to** `true`
6. ถ้า Condition B จริง → **SharePoint — Update item**
   - ID: `ID` (จาก trigger)
   - VerifiedBy: `coalesce(triggerBody()?['VerifiedBy']?['Claims'], triggerBody()?['Editor']?['Claims'])`
     (ถ้าว่าง ใช้ผู้แก้ไขล่าสุดของ item เป็นผู้ verify แทน)
   - Rules_Confirmed_DateTime: `coalesce(triggerBody()?['Rules_Confirmed_DateTime'], utcNow())`
7. ต่อท้าย (นอก Condition B ทั้งสองทาง รวมกันที่ Condition A branch เดียว) → **Office 365 Outlook —
   Send an email (V2)** แจ้งปิดงานอย่างเป็นทางการ
   - To: `triggerBody()?['Author']?['Email']` (ผู้ตรวจที่สร้าง finding นี้)
   - CC: อีเมลหัวหน้างานตาม Shop (Switch เหมือน Flow 1)
   - Subject: `[SHE Patrol] ปิดงานแล้ว - @{triggerBody()?['Shop']} / @{triggerBody()?['Place']}`
   - Body (HTML):
     ```
     Finding นี้ถูกปิดงานเรียบร้อยแล้ว<br><br>
     Grade: @{triggerBody()?['Grade']} | Shop: @{triggerBody()?['Shop']}<br>
     ผู้ตรวจยืนยัน (Verified By): @{triggerBody()?['VerifiedBy']?['DisplayName']}<br>
     เวลายืนยัน: @{formatDateTime(triggerBody()?['Rules_Confirmed_DateTime'], 'dd/MM/yyyy HH:mm')}<br><br>
     <a href="<FRONTEND_BASE_URL>/index.html?id=@{triggerBody()?['ID']}">ดูรายละเอียด</a>
     ```

## JSON โครงสร้างอ้างอิง

```json
{
  "trigger": {
    "type": "OpenApiConnectionWebhook",
    "connector": "shared_sharepointonline",
    "operation": "OnUpdatedItems",
    "parameters": { "dataset": "<SiteUrl>", "table": "SHE_Patrol_Findings" }
  },
  "actions": [
    {
      "type": "OpenApiConnection",
      "connector": "shared_sharepointonline",
      "operation": "GetChanges",
      "parameters": {
        "dataset": "<SiteUrl>",
        "table": "SHE_Patrol_Findings",
        "id": "@triggerBody()?['ID']",
        "since": "@triggerOutputs()?['body/{TriggerWindowStartToken}']",
        "columns": ["Status"]
      }
    },
    {
      "type": "If",
      "name": "Condition_A_ClosedThisRun",
      "expression": {
        "and": [
          { "equals": ["@body('Get_changes')?['{HasColumnChanged_Status}']", true] },
          { "equals": ["@triggerBody()?['Status']", "ปิดงาน"] }
        ]
      },
      "actions": [
        {
          "type": "If",
          "name": "Condition_B_AuditFieldsMissing",
          "expression": {
            "or": [
              { "equals": ["@empty(triggerBody()?['VerifiedBy'])", true] },
              { "equals": ["@empty(triggerBody()?['Rules_Confirmed_DateTime'])", true] }
            ]
          },
          "actions": [
            {
              "type": "OpenApiConnection",
              "connector": "shared_sharepointonline",
              "operation": "PatchItem",
              "parameters": {
                "dataset": "<SiteUrl>",
                "table": "SHE_Patrol_Findings",
                "id": "@triggerBody()?['ID']",
                "item/VerifiedByStringId": "@coalesce(triggerBody()?['VerifiedBy']?['Claims'], triggerBody()?['Editor']?['Claims'])",
                "item/Rules_Confirmed_DateTime": "@coalesce(triggerBody()?['Rules_Confirmed_DateTime'], utcNow())"
              }
            }
          ]
        },
        {
          "type": "OpenApiConnection",
          "connector": "shared_office365",
          "operation": "SendEmailV2",
          "parameters": {
            "emailMessage/To": "@triggerBody()?['Author']?['Email']",
            "emailMessage/Subject": "[SHE Patrol] ปิดงานแล้ว - @{triggerBody()?['Shop']}",
            "emailMessage/Body": "<see markdown above>"
          }
        }
      ]
    }
  ]
}
```

> `VerifiedByStringId` คือชื่อ internal field ที่ SharePoint ใช้เวลาเขียนค่าลง Person field ผ่าน
> REST/Power Automate (ต่อท้าย field name ด้วย `StringId` แล้วใส่ Claims ของ user) — ใน designer
> ให้เลือกจาก dynamic content ที่ picker แสดงเป็น "VerifiedBy Claims" แทนการพิมพ์เอง
