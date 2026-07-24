// =====================================================================
// sync-order-plan.mjs — ซิงก์ "แผนสั่งสต๊อกระดับรหัส" (แบบฟอร์มขออนุมัติ)
//   อ่านเฉพาะแถวหัวรหัสในหน้า "สั่งสต๊อก …" (Rev.00) ผ่าน gviz CSV
//   คอลัมน์ (0-based): 0=รหัส 1=ชื่อ 2=เป้าหมายยอดขายต่อปี 4=เกรด
//     8=WIP 9=สต็อกปัจจุบัน 10=จำนวนที่ต้องการสั่งเพิ่ม(จุดสั่งซื้อ)
//   สต็อกปัจจุบัน+WIP = 8+9 · จำนวนสั่ง = ปัดจุดสั่งซื้อเป็นเต็มสิบ (≥0)
//   รัน: node scripts/sync-order-plan.mjs
// =====================================================================
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";

const SHEET_ID = process.env.SHEET_ID || "1j0n4pMjUKM0eATXb-CbJvtzEF4YZSpXLww6PLUh4HGI";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("❌ ต้องตั้ง NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const SHEETS = [
  ["Kaneko", "สั่งสต๊อก Kaneko"], ["CoolPlus", "สั่งสต๊อก CoolPlus"], ["Cotton", "สั่งสต๊อก Cotton"],
  ["Anti Bac", "สั่งสต๊อก Anti Bac"], ["ช็อป", "สั่งสต๊อก ช็อป"], ["คนงาน", "สั่งสต๊อก คนงาน"], ["ผ้ากันเปื้อน", "สั่งสต๊อก ผ้ากันเปื้อน"],
];

function parseCSV(t) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c === "\r") {} else f += c; }
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const toNum = (v) => { v = (v || "").replace(/[, ]/g, "").replace(/[^0-9.\-]/g, ""); return v === "" || v === "-" ? null : parseFloat(v); };
const isCode = (v) => /^[A-Z0-9]{5,}$/.test((v || "").trim());
const roundTo10 = (n) => Math.round(n / 10) * 10;

async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ดึง "${sheetName}" ไม่ได้ (${res.status})`);
  const txt = await res.text();
  if (txt.startsWith("<")) throw new Error(`"${sheetName}" ต้องแชร์ "ทุกคนที่มีลิงก์ = ผู้อ่าน"`);
  return parseCSV(txt);
}

function extract(rows, category) {
  const out = [];
  for (let r = 3; r < rows.length; r++) {
    const code = (rows[r][0] || "").trim();
    if (!isCode(code)) continue;
    const cur = toNum(rows[r][9]) ?? 0, wip = toNum(rows[r][8]) ?? 0, rp = toNum(rows[r][10]) ?? 0;
    out.push({
      category, code, name: (rows[r][1] || "").trim() || null, grade: (rows[r][4] || "").trim() || null,
      annual_target: toNum(rows[r][2]), current_stock: cur, wip, stock_wip: cur + wip,
      reorder_point: rp, order_qty: rp > 0 ? roundTo10(rp) : 0,
    });
  }
  return out;
}

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function main() {
  const all = [];
  for (const [cat, sheet] of SHEETS) {
    const rows = await fetchSheet(sheet);
    const items = extract(rows, cat);
    const need = items.filter((x) => x.reorder_point > 0).length;
    console.log(`  ${cat.padEnd(14)} ${String(items.length).padStart(4)} รหัส · ต้องสั่ง ${need}`);
    all.push(...items);
  }
  console.log(`รวมทั้งหมด ${all.length} รหัส`);

  const { error: delErr } = await db.from("stock_order_plan").delete().gte("id", 0);
  if (delErr) throw delErr;
  const stamped = all.map((r) => ({ ...r, source: "Rev.00 สั่งสต๊อก 2026", synced_at: new Date().toISOString() }));
  let n = 0;
  for (const part of chunk(stamped, 500)) {
    const { error } = await db.from("stock_order_plan").insert(part);
    if (error) throw error;
    n += part.length; process.stdout.write(`\r✓ เขียน ${n}/${stamped.length}`);
  }
  console.log(`\n🎉 sync stock_order_plan สำเร็จ`);
  // ตัวอย่างตรวจ
  const { data } = await db.from("stock_order_plan").select("code,grade,annual_target,current_stock,wip,stock_wip,reorder_point,order_qty").eq("code", "U01KM0005").maybeSingle();
  console.log("ตัวอย่าง U01KM0005:", JSON.stringify(data));
}
main().catch((e) => { console.error("\n❌", e.message || e); process.exit(1); });
