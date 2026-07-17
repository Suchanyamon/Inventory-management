"use client";
import { useState } from "react";

interface Res { source: string; ok: boolean; count?: number; error?: string; }

export default function SyncButton() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Res[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setResults(null);
    try {
      const r = await fetch("/api/sync", { method: "POST" });
      const j = await r.json();
      if (!r.ok) setErr(j.error || "sync ล้มเหลว");
      else setResults(j.results);
    } catch (e) {
      setErr("เชื่อมต่อไม่ได้ (อาจใช้เวลานานเกินกำหนด)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button onClick={run} disabled={busy} className="btn-primary">
        {busy ? "⏳ กำลัง Sync…" : "🔄 Sync ข้อมูล"}
      </button>
      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
      {results && (
        <div className="card w-full max-w-md p-3 text-xs md:w-80">
          <div className="mb-1 font-medium text-slate-500">ผล Sync ล่าสุด</div>
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate">{r.ok ? "✅" : "❌"} {r.source}</span>
                <span className={r.ok ? "text-emerald-600" : "text-red-600"}>
                  {r.ok ? `${r.count ?? 0} แถว` : (r.error || "ผิดพลาด")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
