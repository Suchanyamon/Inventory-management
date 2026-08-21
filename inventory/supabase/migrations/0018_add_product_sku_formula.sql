-- =====================================================================
-- 0018_add_product_sku_formula.sql
-- เก็บรหัส "สูตร" จาก Google Sheet tab "DATA SKU 25-06-2026"
-- เพื่อใช้อ้างอิงการคำนวณขนาดบรรจุ/กล่อง และกล่องเต็ม+เศษ
-- =====================================================================

alter table public.products
  add column if not exists sku_formula text;

comment on column public.products.sku_formula is
  'รหัสสูตรจาก DATA SKU 25-06-2026 ใช้ผูก SKU กับขนาดบรรจุ/กล่อง';
