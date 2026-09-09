-- =====================================================================
-- BIGDREAM — ปิดรูรั่ว RLS ของ bankReconBook / bankReconMatch
-- =====================================================================
-- ที่มา (2026-09-09): Supabase Security Advisor เตือน `rls_disabled_in_public`
--   ลำดับที่ทำไว้ตอนตั้งระบบ:
--     1) bankrecon-express.sql  → สร้าง 2 ตาราง + เปิด RLS ให้เรียบร้อย
--     2) rls-off-bootstrap.sql  → "ปิด RLS ทุกตารางใน public" (วนลูปจริง) ⇒ 2 ตัวนี้โดนปิดด้วย
--     3) rls-phase4.sql         → เปิดคืนจาก "รายชื่อ hardcode" ที่ไม่มี 2 ตัวนี้ ⇒ ค้างเปิดโล่ง
--   ผล: ใครถือ anon key (อยู่ใน repo public) ก็อ่าน/เขียน/ลบ 2 ตารางนี้ได้
--   ตารางเป็นตารางเปล่า (BDH ตัดหน้ากระทบยอดออก) แต่ "เขียนได้" ⇒ ต้องปิด
--
-- ไฟล์นี้ตั้ง policy ให้เหมือน 25 ตารางอื่นใน rls-phase4.sql เป๊ะ:
--   อ่าน = ทุก role ที่ login · เขียน = staff/manager เท่านั้น · anon = แตะไม่ได้
-- รันซ้ำได้ ไม่พัง · ไม่มี drop/delete/truncate ข้อมูล
--
-- ⚠️ ดูชื่อ project มุมซ้ายบนให้เป็น `bigdream-fin` ก่อนกด Run
-- =====================================================================

-- ต้องมี public.auth_role() อยู่ก่อน (rls-phase4.sql สร้างไว้แล้ว) — เผื่อไว้กรณีรันไฟล์นี้เดี่ยว ๆ
create or replace function public.auth_role()
returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'viewer');
$$;

do $$
declare
  t text;
  ents text[] := array['bankReconBook','bankReconMatch'];
begin
  foreach t in array ents loop
    execute format('alter table %I enable row level security', t);
    -- ล้าง policy เดิมทั้งชุด: ทั้งชื่อแบบ rls-phase4 และชื่อเดิมจาก bankrecon-express.sql
    execute format('drop policy if exists p_read  on %I', t);
    execute format('drop policy if exists p_write on %I', t);
    execute format('drop policy if exists %I on %I', t || '_read',  t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy p_read on %I for select to authenticated using (true)', t);
    execute format($f$create policy p_write on %I for all to authenticated
        using (public.auth_role() in ('staff','manager'))
        with check (public.auth_role() in ('staff','manager'))$f$, t);
  end loop;
end $$;

-- =====================================================================
-- ตรวจผล — รัน 2 คิวรีนี้ต่อ
-- =====================================================================

-- (ก) ตารางใน public ที่ยัง "ปิด RLS" อยู่ → ต้องได้ "Success. No rows returned"
--     ถ้ามีชื่ออื่นโผล่มา = ยังมีตารางที่หลุด ให้ส่งชื่อมาดู
select c.relname as rls_still_off
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- (ข) ตารางที่ "เปิด RLS แต่ไม่มี policy" → อ่านได้ 0 แถวเงียบ ๆ (กับดักเดิมตอน bootstrap)
--     ต้องได้ "Success. No rows returned" เช่นกัน
select c.relname as rls_on_but_no_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
order by 1;
