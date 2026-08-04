# Flow 1 — สร้าง Finding ใหม่ → แจ้งหน่วยงานรับผิดชอบ

Connector: SharePoint (standard) + Office 365 Outlook (standard). ไม่มี premium.

## ขั้นตอนสร้างใน Power Automate

1. **Create → Automated cloud flow** ตั้งชื่อ `SHE Patrol - 1 - New Finding Notify Dept`
2. Trigger: **SharePoint — When an item is created**
   - Site Address: site ของ SHE Patrol
   - List Name: `SHE_Patrol_Findings`
3. เพิ่ม action **Switch** (Control) — On: `Shop` (dynamic content จาก trigger)
   - Case `PDI` → Compose `DeptEmail` = `pdi.lead@sml.co.th`
   - Case `Acc` → `acc.lead@sml.co.th`
   - Case `Yard` → `yard.lead@sml.co.th`
   - Case `Washing` → `washing.lead@sml.co.th`
   - Case `Touch up` → `touchup.lead@sml.co.th`
   - Case `Store` → `store.lead@sml.co.th`
   - Default → `safety@sml.co.th`
   - (แก้อีเมลทั้งหมดเป็นของจริงของ SML — นี่เป็นเพียงตัวอย่าง)
4. เพิ่ม action **Office 365 Outlook — Send an email (V2)** ต่อท้าย Switch (นอก case ทุกอัน ใช้ output
   ของ Compose ล่าสุดที่ทำงาน — หรือจะวาง Send email ไว้ในแต่ละ case ก็ได้ถ้าต้องการ body ต่างกัน)
   - To: `outputs('Compose_DeptEmail')`
   - CC: `safety@sml.co.th`
   - Subject: `[SHE Patrol] พบ Finding ใหม่ Grade @{triggerBody()?['Grade']} - @{triggerBody()?['Shop']}`
   - Body (HTML):
     ```
     พบ Finding ใหม่จากการตรวจ SHE Patrol<br><br>
     Shop: @{triggerBody()?['Shop']}<br>
     จุดที่พบ: @{triggerBody()?['Place']}<br>
     รายละเอียด: @{triggerBody()?['Description']}<br>
     Grade: @{triggerBody()?['Grade']} | Category: @{triggerBody()?['Category']}<br>
     กำหนดเสร็จ (Due Date): @{formatDateTime(triggerBody()?['DueDate'], 'dd/MM/yyyy')}<br><br>
     ดูรายละเอียดและอัปเดตมาตรการแก้ไข:<br>
     <a href="<FRONTEND_BASE_URL>/finding-detail.html?id=@{triggerBody()?['ID']}">เปิดหน้า Finding</a>
     ```

## JSON โครงสร้างอ้างอิง (Workflow Definition Language)

```json
{
  "trigger": {
    "type": "OpenApiConnectionWebhook",
    "connector": "shared_sharepointonline",
    "operation": "OnNewItems",
    "parameters": {
      "dataset": "<SiteUrl>",
      "table": "SHE_Patrol_Findings"
    }
  },
  "actions": [
    {
      "type": "Switch",
      "expression": "@triggerBody()?['Shop']",
      "cases": {
        "PDI": { "actions": [{ "type": "Compose", "inputs": "pdi.lead@sml.co.th" }] },
        "Acc": { "actions": [{ "type": "Compose", "inputs": "acc.lead@sml.co.th" }] },
        "Yard": { "actions": [{ "type": "Compose", "inputs": "yard.lead@sml.co.th" }] },
        "Washing": { "actions": [{ "type": "Compose", "inputs": "washing.lead@sml.co.th" }] },
        "Touch up": { "actions": [{ "type": "Compose", "inputs": "touchup.lead@sml.co.th" }] },
        "Store": { "actions": [{ "type": "Compose", "inputs": "store.lead@sml.co.th" }] }
      },
      "default": { "actions": [{ "type": "Compose", "inputs": "safety@sml.co.th" }] }
    },
    {
      "type": "OpenApiConnection",
      "connector": "shared_office365",
      "operation": "SendEmailV2",
      "parameters": {
        "emailMessage/To": "@outputs('Compose')",
        "emailMessage/Subject": "[SHE Patrol] พบ Finding ใหม่ Grade @{triggerBody()?['Grade']} - @{triggerBody()?['Shop']}",
        "emailMessage/Body": "<see markdown above>"
      }
    }
  ]
}
```
