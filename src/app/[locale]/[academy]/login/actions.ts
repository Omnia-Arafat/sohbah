"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { LoginFieldErrors, LoginState } from "./state";

/**
 * `?next=` is attacker-controlled, so only same-origin absolute paths are
 * honoured. Protocol-relative (`//evil.com`) and backslash forms are the usual
 * ways an open redirect sneaks through.
 */
function safeNext(raw: string): string | null {
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("\\")) return null;
  return raw;
}

export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const academySlug = String(formData.get("academySlug") ?? "").trim();

  const fieldErrors: LoginFieldErrors = {};
  if (!email) fieldErrors.email = "emailRequired";
  if (!password) fieldErrors.password = "passwordRequired";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", email, fieldErrors };
  }

  if (!isSupabaseConfigured()) {
    return { status: "failed", email, reason: "notConfigured" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately not echoed to the user: a precise message would confirm
    // which addresses exist.
    console.error("sign-in failed", error.message);
    return {
      status: "failed",
      email,
      reason: error.status === 400 ? "invalidCredentials" : "generic",
    };
  }

  // Every cached segment was rendered without a session cookie.
  revalidatePath("/", "layout");
  
  // Redirect to academy-specific dashboard
  const redirectPath = next ?? `/${academySlug}/dashboard`;
  redirect(redirectPath);
}

export async function signOut(academySlug: string) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect(`/${academySlug}/login`);
}
