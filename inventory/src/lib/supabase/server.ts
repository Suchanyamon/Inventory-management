import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client สำหรับ Server Components / Server Actions / Route Handlers */
export function createSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as never)
            );
          } catch {
            // เรียกจาก Server Component — refresh cookie จะทำใน middleware แทน
          }
        },
      },
    }
  );
}
