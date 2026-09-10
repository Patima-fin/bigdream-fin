# BIGDREAM Financial Console — คู่มือโค้ด

## เว็บนี้คืออะไร

Dashboard การเงินของ BIGDREAM — **fork ของ `WebAPP - BIO` (BIOAXEL) ที่ตัดเหลือ 11 หน้า**
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

## 11 หน้า (route → component → ไฟล์)

| route | เมนู | component | ไฟล์ |
|---|---|---|---|
| `cashflow_present` | Executive Cash Flow | `CashFlowPresentPage` | `page_cashflow_present.jsx` |
| `bank_diary` | Bank Daily | `BankDiaryPage` | `page_bank_diary.jsx` |
| `receipts` | ประวัติรับเงิน | `ReceiptsPage` | `page_receipts.jsx` |
| `cf_coding` | งบกระทบยอดกระแสเงินสด | `CfCodingPage` | `page_cf_coding.jsx` |
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

## งบกระทบยอดกระแสเงินสด — `app/page_cf_coding.jsx`

โต๊ะลงหมวดให้ทุกรายการ → ได้งบกระแสเงินสด (ส่งออก Excel 3 ชีต หรือดันขึ้น `cashflow_present` ตรง ๆ)

**ต่างจาก BIO อย่างไร** — BIO ใช้ EXPRESS จึงต้องนำเข้าไฟล์งบกระทบยอดธนาคารแล้วไล่จับคู่
บรรทัดธนาคาร ↔ ใบสำคัญจ่ายด้วยเลขเช็ค (โค้ดจับคู่ ~700 บรรทัด: `cfcParseBankSheet` /
`cfcParseSettleReport` / `cfcMatchPv` …) · BDH ใช้ PEAK ซึ่ง `peak_import.js` ยุบ double-entry
เป็น **1 ใบจ่าย = 1 แถว** ให้แล้ว และรายการทั้งหมด**ตรงกับหน้าใบสำคัญจ่ายเป๊ะ**
⇒ หน้านี้ **ไม่มีตัวนำเข้าไฟล์ของตัวเอง** อ่านจาก `data.pvVouchers` ตรง ๆ (นำเข้าที่หน้า PV ที่เดียว)

**เก็บอะไรไว้ที่ไหน** — ตาราง `cfCoding` (∈ `SHEET_TABLES` ของ `data_supabase.js`) · cache `bdh-cfcode-v1`
| id | เก็บ |
|---|---|
| `master` | ผังหมวด `{items:[{name,act,group,flow?}]}` — `act` = op/inv/fin/transfer |
| `rules` | กฎที่เรียนรู้ `{map:{ "doc:…"\|"vendor:…"\|"memo:…"\|"text:…" : {cat,n,by,at} }}` |
| `extra` | รายการนอก PV ที่คีย์เอง (ขารับ / ค่าธรรมเนียมที่ธนาคารหักเอง / โอนระหว่างบัญชี) |
| `manual` | `{opening:{ "<เลขบัญชี>": number }}` — ยอดเงินสดต้นงวดรายบัญชี |

**ข้อควรระวัง**
- **ไม่มีหมวดตั้งต้นจริง** — `CFC_MASTER_SEED` เป็นผังกลางแบบมาตรฐาน (74 หมวด) ไม่ใช่ผังของบริษัท
  หน้าจอขึ้นแถบเตือนจนกว่าจะแก้ครั้งแรก · แก้ทีละหมวดหรือส่งออก/นำเข้าเป็นชุด Excel 4 คอลัมน์ก็ได้
- **ใบที่ `Net_Amount` = 0** (สำรองจ่ายแทน) ถูกตัดออกจากตารางตั้งแต่ต้น — ไม่ใช่กระแสเงินสดของบริษัท
  นับด้วยเมื่อไหร่ยอดในงบเกินจริงทันที (จำนวนใบที่ตัดโชว์ไว้ที่แถบเตือน)
- **PEAK สมุด "จ่าย" ไม่มีขารับ** — ถ้าไม่คีย์ "รายการนอก PV" งบจะติดลบทั้งเดือน (มีแถบเตือนบอก)
- **ไม่มียอดคงเหลือรายบรรทัด** ⇒ ชีต "รายละเอียดทุกรายการ" จง**ใจไม่มีคอลัมน์ "ยอดคงเหลือ"**
  (ถ้าใส่คอลัมน์ว่างไว้ `cfpParseStm` จะคิดยอดต้นงวด = 0 − กระแสแถวแรก แบบเงียบสนิท)
  ยอดต้นงวดมาจากที่คีย์เองในตาราง "สรุปรายบัญชี" เท่านั้น
- `page_cashflow_present.jsx` ต้อง `Object.assign(window, { cfpParseStm, cfpParseSummary, CFP_TABLE, … })`
  ไม่งั้นปุ่ม "ส่งขึ้นหน้า Cash Flow" ตายเงียบ · และ `index.html` ต้องโหลด `page_cf_coding.jsx` **หลัง** ไฟล์นั้น
- ต้องรัน `supabase/cf-coding.sql` ครั้งเดียว ไม่งั้น degrade เป็น local (หัวหน้าขึ้น "ข้อมูลในเครื่อง")

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
- **เพิ่มตารางใหม่ = แก้ 3 ที่** — `supabase/<ไฟล์>.sql` (สร้าง) · `data_supabase.js → SHEET_TABLES`
  หรือ `CRUD_ENTITIES` (ให้แอปอ่าน/เขียนได้) · `supabase/rls-phase4.sql` ทั้ง **array `ents`
  และ ROLLBACK block ในคอมเมนต์หัวไฟล์** — ตกหล่นจาก `ents` = ตารางค้างเปิดโล่งเงียบ ๆ
  เพราะ `rls-off-bootstrap.sql` ปิด RLS แบบวนลูปทุกตาราง

## 2026-09-10 — port ตัวแก้ทั้งชุดจาก BIO (งบกระทบยอด → Executive Cash Flow)
BIO เจอบั๊กชุดใหญ่ในเส้นทาง "ดันข้อมูลจากงบกระทบยอดขึ้นหน้า Cash Flow" แล้วแก้ไปทั้งหมด
(รายละเอียดเต็มอยู่ใน `WebAPP - BIO/docs/CHANGELOG.md` 2026-09-09 / 2026-09-10)
BDH ใช้โค้ดชุดเดียวกันจึงมีบั๊กเหมือนกัน — port มาแล้วดังนี้ (ปรับให้เข้ากับ PEAK ที่ไม่มียอดคงเหลือ):
- **`cfpToISO`** สาขา "ตัวเลข" ผ่านกฎ "ปี > 2400 = พ.ศ. → ลบ 543" (Excel serial ปี พ.ศ. เคยเก็บเป็น `2569-xx`)
- **`cfpFixEraTxns`** (global ใหม่) ยุบ `iso`/`month` ของข้อมูลเก่าเป็น ค.ศ. ทั้งตอนสร้าง model และตอน merge
- **`cfpParseStm`** ไม่เอาแถวที่ช่อง "ยอดคงเหลือ" ว่าง มาคิดต้นงวด (PEAK ไม่มีคอลัมน์นี้เลย)
- **`cfpParseSummary`** จัดชนิดแถวจาก `aoa.kinds` → ย่อหน้า → ค่อยเดาจากยอด
  ⚠️ **ห้ามเดา "ยอด 0 = หัวข้อกลุ่ม"** — รายการย่อยที่ยังไม่มียอดจะกลายเป็นหัวข้อสีเขียว **และตัวเลขถูกซ่อน**
- **⚠️⚠️ "ดันเดือนไหน แตะเฉพาะคอลัมน์เดือนนั้น"** — `cfcApplyOldColumns` ทับคอลัมน์เดือนที่ไม่ได้ส่ง
  ด้วยตัวเลขเดิม **ทุกแถวที่ชื่อตรงกัน** (ไม่ใช่แค่รายการย่อย — แถวรวม/สุทธิถ้าคิดใหม่จะเพี้ยนเมื่อไฟล์เดิม
  มีรายการย่อยที่ผังหมวดตอนนี้ไม่มี) · `cfcYmOfMonthLabel` แกะ ym จากหัวคอลัมน์ · `cfcCanonRowLabel` จับคู่ชื่อ
- **⚠️ `ปลายงวด = ต้นงวด + สุทธิ` เฉย ๆ ไม่พอ** — ต้องบวก "เงินนอกกิจกรรม" (โอนระหว่างบัญชี ·
  ยังไม่ลงหมวด · หมวดผี) ด้วย ผ่าน **`cfcRunCashRows`** ที่เดียว ไม่งั้นปลายงวดเพี้ยนแบบไม่มีอะไรฟ้อง
- ยุบ `(ไม่ระบุหมวด)` → `(ยังไม่ลงหมวด)` ก่อนสร้างงบ (บรรทัดตรวจเคยโชว์ 0 ตลอด)
- **ปุ่มดันเปิดหน้าต่างยืนยัน "จะดันเดือนไหน" ก่อนเสมอ** (กันดันผิดเดือน) · เลือกเดือนในหน้าต่าง = ตั้งตัวกรองของหน้าไปเลย
- **เร็วขึ้น**: `persist` เขียนเฉพาะแถวที่เปลี่ยนผ่าน `WTPData.upsertSheetRows` (เดิม `writeTable`
  selectAll + upsert ทั้งตารางทุกคลิก) · `CfcCatSelect` กาง `<option>` ตอนจะกดเลือก (ต้อง `ReactDOM.flushSync`) ·
  `cfcSaveLocal` ไม่กลืน QuotaExceeded เงียบ ๆ
**ที่ไม่ได้ port (เป็นเรื่องของ EXPRESS ล้วน — BDH ใช้ PEAK):** ตัดใบอนุมัติจ่ายที่ซ้ำกับบรรทัดธนาคาร ·
หน้าต่างเลือกบัญชีให้ใบที่ไม่มีเลขบัญชี · แถว "ปลายงวด จาก STM" + บรรทัดผลต่าง (PEAK ไม่ส่งยอดคงเหลือมาให้)
