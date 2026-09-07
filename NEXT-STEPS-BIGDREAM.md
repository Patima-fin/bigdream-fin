# BIGDREAM Financial Console — ขั้นตอนที่เหลือ (สำหรับคุณ)

เว็บนี้ **scaffold เสร็จแล้ว** จากโค้ด BIOAXEL (`WebAPP - BIO`) โดยตัดเหลือ **10 หน้า**
ที่ขอไว้ · rebrand เป็น BIGDREAM · แยกโฟลเดอร์/ฐานข้อมูล/localStorage ออกจากกันหมด

> โฟลเดอร์เว็บใหม่: `G:\Shared drives\Account&Finance Bioxcel\01 99999 FINANCE\WebAPP - BDH`
> **ไม่แตะ BIOAXEL และ Water POG เลย** — คนละโฟลเดอร์ คนละ repo คนละ Supabase

เหลือ 5 ขั้นที่ต้องใช้ "บัญชีของคุณ" (Supabase + GitHub) ที่ผมทำแทนไม่ได้

---

## ✅ สิ่งที่ทำให้แล้ว

| | |
|---|---|
| **10 หน้า** | Executive Cash Flow · Bank Daily · ประวัติรับเงิน · ใบแจ้งหนี้คงค้าง · DATA PV · DATA AP Outstanding · บันทึกยอดธนาคาร (มีแท็บ DATA BANK) · Audit Log · สำรอง/กู้คืน · จัดการผู้ใช้ |
| **DATA BANK** | ย้ายจากเมนู sidebar → เป็น **แท็บ** ในหน้าบันทึกยอดธนาคาร (จำแท็บล่าสุดไว้ให้) |
| **หน้าที่ตัดออก** | 20+ หน้าของ BIO (Home, War Room, Weekly Forecast, P&L, งบแสดงฐานะ, Budget, Investor, โครงการ, หนี้/ดอกเบี้ย, STS, กระทบยอดธนาคาร, เช็คจ่าย ฯลฯ) — **ลบไฟล์ออกจริง** ไม่ได้แค่ซ่อนเมนู |
| **rebrand** | title / splash / sidebar / หัวรายงาน / ใบพิมพ์ / ชื่อบริษัท → BIGDREAM |
| **แยก localStorage** | คีย์ทุกตัวเปลี่ยนจาก `bio-*` → `bdh-*` (สำคัญมากถ้าโฮสต์ github.io บัญชีเดียวกับ BIO — จะเป็น origin เดียวกัน ข้อมูลในเครื่องจะตีกัน) |
| **`app/shared_bits.jsx`** | ไฟล์ใหม่ — เก็บ helper ที่หน้าที่เหลือยังเรียกใช้ แต่เจ้าของเดิมคือหน้าที่ถูกตัด (`HpBankLogo`, `hpBankBrand`, `resolvePvCategory`, `categorizePayable`, `cfVendorCat`, `categorizeForecastEntry`, `buildPaidVchnoSet`) |
| **เทสแล้ว** | รัน local ผ่าน → login ได้ · ทั้ง 10 หน้าเปิดได้ ไม่มี error ใน console (นอกจากคำเตือน "ยังไม่ได้กรอก Supabase" ที่ตั้งใจ) |

### ✅ โลโก้ + ชื่อบริษัท (เสร็จแล้ว 2026-09-07)

ต้นฉบับอยู่ที่ `logo/โลโก้บริษัท.png` (1920×1080 พื้นโปร่ง เนื้อโลโก้กินแค่ 1585×343)
สคริปต์ `tools/logo-prep.ps1` ตัดขอบว่างแล้วสร้าง 2 ไฟล์ที่แอปใช้จริง:

| ไฟล์ | ขนาด | ใช้ที่ไหน |
|---|---|---|
| `bigdream_logo.png` | 1200×296 (แนวนอน ~4:1) | splash · sidebar (เมนูกาง) · หน้า login |
| `bigdream_mark.png` | 404×404 (สัญลักษณ์ จัตุรัส) | favicon · sidebar (เมนูย่อ) · กล่องโลโก้จัตุรัสในหัวใบพิมพ์ |

> **เปลี่ยนโลโก้ทีหลัง:** วางไฟล์ใหม่ทับใน `logo/` แล้วรัน
> `powershell -File tools\logo-prep.ps1 -Build` → ได้ 2 ไฟล์ใหม่อัตโนมัติ
> (อย่าลืมบั๊มพ์ `?v=` ใน `index.html` ก่อน push)

ชื่อบริษัทจริงใส่ครบแล้ว — `บริษัท บิ๊ก ดรีม โฮลดิง จำกัด` · `BIG DREAM HOLDINGS CO., LTD.`
(`app/data.js → companyName` · `app/page_bank_diary.jsx → BD_COMPANY_NAME` · หัวใบพิมพ์ใน `app/page_invoices.jsx`)

### ✅ สีธีม — อ่อนกว่า BIO 1-2 เฉด (เสร็จแล้ว 2026-09-07)

เขียว hue เดียวกับ BIO แต่ไล่เฉดอ่อนขึ้น ~1.5 เฉดทั้งชุด (เช่น 500: `#2e8b4a` → `#3ea45f`)
ไล่แก้ทั้งพาเลตต์กลาง + สีที่ hardcode กระจายอยู่ตามหน้า (ปุ่ม/หัวใบพิมพ์/สีกราฟ) รวม 61 จุด
พร้อมเปลี่ยนพื้นหลังหน้า login จากฟ้า (ตกทอดมาจาก Water POG) เป็นเขียวอ่อนให้เข้าชุด

รายละเอียดพาเลตต์ + ข้อควรระวังเรื่องคอนทราสต์อยู่ใน `CLAUDE.md` หัวข้อ "แบรนด์ · โลโก้ · สีธีม"

---

## ✅ STEP 1 — สร้าง Supabase project (เสร็จแล้ว 2026-09-03)

- project `bigdream-fin` · ref **`dkdxyuqmkujnktemhwxf`** · org `Patima-fin` · region Asia-Pacific
- รัน SQL ครบแล้ว: `schema.sql` → `pnl-budget.sql` → `bankrecon-express.sql` → `cashflow-present.sql`
  (ครบ 29 ตาราง — ตรวจแล้วอ่าน/เขียนได้จริงทุกตัว)
- รัน `supabase/rls-off-bootstrap.sql` แล้ว (ดูหัวข้อ "กับดัก RLS" ด้านล่าง)
- **ยังไม่รัน** `supabase/rls-phase4.sql` — ถูกต้องแล้ว เก็บไว้ STEP 5

> ตาราง `pnlBase` / `budgetHo` / `bankReconBook` / `bankReconMatch` เป็นตารางที่ BIGDREAM
> **ไม่ได้ใช้** (หน้า P&L / Budget / กระทบยอด ถูกตัดออก) แต่ยังต้องมี เพราะตัว sync อ่าน
> "ทุกตาราง" ทุกครั้ง ถ้าขาดจะเตือน sync ล้มเหลว — เป็นตารางเปล่า ไม่กินอะไร

### ⚠️ กับดัก RLS ที่เจอตอนตั้งระบบ — จดไว้กันลืม

ตอนสร้าง project ติ๊ก **"Enable automatic RLS"** ไว้ → Supabase ติดตั้ง event trigger ที่เปิด RLS
ให้ทุกตารางที่สร้างใหม่ ผลคือ **ตารางมี RLS เปิดแต่ไม่มี policy**:
- อ่านได้ **0 แถวเสมอ** และ **ไม่ error** (คืน HTTP 200 + array ว่าง) ⇒ หลอกมาก ดูเผิน ๆ เหมือนแค่ "ยังไม่มีข้อมูล"
- เขียนโดนปฏิเสธด้วย `42501 new row violates row-level security policy`

แก้ด้วย `supabase/rls-off-bootstrap.sql` (ปิด RLS ทุกตาราง + ถอน event trigger ทิ้ง) — รันแล้ว

> **บทเรียน: ดูชื่อ project มุมซ้ายบนทุกครั้งก่อนกด Run**
> ระหว่างตั้งระบบมีการเผลอรัน SQL ชุดนี้ใส่ project `bioaxel-fin` → RLS ของ BIO ถูกปิดทั้งหมด
> กู้คืนด้วย `WebAPP - BIO/supabase/rls-restore.sql` (ไฟล์นั้นมี guard: ถ้าตาราง invoices ว่าง
> = ไม่ใช่ BIO → rollback ทั้งก้อน) · ข้อมูล BIO ไม่หาย เพราะไฟล์ SQL ทั้งชุดไม่มี drop/delete/truncate

## ✅ STEP 2 — กรอกค่า Supabase ลง config (เสร็จแล้ว)

`app/config.js` ใส่ `SUPABASE_URL` + `SUPABASE_ANON_KEY` แล้ว

**ผลทดสอบ (2026-09-03):**
- ต่อ Supabase ติด — `sync: ok`, `failedSheets: []`
- login `admin` / `bigdream-setup-2026` ผ่าน · เปิดครบทั้ง 10 หน้า ไม่มี error ใน console
- ทดสอบเขียนจริงผ่าน UI: เพิ่มบัญชีในแท็บ DATA BANK → แถวลง Supabase + `audit_log` บันทึกชื่อผู้ทำ → ลบข้อมูลทดสอบออกแล้ว
  (เหลือ 1 บรรทัดในหน้า Audit Log ว่า `bankAccounts: เพิ่ม 1` — เป็นร่องรอยการทดสอบ ไม่ต้องสนใจ)

**รันในเครื่องเพื่อทดสอบ:**
```bash
python -m http.server 8000
```
(หรือ Live Server ใน VS Code) → เปิด http://localhost:8000

## STEP 3 — เปลี่ยนโลโก้ + ชื่อบริษัท

แทนไฟล์ `bigdream_logo.png` ที่ root ด้วยโลโก้จริง (**ชื่อไฟล์เดิม**) + บอกชื่อบริษัทภาษาไทยจริงมา

## STEP 4 — สร้าง GitHub repo + เปิด GitHub Pages

1. สร้าง repo ใหม่บน GitHub เช่น `bigdream-fin` — **public** (GitHub Pages ฟรีต้อง public)
2. ในโฟลเดอร์นี้:
   ```bash
   git init
   git add -A
   git commit -m "BIGDREAM scaffold — 10 pages from BIOAXEL"
   git branch -M master
   git remote add origin https://github.com/Patima-fin/bigdream-fin.git
   git push -u origin master
   ```
3. GitHub → repo → **Settings → Pages** → Source = Deploy from branch → Branch = `master` → Save
4. รอ ~1 นาที → เว็บอยู่ที่ `https://patima-fin.github.io/bigdream-fin/`
   > ⚠️ anon key ขึ้น repo public ได้ **แต่** ปลอดภัยจริงต่อเมื่อเปิด RLS ใน STEP 5

## ✅ STEP 5 — เปิด login จริง + ล็อกความปลอดภัย (RLS) · เสร็จแล้ว 2026-09-07

| ขั้น | สถานะ | ผลตรวจ |
|---|---|---|
| **A** สร้าง Supabase Auth users + รหัส (`tools/supabase-auth-setup.html`) | ✅ | — |
| **B** ปิด "Allow new users to sign up" | ✅ | `disable_signup: true` · ลองสมัครจริง → `422 signup_disabled` |
| **C** `config.js`: `USE_SUPABASE_AUTH: true` + ลบ `password` + ตั้ง `FORCE_LOGOUT_BEFORE` | ✅ | session เก่าถูกเด้งออก → เด้งหน้า login |
| **D** รัน `supabase/rls-phase4.sql` | ✅ | anon อ่านได้ 0 แถวทุกตาราง · เขียนโดน `42501` |

> ⚠️ รอบนี้ทำ **D ก่อน C** → มีช่วงสั้น ๆ ที่ login ไม่ได้ (RLS เปิดแต่โค้ดยังวิ่งเป็น anon
> จึงโดน RLS บล็อก = จอว่าง) แก้แล้วโดยตั้ง C ตามทันที · ครั้งหน้าจำลำดับ **A → B → C → D**

### สิทธิ์หลังเปิด RLS

| role | อ่าน DB | เขียน (เพิ่ม/แก้/ลบ) |
|---|---|---|
| manager · staff | ✓ | ✓ |
| viewer · owner | ✓ | ✗ |
| ไม่ login (anon) | ✗ | ✗ |

audit_log: ทุกคนที่ login เขียนได้ · อ่านได้เฉพาะ manager

### เก็บงาน
- แจกรหัสจากขั้น A ให้ทีม → ทุกคน login ใหม่
- ทดสอบ: เปิดลิงก์แบบ incognito ไม่ login → ต้องไม่เห็นข้อมูลเลย
- (ความปลอดภัย) หมุน (regenerate) `service_role` key ทิ้งได้ — แอปใช้แค่ anon key
- **ถ้าพัง:** รัน ROLLBACK block ที่คอมเมนต์ไว้หัวไฟล์ `supabase/rls-phase4.sql` ปิด RLS กลับทันที

### เพิ่ม / แก้ผู้ใช้ภายหลัง
แก้ `app/config.js → USERS` (username / displayName / role — **ห้ามใส่ password**)
แล้วเปิด `tools/supabase-auth-setup.html` รันซ้ำ (สร้างใหม่ / ตั้งรหัสใหม่ทับของเดิม)

---

## ข้อมูลเริ่มต้น

ฐานข้อมูลใหม่ "ว่างเปล่า" — ไม่มีข้อมูล BIOAXEL / Water POG ปน. ใส่ข้อมูล BIGDREAM ผ่านปุ่มนำเข้า
ในแต่ละหน้า (DATA BANK = เพิ่มบัญชีธนาคาร · DATA PV / DATA AP = นำเข้า Excel · ใบแจ้งหนี้ = นำเข้า ·
Executive Cash Flow = อัป STM + งบกระแสเงินสดรายเดือน) หรือกรอกมือ

**ลำดับที่แนะนำตอนเริ่มใช้:** DATA BANK (ตั้งบัญชี) → บันทึกยอดธนาคาร → DATA AP / DATA PV → ใบแจ้งหนี้ → Bank Daily

## อยากเพิ่มหน้าจาก BIO กลับเข้ามาทีหลัง?

ทำ 3 ที่:
1. ก๊อป `app/page_xxx.jsx` จาก `WebAPP - BIO` มาไว้ใน `app/`
2. เพิ่ม `<script type="text/babel" src="app/page_xxx.jsx?v=...">` ใน `index.html`
3. เพิ่มใน `app/app.jsx` → `PAGE_GROUPS` (เมนู) + `routes` (ชื่อหน้า) + `case` ใน switch (route)

ถ้าหน้านั้นเรียก helper ที่หายไป ให้ดูใน `app/shared_bits.jsx` ก่อน — อาจยกมาแล้ว

## ⚠️ การดูแลต่อไป: 3 codebase แยกกัน

Water POG · BIOAXEL · BIGDREAM ใช้โค้ดรากเดียวกันแต่แยก repo. แก้บั๊ก/เพิ่มฟีเจอร์ที่อยากได้หลายบริษัท
ต้องทำหลายที่ (หรือ copy ไฟล์ข้ามกัน — ระวัง `config.js`, คีย์ `bdh-*`, และชื่อบริษัท).
แลกกับการที่ข้อมูลการเงินแต่ละบริษัทไม่ปนกันเด็ดขาด

---
**สถานะตอนนี้ (2026-09-07):** ✅ STEP 1 · 2 · 3 · 5 เสร็จ — เว็บทำงานเต็มระบบ + ล็อกความปลอดภัยแล้ว
· ⬜ **เหลือ STEP 4 อย่างเดียว** (สร้าง GitHub repo + เปิด Pages ให้ขึ้นออนไลน์)

> ✅ RLS เปิดแล้ว ⇒ push ขึ้น repo public ได้อย่างปลอดภัย — anon key ที่ติดไปกับโค้ด
> อ่าน/เขียนอะไรไม่ได้ถ้าไม่ login จริง (ตรวจแล้ว: anon อ่าน 0 แถว · เขียนโดนปฏิเสธ · สมัครเองไม่ได้)
>
> ก่อน push ทุกครั้ง: บั๊มพ์ `?v=` ใน `index.html` และเช็คว่า `config.js` ไม่มี `password` หลงเหลือ
