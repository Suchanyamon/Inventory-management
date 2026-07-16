// =====================================================================
// seed.mjs — นำเข้าข้อมูลตั้งต้นจาก data/products_seed.json เข้า Supabase
//   1) upsert คลัง DCMT, DCMTA
//   2) upsert สินค้า (พร้อม box_pack_size + reorder placeholder)
//   3) ลง movement 'opening' = ยอดยกมา ณ 29-06-2026 (idempotent)
//
// รัน:  SUPABASE_SERVICE_ROLE_KEY=xxx NEXT_PUBLIC_SUPABASE_URL=xxx node scripts/seed.mjs
// =====================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("❌ ต้องตั้ง NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const OPENING_REF = "OPENING-2026-06-29";
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const rows = JSON.parse(readFileSync(join(__dirname, "..", "data", "products_seed.json"), "utf8"));
console.log(`อ่าน seed: ${rows.length} SKU`);

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function main() {
  // 1) คลัง
  const { error: whErr } = await db.from("warehouse").upsert(
    [
      { code: "DCMT", name: "คลัง DCMT" },
      { code: "DCMTA", name: "คลัง DCMTA" },
    ],
    { onConflict: "code" }
  );
  if (whErr) throw whErr;
  const { data: whs } = await db.from("warehouse").select("id,code");
  const whId = Object.fromEntries(whs.map((w) => [w.code, w.id]));
  console.log("✓ คลัง:", Object.keys(whId).join(", "));

  // 2) สินค้า
  const products = rows.map((r) => {
    const box = r.box_pack_size && r.box_pack_size > 0 ? Math.round(r.box_pack_size) : null;
    return {
      sku: r.sku,
      name: r.name?.trim() || r.model?.trim() || r.sku,
      category: r.category || null,
      color: r.color || null,
      size: r.size || null,
      model: r.model || null,
      unit: "ตัว",
      box_pack_size: box,
      cost_current: r.cost_current ?? null,
      // placeholder ROP: 1 กล่อง, par = 3 กล่อง (Phase 4 คำนวณจริงจากยอดขาย)
      reorder_point: box ?? null,
      par_level: box ? box * 3 : null,
      reorder_is_auto: false,
      source: "bplus",
      bplus_synced_at: new Date("2026-06-29T00:00:00+07:00").toISOString(),
    };
  });

  let n = 0;
  for (const part of chunk(products, 500)) {
    const { error } = await db.from("product").upsert(part, { onConflict: "sku" });
    if (error) throw error;
    n += part.length;
    process.stdout.write(`\r✓ upsert สินค้า ${n}/${products.length}`);
  }
  console.log("");

  // map sku -> id
  const skuId = {};
  for (const part of chunk(products.map((p) => p.sku), 800)) {
    const { data } = await db.from("product").select("id,sku").in("sku", part);
    for (const p of data) skuId[p.sku] = p.id;
  }

  // 3) opening movements (idempotent)
  const { count } = await db
    .from("stock_movement")
    .select("*", { count: "exact", head: true })
    .eq("ref_doc", OPENING_REF);
  if (count && count > 0) {
    console.log(`⏭  ข้ามยอดยกมา: มี movement ${OPENING_REF} อยู่แล้ว ${count} แถว (ledger append-only)`);
    return;
  }

  const moves = [];
  for (const r of rows) {
    const pid = skuId[r.sku];
    if (!pid) continue;
    const cost = r.cost_current ?? null;
    if (r.dcmt > 0)
      moves.push({ product_id: pid, warehouse_id: whId.DCMT, qty: r.dcmt, m_type: "opening", unit_cost: cost, ref_doc: OPENING_REF, actor_name: "ระบบ (opening sync)" });
    if (r.dcmta > 0)
      moves.push({ product_id: pid, warehouse_id: whId.DCMTA, qty: r.dcmta, m_type: "opening", unit_cost: cost, ref_doc: OPENING_REF, actor_name: "ระบบ (opening sync)" });
  }
  console.log(`ยอดยกมา: ${moves.length} แถว`);
  let m = 0;
  for (const part of chunk(moves, 500)) {
    const { error } = await db.from("stock_movement").insert(part);
    if (error) throw error;
    m += part.length;
    process.stdout.write(`\r✓ ลงยอดยกมา ${m}/${moves.length}`);
  }
  console.log("\n🎉 เสร็จสิ้น seed");
}

main().catch((e) => {
  console.error("\n❌", e.message || e);
  process.exit(1);
});
