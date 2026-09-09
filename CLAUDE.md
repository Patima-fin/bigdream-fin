# BIGDREAM Financial Console — คู่มือโค้ด

## เว็บนี้คืออะไร

Dashboard การเงินของ BIGDREAM — **fork ของ `WebAPP - BIO` (BIOAXEL) ที่ตัดเหลือ 10 หน้า**
(BIO เองก็ fork มาจาก Water POG อีกที) สร้างเมื่อ 2026-09-03

**แยกขาดจาก BIO / Water POG ทุกชั้น:** คนละโฟลเดอร์ · คนละ repo · คนละ Supabase project ·
คนละ prefix localStorage (`bdh-*` ไม่ใช่ `bio-*` / `wtp-*`)

## Stack — ไม่มี build step

React 18 + Babel standalone โหลดจาก CDN · ไม่มี npm / bundler / node_modules
`index.html` โหลดไฟล์ `.jsx` เรียงกันเป็น `<script type="text/babel">` แล้ว compile ในเบราว์เซอร์

- **ทุกอย่างเป็น global** — ไม่มี import/export. ไฟล์ปลายทางประกาศ
  `Object.assign(window, { XxxPage })` แล้ว `app.jsx` เรียกใช้ได้เลย
- **แก้โค้ด = เซฟไฟล์ + refresh** — แต่ต้องบั๊มพ์ `?v=` ใน `index.html` ก่อน push
  ไม่งั้น browser/GitHub Pages จะ cache ตัวเก่า
- **รันในเครื่อง:** `python -m http.server 8000` ที่ root (file:// ไม่ได้ — Babel fetch ข้าม CORS)

## Backend

Supabase (Postgres + Realtime). ตั้งค่าที่ `app/config.js`
- `BACKEND: 'supabase'` · `SUPABASE_URL` / `SUPABASE_ANON_KEY`
- `USE_SUPABASE_AUTH` — `false` = bootstrap (เช็ค password จาก `USERS` ใน config, RLS ต้องปิด)
  · `true` = production (Supabase Auth + RLS)
- schema อยู่ใน `supabase/*.sql` — ดู `NEXT-STEPS-BIGDREAM.md` ว่าต้องรันไฟล์ไหนตามลำดับใด

data layer: `data.js` (shape + cache) → `data_sync.js` / `data_supabase.js` (sync)
เข้าถึงผ่าน global `WTPData.*` · สิทธิ์ผ่าน `WTPAuth.*` (ประกาศใน `app.jsx`)

## 10 หน้า (route → component → ไฟล์)

| route | เมนู | component | ไฟล์ |
|---|---|---|---|
| `cashflow_present` | Executive Cash Flow | `CashFlowPresentPage` | `page_cashflow_present.jsx` |
| `bank_diary` | Bank Daily | `BankDiaryPage` | `page_bank_diary.jsx` |
| `receipts` | ประวัติรับเงิน | `ReceiptsPage` | `page_receipts.jsx` |
| `invoices` | ลูกหนี้คงค้าง | `InvoicesPage` | `page_invoices.jsx` |
| `data_pv` | ใบสำคัญจ่าย | `DataPVPage` | `page_data_extras.jsx` |
| `data_payable` | เจ้าหนี้คงค้าง | `DataPayablePage` | `page_data_extras.jsx` |
| `daily_balance` | บันทึกยอดธนาคาร | `DailyBalancePage` | `page_daily_balance.jsx` |
| `audit_log` | Audit Log | `AuditLogPage` | `page_audit_log.jsx` |
| `backup` | สำรอง / กู้คืนข้อมูล | `BackupPage` | `page_backup.jsx` |
| `users` | จัดการผู้ใช้ | `UsersPage` | `page_users.jsx` |

**DATA BANK ไม่มี route ของตัวเอง** — `DailyBalancePage` (ท้าย `page_daily_balance.jsx`)
เป็น wrapper ที่มีแท็บ 2 อัน: ฟอร์มบันทึกยอด (`DailyBalanceEntryPage`) กับ `DataBankPage`
(มาจาก `page_data_extras.jsx`) · จำแท็บล่าสุดใน `localStorage['bdh-dbal-tab']`

## `app/shared_bits.jsx` — ไฟล์เฉพาะของ BIGDREAM

หน้าที่ถูกตัดออก (`page_home` / `page_cashflow` ฯลฯ) เคยเป็นเจ้าของ helper ที่หน้าที่เหลือ
ยังเรียกอยู่ → ยกมารวมไว้ที่นี่ **คงโค้ดเดิมเป๊ะ** เพื่อให้ diff กับ BIO ง่าย:
`hpBankName` `hpBankAcNo` `HP_BANK_LOGO_DIR` `HP_BANKS` `hpBankBrand` `HpBankLogo`
`cfPvCatKey` `cfVendorCat` `categorizePayable` `resolvePvCategory` `categorizeForecastEntry` `buildPaidVchnoSet`

⚠️ ต้องโหลด **ก่อน** ไฟล์ `page_*.jsx` ทุกตัวใน `index.html`

## เพิ่มหน้าใหม่ (ดึงกลับจาก BIO)

1. ก๊อป `app/page_xxx.jsx` จาก `WebAPP - BIO`
2. เพิ่ม `<script type="text/babel" src="app/page_xxx.jsx?v=...">` ใน `index.html`
3. `app/app.jsx` → เพิ่มใน `PAGE_GROUPS` (เมนู + ตัวเลือกสิทธิ์รายคน) + `routes` (ชื่อ/ไอคอน) + `case` ใน switch

ถ้าหน้านั้น error ว่า `X is not defined` → helper ตัวนั้นอยู่ในหน้าที่ถูกตัด ให้ยกมาไว้ `shared_bits.jsx`

## นำเข้าข้อมูลจาก PEAK — `app/peak_import.js`

BIGDREAM ใช้โปรแกรมบัญชี **PEAK** (BIO ใช้ **EXPRESS**) รายงานที่ PEAK ส่งออกมาใช้กับ
ตัวนำเข้าเดิมไม่ได้ 3 เหตุ: (1) มีหัวรายงานคร่อม ~11 บรรทัด (2) หัวคอลัมน์เป็นไทย
(3) สมุดรายวันเป็น double-entry ต้องยุบเป็นรายเอกสารก่อน

`peak_import.js` แปลง sheet ของ PEAK → TSV ที่หัวคอลัมน์ตรงฟิลด์แอป แล้วส่งต่อให้
ตัวนำเข้าเดิมทำ diff/preview/commit ตามปกติ — **ไฟล์ที่ไม่ใช่ PEAK คืน `null` แล้วไหลไปทางเดิม**

| รายงาน PEAK | หน้าในแอป | target |
|---|---|---|
| รายงานใบแจ้งหนี้ | ลูกหนี้คงค้าง | `iv` |
| รายงานบันทึกรายจ่าย | เจ้าหนี้คงค้าง | `ap` |
| รายงานสมุดรายวัน | ใบสำคัญจ่าย | `pv` |

**จุดที่ hook ไว้ 3 ที่** (ทั้งหมดอ่าน workbook แล้วทำเป็น TSV เหมือนกัน):
- `page_data_extras.jsx` → `DataCrudPage.handleFileUpload` (เปิดใช้ด้วย `config.peakTarget`)
- `page_data_extras.jsx` → `DataPayablePage.handleFileUpload` (fix เป็น `'ap'`)
- `page_invoices.jsx` → `ImportRawIvModal.handleFile` (fix เป็น `'iv'`)

การแปลงที่ควรรู้:
- **PV**: `Net_Amount` = ยอดเครดิตบัญชีธนาคาร (`1113xx`) = เงินออกจริง · `WHT` = เครดิต
  ภ.ง.ด.ค้างจ่าย (`2152xx`) · `Bank_AC` ดึงจากเลขบัญชีที่ฝังในคำอธิบายด้วย regex ·
  ใบที่ไม่มีเงินออก (สำรองจ่ายแทน `212203`) → `Net_Amount` 0 + ใส่หมายเหตุ · เอาเฉพาะสมุด "จ่าย"
- **IV**: `balance` = คอลัมน์ "ทั้งหมด" (รวม VAT) แล้วให้แอปหัก WHT เอง · สถานะ PEAK
  map เป็น `paid` / `tracking` · ใบที่ "ยกเลิก" ถูกข้าม
- **AP**: `netpayment` = "ต้องชำระ" (หลังหัก WHT) · `vchno` = `EXP-xxxxx`
  ⚠️ `_isPayableDetailRow` ต้องมี prefix `EXP` อยู่ใน `_PAYABLE_DOC_PREFIX` ไม่งั้นแถวถูกทิ้งเงียบ ๆ

**เพิ่มโปรแกรมบัญชีใหม่ในอนาคต:** เขียน builder เพิ่มใน `peak_import.js` แล้วเติมใน `REPORTS`

## แบรนด์ · โลโก้ · สีธีม

**ชื่อบริษัท** — `บริษัท บิ๊ก ดรีม โฮลดิง จำกัด` · `BIG DREAM HOLDINGS CO., LTD.`
อยู่ 3 จุด: `data.js → companyName` · `page_bank_diary.jsx → BD_COMPANY_NAME` · `page_invoices.jsx → .iv-print-co`

**โลโก้ 2 ไฟล์** สร้างจาก `logo/โลโก้บริษัท.png` ด้วย `tools/logo-prep.ps1 -Build`
- `bigdream_logo.png` (1200×296 แนวนอน) → splash · sidebar กาง · login
- `bigdream_mark.png` (404×404 จัตุรัส) → favicon · sidebar ย่อ · กล่องโลโก้จัตุรัสในหัวใบพิมพ์

โลโก้เป็นแนวนอน ~4:1 ต่างจาก BIO ที่เป็นแนวตั้ง ⇒ ทุกที่ที่เคยคุมขนาดด้วย `height`
ต้องเปลี่ยนมาคุมด้วย `width` ไม่งั้นล้นกรอบ (แก้ไว้แล้วที่ `.sb-logo-img`, splash, login)

**สีธีม — อ่อนกว่า BIO ~1.5 เฉด (hue เดียวกัน)**

| | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 |
|---|---|---|---|---|---|---|---|---|---|
| BDH | `#f3faf5` | `#e0f4e7` | `#bfe6cc` | `#94d4aa` | `#62bd85` | `#3ea45f` | `#2d8b4d` | `#22703c` | `#1a5730` |
| BIO เดิม | `#eef7f1` | `#d5edda` | `#aedcb8` | `#7cc48f` | `#47a566` | `#2e8b4a` | `#21703a` | `#1a592f` | `#154524` |

⚠️ **สีธีมอยู่ 3 ที่ ต้องแก้ให้ตรงกันทุกที่:**
1. `app/app.jsx` → object `themes.green` — ตัวจริงที่ `setProperty('--brand-*')` ทับตอน runtime
2. `app/styles.css` → `:root { --brand-* }` — ค่าตั้งต้นก่อน React mount
3. `app/app.jsx` → `LoginPage` — hardcode สีไว้ (หน้า login เรนเดอร์ก่อน effect ธีมทำงาน)

**คอนทราสต์:** `--brand-500` ใหม่ (#3ea45f) ให้ตัวอักษรขาวแค่ 3.14:1 — ต่ำเกินอ่านสบาย
เลยตั้ง `.btn-primary` ให้ไล่ `500→700` (แทน `500→600` ของ BIO) ตัวหนังสือกลางปุ่มจึงได้ ~4.3:1
เท่าปุ่มเดิมของ BIO แต่ขอบบนยังดูอ่อนกว่า — **อย่าเปลี่ยนกลับเป็น 500→600**

## กับดักที่เจอบ่อย

- **localStorage prefix** — ทุกคีย์ต้องเป็น `bdh-*`. ถ้าโฮสต์ github.io บัญชีเดียวกับ BIO จะเป็น
  origin เดียวกัน → คีย์ชนกัน = session/แคชข้ามบริษัท. ตอน copy ไฟล์จาก BIO ต้องไล่เปลี่ยน `bio-` → `bdh-`
- **`?v=` cache-bust** — แก้ไฟล์แล้วไม่บั๊มพ์ = ผู้ใช้เห็นโค้ดเก่า
- **ชื่อบริษัท** อยู่ 2 จุด: `data.js → companyName` และ `page_bank_diary.jsx → BD_COMPANY_NAME`
- **ตารางที่ไม่ได้ใช้ก็ต้องสร้าง** — `pnlBase` `budgetHo` `bankReconBook` `bankReconMatch` ยังอยู่ใน
  รายการ sync (`data.js` / `data_supabase.js`) ถึงหน้าจะถูกตัดไปแล้ว ⇒ ต้องรัน SQL ครบทุกไฟล์
