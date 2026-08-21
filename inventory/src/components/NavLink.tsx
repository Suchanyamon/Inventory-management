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
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition " +
        (active
          ? "bg-gradient-to-r from-brand to-red-700 text-white shadow-lg shadow-red-900/15"
          : "text-slate-600 hover:bg-brand/5 hover:text-brand")
      }
    >
      <span className="text-base">{icon}</span>
      {label}
    </Link>
  );
}
