// โหลด .env.local เข้า process.env อัตโนมัติ (ไม่ต้องพึ่ง dependency)
// ให้สคริปต์ sync-* อ่าน NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ได้เลย
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
for (const f of [".env.local", ".env"]) {
  try {
    const txt = readFileSync(join(dir, "..", f), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* ไม่มีไฟล์ก็ข้าม */ }
}
