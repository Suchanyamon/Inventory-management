-- Deduplicate Inv.Ratio / DSI rows and prevent duplicate chart points.
-- The source sheet can contain more than one month table block; keep the row
-- with the highest Inv.Ratio for each sheet + business + month.

with ranked as (
  select
    id,
    row_number() over (
      partition by sheet, business, month_idx
      order by coalesce(inv_ratio, 0) desc, coalesce(dsi, 0) desc, id desc
    ) as rn
  from public.inv_turnover
)
delete from public.inv_turnover t
using ranked r
where t.id = r.id
  and r.rn > 1;

create unique index if not exists inv_turnover_sheet_business_month_idx_key
  on public.inv_turnover(sheet, business, month_idx);
