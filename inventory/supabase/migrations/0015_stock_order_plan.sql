-- =====================================================================
-- 0015_stock_order_plan.sql — แผนสั่งสต๊อกระดับรหัสสินค้า (สำหรับแบบฟอร์มขออนุมัติ)
--   sync จากแถวหัวรหัสในหน้า "สั่งสต๊อก …" (Rev.00 สั่งสต๊อก Product 2026)
--   คอลัมน์ต้นทาง (0-index): 0=รหัส 1=ชื่อ 2=เป้าหมายยอดขายต่อปี 4=เกรด
--     8=WIP(ค้างผลิต) 9=สต็อกปัจจุบัน 10=จำนวนที่ต้องการสั่งเพิ่ม(=จุดสั่งซื้อ)
--   สต็อกปัจจุบัน+WIP = 8+9 · จำนวนสั่ง = ปัดจุดสั่งซื้อเป็นเต็มสิบ (คลัมป์ ≥ 0)
-- =====================================================================
create table if not exists public.stock_order_plan (
  id             bigint generated always as identity primary key,
  category       text not null,
  code           text not null,
  name           text,
  grade          text,
  annual_target  numeric,     -- เป้าหมายยอดขายต่อปี
  current_stock  numeric,     -- จำนวนคงคลังปัจจุบัน (สต็อกปัจจุบัน)
  wip            numeric,     -- ค้างผลิต
  stock_wip      numeric,     -- จำนวนคงคลังรวมค้างผลิต (สต็อกปัจจุบัน+WIP)
  reorder_point  numeric,     -- จุดสั่งซื้อ (จำนวนที่ต้องการสั่งเพิ่ม)
  order_qty      numeric,     -- จำนวนที่ต้องการสั่งสินค้า (ปัดเต็มสิบ)
  source         text not null default 'Rev.00 สั่งสต๊อก 2026',
  synced_at      timestamptz not null default now()
);
comment on table public.stock_order_plan is 'แผนสั่งสต๊อกระดับรหัส — สำหรับแบบฟอร์มขออนุมัติสั่งตัดสต๊อก 2026';
create index if not exists idx_order_plan_cat on public.stock_order_plan(category);
create index if not exists idx_order_plan_code on public.stock_order_plan(code);

alter table public.stock_order_plan enable row level security;

drop policy if exists p_order_plan_read on public.stock_order_plan;
create policy p_order_plan_read on public.stock_order_plan for select using (auth.uid() is not null);

drop policy if exists p_order_plan_admin on public.stock_order_plan;
create policy p_order_plan_admin on public.stock_order_plan for all using (public.is_admin()) with check (public.is_admin());

grant select on public.stock_order_plan to authenticated;
