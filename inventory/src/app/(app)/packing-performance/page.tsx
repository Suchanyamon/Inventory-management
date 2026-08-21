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

const groupColors = [
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-red-100 text-red-700 border-red-200",
  "bg-slate-100 text-slate-500 border-slate-200",
];

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

  const [{ data: rows }, { data: groups }, { data: latest }] = await Promise.all([
    q,
    supabase.from("packing_performance_daily").select("packing_group").order("packing_group", { ascending: true }),
    supabase.from("packing_performance_daily").select("finished_date").order("finished_date", { ascending: false }).limit(1),
  ]);

  const data = (rows || []) as Row[];
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

function Kpi({ label, value, tone = "text-brand", sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
