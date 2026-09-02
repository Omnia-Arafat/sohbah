import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseUrl } from "./config";

/**
 * A Supabase client holding the service-role key.
 *
 * DANGER: this key bypasses Row Level Security completely. Every policy in the
 * schema is invisible to it. It exists for exactly two jobs that cannot be done
 * any other way:
 *
 *   1. creating a teacher's sign-in account already confirmed, so nobody waits
 *      for a confirmation email that can never arrive, and
 *   2. letting a supervisor reset a teacher's password.
 *
 * The `server-only` import above is the guard: if this module is ever pulled
 * into a Client Component, the build fails rather than shipping the key to the
 * browser. Never import it from a `"use client"` file, and never pass the
 * client or the key out of a server action.
 */
export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && supabaseUrl.length > 0;
}

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient<Database>(supabaseUrl, key, {
    auth: {
      // No cookies, no refresh: this client is used for one call and discarded.
      // Persisting a session here would risk it leaking into a user's context.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
