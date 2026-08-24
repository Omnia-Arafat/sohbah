import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { supabasePublishableKey, supabaseUrl } from "./config";

/**
 * Browser client — publishable key only. Every student-facing operation goes
 * through a SECURITY DEFINER RPC, so this key never needs elevated rights.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}
