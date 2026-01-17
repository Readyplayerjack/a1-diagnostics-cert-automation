import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadConfig } from '../config/index.js';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = loadConfig();

/**
 * Supabase client configured for server-side services using the service role key.
 * Do not expose this client to any end-user or browser contexts.
 */
export const supabaseClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

