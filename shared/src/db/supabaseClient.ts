import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types.js';

let browserClient: SupabaseClient<Database> | null = null;
let serverClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  browserClient = createClient<Database>(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return browserClient;
}

export function getSupabaseServerClient() {
  if (serverClient) return serverClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  serverClient = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return serverClient;
}
