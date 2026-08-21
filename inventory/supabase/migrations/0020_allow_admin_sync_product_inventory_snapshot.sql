grant select, insert, update, delete on public.product_inventory_snapshot to authenticated;
grant usage, select on sequence public.product_inventory_snapshot_id_seq to authenticated;

drop policy if exists p_product_inventory_snapshot_insert on public.product_inventory_snapshot;
create policy p_product_inventory_snapshot_insert
  on public.product_inventory_snapshot
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.user_id = (select auth.uid())
        and p.role = 'admin'
        and p.is_active = true
    )
  );

drop policy if exists p_product_inventory_snapshot_update on public.product_inventory_snapshot;
create policy p_product_inventory_snapshot_update
  on public.product_inventory_snapshot
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = (select auth.uid())
        and p.role = 'admin'
        and p.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.user_id = (select auth.uid())
        and p.role = 'admin'
        and p.is_active = true
    )
  );

drop policy if exists p_product_inventory_snapshot_delete on public.product_inventory_snapshot;
create policy p_product_inventory_snapshot_delete
  on public.product_inventory_snapshot
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = (select auth.uid())
        and p.role = 'admin'
        and p.is_active = true
    )
  );
