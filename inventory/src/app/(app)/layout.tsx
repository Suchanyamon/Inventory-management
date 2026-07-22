import NavLink from "@/components/NavLink";
import ThemeToggle from "@/components/ThemeToggle";
import { getSessionProfile } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

const ROLE_LABEL: Record<string, string> = { admin: "ผู้ดูแลระบบ", staff: "พนักงานคลัง", viewer: "ดูอย่างเดียว" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, profile } = await getSessionProfile();
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">📦</span>
          <div>
            <div className="text-sm font-semibold leading-tight">คลังสินค้า</div>
            <div className="text-xs text-slate-400">DCMT · DCMTA</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          <NavLink href="/" label="แดชบอร์ด POLOMAKER" icon="📊" />
          <NavLink href="/pwc19" label="แดชบอร์ด PWC19" icon="🏬" />
          <NavLink href="/operations" label="รับ-เบิก-โอน" icon="🔁" />
          <NavLink href="/scan" label="สแกนบาร์โค้ด" icon="📷" />
          <NavLink href="/products" label="สินค้า" icon="🏷️" />
          <NavLink href="/reorder" label="ต้องสั่งเพิ่ม" icon="🛒" />
          <NavLink href="/reports" label="รายงานมูลค่า" icon="💰" />
          <NavLink href="/movements" label="ประวัติเคลื่อนไหว" icon="🧾" />
          {profile?.role === "admin" && <NavLink href="/settings" label="ตั้งค่า" icon="⚙️" />}
        </nav>
        <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
          <div className="px-2 text-xs">
            <div className="truncate font-medium text-slate-700">{profile?.full_name || email}</div>
            <div className="text-slate-400">{ROLE_LABEL[profile?.role || "viewer"]}</div>
          </div>
          <ThemeToggle className="w-full" />
          <form action={signOut}>
            <button className="btn-ghost w-full text-slate-500" type="submit">
              ออกจากระบบ
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <span className="flex items-center gap-2 font-semibold">📦 คลังสินค้า</span>
          <div className="flex items-center gap-2">
            <ThemeToggle className="!px-2 !py-1 text-xs" />
            <form action={signOut}>
              <button className="text-sm text-slate-500">ออก</button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-6">{children}</main>
        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-6 border-t border-slate-200 bg-white md:hidden">
          {[
            { href: "/", icon: "📊", label: "POLO" },
            { href: "/pwc19", icon: "🏬", label: "PWC19" },
            { href: "/operations", icon: "🔁", label: "ทำรายการ" },
            { href: "/scan", icon: "📷", label: "สแกน" },
            { href: "/reorder", icon: "🛒", label: "สั่งซื้อ" },
            { href: "/products", icon: "🏷️", label: "สินค้า" },
          ].map((i) => (
            <a key={i.href} href={i.href} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-slate-600">
              <span className="text-lg">{i.icon}</span>
              {i.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
