# Flow 3 — Scheduled รายวัน → เช็ค DueDate ใกล้/เลยกำหนด → escalate ตาม SLA

Connector: Schedule (built-in) + SharePoint (standard) + Office 365 Outlook (standard). ไม่มี premium.

SLA: Grade A = 7 วัน (escalate MGR+AGM/GM ทันทีถ้าเลย), B = 14 วัน (MGR), C/Others = 30 วัน (หัวหน้างาน)

## ขั้นตอนสร้างใน Power Automate

1. **Create → Scheduled cloud flow** ตั้งชื่อ `SHE Patrol - 3 - Daily SLA Escalation`
   - Starting: วันนี้ เวลา 08:00 · Repeat every: `1` `Day`
2. เพิ่ม action **SharePoint — Get items**
   - Site Address / List Name: `SHE_Patrol_Findings`
   - Filter Query (OData): `Status ne 'ปิดงาน'`
   - Top Count: `500`
3. เพิ่ม **Apply to each** ครอบ `value` จาก Get items
4. ใน loop เพิ่ม **Compose** ชื่อ `DaysLeft`:
   ```
   div(sub(ticks(items('Apply_to_each')?['DueDate']), ticks(utcNow())), 864000000000)
   ```
   (จำนวนวันที่เหลือถึง DueDate — ค่าติดลบ = เลยกำหนดแล้ว)
5. เพิ่ม **Condition**: `outputs('DaysLeft')` **is less than or equal to** `2`
   (ครอบคลุมทั้ง "ใกล้กำหนด" ภายใน 2 วัน และ "เลยกำหนด" ที่เป็นค่าติดลบ — ปรับเลข 2 ได้ตามต้องการ)
6. ถ้าจริง (Yes branch) → **Switch** on `items('Apply_to_each')?['Grade']`
   - Case `A` → Send email ถึง `mgr@sml.co.th; agmgm@sml.co.th` (escalate ทันที)
   - Case `B` → Send email ถึง `mgr@sml.co.th`
   - Case `C` → Send email ถึง `<หัวหน้างานตาม Shop — ใช้ Switch ซ้อนบน Shop เหมือน Flow 1>`
   - Default (`Others`) → เหมือน case `C`
   - Subject: `[SHE Patrol] @{if(less(outputs('DaysLeft'), 0), 'เลยกำหนด', 'ใกล้กำหนด')} Grade @{items('Apply_to_each')?['Grade']} - @{items('Apply_to_each')?['Shop']}`
   - Body (HTML):
     ```
     Finding Grade @{items('Apply_to_each')?['Grade']} ที่ @{items('Apply_to_each')?['Shop']} / @{items('Apply_to_each')?['Place']}<br>
     สถานะ SLA: @{if(less(outputs('DaysLeft'), 0), concat('เลยกำหนดมาแล้ว ', string(mul(outputs('DaysLeft'), -1)), ' วัน'), concat('เหลืออีก ', string(outputs('DaysLeft')), ' วัน'))}<br>
     สถานะปัจจุบัน: @{items('Apply_to_each')?['Status']}<br><br>
     <a href="<FRONTEND_BASE_URL>/finding-detail.html?id=@{items('Apply_to_each')?['ID']}">เปิดหน้า Finding</a>
     ```

## JSON โครงสร้างอ้างอิง

```json
{
  "trigger": {
    "type": "Recurrence",
    "recurrence": { "frequency": "Day", "interval": 1, "startTime": "08:00", "timeZone": "SE Asia Standard Time" }
  },
  "actions": [
    {
      "type": "OpenApiConnection",
      "connector": "shared_sharepointonline",
      "operation": "GetItems",
      "parameters": {
        "dataset": "<SiteUrl>",
        "table": "SHE_Patrol_Findings",
        "$filter": "Status ne 'ปิดงาน'",
        "$top": 500
      }
    },
    {
      "type": "Foreach",
      "foreach": "@body('Get_items')?['value']",
      "actions": [
        {
          "type": "Compose",
          "name": "DaysLeft",
          "inputs": "@div(sub(ticks(items('Apply_to_each')?['DueDate']), ticks(utcNow())), 864000000000)"
        },
        {
          "type": "If",
          "expression": { "lessOrEquals": ["@outputs('DaysLeft')", 2] },
          "actions": [
            {
              "type": "Switch",
              "expression": "@items('Apply_to_each')?['Grade']",
              "cases": {
                "A": { "actions": [{ "type": "OpenApiConnection", "connector": "shared_office365", "operation": "SendEmailV2", "parameters": { "emailMessage/To": "mgr@sml.co.th;agmgm@sml.co.th" } }] },
                "B": { "actions": [{ "type": "OpenApiConnection", "connector": "shared_office365", "operation": "SendEmailV2", "parameters": { "emailMessage/To": "mgr@sml.co.th" } }] }
              },
              "default": { "actions": [{ "type": "OpenApiConnection", "connector": "shared_office365", "operation": "SendEmailV2", "parameters": { "emailMessage/To": "<หัวหน้างานตาม Shop>" } }] }
            }
          ]
        }
      ]
    }
  ]
}
```

> เหตุผลที่ใช้ `Get items` + `Apply to each` แทน trigger แบบ per-item: การ escalate ต้องเช็ค
> **ทุก finding ที่ยังเปิดอยู่ทุกวัน** ไม่ใช่แค่ตอนมีการแก้ไข จึงต้องเป็น scheduled flow ที่ query
> ทั้งลิสต์ทุกรอบ ไม่ใช่ event-trigger แบบ Flow 1/2/4
