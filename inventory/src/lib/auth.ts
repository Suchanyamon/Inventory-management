import { createSupabaseServer } from "@/lib/supabase/server";

export type Role = "admin" | "staff" | "viewer";
export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
}

/** ดึง user + profile (role) ของ session ปัจจุบัน */
export async function getSessionProfile(): Promise<{ email: string | null; profile: Profile | null }> {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { email: null, profile: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();
  return { email: user.email ?? null, profile: (profile as Profile) ?? null };
}

export function canWrite(role: Role | undefined | null): boolean {
  return role === "admin" || role === "staff";
}
