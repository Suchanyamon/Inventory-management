// =====================================================================
// sync-turnover.mjs — อัปเดต Inv.Ratio + DSI จาก Excel → DB
//   ① สกัดจาก Excel (python build-inv-turnover.py)  ② refresh ตาราง inv_turnover
//   รัน:  npm run sync-turnover
//   ต้องมีใน .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY + python/pyxlsb
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
execSync(`${PY} scripts/build-inv-turnover.py`, { stdio: "inherit", cwd: root });

const rows = JSON.parse(readFileSync(join(root, "data", "inv_turnover.json"), "utf8"));
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

console.log(`② อัปเดต inv_turnover (${rows.length} แถว)…`);
const { error: delErr } = await db.from("inv_turnover").delete().gte("id", 0);
if (delErr) throw delErr;
for (const part of chunk(rows, 500)) {
  const { error } = await db.from("inv_turnover").insert(part);
  if (error) throw error;
}
console.log("🎉 อัปเดต Inv.Ratio + DSI สำเร็จ");
