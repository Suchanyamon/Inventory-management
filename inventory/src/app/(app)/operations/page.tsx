import OperationPanel from "@/components/OperationPanel";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSessionProfile, canWrite } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OperationsPage({ searchParams }: { searchParams: { sku?: string } }) {
  const supabase = createSupabaseServer();
  const { data: whs } = await supabase.from("warehouse").select("code, name").eq("is_active", true).order("code");
  const { profile } = await getSessionProfile();

  return (
    <div className="mx-auto max-w-lg pb-16">
      <h1 className="mb-1 text-xl font-semibold">รับ-เบิก-โอน</h1>
      <p className="mb-4 text-sm text-slate-500">บันทึกการเคลื่อนไหวสต๊อก — ทุกครั้งลงบัญชีเดินสต๊อก (ตรวจย้อนหลังได้)</p>
      {!canWrite(profile?.role) ? (
        <div className="card p-6 text-center text-sm text-slate-500">
          บทบาทของคุณ (ดูอย่างเดียว) ไม่มีสิทธิ์ทำรายการสต๊อก
        </div>
      ) : (
        <OperationPanel warehouses={whs || []} initialSku={searchParams.sku || ""} />
      )}
    </div>
  );
}
