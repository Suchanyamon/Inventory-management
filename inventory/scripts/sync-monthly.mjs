// =====================================================================
// sync-monthly.mjs — อัปเดต "Input/Output/มูลค่าคงคลัง รายเดือน" จาก Excel → DB
//   ① สกัดจาก Excel ในเครื่อง (python build-monthly-flow.py)
//   ② refresh ตาราง monthly_flow (ลบเก่า→ใส่ใหม่) ผ่าน service role
//   รัน:  npm run sync-monthly
//   ต้องมีใน .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   และมี python + pyxlsb (pip install pyxlsb)
// =====================================================================
import "./_env.mjs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("❌ ต้องตั้ง NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ใน .env.local"); process.exit(1); }

const PY = process.env.PYTHON || "python";
console.log("① สกัดข้อมูลจาก Excel…");
execSync(`${PY} scripts/build-monthly-flow.py`, { stdio: "inherit", cwd: root });

const rows = JSON.parse(readFileSync(join(root, "data", "monthly_flow.json"), "utf8"));
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

console.log(`② อัปเดต monthly_flow (${rows.length} แถว)…`);
const { error: delErr } = await db.from("monthly_flow").delete().gte("id", 0);
if (delErr) throw delErr;
for (const part of chunk(rows, 500)) {
  const { error } = await db.from("monthly_flow").insert(part);
  if (error) throw error;
}
console.log("🎉 อัปเดต Input/Output/คงคลัง รายเดือน สำเร็จ");
