"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Supabase client สำหรับ Client Components (เช่น หน้าสแกน + realtime) */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
