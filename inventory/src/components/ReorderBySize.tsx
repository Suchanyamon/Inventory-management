"use client";
import { useMemo, useState } from "react";
import { num } from "@/lib/format";

export interface ReorderRow {
  category: string;
  sku: string | null;
  name: string | null;
  grade: string | null;
  size: string | null;
  qty: number;
}

const CAT_ORDER = ["Kaneko", "CoolPlus", "Cotton", "Anti Bac", "ช็อป", "คนงาน", "ผ้ากันเปื้อน"];

export default function ReorderBySize({ rows }: { rows: ReorderRow[] }) {
  const [active, setActive] = useState<string>("ALL");
  const [term, setTerm] = useState("");

  const cats = useMemo(
    () => CAT_ORDER.filter((c) => rows.some((r) => r.category === c)),
    [rows]
  );
  const countByCat = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => (m[r.category] = (m[r.category] || 0) + 1));
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const t = term.toLowerCase().trim();
    return rows.filter(
      (r) =>
        (active === "ALL" || r.category === active) &&
        (!t || r.sku?.toLowerCase().includes(t) || r.name?.toLowerCase().includes(t))
    );
  }, [rows, active, term]);

  const groups = useMemo(() => {
    const list = active === "ALL" ? cats : [active];
    return list
      .map((c) => ({
        cat: c,
        rows: filtered.filter((r) => r.category === c).sort((a, b) => b.qty - a.qty),
      }))
      .filter((g) => g.rows.length > 0);
  }, [filtered, cats, active]);

  const shownCount = filtered.length;
  const shownQty = filtered.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="space-y-4 pb-16">
      <div>
        <h1 className="text-xl font-semibold">ต้องสั่งเพิ่ม — แยกตาม SIZE</h1>
        <p className="text-sm text-slate-500">
          จาก “จำนวนที่ต้องการสั่งเพิ่ม” ในทุกหน้า “สั่งสต๊อก…” (Rev.00 สั่งสต๊อก 2026)
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs text-slate-500">รายการที่ต้องสั่ง (SKU×ไซส์)</div>
          <div className="mt-1 text-2xl font-bold text-brand">{num(shownCount)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">จำนวนรวมที่ต้องสั่ง</div>
          <div className="mt-1 text-2xl font-bold">{num(shownQty)} ตัว</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">หมวดสินค้า</div>
          <div className="mt-1 text-2xl font-bold">{num(cats.length)}</div>
        </div>
      </div>

      {/* category filter buttons */}
      <div className="flex flex-wrap gap-2">
        <FilterBtn label="ทั้งหมด" count={rows.length} active={active === "ALL"} onClick={() => setActive("ALL")} />
        {cats.map((c) => (
          <FilterBtn key={c} label={c} count={countByCat[c]} active={active === c} onClick={() => setActive(c)} />
        ))}
      </div>

      {/* search */}
      <input
        className="input max-w-sm"
        placeholder="🔍 ค้นหา SKU หรือชื่อสินค้า…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      {/* table */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="th">SKU</th>
              <th className="th">ชื่อสินค้า</th>
              <th className="th">เกรด</th>
              <th className="th">SIZE</th>
              <th className="th">หมวด</th>
              <th className="th text-right">จำนวนสั่ง (ตัว)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {groups.map((g) => (
              <FragmentGroup key={g.cat} cat={g.cat} rows={g.rows} />
            ))}
            {groups.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  ไม่พบรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        * แสดงเฉพาะไซส์ที่ต้องสั่ง (ค่า &gt; 0) · ค่าติดลบ = สต๊อกเกิน ไม่ต้องสั่ง · เรียงจากมากไปน้อยในแต่ละหมวด
      </p>
    </div>
  );
}

function FragmentGroup({ cat, rows }: { cat: string; rows: ReorderRow[] }) {
  const sub = rows.reduce((s, r) => s + r.qty, 0);
  return (
    <>
      <tr>
        <td colSpan={6} className="bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
          {cat} — {num(rows.length)} รายการ · รวม {num(sub)} ตัว
        </td>
      </tr>
      {rows.map((r, i) => (
        <tr key={i} className="hover:bg-slate-50">
          <td className="td font-mono text-xs">{r.sku || "-"}</td>
          <td className="td max-w-[240px] truncate">{r.name || "-"}</td>
          <td className="td">
            <span className="badge border-slate-200 text-slate-500">{r.grade || "-"}</span>
          </td>
          <td className="td">
            <span className="inline-block min-w-[42px] rounded-md border border-slate-200 px-2 text-center text-xs font-semibold">
              {r.size || "-"}
            </span>
          </td>
          <td className="td text-slate-500">{r.category}</td>
          <td className="td text-right text-base font-bold text-emerald-600">{num(r.qty)}</td>
        </tr>
      ))}
    </>
  );
}

function FilterBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition " +
        (active
          ? "border-brand bg-brand text-white"
          : "border-slate-200 bg-white text-slate-600 hover:text-slate-800")
      }
    >
      {label}
      <span className={"text-xs " + (active ? "opacity-90" : "text-slate-400")}>{num(count)}</span>
    </button>
  );
}
