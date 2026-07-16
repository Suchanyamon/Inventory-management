-- =====================================================================
-- 0009_storage_location.sql — ตำแหน่งเก็บสินค้า (PWC19)
--   sync จาก Google Sheet "Layout PWC19" > "Storage Location PWC19"
--   ผูกกับ product ตาม prefix ของ sku (รหัสรุ่น)
-- =====================================================================
create table if not exists public.storage_location (
  code       text primary key,             -- รหัสรุ่น (prefix ของ SKU) เช่น 01PK093
  locations  text not null,                 -- ตำแหน่งเก็บรวม เช่น "A1 01, A1 02"
  category   text,
  grade      text,
  source     text not null default 'Layout PWC19',
  synced_at  timestamptz not null default now()
);
comment on table public.storage_location is 'ตำแหน่งเก็บสินค้าใน PWC19 (ต่อรหัสรุ่น)';

alter table public.product add column if not exists storage_location text;
comment on column public.product.storage_location is 'ตำแหน่งเก็บ (denormalized จาก storage_location ตาม prefix ของ sku)';

alter table public.storage_location enable row level security;
drop policy if exists p_storage_read on public.storage_location;
create policy p_storage_read on public.storage_location for select using (auth.uid() is not null);
drop policy if exists p_storage_admin on public.storage_location;
create policy p_storage_admin on public.storage_location for all using (public.is_admin()) with check (public.is_admin());
grant select on public.storage_location to authenticated;

-- repopulate product.storage_location จาก storage_location (prefix match, รหัสยาวสุดชนะ)
create or replace function public.sp_refresh_product_storage()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update product p set storage_location = null where storage_location is not null;
  update product p
  set storage_location = sub.locations
  from (
    select p2.id, sl.locations
    from product p2
    join lateral (
      select locations from storage_location sl
      where p2.sku like sl.code || '%'
      order by length(sl.code) desc limit 1
    ) sl on true
  ) sub
  where p.id = sub.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.sp_refresh_product_storage() from public, anon, authenticated;
