"use client";
import { useMemo, useState } from "react";

export interface InvRow {
  sheet: string;
  business: string;
  month: string;
  month_idx: number;
  inv_ratio: number | null;
  dsi: number | null;
}

const SHEETS: [string, string][] = [
  ["Over", "Inv.Trun Over"],
  ["Runitem", "Over Runitem"],
  ["F", "Over F"],
];
const BIZ_ORDER = ["Uniform", "Merchandise", "Fashion", "YTD"];
const RATIO = "#0ea5e9";
const DSI = "#f97316";
const GUTTER = 56;
const PLOT_H = 130;

const f2 = (n: number) => n.toFixed(2);
const f1 = (n: number) => n.toFixed(1);

export default function InvTurnover({ rows }: { rows: InvRow[] }) {
  const [sheet, setSheet] = useState("Over");
  const businesses = useMemo(() => BIZ_ORDER.filter((b) => rows.some((r) => r.business === b)), [rows]);
  const [biz, setBiz] = useState(() => BIZ_ORDER.find((b) => rows.some((r) => r.business === b)) || "Uniform");

  const pts = useMemo(() => {
    return rows
      .filter((r) => r.sheet === sheet && r.business === biz)
      .sort((a, b) => a.month_idx - b.month_idx)
      .filter((r) => (r.inv_ratio || 0) !== 0 || (r.dsi || 0) !== 0);
  }, [rows, sheet, biz]);

  const months = pts.map((r) => r.month);
  const ratios = pts.map((r) => Number(r.inv_ratio || 0));
  const dsis = pts.map((r) => Number(r.dsi || 0));

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Inventory Turnover — Inv.Ratio &amp; DSI รายเดือน</h2>
        <span className="text-xs text-slate-400">จาก "_DATA Inventory Month 2026"</span>
      </div>

      {/* sheet selector */}
      <div className="mb-2 flex flex-wrap gap-2">
        {SHEETS.map(([k, label]) => (
          <button key={k} onClick={() => setSheet(k)}
            className={"rounded-lg border px-3 py-1.5 text-sm font-medium transition " + (sheet === k ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:text-slate-800")}>
            {label}
          </button>
        ))}
      </div>
      {/* business selector */}
      <div className="mb-4 flex flex-wrap gap-2">
        {businesses.map((b) => (
          <button key={b} onClick={() => setBiz(b)}
            className={"rounded-full border px-4 py-1.5 text-sm font-medium transition " + (biz === b ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:text-slate-800")}>
            {b}
          </button>
        ))}
      </div>

      {months.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีข้อมูล (ต้องเข้าสู่ระบบเพื่อดู)</div>
      ) : (
        <>
          <LineChart title="Inv.Ratio" color={RATIO} months={months} values={ratios} fmt={f2} />
          <div className="mt-6" />
          <LineChart title="DSI (Days) 2026" color={DSI} months={months} values={dsis} fmt={f1} unit="วัน" />
        </>
      )}
    </div>
  );
}

function LineChart({ title, color, months, values, fmt, unit }: {
  title: string; color: string; months: string[]; values: number[]; fmt: (n: number) => string; unit?: string;
}) {
  const n = months.length;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, max);
  const pad = (max - min) * 0.3 || max * 0.1 || 1;
  const lo = Math.max(0, min - pad), hi = max + pad;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo || 1)) * 100;
  const ticks = [1, 0.66, 0.33, 0];

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm">
        <i className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} /> {title}
      </div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-0 text-right text-[10px] text-slate-400" style={{ height: PLOT_H, width: GUTTER }}>
          {ticks.map((t, i) => <span key={i}>{fmt(lo + t * (hi - lo))}</span>)}
        </div>
        <div className="relative flex-1" style={{ height: PLOT_H }}>
          <div className="pointer-events-none absolute inset-0">
            {ticks.map((t, i) => <div key={i} className="absolute w-full border-t border-slate-100" style={{ top: `${(1 - t) * 100}%` }} />)}
          </div>
          <svg viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" width="100%" height={PLOT_H} className="absolute inset-0 overflow-visible">
            <polyline points={months.map((_, i) => `${i + 0.5},${y(values[i])}`).join(" ")}
              fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {months.map((mo, i) => (
            <div key={mo} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${((i + 0.5) / n) * 100}%`, top: `${y(values[i])}%` }}>
              <div className="h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: color }} title={`${mo}: ${fmt(values[i])}${unit ? " " + unit : ""}`} />
              <div className="absolute left-1/2 -top-4 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium" style={{ color }}>{fmt(values[i])}</div>
            </div>
          ))}
        </div>
      </div>
      {/* month axis */}
      <div className="flex gap-2">
        <div style={{ width: GUTTER }} />
        <div className="flex flex-1">
          {months.map((mo) => <div key={mo} className="flex-1 text-center text-xs text-slate-500">{mo}</div>)}
        </div>
      </div>
    </div>
  );
}
