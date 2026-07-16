-- =====================================================================
-- 0011_monthly_flow.sql — มูลค่า Input/Output รายเดือน (แดชบอร์ด)
--   sync จาก Excel "_DATA Inventory _ Month 2026" > "มูลค่าสต๊อก Week+In-Out รวม"
--   aggregate: กลุ่มธุรกิจ x หมวด x เดือน (ดู scripts/build-monthly-flow.py)
-- =====================================================================
create table if not exists public.monthly_flow (
  id           bigint generated always as identity primary key,
  business     text not null,             -- Uniform/Fashion/Merchandise/Other
  category     text not null,             -- ประเภทสินค้า (หมวด)
  month        text not null,             -- Jan..Dec
  month_idx    integer not null,          -- 0..11
  input_value  numeric(16,2) not null default 0,
  output_value numeric(16,2) not null default 0,
  source       text not null default '_DATA Inventory Month 2026',
  synced_at    timestamptz not null default now()
);
comment on table public.monthly_flow is 'มูลค่า Input/Output รายเดือน แยกกลุ่มธุรกิจ+หมวด';
create index if not exists idx_mflow_biz on public.monthly_flow(business);

alter table public.monthly_flow enable row level security;
drop policy if exists p_mflow_read on public.monthly_flow;
create policy p_mflow_read on public.monthly_flow for select using (auth.uid() is not null);
drop policy if exists p_mflow_admin on public.monthly_flow;
create policy p_mflow_admin on public.monthly_flow for all using (public.is_admin()) with check (public.is_admin());
grant select on public.monthly_flow to authenticated;
