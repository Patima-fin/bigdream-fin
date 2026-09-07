/* =====================================================================
 * BIGDREAM Financial Console — Configuration
 * =====================================================================
 *  เว็บแยกต่างหากจาก BIOAXEL และ Water POG — ใช้โค้ดชุดเดียวกัน (ตัดเหลือ 10 หน้า)
 *  แต่ "ฐานข้อมูล / โดเมน auth / ทีมผู้ใช้ / โฮสติ้ง" แยกกันคนละชุด ไม่ปนกัน
 *
 *  ★★ ต้องทำก่อนใช้งานครั้งแรก (ดู NEXT-STEPS-BIGDREAM.md ที่ root) ★★
 *   1) สร้าง Supabase project ใหม่ของ BIGDREAM → รัน supabase/schema.sql
 *      + supabase/cashflow-present.sql ใน SQL Editor (ยัง "ไม่ต้อง" รัน rls-phase4.sql)
 *   2) เอา Project URL + anon public key (Project Settings → API) มาวางด้านล่าง
 *   3) login ด้วย admin + รหัสชั่วคราว (USE_SUPABASE_AUTH:false) → ตรวจว่าใช้งานได้
 *   4) ภายหลังค่อยเปิด Supabase Auth + RLS (docs/supabase-phase4-auth-guide.md)
 *      แล้วจึงตั้ง USE_SUPABASE_AUTH:true + ลบ password ออกจาก USERS
 * ===================================================================== */

window.WTP_CONFIG = {
  // ── Backend ───────────────────────────────────────────────────────
  //  'supabase' = Postgres + Realtime (อ่านหลังเขียนเห็นทันที, push, เขียนทีละแถว)
  BACKEND: 'supabase',

  // ── Supabase ของ BIGDREAM ─────────────────────────────────────────
  //  ⚠️ ยังว่าง — ต้องกรอก 2 ค่านี้จาก Supabase project ใหม่ (Project Settings → API)
  //     SUPABASE_URL      = Project URL (เช่น https://xxxxxxxx.supabase.co)
  //     SUPABASE_ANON_KEY = anon public / publishable key (อยู่ฝั่ง client ได้)
  //  ★ ต้องเป็นคนละ project กับ BIOAXEL (tfcxbcekxwnncdqiqzav) และ Water POG
  //    (kibxevldnzquwulcyegr) — ข้อมูลแยก 100%
  SUPABASE_URL: 'https://dkdxyuqmkujnktemhwxf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZHh5dXFta3Vqbmt0ZW1od3hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MTY2NzAsImV4cCI6MjEwMzk5MjY3MH0.FgCpNthhEMcth9HZA4pNLElf5bm7COikdULO3BdCcn8',

  // Phase 4 — login จับคู่ username → อีเมลภายใน "<username>@<domain>" (อีเมลปลอม ไม่ส่งจริง)
  //   ★ ค่านี้ต้องตรงกันระหว่าง tools/supabase-auth-setup.html กับ login
  AUTH_EMAIL_DOMAIN: 'bigdream.app',

  // ── รหัสแบรนด์ (ใช้เป็น prefix ชื่อไฟล์ตอนเซฟ PDF/Excel ฯลฯ) ─────────
  //   BIGDREAM = 'BDH' · BIOAXEL = 'BIO' · Water POG = 'WTP'
  BRAND_CODE: 'BDH',

  // ── โหมด login ────────────────────────────────────────────────────
  //  false = bootstrap: ตรวจ username/รหัสกับ USERS ด้านล่าง (ต้องปิด RLS อยู่)
  //          → ใช้ตอนตั้งระบบครั้งแรก เพื่อทดสอบว่าเว็บต่อ Supabase ใหม่ได้
  //  true  = production: login ผ่าน Supabase Auth (รหัส hash ฝั่ง server, role จาก
  //          app_metadata) — เปิดหลังสร้าง Auth users + รัน rls-phase4.sql แล้ว
  //  ★ 2026-09-07 go-live: สร้าง Auth users + รัน rls-phase4.sql แล้ว → ต้องเป็น true
  //    ถ้าเป็น false ตอน RLS เปิดอยู่ → login วิ่งเป็น anon → RLS บล็อก → จอว่าง
  USE_SUPABASE_AUTH: true,

  // ไม่ใช้ Google Sheet — ทุก entity อยู่ใน Supabase (เว้นว่างทั้งคู่)
  SHEET_ID: '',
  APPS_SCRIPT_URL: '',

  AUTO_REFRESH_MS: 120000,  // 2 นาที
  ROW_LEVEL_SYNC: true,

  // ── ผู้ใช้ระบบ BIGDREAM ────────────────────────────────────────────
  //  ★ แก้รายชื่อจริงที่นี่. ตอน bootstrap (USE_SUPABASE_AUTH:false) "ทุกคนที่ต้อง
  //    login ต้องมี password" ในนี้. หลังเปิด Supabase Auth ให้ "ลบ password ออก"
  //    แล้วสร้างผู้ใช้+รหัสผ่านที่ tools/supabase-auth-setup.html แทน
  //    (อย่าทิ้งรหัสไว้ใน repo public)
  //  Roles: viewer (ดู) · staff (แก้ได้ ลบไม่ได้) · manager (ทุกอย่าง+users) · owner (ดูอย่างเดียว)
  //  ★ USE_SUPABASE_AUTH:true แล้ว → "ไม่เช็ค password ที่นี่" (login ผ่าน Supabase Auth)
  //    รายการนี้เหลือไว้เป็น "directory" (ชื่อ/role) ให้บางหน้ารู้จักผู้ใช้ + เป็นรายชื่อตั้งต้น
  //    ของ tools/supabase-auth-setup.html — ห้ามใส่ password กลับเข้ามาเด็ดขาด (repo เป็น public)
  USERS: [
    { username: 'admin', displayName: 'ผู้ดูแลระบบ', role: 'manager' },
  ],

  SESSION_TTL_MS: 8 * 60 * 60 * 1000,   // 8 ชั่วโมง
  IDLE_LOGOUT_MS: 30 * 60 * 1000,       // 30 นาที — เด้งออกเมื่อไม่ได้ใช้งาน
  FORCE_LOGOUT_BEFORE: 1788755083852,   // 2026-09-07 go-live: บังคับทุกคน re-login ผ่าน Supabase Auth (รหัสใหม่) หลังเปิด RLS
                                        //   session bootstrap เก่าที่ค้างอยู่จะถูกเด้งออกทันทีที่โหลดโค้ดใหม่
  PRESENCE_HEARTBEAT_MS: 5 * 60 * 1000, // 5 นาที — "ใครออนไลน์"

  // auto-push เฉพาะตอนผู้ใช้แก้จริง (กันแท็บค้างดันข้อมูลหาย) — ปุ่มบันทึก (forceSyncNow) ข้าม gate นี้เสมอ
  AUTO_PUSH_REQUIRES_ACTIVITY: true,
  AUTO_PUSH_ACTIVITY_WINDOW_MS: 2 * 60 * 1000,
};
