# Flow 5 — API Gateway (ทำให้ใช้งานได้แม้ไม่มีบัญชี Microsoft 365)

> ⚠️ **แทนที่ด้วย `SHE-Patrol-AppsScript.gs` แล้ว** — trigger "When a HTTP request is received"
> ที่ flow นี้ต้องใช้ถูกจัดเป็นฟีเจอร์ premium ของ Power Automate (ไม่รวมใน M365 Business Basic)
> เก็บไฟล์นี้ไว้เป็นข้อมูลอ้างอิงเผื่อ SML มี license ที่รองรับในอนาคต

Connector: SharePoint (standard, "Send an HTTP request to SharePoint" + "Get items"/"Get item") +
Request/Response (**premium trigger** — ดูคำเตือนด้านบน)

## ทำไมต้องมี flow นี้

`index.html` เดิมเรียก SharePoint REST API ตรงจาก browser (`fetch(..., {credentials:"same-origin"})`)
ซึ่ง**ใช้ session cookie ของผู้ใช้ที่ login M365 อยู่แล้วเท่านั้น** — พนักงานที่ไม่มี license M365
เปิดหน้าเว็บแล้วจะถูก SharePoint ปฏิเสธทันที (401) ไม่ว่าจะแค่ "อ่าน" ก็ตาม

Flow นี้แก้ปัญหาด้วยการเป็น **ตัวกลาง**: browser ทุกคน (มี M365 หรือไม่มีก็ตาม) เรียก HTTP endpoint
ของ flow นี้แทน — ตัว flow เองมี "การเชื่อมต่อ SharePoint" ของมันเอง (ผูกกับบัญชีที่สร้าง flow ตอน
authorize connection ครั้งแรก) จึงอ่าน/เขียน SharePoint List แทนผู้ใช้ได้เสมอ โดยผู้ใช้ปลายทางไม่ต้อง
login SharePoint เลย — front-end จึงโฮสต์ที่ไหนก็ได้ด้วย (ไม่ต้องอยู่ใน SharePoint site อีกต่อไป)

**ผลคือ**: การควบคุมสิทธิ์ตอนนี้ย้ายจากระดับ SharePoint permission group มาอยู่ที่ระดับ
`SHE_Patrol_Users` + logic ในตัว flow/หน้าเว็บแทน — ดูหัวข้อ "ข้อควรระวังด้านความปลอดภัย" ท้ายไฟล์

## ขั้นตอนสร้างใน Power Automate

1. **Create → Automated cloud flow → Skip (ตั้งชื่อเอง)** ชื่อ `SHE Patrol - 5 - API Gateway`
2. Trigger: **When a HTTP request is received**
   - Method: `POST`
   - Request Body JSON Schema:
     ```json
     {
       "type": "object",
       "properties": {
         "action": { "type": "string" },
         "id": { "type": "integer" },
         "fields": { "type": "object" },
         "findingId": { "type": "integer" },
         "stage": { "type": "string" },
         "fileName": { "type": "string" },
         "contentBase64": { "type": "string" },
         "fileUrl": { "type": "string" }
       },
       "required": ["action"]
     }
     ```
   - หลัง save flow ครั้งแรก Power Automate จะสร้าง **HTTP POST URL** ให้ — คัดลอก URL นี้ไปวางที่
     `APP_CONFIG.API_URL` ใน `index.html`
3. เพิ่ม **Switch** บน `triggerBody()?['action']` — สร้าง case ตามตารางด้านล่าง แต่ละ case จบด้วย
   action **Response** (Request/Response connector, standard) ส่ง JSON กลับ

### ตาราง action ทั้งหมด

| action | input | สิ่งที่ flow ทำ | response data |
|---|---|---|---|
| `listFindings` | - | SharePoint **Get items** จาก `SHE_Patrol_Findings`, `$top` 5000, `$orderby=PatrolDate desc` | array ของ finding ทั้งหมด |
| `getFinding` | `id` | SharePoint **Get item**, Id = `triggerBody()?['id']` | finding object เดียว |
| `createFinding` | `fields` | **Send an HTTP request to SharePoint**: POST `_api/web/lists/getbytitle('SHE_Patrol_Findings')/items`, header `Accept`/`Content-Type: application/json;odata=nometadata`, Body = `@{triggerBody()?['fields']}` | item ที่สร้างแล้ว (มี `Id`) |
| `updateFinding` | `id`, `fields` | **Send an HTTP request to SharePoint**: POST `_api/web/lists/getbytitle('SHE_Patrol_Findings')/items(@{triggerBody()?['id']})`, header เพิ่ม `X-HTTP-Method: MERGE`, `IF-MATCH: *` | `{updated:true}` แล้วตามด้วย Get item อีกครั้งเพื่อ response ค่าล่าสุด |
| `listUsers` | - | SharePoint **Get items** จาก `SHE_Patrol_Users`, `$top` 2000 | array ผู้ใช้ทั้งหมด |
| `createUser` | `fields` | เหมือน `createFinding` แต่เปลี่ยน list เป็น `SHE_Patrol_Users` | user ที่สร้างแล้ว |
| `updateUser` | `id`, `fields` | เหมือน `updateFinding` แต่เปลี่ยน list เป็น `SHE_Patrol_Users` | `{updated:true}` |
| `uploadPhoto` | `findingId`, `stage`, `fileName`, `contentBase64` | ดูหัวข้อ "อัปโหลดรูป" ด้านล่าง | `{fileUrl: "<server-relative-url>"}` |
| `getPhoto` | `fileUrl` | ดูหัวข้อ "ดึงรูปกลับมาแสดง" ด้านล่าง | `{contentBase64, contentType}` |

ทุก case ที่ error ให้ Response ด้วย `{"ok": false, "error": "<message>"}` และ status code 400/500
แทนการปล่อยให้ flow fail เฉยๆ (ใช้ **Configure run after** ต่อจาก action ที่อาจ fail เพื่อจับ error)

ทุก case ที่สำเร็จ Response body: `{"ok": true, "data": <ผลลัพธ์ตามตารางข้างบน>}`

### อัปโหลดรูป (`uploadPhoto`)

1. **Compose** `binary` = `base64ToBinary(triggerBody()?['contentBase64'])`
2. **Compose** `fileName` = `concat(triggerBody()?['findingId'], '_', if(equals(triggerBody()?['stage'], 'ก่อนแก้ไข'), 'before', 'after'), '.jpg')`
3. **Send an HTTP request to SharePoint**: POST
   `_api/web/GetFolderByServerRelativeUrl('/sites/<site>/SHE_Patrol_Photos')/Files/add(url='@{outputs('Compose_fileName')}',overwrite=true)`
   Body = `@{outputs('Compose_binary')}`
4. อ่าน `ServerRelativeUrl` จาก response ของขั้นตอนที่ 3 (`body('Send_an_HTTP_request_to_SharePoint')?['d']?['ServerRelativeUrl']`)
5. **Send an HTTP request to SharePoint** อีกครั้ง: POST
   `_api/web/GetFileByServerRelativeUrl('@{...ServerRelativeUrl...}')/ListItemAllFields`,
   header `X-HTTP-Method: MERGE`, `IF-MATCH: *`, Body:
   `{ "FindingID": "@{triggerBody()?['findingId']}", "PhotoStage": "@{triggerBody()?['stage']}" }`
6. Response: `{"ok": true, "data": {"fileUrl": "<ServerRelativeUrl จากขั้นตอน 4>"}}`

**เก็บค่านี้ (`fileUrl` ที่เป็น server-relative path เช่น `/sites/.../SHE_Patrol_Photos/12_before.jpg`)
ลงในคอลัมน์ `PhotoBeforeUrl`/`PhotoAfterUrl` ของ finding นั้นตรงๆ** — front-end จะเรียก `getPhoto`
เพื่อดึงรูปจริงตอนจะแสดงผลเท่านั้น ไม่ใช่ URL ที่เปิดตรงได้จาก browser ภายนอก (ดูเหตุผลข้อถัดไป)

### ดึงรูปกลับมาแสดง (`getPhoto`)

รูปเก็บอยู่ใน SharePoint Document Library ซึ่ง**ต้อง login SharePoint ถึงจะเปิดได้ตรงๆ** — ผู้ใช้ที่ไม่มี
M365 จะเปิดรูปด้วย `<img src="https://tenant.sharepoint.com/...">` ตรงๆ ไม่ได้ (จะเจอ 401 เหมือนเดิม)
จึงต้องให้ flow (ซึ่งมีสิทธิ์อยู่แล้ว) เป็นคนไปเอาไฟล์มาให้แทน:

1. **Send an HTTP request to SharePoint**: GET
   `_api/web/GetFileByServerRelativeUrl('@{triggerBody()?['fileUrl']}')/$value`, header `Accept: */*`
2. **Compose** `contentBase64` = `base64(body('Send_an_HTTP_request_to_SharePoint'))`
3. Response: `{"ok": true, "data": {"contentBase64": "@{outputs('Compose_contentBase64')}", "contentType": "image/jpeg"}}`

front-end แปลงเป็น `data:image/jpeg;base64,<contentBase64>` แล้วใช้เป็น `img.src` ตรงๆ — เรียกเฉพาะตอน
เปิดดูรายละเอียด finding นั้นจริงๆ (ไม่ใช่ตอนโหลดรายการทั้งหมด) เพื่อไม่ให้ payload ใหญ่เกินไป

## ข้อควรระวังด้านความปลอดภัย

- **URL ของ flow นี้ต้องเก็บเป็นความลับในระดับหนึ่ง** — Power Automate สร้าง URL ที่มี signature
  ยาวคาดเดาไม่ได้ (ไม่ใช่ URL แบบ `/api/xxx` ธรรมดา) แต่**ใครก็ตามที่มี URL นี้เรียก API ได้ตรงๆ
  โดยไม่ผ่านหน้าเว็บ/ไม่ผ่านการ login เลือกชื่อใน `SHE_Patrol_Users`** เพราะ flow เองไม่ได้ตรวจสอบตัวตน
  ผู้เรียก — เป็นการยอมรับความเสี่ยงแบบเดียวกับที่ระบบพี่น้อง (Work Permit) ใช้กับ public endpoint สำหรับ
  ผู้รับเหมาภายนอกอยู่แล้ว
- ถ้าต้องการเพิ่มชั้นป้องกัน แนะนำ (ทำเพิ่มได้ภายหลัง ไม่ใช่ scope รอบนี้):
  - เปลี่ยน "Who can trigger the flow" เป็น require **SAS key** ใน query string แล้วให้ front-end แนบ
    key นั้นทุก request (ยังไม่ใช่ auth จริงแต่กันการเดา URL สุ่มได้ระดับหนึ่ง)
  - เพิ่ม validation ใน flow เอง เช่น เช็คว่า `Grade` ที่ส่งมาอยู่ใน `A/B/C/Others` เท่านั้นก่อนเขียนลง SharePoint
  - เมื่อพร้อม อัปเกรดเป็น Microsoft 365 SSO (Azure AD / MSAL.js) ทั้งระบบจะตัดปัญหานี้ไปเลย เพราะกลับไป
    ใช้สิทธิ์ SharePoint permission group บังคับที่ SharePoint โดยตรงเหมือนเดิม (ดู README หลัก)

## JSON โครงสร้างอ้างอิง (สรุปสั้น)

```json
{
  "trigger": { "type": "Request", "kind": "Http" },
  "actions": [
    {
      "type": "Switch",
      "expression": "@triggerBody()?['action']",
      "cases": {
        "listFindings": { "actions": [ { "type": "OpenApiConnection", "connector": "shared_sharepointonline", "operation": "GetItems", "parameters": { "dataset": "<SiteUrl>", "table": "SHE_Patrol_Findings", "$top": 5000, "$orderby": "PatrolDate desc" } }, { "type": "Response", "kind": "Http", "inputs": { "statusCode": 200, "body": { "ok": true, "data": "@body('Get_items')?['value']" } } } ] },
        "createFinding": { "actions": [ { "type": "OpenApiConnection", "connector": "shared_sharepointonline", "operation": "HttpRequest", "parameters": { "dataset": "<SiteUrl>", "uri": "_api/web/lists/getbytitle('SHE_Patrol_Findings')/items", "method": "POST", "headers": { "Accept": "application/json;odata=nometadata", "Content-Type": "application/json;odata=nometadata" }, "body": "@triggerBody()?['fields']" } }, { "type": "Response", "kind": "Http", "inputs": { "statusCode": 200, "body": { "ok": true, "data": "@body('Send_an_HTTP_request_to_SharePoint')" } } } ] }
      }
    }
  ]
}
```

(action อื่นทำตามรูปแบบเดียวกัน ดูรายละเอียดขั้นตอนในตารางด้านบน — ไม่ได้ใส่ JSON ครบทุก action
เพราะซ้ำ pattern เดิม แค่เปลี่ยน list/method/header)
