export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * The project's *publishable* key (`sb_publishable_…`), which replaces the legacy
 * anon JWT. Public by design: Row Level Security and the SECURITY DEFINER RPCs
 * are what constrain it, not secrecy.
 */
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/**
 * The app is useful to look at before Supabase credentials exist, so every
 * data-backed page checks this and renders a setup notice instead of throwing.
 */
export function isSupabaseConfigured() {
  return supabaseUrl.length > 0 && supabasePublishableKey.length > 0;
}
