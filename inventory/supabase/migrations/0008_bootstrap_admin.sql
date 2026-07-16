-- =====================================================================
-- 0008_bootstrap_admin.sql — ผู้ใช้คนแรกที่สมัคร = admin อัตโนมัติ
--   (ชื่อเริ่มต้น Suchanyamon.M) ผู้ใช้ถัดไป = viewer
--   ใช้ตอนตั้งระบบครั้งแรก — ไม่ต้องรัน SQL promote เอง
-- =====================================================================
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_first boolean;
begin
  select not exists(select 1 from public.profiles where role = 'admin') into v_first;
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''),
             case when v_first then 'Suchanyamon.M' else new.email end),
    case when v_first then 'admin' else 'viewer' end
  )
  on conflict (id) do nothing;
  return new;
end $$;
