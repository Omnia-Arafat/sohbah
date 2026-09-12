/**
 * Trimmed, deliberately.
 *
 * A value pasted into a hosting dashboard very easily carries a trailing
 * newline, and the two ways this project uses these strings disagree about how
 * forgiving they are:
 *
 *   * REST sends the key as an HTTP header, where the stray byte is tolerated,
 *     so every page keeps loading and nothing looks wrong.
 *   * Realtime puts it in a WebSocket *query string*, where it is encoded as
 *     `%0A` and the connection is refused outright.
 *
 * The result is the worst kind of failure: the site works, and only the live
 * queue silently stops updating — which is exactly what was happening in
 * production. Trimming here fixes it for any environment, rather than relying
 * on every future deployment pasting the value cleanly.
 */
function readEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

export const supabaseUrl = readEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);

/**
 * The project's *publishable* key (`sb_publishable_…`), which replaces the legacy
 * anon JWT. Public by design: Row Level Security and the SECURITY DEFINER RPCs
 * are what constrain it, not secrecy.
 */
export const supabasePublishableKey = readEnv(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

/**
 * The app is useful to look at before Supabase credentials exist, so every
 * data-backed page checks this and renders a setup notice instead of throwing.
 */
export function isSupabaseConfigured() {
  return supabaseUrl.length > 0 && supabasePublishableKey.length > 0;
}
