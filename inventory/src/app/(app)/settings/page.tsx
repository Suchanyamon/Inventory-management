import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import AddUserForm from "@/components/AddUserForm";
import { setRole, toggleActive } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { admin: "ผู้ดูแลระบบ", staff: "พนักงานคลัง", viewer: "ดูอย่างเดียว" };
const ROLE_BADGE: Record<string, string> = {
  admin: "bg-brand/10 text-brand",
  staff: "bg-amber-500/10 text-amber-600",
  viewer: "bg-slate-500/10 text-slate-500",
};

interface Row {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  email: string;
  created_at: string | null;
}

export default async function SettingsPage() {
  const { profile } = await getSessionProfile();
  if (profile?.role !== "admin") redirect("/");

  const admin = createSupabaseAdmin();
  const [{ data: profiles }, { data: authList }] = await Promise.all([
    admin.from("profiles").select("id, full_name, role, is_active, created_at").order("created_at", { ascending: true }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emailById = new Map((authList?.users || []).map((u) => [u.id, u.email || ""]));
  const rows: Row[] = ((profiles as any[]) || []).map((p) => ({ ...p, email: emailById.get(p.id) || "—" }));

  return (
    <div className="space-y-6 pb-16">
      <h1 className="text-xl font-semibold">ตั้งค่า · ผู้ใช้งาน</h1>

      {/* เพิ่มผู้ใช้ */}
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">➕ เพิ่มผู้ใช้งาน</h2>
          <p className="text-sm text-slate-500">
            สร้างบัญชีใหม่พร้อมกำหนดบทบาท ผู้ใช้จะเข้าระบบด้วยอีเมล + รหัสผ่านชั่วคราวที่ตั้งให้
          </p>
        </div>
        <AddUserForm />
      </section>

      {/* รายชื่อผู้ใช้ */}
      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="font-semibold">👥 ผู้ใช้ทั้งหมด ({rows.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-2 font-medium">ชื่อ / อีเมล</th>
                <th className="px-4 py-2 font-medium">บทบาท</th>
                <th className="px-4 py-2 font-medium">สถานะ</th>
                <th className="px-4 py-2 font-medium text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((u) => {
                const isSelf = u.id === profile.id;
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.full_name || "—"}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className={`rounded px-2 py-0.5 text-xs ${ROLE_BADGE[u.role] || ""}`}>
                          {ROLE_LABEL[u.role] || u.role}
                        </span>
                      ) : (
                        <form action={setRole} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={u.id} />
                          <select name="role" defaultValue={u.role} className="input !py-1 text-xs">
                            <option value="admin">admin</option>
                            <option value="staff">staff</option>
                            <option value="viewer">viewer</option>
                          </select>
                          <button type="submit" className="btn-ghost !px-2 !py-1 text-xs" title="บันทึกบทบาท">
                            ✓
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="text-emerald-600">● ใช้งาน</span>
                      ) : (
                        <span className="text-red-500">● ปิดใช้งาน</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isSelf && (
                        <form action={toggleActive} className="inline">
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="active" value={String(u.is_active)} />
                          <button type="submit" className="btn-ghost !py-1 text-xs">
                            {u.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                          </button>
                        </form>
                      )}
                      {isSelf && <span className="text-xs text-slate-400">บัญชีของคุณ</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
