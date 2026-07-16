"use client";
import { useMemo, useState } from "react";
import { baht } from "@/lib/format";

export interface FlowRow {
  business: string;
  category: string;
  month: string;
  month_idx: number;
  input_value: number;
  output_value: number;
  inventory_value: number;
}

const BIZ_ORDER = ["Uniform", "Merchandise", "Fashion", "Other"];
const IN = "var(--brand)";
const OUT = "#f97316";
const INV = "#6366f1";

// ย่อจำนวนเงินเป็น K/M
function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e3) return Math.round(n / 1e3) + "K";
  return String(Math.round(n));
}

export default function MonthlyFlow({ rows }: { rows: FlowRow[] }) {
  const [biz, setBiz] = useState("ALL");

  const businesses = useMemo(() => BIZ_ORDER.filter((b) => rows.some((r) => r.business === b)), [rows]);
  const sel = useMemo(() => rows.filter((r) => biz === "ALL" || r.business === biz), [rows, biz]);

  const months = useMemo(() => {
    const m = new Map<string, number>();
    sel.forEach((r) => m.set(r.month, r.month_idx));
    return [...m.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
  }, [sel]);

  const byMonth = useMemo(() => {
    const m: Record<string, { input: number; output: number; inv: number }> = {};
    months.forEach((mo) => (m[mo] = { input: 0, output: 0, inv: 0 }));
    sel.forEach((r) => {
      const o = (m[r.month] ||= { input: 0, output: 0, inv: 0 });
      o.input += +r.input_value; o.output += +r.output_value; o.inv += +r.inventory_value;
    });
    return m;
  }, [sel, months]);

  const byCat = useMemo(() => {
    const m: Record<string, { input: number; output: number; inv: number }> = {};
    sel.forEach((r) => {
      const o = (m[r.category] ||= { input: 0, output: 0, inv: 0 });
      o.input += +r.input_value; o.output += +r.output_value; o.inv += +r.inventory_value;
    });
    return Object.entries(m).map(([category, v]) => ({ category, ...v }))
      .filter((c) => c.input || c.output || c.inv)
      .sort((a, b) => b.input + b.output - (a.input + a.output));
  }, [sel]);

  const totalIn = sel.reduce((s, r) => s + +r.input_value, 0);
  const totalOut = sel.reduce((s, r) => s + +r.output_value, 0);
  const flowMax = Math.max(1, ...months.map((mo) => Math.max(byMonth[mo].input, byMonth[mo].output)));
  const invMax = Math.max(1, ...months.map((mo) => byMonth[mo].inv));
  const grid = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">มูลค่า Input vs Output รายเดือน</h2>
        <span className="text-xs text-slate-400">แยกหมวด · เลือกกลุ่มธุรกิจ</span>
      </div>

      {/* business filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <BizBtn label="ทุกกลุ่ม" active={biz === "ALL"} onClick={() => setBiz("ALL")} />
        {businesses.map((b) => <BizBtn key={b} label={b} active={biz === b} onClick={() => setBiz(b)} />)}
      </div>

      {/* legend + totals */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <Legend color={IN} label="Input" /> <b className="text-brand">{baht(totalIn)}</b>
        <Legend color={OUT} label="Output" /> <b style={{ color: OUT }}>{baht(totalOut)}</b>
        <span className="text-slate-500">สุทธิ <b className={totalIn - totalOut >= 0 ? "text-emerald-600" : "text-red-600"}>{baht(totalIn - totalOut)}</b></span>
      </div>

      {/* ---- Bar chart: Input vs Output ---- */}
      <BarChart months={months} gridVals={grid.map((g) => g * flowMax)}>
        {months.map((mo) => (
          <div key={mo} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ minWidth: 40 }}>
            <div className="flex h-full w-full items-end justify-center gap-[3px]">
              <Bar h={byMonth[mo].input / flowMax} color={IN} label={compact(byMonth[mo].input)} title={`Input ${baht(byMonth[mo].input)}`} />
              <Bar h={byMonth[mo].output / flowMax} color={OUT} label={compact(byMonth[mo].output)} title={`Output ${baht(byMonth[mo].output)}`} />
            </div>
            <span className="text-xs text-slate-500">{mo}</span>
          </div>
        ))}
      </BarChart>

      {/* ---- Bar chart: มูลค่าคงคลังปลายเดือน (คนละสเกล) ---- */}
      <div className="mt-6 mb-2 flex items-center gap-2">
        <Legend color={INV} label="มูลค่าคงคลังปลายเดือน" />
      </div>
      <BarChart months={months} gridVals={grid.map((g) => g * invMax)}>
        {months.map((mo) => (
          <div key={mo} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ minWidth: 40 }}>
            <div className="flex h-full w-full items-end justify-center">
              <Bar h={byMonth[mo].inv / invMax} color={INV} wide label={compact(byMonth[mo].inv)} title={`คงคลัง ${baht(byMonth[mo].inv)}`} />
            </div>
            <span className="text-xs text-slate-500">{mo}</span>
          </div>
        ))}
      </BarChart>

      {/* ---- Category breakdown ---- */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="th">หมวดสินค้า</th>
              <th className="th text-right">Input</th>
              <th className="th text-right">Output</th>
              <th className="th text-right">คงคลัง</th>
              <th className="th text-right">สุทธิ (In−Out)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {byCat.slice(0, 40).map((c) => (
              <tr key={c.category} className="hover:bg-slate-50">
                <td className="td">{c.category}</td>
                <td className="td text-right text-brand">{baht(c.input)}</td>
                <td className="td text-right" style={{ color: OUT }}>{baht(c.output)}</td>
                <td className="td text-right" style={{ color: INV }}>{baht(c.inv)}</td>
                <td className={"td text-right " + (c.input - c.output >= 0 ? "text-emerald-600" : "text-red-600")}>{baht(c.input - c.output)}</td>
              </tr>
            ))}
            {byCat.length === 0 && <tr><td className="td text-slate-400" colSpan={5}>ไม่มีข้อมูล</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarChart({ months, gridVals, children }: { months: string[]; gridVals: number[]; children: React.ReactNode }) {
  if (months.length === 0) return <div className="py-8 text-center text-sm text-slate-400">ไม่มีข้อมูล</div>;
  return (
    <div className="flex gap-2">
      {/* y-axis labels */}
      <div className="flex flex-col justify-between py-1 text-right text-[10px] text-slate-400" style={{ height: 200, minWidth: 34 }}>
        {gridVals.map((v, i) => <span key={i}>{compact(v)}</span>)}
      </div>
      {/* plot */}
      <div className="relative flex-1 overflow-x-auto">
        {/* gridlines */}
        <div className="pointer-events-none absolute inset-0" style={{ height: 200 }}>
          {gridVals.map((_, i) => (
            <div key={i} className="absolute w-full border-t border-slate-100" style={{ top: `${(i / (gridVals.length - 1)) * 100}%` }} />
          ))}
        </div>
        <div className="relative flex min-w-[300px] items-end gap-3" style={{ height: 200 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Bar({ h, color, label, title, wide }: { h: number; color: string; label: string; title: string; wide?: boolean }) {
  const pct = Math.max(h * 100, h > 0 ? 1.5 : 0);
  return (
    <div className={"group relative flex h-full flex-col justify-end " + (wide ? "w-1/3" : "w-1/2")} title={title}>
      <span className="mb-0.5 text-center text-[9px] font-medium text-slate-500 opacity-0 transition group-hover:opacity-100">{label}</span>
      <div className="rounded-t transition-all" style={{ height: `${pct}%`, background: color }} />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <i className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function BizBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={"rounded-full border px-4 py-1.5 text-sm font-medium transition " + (active ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:text-slate-800")}>
      {label}
    </button>
  );
}
