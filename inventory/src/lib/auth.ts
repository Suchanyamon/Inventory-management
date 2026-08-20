import { createSupabaseServer } from "@/lib/supabase/server";

export type Role = "admin" | "staff" | "viewer";
export interface Profile {
  user_id: string;
  display_name: string | null;
  role: Role;
}

/** ดึง user + profile (role) ของ session ปัจจุบัน */
export async function getSessionProfile(): Promise<{ email: string | null; profile: Profile | null }> {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { email: null, profile: null };
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, display_name, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Failed to load session profile", {
      code: profileError.code,
      message: profileError.message,
    });
  }
  return { email: user.email ?? null, profile: (profile as Profile) ?? null };
}

export function canWrite(role: Role | undefined | null): boolean {
  return role === "admin" || role === "staff";
}
