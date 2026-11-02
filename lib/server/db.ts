import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "./env";

let client: SupabaseClient | undefined;

/**
 * Service-role Supabase client. Bypasses RLS, so it must only ever run on the
 * server (enforced by `server-only`). No session persistence or token refresh:
 * guests are never Supabase Auth users.
 */
export function db(): SupabaseClient {
  if (client) return client;
  const env = serverEnv();
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
