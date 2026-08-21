import { createSupabaseServer } from "@/lib/supabase/server";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = {
  finished_date: string;
  finished_month: string | null;
  packing_group: string;
  orders_count: number;
  lines_count: number;
  items_qty: number;
  wrong_qty: number;
  avg_close_days: number | null;
  max_close_days: number | null;
};

type StatusRow = {
  finished_date: string;
  packing_group: string;
  completion_status: string;
  orders_count: number;
  lines_count: number;
  items_qty: number;
};

const groupColors = [
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-red-100 text-red-700 border-red-200",
  "bg-slate-100 text-slate-500 border-slate-200",
];

const chartPalette = ["#780808", "#065f46", "#b45309", "#2563eb", "#7c3aed", "#be123c", "#0f766e", "#ca8a04"];

function thDate(iso: string) {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function PackingPerformancePage({ searchParams }: { searchParams: { group?: string; date?: string } }) {
  const supabase = createSupabaseServer();
  const group = searchParams.group || "ALL";
  const date = searchParams.date || "";

  let q = supabase
    .from("packing_performance_daily")
    .select("finished_date,finished_month,packing_group,orders_count,lines_count,items_qty,wrong_qty,avg_close_days,max_close_days")
    .order("finished_date", { ascending: false })
    .order("packing_group", { ascending: true })
    .limit(240);

  if (group !== "ALL") q = q.eq("packing_group", group);
  if (date) q = q.eq("finished_date", date);

  let statusQ = supabase
    .from("packing_completion_status_daily")
    .select("finished_date,packing_group,completion_status,orders_count,lines_count,items_qty")
    .order("orders_count", { ascending: false });
  if (group !== "ALL") statusQ = statusQ.eq("packing_group", group);
  if (date) statusQ = statusQ.eq("finished_date", date);

  const [{ data: rows }, { data: groups }, { data: latest }] = await Promise.all([
    q,
    supabase.from("packing_performance_daily").select("packing_group").order("packing_group", { ascending: true }),
    supabase.from("packing_performance_daily").select("finished_date").order("finished_date", { ascending: false }).limit(1),
  ]);
  const { data: statusRows } = await statusQ;

  const data = (rows || []) as Row[];
  const statusRaw = (statusRows || []) as StatusRow[];
  const groupList = Array.from(new Set((groups || []).map((r) => r.packing_group).filter(Boolean)));
  const latestDate = latest?.[0]?.finished_date as string | undefined;
  const totalOrders = data.reduce((s, r) => s + Number(r.orders_count || 0), 0);
  const totalLines = data.reduce((s, r) => s + Number(r.lines_count || 0), 0);
  const totalItems = data.reduce((s, r) => s + Number(r.items_qty || 0), 0);
  const totalWrong = data.reduce((s, r) => s + Number(r.wrong_qty || 0), 0);
  const weightedDays = data.reduce((s, r) => s + Number(r.avg_close_days || 0) * Number(r.lines_count || 0), 0);
  const dayWeight = data.reduce((s, r) => s + (r.avg_close_days == null ? 0 : Number(r.lines_count || 0)), 0);
  const avgDays = dayWeight ? weightedDays / dayWeight : null;

  const byGroup = groupList
    .map((g) => {
      const rs = data.filter((r) => r.packing_group === g);
      return {
        group: g,
        orders: rs.reduce((s, r) => s + Number(r.orders_count || 0), 0),
        items: rs.reduce((s, r) => s + Number(r.items_qty || 0), 0),
        wrong: rs.reduce((s, r) => s + Number(r.wrong_qty || 0), 0),
      };
    })
    .filter((r) => r.orders || r.items || r.wrong)
    .sort((a, b) => b.items - a.items);

  const trendDates = Array.from(new Set(data.map((r) => r.finished_date))).sort((a, b) => a.localeCompare(b));
  const trendGroups = Array.from(new Set(data.map((r) => r.packing_group))).sort((a, b) => a.localeCompare(b, "th"));
  const trendSeries = trendGroups.map((g, i) => ({
    label: g,
    color: chartPalette[i % chartPalette.length],
    points: trendDates.map((d) => data.find((r) => r.finished_date === d && r.packing_group === g)?.orders_count || 0),
  }));
  const statusByName = new Map<string, { completion_status: string; orders_count: number; lines_count: number; items_qty: number }>();
  for (const row of statusRaw) {
    const cur = statusByName.get(row.completion_status) || {
      completion_status: row.completion_status,
      orders_count: 0,
      lines_count: 0,
      items_qty: 0,
    };
    cur.orders_count += Number(row.orders_count || 0);
    cur.lines_count += Number(row.lines_count || 0);
    cur.items_qty += Number(row.items_qty || 0);
    statusByName.set(row.completion_status, cur);
  }
  const statusData = [...statusByName.values()].sort((a, b) => b.orders_count - a.orders_count);
  const pieTotal = statusData.reduce((s, r) => s + Number(r.orders_count || 0), 0);

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">รายงานแพ็คสินค้า LGS รายวัน</h1>
          <p className="text-sm text-slate-500">
            จาก Google Sheet “DATA-Performance -LGS 2026” · แสดงตามกลุ่มการจัดสินค้าและวันที่จัดสินค้าเสร็จ
          </p>
        </div>
        {latestDate && <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">ข้อมูลล่าสุด {thDate(latestDate)}</div>}
      </div>

      <div className="card p-4">
        <form className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label">กลุ่มการจัดสินค้า</span>
            <select name="group" defaultValue={group} className="input w-56">
              <option value="ALL">ทุกกลุ่ม</option>
              {groupList.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">วันที่จัดสินค้าเสร็จ</span>
            <input name="date" defaultValue={date} type="date" className="input w-52" />
          </label>
          <button className="btn-primary" type="submit">กรองรายงาน</button>
          {(group !== "ALL" || date) && <a href="/packing-performance" className="btn-ghost">ล้างตัวกรอง</a>}
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="ออเดอร์ที่แพ็ค" value={num(totalOrders)} />
        <Kpi label="จำนวนชิ้น" value={num(totalItems)} tone="text-emerald-700" />
        <Kpi label="รายการสินค้า" value={num(totalLines)} />
        <Kpi label="จัดผิด" value={num(totalWrong)} tone={totalWrong ? "text-red-600" : "text-slate-700"} sub={avgDays == null ? undefined : `เฉลี่ยปิดงาน ${avgDays.toFixed(1)} วัน`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="card p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">จำนวน order_number ที่แพ็คต่อวัน</h2>
              <p className="text-xs text-slate-500">กราฟเส้นแยกตามกลุ่มการจัดสินค้า</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {trendSeries.map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
          <LineOrdersChart dates={trendDates} series={trendSeries} />
        </section>

        <section className="card p-4">
          <div className="mb-4">
            <h2 className="font-semibold">สัดส่วนสถานะวันที่จัดสินค้าเสร็จ</h2>
            <p className="text-xs text-slate-500">นับจากจำนวนเลข order_number</p>
          </div>
          <PieStatusChart rows={statusData} total={pieTotal} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">สรุปตามกลุ่มการจัดสินค้า</h2>
          <div className="space-y-3">
            {byGroup.length ? byGroup.map((g, i) => {
              const pct = totalItems ? (g.items / totalItems) * 100 : 0;
              return (
                <div key={g.group}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className={`badge border ${groupColors[i % groupColors.length]}`}>{g.group}</span>
                    <span className="font-medium">{num(g.items)} ชิ้น</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{num(g.orders)} ออเดอร์ · จัดผิด {num(g.wrong)}</div>
                </div>
              );
            }) : <div className="py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูลตามตัวกรองนี้</div>}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="font-semibold">รายละเอียดรายวัน</h2>
            <p className="text-xs text-slate-500">หนึ่งแถว = วันที่จัดสินค้าเสร็จ x กลุ่มการจัดสินค้า</p>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="th">วันที่เสร็จ</th>
                  <th className="th">กลุ่ม</th>
                  <th className="th text-right">ออเดอร์</th>
                  <th className="th text-right">รายการ</th>
                  <th className="th text-right">ชิ้น</th>
                  <th className="th text-right">จัดผิด</th>
                  <th className="th text-right">เฉลี่ยวันปิดงาน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.map((r) => (
                  <tr key={`${r.finished_date}-${r.packing_group}`} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap font-medium">{thDate(r.finished_date)}</td>
                    <td className="td">{r.packing_group}</td>
                    <td className="td text-right">{num(r.orders_count)}</td>
                    <td className="td text-right">{num(r.lines_count)}</td>
                    <td className="td text-right font-medium text-emerald-700">{num(r.items_qty)}</td>
                    <td className={"td text-right " + (r.wrong_qty ? "text-red-600" : "text-slate-400")}>{num(r.wrong_qty)}</td>
                    <td className="td text-right">{r.avg_close_days == null ? "-" : r.avg_close_days.toFixed(1)}</td>
                  </tr>
                ))}
                {!data.length && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">ยังไม่มีข้อมูล — ให้ admin กด Sync ข้อมูลหลังแชร์ Google Sheet เป็น Viewer ด้วยลิงก์</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function LineOrdersChart({ dates, series }: { dates: string[]; series: { label: string; color: string; points: number[] }[] }) {
  const width = 920;
  const height = 300;
  const pad = { top: 24, right: 24, bottom: 48, left: 44 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const maxY = Math.max(1, ...series.flatMap((s) => s.points));
  const yTop = Math.ceil(maxY * 1.15);
  const x = (i: number) => pad.left + (dates.length <= 1 ? chartW / 2 : (i / (dates.length - 1)) * chartW);
  const y = (v: number) => pad.top + chartH - (v / yTop) * chartH;
  const ticks = [0, Math.round(yTop / 2), yTop];

  if (!dates.length || !series.length) {
    return <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">ยังไม่มีข้อมูลสำหรับกราฟเส้น</div>;
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px]">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} y1={y(t)} x2={width - pad.right} y2={y(t)} stroke="var(--border-2)" />
            <text x={pad.left - 10} y={y(t) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{num(t)}</text>
          </g>
        ))}
        {dates.map((d, i) => (
          <text key={d} x={x(i)} y={height - 18} textAnchor="middle" className="fill-slate-500 text-[11px]">
            {thDate(d).replace("2569", "69")}
          </text>
        ))}
        {series.map((s) => {
          const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p)}`).join(" ");
          return (
            <g key={s.label}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {s.points.map((p, i) => (
                <g key={`${s.label}-${dates[i]}`}>
                  <circle cx={x(i)} cy={y(p)} r="4" fill={s.color} stroke="white" strokeWidth="2" />
                  {p > 0 && <text x={x(i)} y={y(p) - 9} textAnchor="middle" className="fill-slate-700 text-[10px] font-semibold">{num(p)}</text>}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PieStatusChart({ rows, total }: { rows: Array<Pick<StatusRow, "completion_status" | "orders_count" | "lines_count" | "items_qty">>; total: number }) {
  if (!rows.length || !total) {
    return <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">ยังไม่มีข้อมูลสำหรับ Pie chart</div>;
  }

  const cx = 110;
  const cy = 110;
  const r = 86;
  let acc = 0;
  const slices = rows.map((row, i) => {
    const value = Number(row.orders_count || 0);
    const start = acc;
    const end = acc + value / total;
    acc = end;
    return { row, value, start, end, color: chartPalette[i % chartPalette.length] };
  });

  return (
    <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
      <svg viewBox="0 0 220 220" className="mx-auto h-[220px] w-[220px]">
        {slices.map((s) => <path key={s.row.completion_status} d={piePath(cx, cy, r, s.start, s.end)} fill={s.color} stroke="var(--surface)" strokeWidth="3" />)}
        <circle cx={cx} cy={cy} r="48" fill="var(--surface)" />
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-500 text-[12px]">ออเดอร์</text>
        <text x={cx} y={cy + 22} textAnchor="middle" className="fill-slate-800 text-[24px] font-bold">{num(total)}</text>
      </svg>
      <div className="space-y-2">
        {slices.map((s) => {
          const pct = total ? (s.value / total) * 100 : 0;
          return (
            <div key={s.row.completion_status} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="truncate text-sm font-medium">{s.row.completion_status}</span>
                </div>
                <div className="text-right text-sm font-semibold">{num(s.value)}</div>
              </div>
              <div className="mt-1 text-xs text-slate-500">{pct.toFixed(1)}% · {num(s.row.lines_count)} รายการ · {num(s.row.items_qty)} ชิ้น</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function piePath(cx: number, cy: number, r: number, startRatio: number, endRatio: number) {
  const start = startRatio * Math.PI * 2 - Math.PI / 2;
  const end = endRatio * Math.PI * 2 - Math.PI / 2;
  const x1 = cx + Math.cos(start) * r;
  const y1 = cy + Math.sin(start) * r;
  const x2 = cx + Math.cos(end) * r;
  const y2 = cy + Math.sin(end) * r;
  const large = endRatio - startRatio > 0.5 ? 1 : 0;
  if (endRatio - startRatio >= 0.9999) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

function Kpi({ label, value, tone = "text-brand", sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
