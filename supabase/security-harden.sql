-- =====================================================================
-- BIGDREAM — ล็อก search_path ของฟังก์ชัน (เก็บ warning จาก Security Advisor)
-- =====================================================================
-- ที่มา (2026-09-09): หลังแก้ rls_disabled_in_public เสร็จ (0 errors) เหลือ warning
--   `Function Search Path Mutable` ที่ public.set_updated_at และ public.auth_role
--
-- ปัญหา: ฟังก์ชันที่ไม่ตั้ง search_path จะค้นชื่อ object ตาม search_path ของ "ผู้เรียก"
--   ⇒ ถ้ามีใครสร้าง object ชื่อซ้ำในสคีมาที่ถูกค้นก่อน ฟังก์ชันจะไปเรียกของปลอม
--   auth_role() เป็นตัวตัดสิน "ใครเขียน DB ได้" ในทุก policy ⇒ ควรล็อกให้แน่น
--
-- ความเสี่ยงจริงของเรา: ต่ำ — ทั้งคู่เป็น SECURITY INVOKER (ไม่ใช่ DEFINER) และ
--   auth_role() เรียก auth.jwt() แบบระบุสคีมาอยู่แล้ว · แก้ไว้เป็น defense-in-depth
--
-- ทำไม `search_path = ''` ถึงไม่พัง:
--   set_updated_at → ใช้แค่ now() (อยู่ pg_catalog ซึ่ง Postgres ค้นให้เสมอโดยปริยาย)
--   auth_role      → ใช้ auth.jwt() (ระบุสคีมาแล้ว) + coalesce/-> /->> (pg_catalog)
--   ⇒ ไม่มีตัวไหนพึ่ง search_path เลย
--
-- รันซ้ำได้ ไม่พัง · ไม่แตะข้อมูล/ตาราง/policy
-- ⚠️ ดูชื่อ project มุมซ้ายบนให้เป็น `bigdream-fin` ก่อนกด Run
-- =====================================================================

alter function public.set_updated_at() set search_path = '';
alter function public.auth_role()      set search_path = '';

-- =====================================================================
-- ตรวจผล — ต้องได้ 2 แถว และช่อง search_path ต้องเป็น "search_path=" ทั้งคู่
-- =====================================================================
select p.proname                                   as function_name,
       coalesce(array_to_string(p.proconfig, ', '),
                '⚠️ ยังไม่ได้ตั้ง')                as search_path,
       case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('set_updated_at', 'auth_role')
order by 1;

-- =====================================================================
-- หลังรัน: ทดสอบว่า trigger + RLS ยังทำงาน (ฟังก์ชันทั้งคู่ถูกเรียกจริงตอนเขียน)
--   เปิดเว็บ → login เป็น manager/staff → แก้อะไรสักอย่าง → ต้องเซฟผ่าน
--   ถ้าเขียนไม่ผ่าน (42501) = auth_role() พัง → ย้อนกลับด้วย:
--     alter function public.auth_role() reset search_path;
--     alter function public.set_updated_at() reset search_path;
-- =====================================================================
