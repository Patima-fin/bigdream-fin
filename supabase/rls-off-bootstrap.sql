-- =====================================================================
-- BIGDREAM — ปิด RLS ทุกตาราง (ช่วง bootstrap เท่านั้น)
-- =====================================================================
-- ใช้เมื่อ: ตอนสร้าง Supabase project ติ๊ก "Enable automatic RLS" ไว้
--   → Supabase ติดตั้ง event trigger ที่เปิด RLS ให้ตารางใหม่ใน schema public
--   → ตารางมี RLS เปิดแต่ "ไม่มี policy" ⇒ อ่านได้ 0 แถวเสมอ (ไม่ error!) + เขียนโดน 42501
--
-- ⚠️ หลังรันไฟล์นี้ = ใครมี anon key ก็อ่าน/เขียน DB ได้ (key อยู่ในหน้าเว็บ)
--    ยอมรับได้เฉพาะช่วงตั้งระบบที่ยัง "ไม่มีข้อมูลจริง"
--    → ก่อนใส่ข้อมูลจริง ต้องทำ STEP 5 (Supabase Auth + rls-phase4.sql) เสมอ
--
-- รันใน SQL Editor หลังรัน schema.sql / pnl-budget.sql / bankrecon-express.sql /
-- cashflow-present.sql / cf-coding.sql ครบแล้ว · รันซ้ำได้ ไม่พัง
-- =====================================================================

-- ── 1) ปิด RLS ทุกตารางใน public ที่ยังเปิดอยู่ (วนลูปจริง ไม่ใช้รายชื่อ hardcode
--       → ครอบคลุมตารางที่ Supabase สร้างเองด้วย) ──────────────────────────
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('alter table %s disable row level security', r.t);
    execute format('alter table %s no force row level security', r.t);
  end loop;
end $$;

-- ── 2) ถอน event trigger ของ "automatic RLS" ───────────────────────────────
--     ไม่งั้นตารางที่สร้างใหม่ในอนาคตจะโดนเปิด RLS อีก แล้วงงว่าทำไมจู่ ๆ อ่านไม่ออก
--     (ชื่อ trigger ต่างกันได้ตามเวอร์ชัน dashboard — ลบเท่าที่เจอ)
drop event trigger if exists enable_rls_on_new_tables;
drop event trigger if exists supabase_enable_rls_on_new_tables;
drop event trigger if exists rls_enable_on_create;

-- =====================================================================
-- ตรวจผล — รัน 3 คิวรีนี้แล้วส่งผลมาให้ผมดู
-- =====================================================================

-- (ก) ตารางที่ยังเปิด RLS อยู่ → ต้องได้ "Success. No rows returned"
select c.relname as still_rls_on
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
order by 1;

-- (ข) event trigger ที่เหลือ → ถ้ามีชื่อที่เกี่ยวกับ rls โผล่มา บอกผมด้วย
select evtname, evtevent, evtenabled from pg_event_trigger order by 1;

-- (ค) สิทธิ์ของ anon บนตารางตัวอย่าง → ควรเห็น SELECT/INSERT/UPDATE/DELETE
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'presence' and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
