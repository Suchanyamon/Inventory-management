"use client";
import { useMemo, useState } from "react";
import { baht, num } from "@/lib/format";

export interface FlowRow {
  business: string;
  category: string;
  month: string;
  month_idx: number;
  input_value: number;
  output_value: number;
}

const BIZ_ORDER = ["Uniform", "Merchandise", "Fashion", "Other"];

export default function MonthlyFlow({ rows }: { rows: FlowRow[] }) {
  const [biz, setBiz] = useState("ALL");

  const businesses = useMemo(
    () => BIZ_ORDER.filter((b) => rows.some((r) => r.business === b)),
    [rows]
  );
  const sel = useMemo(
    () => rows.filter((r) => biz === "ALL" || r.business === biz),
    [rows, biz]
  );

  // months present (sorted)
  const months = useMemo(() => {
    const m = new Map<string, number>();
    sel.forEach((r) => m.set(r.month, r.month_idx));
    return [...m.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
  }, [sel]);

  const byMonth = useMemo(() => {
    const m: Record<string, { input: number; output: number }> = {};
    months.forEach((mo) => (m[mo] = { input: 0, output: 0 }));
    sel.forEach((r) => {
      if (!m[r.month]) m[r.month] = { input: 0, output: 0 };
      m[r.month].input += Number(r.input_value);
      m[r.month].output += Number(r.output_value);
    });
    return m;
  }, [sel, months]);

  const byCat = useMemo(() => {
    const m: Record<string, { input: number; output: number }> = {};
    sel.forEach((r) => {
      (m[r.category] ||= { input: 0, output: 0 });
      m[r.category].input += Number(r.input_value);
      m[r.category].output += Number(r.output_value);
    });
    return Object.entries(m)
      .map(([category, v]) => ({ category, ...v }))
      .filter((c) => c.input > 0 || c.output > 0)
      .sort((a, b) => b.input + b.output - (a.input + a.output));
  }, [sel]);

  const totalIn = sel.reduce((s, r) => s + Number(r.input_value), 0);
  const totalOut = sel.reduce((s, r) => s + Number(r.output_value), 0);
  const chartMax = Math.max(1, ...months.map((mo) => Math.max(byMonth[mo].input, byMonth[mo].output)));

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">มูลค่า Input vs Output รายเดือน</h2>
        <span className="text-xs text-slate-400">แยกตามหมวด · เลือกกลุ่มธุรกิจได้</span>
      </div>

      {/* business filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <BizBtn label="ทุกกลุ่ม" active={biz === "ALL"} onClick={() => setBiz("ALL")} />
        {businesses.map((b) => (
          <BizBtn key={b} label={b} active={biz === b} onClick={() => setBiz(b)} />
        ))}
      </div>

      {/* totals + legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <i className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--brand)" }} />
          Input รวม <b className="text-brand">{baht(totalIn)}</b>
        </span>
        <span className="flex items-center gap-2">
          <i className="inline-block h-3 w-3 rounded-sm" style={{ background: "#f97316" }} />
          Output รวม <b style={{ color: "#f97316" }}>{baht(totalOut)}</b>
        </span>
        <span className="text-slate-500">
          สุทธิ (In−Out): <b className={totalIn - totalOut >= 0 ? "text-emerald-600" : "text-red-600"}>{baht(totalIn - totalOut)}</b>
        </span>
      </div>

      {/* monthly grouped bars */}
      <div className="overflow-x-auto">
        <div className="flex min-w-[320px] items-end gap-4 border-b border-slate-100 pb-2" style={{ height: 200 }}>
          {months.map((mo) => {
            const d = byMonth[mo];
            return (
              <div key={mo} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ minWidth: 44 }}>
                <div className="flex h-full w-full items-end justify-center gap-1">
                  <div
                    className="w-1/2 rounded-t"
                    style={{ height: `${(d.input / chartMax) * 100}%`, background: "var(--brand)", minHeight: d.input > 0 ? 2 : 0 }}
                    title={`Input ${baht(d.input)}`}
                  />
                  <div
                    className="w-1/2 rounded-t"
                    style={{ height: `${(d.output / chartMax) * 100}%`, background: "#f97316", minHeight: d.output > 0 ? 2 : 0 }}
                    title={`Output ${baht(d.output)}`}
                  />
                </div>
                <span className="text-xs text-slate-500">{mo}</span>
              </div>
            );
          })}
          {months.length === 0 && <div className="w-full text-center text-sm text-slate-400">ไม่มีข้อมูล</div>}
        </div>
      </div>

      {/* category breakdown */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="th">หมวดสินค้า</th>
              <th className="th text-right">มูลค่า Input</th>
              <th className="th text-right">มูลค่า Output</th>
              <th className="th text-right">สุทธิ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {byCat.slice(0, 40).map((c) => (
              <tr key={c.category} className="hover:bg-slate-50">
                <td className="td">{c.category}</td>
                <td className="td text-right text-brand">{baht(c.input)}</td>
                <td className="td text-right" style={{ color: "#f97316" }}>{baht(c.output)}</td>
                <td className={"td text-right " + (c.input - c.output >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {baht(c.input - c.output)}
                </td>
              </tr>
            ))}
            {byCat.length === 0 && <tr><td className="td text-slate-400" colSpan={4}>ไม่มีข้อมูล</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BizBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-4 py-1.5 text-sm font-medium transition " +
        (active ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:text-slate-800")
      }
    >
      {label}
    </button>
  );
}
