# ระบบจัดการคลังสินค้า (Wholesale Inventory Management)

Next.js (App Router) + Supabase (Postgres/Auth/Realtime) + Vercel · ภาษาไทย · Asia/Bangkok

คลังในสโคป: **DCMT**, **DCMTA** — ข้อมูลตั้งต้น ณ 29-06-2026 (2,898 SKU, มูลค่า FIFO ≈ 25.3 ล้านบาท)

---

## หลักการออกแบบ (สำคัญ)

1. **ยอดคงเหลือ = ผลรวมของ `stock_movement` เสมอ** — ไม่มีคอลัมน์ balance ที่แก้ได้
   ledger เป็น *append-only* (trigger บล็อก UPDATE/DELETE) → เป็น audit trail ในตัว
2. **โอนย้าย = 2 แถวผูก `transfer_group_id`** (โอนออก + โอนเข้า) ผลรวม = 0 เสมอ ยอดข้ามคลังไม่มีทางเพี้ยน
3. **`box_pack_size` (ขนาดบรรจุ/กล่อง) ทำงาน 3 หน้าที่**
   - รับเข้า → บอก “กี่กล่องเต็ม + เศษ” ทันที
   - สั่งซื้อ → ปัดจำนวนขึ้นเป็นกล่องเต็มอัตโนมัติ
   - เตือนสั่งเพิ่ม → เทียบ on_hand กับ ROP
4. **FIFO valuation** — เดินชั้น inbound เก่าสุดก่อน (ดู `v_stock_valuation`)
5. **สิทธิ์ 3 บทบาท** — admin / staff / viewer (RLS + ฟังก์ชัน SECURITY DEFINER)

---

## ติดตั้ง

### 1) สร้างโปรเจกต์ Supabase แล้วรัน migration
รันไฟล์ใน `supabase/migrations/` ตามลำดับ (0001 → 0005) ผ่าน SQL Editor หรือ Supabase CLI:
```bash
supabase db push        # ถ้าใช้ CLI
```

### 2) ตั้งค่า env
```bash
cp .env.example .env.local
# เติม NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

### 3) นำเข้าข้อมูลตั้งต้น (คลัง + สินค้า + ยอดยกมา)
```bash
npm install
npm run seed
```

### 4) รัน
```bash
npm run dev      # http://localhost:3000
```

### 5) สร้างผู้ใช้ + ตั้งเป็น admin
- สมัคร/เชิญผู้ใช้ผ่าน Supabase Auth (ค่าเริ่มต้น role = `viewer`)
- อัปเป็น admin:
```sql
update public.profiles set role = 'admin' where id = '<user-uuid>';
```

### 6) (Phase 4) คำนวณ ROP จากยอดขายจริง
สร้าง `data/sales_history.json` = `[{ "sku": "...", "qty_sold": 1200, "days": 365 }, ...]`
(สรุปจากชีต “DATA ยอดขาย 2025”) แล้ว:
```bash
npm run compute-reorder
```

---

## โครงสร้าง

```
supabase/migrations/
  0001_schema.sql     ตาราง + view (ยอดคงเหลือจาก ledger)
  0002_functions.sql  sp_stock_in / sp_stock_out / sp_transfer / sp_adjust + FIFO
  0003_rls.sql        RLS 3 บทบาท + auto-create profile
  0004_alerts.sql     view: reorder, near-expiry, valuation + fn_box_breakdown
  0005_grants.sql     สิทธิ์ PostgREST + realtime
scripts/
  seed.mjs            นำเข้าข้อมูลตั้งต้น
  compute-reorder.mjs คำนวณ ROP/Par จากยอดขาย
data/
  products_seed.json  2,898 SKU (DCMT/DCMTA) + ขนาดบรรจุ/กล่อง
src/app/(app)/        UI: dashboard, operations, scan, products, reorder, reports, movements
```

## หมายเหตุ
- ROP ค่าเริ่มต้น = 1 กล่อง (placeholder) จนกว่าจะรัน `compute-reorder`
- ทุกการเปลี่ยนสต๊อกต้องผ่านฟังก์ชัน `sp_*` (เขียน `stock_movement` ตรงไม่ได้ตาม RLS)
- แก้ยอดผิด = ลง movement `adjust` (นับสต๊อก) ไม่ใช่แก้ประวัติเดิม
