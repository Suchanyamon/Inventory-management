"use client";
import { useMemo, useState } from "react";
import { baht } from "@/lib/format";

export interface FlowRow {
  business: string;
  category: string;
  month: string;
  month_idx: number;
  input_value: number;
  output_value: number; // มูลค่า Output = ค่าลบ
  inventory_value: number;
}

const BIZ_ORDER = ["Uniform", "Merchandise", "Fashion", "Other"];
const IN = "var(--brand)";
const OUT = "#f97316";
const INV = "#6366f1";
const GUTTER = 52;
const PLOT_H = 150;

function compact(n: number): string {
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e3) return s + Math.round(a / 1e3) + "K";
  return String(Math.round(n));
}
// label ค่าบนกราฟ — ทศนิยม 2 ตำแหน่ง (M/K)
function lab2(n: number): string {
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return s + (a / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
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
      .sort((a, b) => (b.input - b.output) - (a.input - a.output));
  }, [sel]);

  const totalIn = sel.reduce((s, r) => s + +r.input_value, 0);
  const totalOut = sel.reduce((s, r) => s + +r.output_value, 0); // ลบ

  // ---- แกนกราฟเส้น (คงคลัง) : zoom min–max ----
  const invVals = months.map((mo) => byMonth[mo].inv);
  const invMax = Math.max(1, ...invVals);
  const invMin = Math.min(...invVals, invMax);
  const invPad = (invMax - invMin) * 0.35 || invMax * 0.05;
  const invLo = Math.max(0, invMin - invPad), invHi = invMax + invPad;
  const yInv = (v: number) => 100 - ((v - invLo) / (invHi - invLo || 1)) * 100;
  const ticks = [1, 0.66, 0.33, 0];

  // ---- แกนกราฟแท่ง diverging (Input บวกขึ้น / Output ลบลง) ----
  const inMax = Math.max(1, ...months.map((mo) => byMonth[mo].input));
  const outMin = Math.min(0, ...months.map((mo) => byMonth[mo].output)); // ค่าลบสุด
  const range = inMax - outMin || 1;
  const zeroY = (inMax / range) * PLOT_H; // px จากบนถึงเส้นศูนย์

  const empty = months.length === 0;

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">มูลค่าคงคลัง · Input vs Output รายเดือน</h2>
        <span className="text-xs text-slate-400">เลือกกลุ่มธุรกิจได้</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <BizBtn label="ทุกกลุ่ม" active={biz === "ALL"} onClick={() => setBiz("ALL")} />
        {businesses.map((b) => <BizBtn key={b} label={b} active={biz === b} onClick={() => setBiz(b)} />)}
      </div>

      {empty ? (
        <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีข้อมูล (ต้องเข้าสู่ระบบเพื่อดู)</div>
      ) : (
        <>
          {/* ===== กราฟบน: มูลค่าคงคลัง (เส้น) ===== */}
          <div className="mb-1 flex items-center gap-2 text-sm"><Dot color={INV} /> มูลค่าคงคลังปลายเดือน</div>
          <div className="flex gap-2">
            <YAxis min={invLo} max={invHi} />
            <div className="relative flex-1" style={{ height: PLOT_H }}>
              <Grid ticks={ticks} />
              <svg viewBox={`0 0 ${months.length} 100`} preserveAspectRatio="none" width="100%" height={PLOT_H} className="absolute inset-0 overflow-visible">
                <polyline points={months.map((mo, i) => `${i + 0.5},${yInv(byMonth[mo].inv)}`).join(" ")}
                  fill="none" stroke={INV} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              {months.map((mo, i) => (
                <div key={mo} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${((i + 0.5) / months.length) * 100}%`, top: `${yInv(byMonth[mo].inv)}%` }}>
                  <div className="h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: INV }} title={`${mo}: ${baht(byMonth[mo].inv)}`} />
                  <div className="absolute left-1/2 -top-4 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium" style={{ color: INV }}>{lab2(byMonth[mo].inv)}</div>
                </div>
              ))}
            </div>
          </div>
          <MonthAxis months={months} />

          {/* ===== กราฟล่าง: Input (บวก) vs Output (ลบ) แบบ diverging ===== */}
          <div className="mb-1 mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5"><Dot color={IN} /> Input <b className="text-brand">{baht(totalIn)}</b></span>
            <span className="flex items-center gap-1.5"><Dot color={OUT} /> Output <b style={{ color: OUT }}>{baht(totalOut)}</b></span>
            <span className="text-slate-500">สุทธิ <b className={totalIn + totalOut >= 0 ? "text-emerald-600" : "text-red-600"}>{baht(totalIn + totalOut)}</b></span>
          </div>
          <div className="flex gap-2">
            {/* y-axis diverging */}
            <div className="relative text-right text-[10px] text-slate-400" style={{ height: PLOT_H, width: GUTTER }}>
              <span className="absolute right-0 top-0 -translate-y-1/2">{compact(inMax)}</span>
              <span className="absolute right-0 -translate-y-1/2 font-medium text-slate-500" style={{ top: zeroY }}>0</span>
              <span className="absolute bottom-0 right-0 translate-y-1/2" style={{ color: OUT }}>{compact(outMin)}</span>
            </div>
            <div className="relative flex-1" style={{ height: PLOT_H }}>
              {/* zero line */}
              <div className="absolute w-full border-t border-slate-300" style={{ top: zeroY }} />
              <div className="absolute inset-0 flex">
                {months.map((mo) => {
                  const d = byMonth[mo];
                  const inH = (d.input / range) * PLOT_H;
                  const outH = (-d.output / range) * PLOT_H;
                  return (
                    <div key={mo} className="relative flex-1">
                      <div className="absolute rounded-t" style={{ left: "14%", width: "32%", bottom: PLOT_H - zeroY, height: Math.max(inH, d.input > 0 ? 2 : 0), background: IN }} title={`${mo} Input ${baht(d.input)}`}>
                        {d.input > 0 && <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium text-brand">{lab2(d.input)}</span>}
                      </div>
                      <div className="absolute rounded-b" style={{ left: "54%", width: "32%", top: zeroY, height: Math.max(outH, d.output < 0 ? 2 : 0), background: OUT }} title={`${mo} Output ${baht(d.output)}`}>
                        {d.output < 0 && <span className="absolute top-full left-1/2 mt-0.5 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium" style={{ color: OUT }}>{lab2(d.output)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <MonthAxis months={months} />

          {/* ===== ตารางแยกหมวด ===== */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="th">หมวดสินค้า</th>
                  <th className="th text-right">Input</th>
                  <th className="th text-right">Output</th>
                  <th className="th text-right">คงคลัง</th>
                  <th className="th text-right">สุทธิ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {byCat.slice(0, 40).map((c) => (
                  <tr key={c.category} className="hover:bg-slate-50">
                    <td className="td">{c.category}</td>
                    <td className="td text-right text-brand">{baht(c.input)}</td>
                    <td className="td text-right" style={{ color: OUT }}>{baht(c.output)}</td>
                    <td className="td text-right" style={{ color: INV }}>{baht(c.inv)}</td>
                    <td className={"td text-right " + (c.input + c.output >= 0 ? "text-emerald-600" : "text-red-600")}>{baht(c.input + c.output)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function YAxis({ min = 0, max }: { min?: number; max: number }) {
  const ticks = [1, 0.66, 0.33, 0];
  return (
    <div className="flex flex-col justify-between py-0 text-right text-[10px] text-slate-400" style={{ height: PLOT_H, width: GUTTER }}>
      {ticks.map((t, i) => <span key={i}>{compact(min + t * (max - min))}</span>)}
    </div>
  );
}

function Grid({ ticks }: { ticks: number[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {ticks.map((t, i) => <div key={i} className="absolute w-full border-t border-slate-100" style={{ top: `${(1 - t) * 100}%` }} />)}
    </div>
  );
}

function MonthAxis({ months }: { months: string[] }) {
  return (
    <div className="flex gap-2">
      <div style={{ width: GUTTER }} />
      <div className="flex flex-1">
        {months.map((mo) => <div key={mo} className="flex-1 text-center text-xs text-slate-500">{mo}</div>)}
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <i className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />;
}

function BizBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={"rounded-full border px-4 py-1.5 text-sm font-medium transition " + (active ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:text-slate-800")}>
      {label}
    </button>
  );
}
