-- =====================================================================
-- 0016_order_form_size.sql — ข้อมูลรายไซส์สำหรับ "แบบฟอร์มขออนุมัติสั่งผลิตฯ"
--   แหล่ง: แถวไซส์ในหน้า "สั่งสต๊อก …" (Rev.00 สั่งสต๊อก Product 2026)
--   คอลัมน์ (0-index): 0=รหัส 1=ชื่อ 4=เกรด 5=SIZE(+ญ/ช) 8=WIP 9=สต็อกปัจจุบัน
--     10=จำนวนที่ต้องการสั่งเพิ่ม(Reorder Point) 16=เป้าหมายยอดขายต่อปี
--   สต็อก+WIP = 8+9 · ขอผลิต = ปัด col10 เต็มสิบ(≥0) · +รออนุมัติ = สต็อก+WIP+ขอผลิต
-- =====================================================================
create table if not exists public.order_form_size (
  id             bigint generated always as identity primary key,
  category       text not null,
  code           text not null,
  name           text,
  grade          text,
  annual_target  numeric,
  size_raw       text not null,
  current_stock  numeric,
  wip            numeric,
  reorder_point  numeric,
  source         text not null default 'Rev.00 สั่งสต๊อก 2026',
  synced_at      timestamptz not null default now()
);
comment on table public.order_form_size is 'ข้อมูลรายไซส์สำหรับแบบฟอร์มขออนุมัติสั่งผลิตสินค้าสำเร็จรูป';
create index if not exists idx_order_form_size_code on public.order_form_size(code);

alter table public.order_form_size enable row level security;

drop policy if exists p_order_form_read on public.order_form_size;
create policy p_order_form_read on public.order_form_size for select using (auth.uid() is not null);

drop policy if exists p_order_form_admin on public.order_form_size;
create policy p_order_form_admin on public.order_form_size for all using (public.is_admin()) with check (public.is_admin());

grant select on public.order_form_size to authenticated;
