import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { auth } from './firebase';

export type AppSupabaseClient = SupabaseClient;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function createSupabaseClient(): AppSupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase env vars missing (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)');
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => {
      const user = auth.currentUser;
      if (!user) return null;
      return user.getIdToken();
    },
  });
}

export const supabase = createSupabaseClient();

export function getSupabase(): AppSupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

export function handleSupabaseError(error: unknown, operation: string, table?: string) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Supabase Error:', { operation, table, message, userId: auth.currentUser?.uid });
  throw new Error(message);
}
