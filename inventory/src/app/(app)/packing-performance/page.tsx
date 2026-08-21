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

type RawPackingRow = {
  ref_date: string | null;
  packing_group: string;
  completion_status: string;
  order_number: string | null;
  lines_count: number;
  items_qty: number;
  wrong_qty: number;
};

type SummaryGroup = {
  group: string;
  orders: number;
  items: number;
  wrong?: number;
  lines?: number;
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
    .order("packing_group", { ascending: true });

  if (group !== "ALL") q = q.eq("packing_group", group);
  if (date) q = q.eq("finished_date", date);

  let rawQ = supabase
    .from("packing_performance_rows")
    .select("ref_date,packing_group,completion_status,order_number,lines_count,items_qty,wrong_qty")
    .range(0, 49999);
  if (group !== "ALL") rawQ = rawQ.eq("packing_group", group);
  if (date) rawQ = rawQ.eq("ref_date", date);

  let statusQ = supabase
    .from("packing_completion_status_daily")
    .select("finished_date,packing_group,completion_status,orders_count,lines_count,items_qty")
    .order("orders_count", { ascending: false });
  if (group !== "ALL") statusQ = statusQ.eq("packing_group", group);
  if (date) statusQ = statusQ.eq("finished_date", date);

  const [{ data: rows }, { data: rawRows }, { data: groups }, { data: latest }] = await Promise.all([
    q,
    rawQ,
    supabase.from("packing_performance_daily").select("packing_group").order("packing_group", { ascending: true }),
    supabase.from("packing_performance_daily").select("finished_date").order("finished_date", { ascending: false }).limit(1),
  ]);
  const { data: statusRows } = await statusQ;

  const data = (rows || []) as Row[];
  const rawData = (rawRows || []) as RawPackingRow[];
  const statusRaw = (statusRows || []) as StatusRow[];
  const hasRawData = rawData.length > 0;
  const groupList = Array.from(new Set((groups || []).map((r) => r.packing_group).filter(Boolean)));
  const latestDate = latest?.[0]?.finished_date as string | undefined;
  const totalOrders = hasRawData ? new Set(rawData.map((r) => r.order_number).filter(Boolean)).size : data.reduce((s, r) => s + Number(r.orders_count || 0), 0);
  const totalLines = (hasRawData ? rawData : data).reduce((s, r) => s + Number(r.lines_count || 0), 0);
  const totalItems = (hasRawData ? rawData : data).reduce((s, r) => s + Number(r.items_qty || 0), 0);
  const totalWrong = (hasRawData ? rawData : data).reduce((s, r) => s + Number(r.wrong_qty || 0), 0);
  const weightedDays = data.reduce((s, r) => s + Number(r.avg_close_days || 0) * Number(r.lines_count || 0), 0);
  const dayWeight = data.reduce((s, r) => s + (r.avg_close_days == null ? 0 : Number(r.lines_count || 0)), 0);
  const avgDays = dayWeight ? weightedDays / dayWeight : null;

  const byGroup: SummaryGroup[] = groupList
    .map((g) => {
      const rs = (hasRawData ? rawData : data).filter((r) => r.packing_group === g);
      return {
        group: g,
        orders: hasRawData ? new Set((rs as RawPackingRow[]).map((r) => r.order_number).filter(Boolean)).size : (rs as Row[]).reduce((s, r) => s + Number(r.orders_count || 0), 0),
        items: rs.reduce((s, r) => s + Number(r.items_qty || 0), 0),
        wrong: rs.reduce((s, r) => s + Number(r.wrong_qty || 0), 0),
      };
    })
    .filter((r) => r.orders || r.items || r.wrong)
    .sort((a, b) => b.items - a.items);
  const unclosedByGroup: SummaryGroup[] = groupList
    .map((g) => {
      const rs = hasRawData
        ? rawData.filter((r) => r.packing_group === g && r.completion_status === "ยังไม่ระบุวันปิดงาน")
        : statusRaw.filter((r) => r.packing_group === g && r.completion_status === "ยังไม่ระบุวันปิดงาน");
      return {
        group: g,
        orders: hasRawData ? new Set((rs as RawPackingRow[]).map((r) => r.order_number).filter(Boolean)).size : (rs as StatusRow[]).reduce((s, r) => s + Number(r.orders_count || 0), 0),
        items: rs.reduce((s, r) => s + Number(r.items_qty || 0), 0),
        lines: rs.reduce((s, r) => s + Number(r.lines_count || 0), 0),
      };
    })
    .filter((r) => r.orders || r.items || r.lines)
    .sort((a, b) => b.items - a.items);
  const totalUnclosedItems = unclosedByGroup.reduce((s, r) => s + r.items, 0);

  const trendDates = Array.from(new Set(data.map((r) => r.finished_date))).sort((a, b) => a.localeCompare(b));
  const trendGroups = Array.from(new Set(data.map((r) => r.packing_group))).sort((a, b) => a.localeCompare(b, "th"));
  const orderTrendSeries = trendGroups.map((g, i) => ({
    label: g,
    color: chartPalette[i % chartPalette.length],
    points: trendDates.map((d) => data.find((r) => r.finished_date === d && r.packing_group === g)?.orders_count || 0),
  }));
  const itemTrendSeries = trendGroups.map((g, i) => ({
    label: g,
    color: chartPalette[i % chartPalette.length],
    points: trendDates.map((d) => data.find((r) => r.finished_date === d && r.packing_group === g)?.items_qty || 0),
  }));
  const statusByName = new Map<string, { completion_status: string; orders: Set<string>; orders_count: number; lines_count: number; items_qty: number }>();
  for (const row of hasRawData ? rawData : statusRaw) {
    const cur = statusByName.get(row.completion_status) || {
      completion_status: row.completion_status,
      orders: new Set<string>(),
      orders_count: 0,
      lines_count: 0,
      items_qty: 0,
    };
    if (hasRawData && "order_number" in row && row.order_number) cur.orders.add(row.order_number);
    if (!hasRawData && "orders_count" in row) cur.orders_count += Number(row.orders_count || 0);
    cur.lines_count += Number(row.lines_count || 0);
    cur.items_qty += Number(row.items_qty || 0);
    statusByName.set(row.completion_status, cur);
  }
  const statusData = [...statusByName.values()]
    .map((r) => ({ completion_status: r.completion_status, orders_count: hasRawData ? r.orders.size : r.orders_count, lines_count: r.lines_count, items_qty: r.items_qty }))
    .sort((a, b) => b.orders_count - a.orders_count);
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

      <section className="card p-4">
        <div className="mb-4">
          <div>
            <h2 className="font-semibold">จำนวน order_number ที่แพ็คต่อวัน</h2>
            <p className="text-xs text-slate-500">กราฟเส้นแยกตามกลุ่มการจัดสินค้า · ชี้ที่เส้นหรือจุดเพื่อดูชื่อข้อมูล</p>
          </div>
        </div>
        <LineTrendChart dates={trendDates} series={orderTrendSeries} unit="ออเดอร์" />
      </section>

      <section className="card p-4">
        <div className="mb-4">
          <h2 className="font-semibold">จำนวนตัวที่แพ็คต่อวัน</h2>
          <p className="text-xs text-slate-500">กราฟเส้นแยกตามกลุ่มการจัดสินค้า · ชี้ที่เส้นหรือจุดเพื่อดูชื่อข้อมูล</p>
        </div>
        <LineTrendChart dates={trendDates} series={itemTrendSeries} unit="ชิ้น" />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <GroupSummaryCard title="สรุปตามกลุ่มการจัดสินค้า" rows={byGroup} totalItems={totalItems} emptyText="ยังไม่มีข้อมูลตามตัวกรองนี้" />
        <GroupSummaryCard title="ยังไม่ปิดงานตามกลุ่มการจัดสินค้า" rows={unclosedByGroup} totalItems={totalUnclosedItems} emptyText="ไม่มีรายการที่ยังไม่ปิดงานตามตัวกรองนี้" showLines />

        <section className="card p-4">
          <div className="mb-4">
            <h2 className="font-semibold">สัดส่วนสถานะวันที่จัดสินค้าเสร็จ</h2>
            <p className="text-xs text-slate-500">นับจากจำนวนเลข order_number · ชี้ที่ชิ้นกราฟเพื่อดูชื่อสถานะ</p>
          </div>
          <PieStatusChart rows={statusData} total={pieTotal} />
        </section>
      </div>
    </div>
  );
}

function GroupSummaryCard({
  title,
  rows,
  totalItems,
  emptyText,
  showLines = false,
}: {
  title: string;
  rows: SummaryGroup[];
  totalItems: number;
  emptyText: string;
  showLines?: boolean;
}) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="space-y-3">
        {rows.length ? rows.map((g, i) => {
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
              <div className="mt-1 text-xs text-slate-500">
                {num(g.orders)} ออเดอร์
                {showLines ? ` · ${num(g.lines || 0)} รายการ` : ` · จัดผิด ${num(g.wrong || 0)}`}
              </div>
            </div>
          );
        }) : <div className="py-8 text-center text-sm text-slate-400">{emptyText}</div>}
      </div>
    </section>
  );
}

function LineTrendChart({ dates, series, unit }: { dates: string[]; series: { label: string; color: string; points: number[] }[]; unit: string }) {
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
              <path d={d} fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <title>{`${s.label} · ${unit}`}</title>
              </path>
              {s.points.map((p, i) => (
                <g key={`${s.label}-${dates[i]}`}>
                  <circle cx={x(i)} cy={y(p)} r="4" fill={s.color} stroke="white" strokeWidth="2">
                    <title>{`${s.label} · ${thDate(dates[i])} · ${num(p)} ${unit}`}</title>
                  </circle>
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
    <div className="flex justify-center">
      <svg viewBox="0 0 220 220" className="mx-auto h-[260px] w-[260px] max-w-full">
        {slices.map((s) => {
          const pct = total ? (s.value / total) * 100 : 0;
          return (
            <path key={s.row.completion_status} d={piePath(cx, cy, r, s.start, s.end)} fill={s.color} stroke="var(--surface)" strokeWidth="3">
              <title>{`${s.row.completion_status} · ${num(s.value)} ออเดอร์ · ${pct.toFixed(1)}% · ${num(s.row.lines_count)} รายการ · ${num(s.row.items_qty)} ชิ้น`}</title>
            </path>
          );
        })}
        <circle cx={cx} cy={cy} r="48" fill="var(--surface)" />
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-500 text-[12px]">ออเดอร์</text>
        <text x={cx} y={cy + 22} textAnchor="middle" className="fill-slate-800 text-[24px] font-bold">{num(total)}</text>
      </svg>
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
