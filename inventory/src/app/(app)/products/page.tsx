import { createSupabaseServer } from "@/lib/supabase/server";
import { num, baht, STATUS_LABEL } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";
const PAGE = 40;

export default async function ProductsPage({ searchParams }: { searchParams: { q?: string; p?: string } }) {
  const q = (searchParams.q || "").trim();
  const page = Math.max(1, Number(searchParams.p || 1));
  const supabase = createSupabaseServer();

  let query = supabase
    .from("v_product_stock")
    .select("sku,name,category,size,color,box_pack_size,on_hand,full_boxes,loose_units,value_current_cost,stock_status", { count: "exact" })
    .order("on_hand", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.or(`sku.ilike.%${q}%,name.ilike.%${q}%`);

  const { data: rows, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE));

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">สินค้า</h1>
        <span className="text-sm text-slate-400">{num(count || 0)} SKU</span>
      </div>

      <form className="flex gap-2">
        <input name="q" defaultValue={q} className="input" placeholder="ค้นหา SKU หรือชื่อสินค้า…" />
        <button className="btn-primary shrink-0">ค้นหา</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="th">SKU</th>
              <th className="th">สินค้า</th>
              <th className="th text-right">บรรจุ/กล่อง</th>
              <th className="th text-right">คงเหลือ</th>
              <th className="th text-right">กล่อง+เศษ</th>
              <th className="th text-right">มูลค่า</th>
              <th className="th">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(rows || []).map((r) => {
              const st = STATUS_LABEL[r.stock_status] || STATUS_LABEL.unknown;
              return (
                <tr key={r.sku} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">
                    <Link href={`/products/${encodeURIComponent(r.sku)}`} className="text-brand hover:underline">{r.sku}</Link>
                  </td>
                  <td className="td max-w-[260px] truncate">{r.name}</td>
                  <td className="td text-right">{r.box_pack_size ?? "—"}</td>
                  <td className="td text-right font-medium">{num(Number(r.on_hand))}</td>
                  <td className="td text-right text-slate-500">
                    {r.box_pack_size ? `${num(Number(r.full_boxes))} + ${num(Number(r.loose_units))}` : "—"}
                  </td>
                  <td className="td text-right text-slate-500">{baht(Number(r.value_current_cost))}</td>
                  <td className="td"><span className={"badge " + st.cls}>{st.text}</span></td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && <tr><td className="td text-slate-400" colSpan={7}>ไม่พบสินค้า</td></tr>}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="flex items-center justify-center gap-2 text-sm">
        {page > 1 && <Link className="btn-ghost" href={`/products?q=${encodeURIComponent(q)}&p=${page - 1}`}>← ก่อนหน้า</Link>}
        <span className="px-2 text-slate-500">หน้า {page}/{totalPages}</span>
        {page < totalPages && <Link className="btn-ghost" href={`/products?q=${encodeURIComponent(q)}&p=${page + 1}`}>ถัดไป →</Link>}
      </div>
    </div>
  );
}
