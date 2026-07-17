-- =====================================================================
-- 0012_inv_turnover.sql — Inv.Ratio + DSI รายเดือน (แดชบอร์ด)
--   sync จาก Excel "_DATA Inventory _ Month 2026" หน้า "Inv.Trun Over*"
--   3 หน้า: Over / Over Runitem (Runitem) / Over F (F)
-- =====================================================================
create table if not exists public.inv_turnover (
  id         bigint generated always as identity primary key,
  sheet      text not null,             -- Over / Runitem / F
  business   text not null,             -- Uniform / Merchandise / Fashion / YTD
  month      text not null,
  month_idx  integer not null,
  inv_ratio  numeric(16,6),             -- Inv.Ratio
  dsi        numeric(14,2),             -- DSI (Days) 2026
  source     text not null default '_DATA Inventory Month 2026',
  synced_at  timestamptz not null default now()
);
comment on table public.inv_turnover is 'Inv.Ratio + DSI รายเดือน (แยกกลุ่มธุรกิจ x หน้า Inv.Trun)';
create index if not exists idx_invturn on public.inv_turnover(sheet, business);

alter table public.inv_turnover enable row level security;
drop policy if exists p_invturn_read on public.inv_turnover;
create policy p_invturn_read on public.inv_turnover for select using (auth.uid() is not null);
drop policy if exists p_invturn_admin on public.inv_turnover;
create policy p_invturn_admin on public.inv_turnover for all using (public.is_admin()) with check (public.is_admin());
grant select on public.inv_turnover to authenticated;
