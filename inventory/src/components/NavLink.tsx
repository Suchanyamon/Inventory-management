"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition " +
        (active ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100")
      }
    >
      <span className="text-base">{icon}</span>
      {label}
    </Link>
  );
}
