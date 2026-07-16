// =====================================================================
// compute-reorder.mjs — คำนวณ Reorder Point (ROP) + Par จากยอดขายจริง
//
// อินพุต: data/sales_history.json = [{ "sku": "...", "qty_sold": 1234, "days": 365 }, ...]
//   (สรุปยอดขายย้อนหลังต่อ SKU — ดึงจากชีต "DATA ยอดขาย 2025" / "ยอดขายย้อนหลัง 2025")
//
// สูตร:
//   avg_daily     = qty_sold / days
//   safety_stock  = avg_daily * SAFETY_DAYS
//   ROP           = avg_daily * LEAD_TIME_DAYS + safety_stock         (ปัดขึ้นกล่องเต็ม)
//   par_level     = avg_daily * (LEAD_TIME_DAYS + REVIEW_DAYS) + safety (ปัดขึ้นกล่องเต็ม)
//
// รัน:  node scripts/compute-reorder.mjs
// =====================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEAD = Number(process.env.DEFAULT_LEAD_TIME_DAYS || 14);
const SAFETY_DAYS = Number(process.env.SAFETY_DAYS || 7);
const REVIEW_DAYS = Number(process.env.REVIEW_DAYS || 30);

if (!URL || !KEY) {
  console.error("❌ ต้องตั้ง NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const salesPath = join(__dirname, "..", "data", "sales_history.json");
if (!existsSync(salesPath)) {
  console.error(`❌ ไม่พบ ${salesPath}
สร้างไฟล์รูปแบบ: [{ "sku": "01CA001M4000M", "qty_sold": 1200, "days": 365 }, ...]
(สรุปยอดขายย้อนหลังต่อ SKU จากชีต DATA ยอดขาย 2025)`);
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const sales = JSON.parse(readFileSync(salesPath, "utf8"));
const roundUpBox = (x, box) => (box && box > 0 ? Math.ceil(x / box) * box : Math.ceil(x));

async function main() {
  const { data: prods } = await db.from("product").select("id, sku, box_pack_size");
  const bySku = Object.fromEntries(prods.map((p) => [p.sku, p]));
  let updated = 0;

  for (const s of sales) {
    const p = bySku[s.sku];
    if (!p || !s.days || s.days <= 0) continue;
    const avgDaily = s.qty_sold / s.days;
    const safety = avgDaily * SAFETY_DAYS;
    const rop = roundUpBox(avgDaily * LEAD + safety, p.box_pack_size);
    const par = roundUpBox(avgDaily * (LEAD + REVIEW_DAYS) + safety, p.box_pack_size);
    const { error } = await db
      .from("product")
      .update({ reorder_point: rop, par_level: par, reorder_is_auto: true })
      .eq("id", p.id);
    if (!error) updated++;
    if (updated % 200 === 0) process.stdout.write(`\rอัปเดต ${updated}…`);
  }
  console.log(`\n✓ คำนวณ ROP/Par จากยอดขายแล้ว ${updated} SKU (lead ${LEAD} วัน, safety ${SAFETY_DAYS} วัน)`);
}
main().catch((e) => { console.error("❌", e.message || e); process.exit(1); });
