# Flow 2 — อัปเดต Countermeasure/รูปหลัง → แจ้ง Safety Officer มา verify

Connector: SharePoint (standard) + Office 365 Outlook (standard). ไม่มี premium.

## ขั้นตอนสร้างใน Power Automate

1. **Create → Automated cloud flow** ตั้งชื่อ `SHE Patrol - 2 - Countermeasure Notify Verify`
2. Trigger: **SharePoint — When an item is created or modified**
   - Site Address / List Name: `SHE_Patrol_Findings`
3. เพิ่ม action **SharePoint — Get changes for an item or a file (properties only)**
   (ป้องกันแจ้งซ้ำทุกครั้งที่มีการแก้ไข field อื่น — ดูเหตุผลใน README หลัก)
   - Site Address / List Name: เหมือน trigger
   - Id: `ID` (จาก trigger)
   - Since: `triggerOutputs()?['body/{TriggerWindowStartToken}']`
   - ในช่อง "คอลัมน์ที่ต้องการตรวจสอบ" ให้ติ๊กเลือก **Status**
4. เพิ่ม action **Condition**:
   - `Status Changed` (dynamic content จาก action ก่อนหน้า) **is equal to** `true`
   - **AND** `Status` (dynamic content จาก trigger) **is equal to** `รอตรวจสอบ`
5. ถ้าเงื่อนไขเป็นจริง (Yes branch) → **Office 365 Outlook — Send an email (V2)**
   - To: `safety.officer@sml.co.th` (แก้เป็นอีเมลจริงของทีม Safety)
   - Subject: `[SHE Patrol] รอตรวจสอบ - @{triggerBody()?['Shop']} / @{triggerBody()?['Place']}`
   - Body (HTML):
     ```
     หน่วยงานได้อัปเดตมาตรการแก้ไขและแนบรูปหลังแล้ว รอ Safety Officer ตรวจสอบและปิดงาน<br><br>
     Shop: @{triggerBody()?['Shop']} | Grade: @{triggerBody()?['Grade']}<br>
     มาตรการแก้ไข: @{triggerBody()?['Countermeasure']}<br>
     ผู้รับผิดชอบ: @{triggerBody()?['ActionResponsible']?['DisplayName']}<br><br>
     <a href="<FRONTEND_BASE_URL>/index.html?id=@{triggerBody()?['ID']}">เปิดหน้าตรวจสอบและปิดงาน</a>
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
      "expression": {
        "and": [
          { "equals": ["@body('Get_changes')?['{HasColumnChanged_Status}']", true] },
          { "equals": ["@triggerBody()?['Status']", "รอตรวจสอบ"] }
        ]
      },
      "actions": [
        {
          "type": "OpenApiConnection",
          "connector": "shared_office365",
          "operation": "SendEmailV2",
          "parameters": {
            "emailMessage/To": "safety.officer@sml.co.th",
            "emailMessage/Subject": "[SHE Patrol] รอตรวจสอบ - @{triggerBody()?['Shop']}",
            "emailMessage/Body": "<see markdown above>"
          }
        }
      ]
    }
  ]
}
```

> หมายเหตุ: ชื่อ output จริงของ "Get changes for an item or a file" ที่บอกว่าคอลัมน์ไหนเปลี่ยน
> จะเห็นได้ตรงๆ จาก dynamic content picker ในหน้า designer (มักแสดงเป็น "Status Changed") —
> ใช้ตัวที่ picker แสดงจริงแทนชื่อ placeholder ด้านบน เพราะชื่อ internal อาจต่างกันเล็กน้อยตาม
> เวอร์ชัน connector
