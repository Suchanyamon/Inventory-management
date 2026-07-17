// =====================================================================
// sync-reorder.mjs — ซิงก์ "แผนสั่งเพิ่มแยกตาม SIZE" จาก Google Sheets → Supabase
//
//   อ่าน: ทุกหน้าที่ขึ้นต้นด้วย "สั่งสต๊อก" ในไฟล์ Rev.00 (ผ่าน gviz CSV)
//         คอลัมน์ index 10 = "จำนวนที่ต้องการสั่งเพิ่ม", 5 = SIZE, 19 = SKU/ไซส์,
//         4 = เกรด, 1 = ชื่อสินค้า (เก็บเฉพาะค่า > 0)
//   เขียน: refresh ตาราง public.reorder_plan ทั้งหมด (ลบเก่า → ใส่ใหม่)
//
//   รัน:  node scripts/sync-reorder.mjs
//   Cron: ตั้ง GitHub Action / cron ให้รันสคริปต์นี้เป็นระยะได้
//
//   ต้องมี ENV:
//     NEXT_PUBLIC_SUPABASE_URL
//     SUPABASE_SERVICE_ROLE_KEY        (Supabase > Settings > API — ใช้ฝั่ง server เท่านั้น)
//     SHEET_ID  (ไม่บังคับ, ค่าเริ่มต้น = ไฟล์ Rev.00)
//
//   การเข้าถึงชีต (เลือกอย่างใดอย่างหนึ่ง):
//     A) แชร์สเปรดชีตแบบ "ทุกคนที่มีลิงก์ = ผู้อ่าน" แล้ว gviz จะดึงได้ทันที (ง่ายสุด)
//     B) ถ้าต้องการเก็บเป็นส่วนตัว ใช้ Google Service Account แล้วเปลี่ยน fetchSheet()
//        ไปเรียก Sheets API v4 (แชร์ชีตให้อีเมล service account เป็น Viewer)
// =====================================================================
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";

const SHEET_ID = process.env.SHEET_ID || "1j0n4pMjUKM0eATXb-CbJvtzEF4YZSpXLww6PLUh4HGI";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("❌ ต้องตั้ง NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

// หมวด → ชื่อชีต
const SHEETS = [
  ["Kaneko", "สั่งสต๊อก Kaneko"],
  ["CoolPlus", "สั่งสต๊อก CoolPlus"],
  ["Cotton", "สั่งสต๊อก Cotton"],
  ["Anti Bac", "สั่งสต๊อก Anti Bac"],
  ["ช็อป", "สั่งสต๊อก ช็อป"],
  ["คนงาน", "สั่งสต๊อก คนงาน"],
  ["ผ้ากันเปื้อน", "สั่งสต๊อก ผ้ากันเปื้อน"],
];

// คอลัมน์ (0-based) — หัวตารางเป็น merged cell จึง map ตามตำแหน่ง
const COL = { name: 1, grade: 4, size: 5, qty: 10, formula: 18, sku: 19 };

function parseCSV(t) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
      else if (c === "\r") {} else f += c;
    }
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const toNum = (v) => {
  v = (v || "").replace(/[, ]/g, "").replace(/[^0-9.\-]/g, "");
  return v === "" || v === "-" ? null : parseFloat(v);
};
const isCode = (v) => /^[A-Z0-9]{5,}$/.test((v || "").trim());

async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ดึง "${sheetName}" ไม่ได้ (${res.status}) — ตรวจสิทธิ์แชร์ชีต`);
  const txt = await res.text();
  if (txt.startsWith("<")) throw new Error(`"${sheetName}" ต้องแชร์แบบ "ทุกคนที่มีลิงก์ = ผู้อ่าน" หรือใช้ service account`);
  return parseCSV(txt);
}

function extract(rows, category) {
  const out = [];
  let name = "", grade = "";
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r];
    const c0 = (row[0] || "").trim();
    const size = (row[COL.size] || "").trim();
    if (isCode(c0)) { grade = (row[COL.grade] || "").trim(); name = (row[COL.name] || "").trim(); }
    else if (c0 && /[ก-๙]/.test(c0) && c0.length > 2) name = c0;
    if (size && size !== "SIZE") {
      const q = toNum(row[COL.qty]);
      if (q != null && q > 0) {
        out.push({
          category,
          sku: (row[COL.sku] || row[COL.formula] || "").trim() || null,
          name: name || null,
          grade: grade || null,
          size,
          qty: Math.round(q),
        });
      }
    }
  }
  return out;
}

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function main() {
  const all = [];
  for (const [cat, sheet] of SHEETS) {
    const rows = await fetchSheet(sheet);
    const items = extract(rows, cat);
    console.log(`  ${cat.padEnd(14)} ${String(items.length).padStart(4)} รายการ · ${items.reduce((s, x) => s + x.qty, 0)} ตัว`);
    all.push(...items);
  }
  console.log(`รวมทั้งหมด ${all.length} รายการ`);

  // full refresh: ลบเก่าทั้งหมด แล้วใส่ใหม่
  const { error: delErr } = await db.from("reorder_plan").delete().gte("id", 0);
  if (delErr) throw delErr;
  const stamped = all.map((r) => ({ ...r, source: "Rev.00 สั่งสต๊อก 2026", synced_at: new Date().toISOString() }));
  let n = 0;
  for (const part of chunk(stamped, 500)) {
    const { error } = await db.from("reorder_plan").insert(part);
    if (error) throw error;
    n += part.length;
    process.stdout.write(`\r✓ เขียน ${n}/${stamped.length}`);
  }
  console.log(`\n🎉 sync reorder_plan สำเร็จ (${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })})`);
}
main().catch((e) => { console.error("\n❌", e.message || e); process.exit(1); });
