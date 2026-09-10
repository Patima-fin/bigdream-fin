-- =====================================================================
-- BIGDREAM — ตาราง cfCoding (หน้า "งบกระทบยอดกระแสเงินสด" #cf_coding)
-- =====================================================================
-- รันใน Supabase SQL Editor ครั้งเดียว — ใน "Supabase project ของ BIGDREAM" เท่านั้น
-- (คนละ project กับ BIOAXEL / Water POG) และต้องรัน schema.sql ก่อนไฟล์นี้เสมอ
-- รันซ้ำได้ ไม่พัง (idempotent)
--
-- เก็บ 4 ชนิดแถว (blob ต่อ id — อ่าน/เขียนผ่าน WTPData.fetchSheetRows/writeTable
-- เพราะ cfCoding ∈ SHEET_TABLES ใน app/data_supabase.js):
--   id = 'master' → ผังหมวด        { items:[{name,act,group,flow?}] }
--   id = 'rules'  → กฎที่เรียนรู้   { map: { "doc:…"|"vendor:…"|"memo:…"|"text:…" : {cat,n,by,at} } }
--   id = 'extra'  → รายการนอก PV   { rows:[{id,iso,docNo,payee,memo,acctRaw,dir,amount}] }
--   id = 'manual' → ยอดต้นงวด      { opening: { "<เลขบัญชี>": number } }
--
-- ★ ไม่มี id 'lines:…' แบบ BIOAXEL — BIGDREAM ใช้ PEAK ซึ่งรายการทั้งหมดตรงกับ
--   ตาราง pvVouchers อยู่แล้ว หน้านี้จึงอ่านจากที่นั่น ไม่เก็บข้อมูลดิบซ้ำอีกก้อน
--
-- ⚠️ หลังรันไฟล์นี้ ต้องรัน rls-phase4.sql ใหม่อีกครั้ง (รายชื่อตารางในนั้นมี cfCoding แล้ว)
--    ไม่งั้นตารางนี้จะไม่มี policy ⇒ อ่านได้ 0 แถวเสมอเมื่อเปิด RLS
-- =====================================================================

create table if not exists "cfCoding" ("id" text primary key, "data" jsonb not null default '{}', "updated_at" timestamptz not null default now());

-- trigger updated_at (ใช้ฟังก์ชัน public.set_updated_at() ที่สร้างไว้ใน schema.sql แล้ว)
drop trigger if exists set_updated_at on "cfCoding";
create trigger set_updated_at before update on "cfCoding" for each row execute function public.set_updated_at();

create index if not exists "cfCoding_data_gin" on "cfCoding" using gin (data);

-- realtime (เผื่อแท็บที่เปิดค้างอัปเดตเอง — optional · add ซ้ำจะ error จึงกลืนไว้)
do $$ begin alter publication supabase_realtime add table "cfCoding"; exception when others then null; end $$;

-- grant (RLS คุมจริงอีกชั้นใน rls-phase4.sql)
grant all on "cfCoding" to anon, authenticated, service_role;

-- ── RLS: อ่านได้ทุกคนที่ล็อกอิน · เขียนได้เฉพาะ staff/manager ──
--    (ตั้งไว้ตรงนี้ด้วย เผื่อรันไฟล์นี้ทีหลัง rls-phase4.sql — ค่าเดียวกันเป๊ะ รันซ้ำได้)
--    ★ ช่วง bootstrap ที่ยังไม่ได้ทำ STEP 5: rls-off-bootstrap.sql จะปิด RLS ให้เองอยู่แล้ว
alter table "cfCoding" enable row level security;
do $$ begin
  drop policy if exists p_read  on "cfCoding";
  drop policy if exists p_write on "cfCoding";
  create policy p_read  on "cfCoding" for select to authenticated using (true);
  create policy p_write on "cfCoding" for all to authenticated
    using (public.auth_role() in ('staff','manager')) with check (public.auth_role() in ('staff','manager'));
exception when undefined_function then
  -- ยังไม่ได้รัน rls-phase4.sql (ยังไม่มี public.auth_role()) → ปิด RLS ไว้ก่อนเหมือนตารางอื่นช่วง bootstrap
  alter table "cfCoding" disable row level security;
end $$;
