-- =====================================================================
-- 0005_grants.sql — สิทธิ์ให้ PostgREST (anon/authenticated) เข้าถึง
--   ตาราง: มี RLS คุมอยู่แล้ว / view: อ่านได้เมื่อ login
-- =====================================================================

grant usage on schema public to anon, authenticated;

-- ตาราง (RLS ยังบังคับ row-level อยู่)
grant select on public.profiles, public.warehouse, public.product, public.lot, public.stock_movement to authenticated;

-- views (สรุป/รายงาน)
grant select on
  public.v_stock_balance,
  public.v_stock_balance_lot,
  public.v_product_stock,
  public.v_stock_valuation,
  public.v_reorder_list,
  public.v_near_expiry,
  public.v_valuation_by_warehouse,
  public.v_valuation_by_category
to authenticated;

-- realtime: broadcast ความเคลื่อนไหวสต๊อก (dashboard อัปเดตสด)
do $$ begin
  alter publication supabase_realtime add table public.stock_movement;
exception when duplicate_object then null; when undefined_object then null; end $$;
