import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { auth } from './firebase';
import { ensureSupabaseRoleClaim } from './lib/authClaim';

export type AppSupabaseClient = SupabaseClient;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Supabase trusts Firebase ID tokens (Third-party Auth → Firebase). Those tokens only carry the
 * `role: 'authenticated'` claim that Supabase needs once the claim has been set on the Firebase
 * user *and* the token has been refreshed. Cached tokens from before the claim was added would be
 * treated as `anon`, so refresh once when the claim is missing.
 */
const TOKEN_REFRESH_MARGIN_SECONDS = 300;

function claimsOf(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function createSupabaseClient(): AppSupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase env vars missing (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)');
    return null;
  }

  let cached: { token: string; expiresAt: number } | null = null;

  async function freshFirebaseToken(): Promise<string | null> {
    const user = auth.currentUser;
    if (!user) {
      cached = null;
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (cached && cached.expiresAt - now > TOKEN_REFRESH_MARGIN_SECONDS) return cached.token;

    const token = await user.getIdToken();
    const claims = claimsOf(token);
    const expiresAt = typeof claims?.exp === 'number' ? claims.exp : now + 300;

    // Older tokens predate the role claim; ask the API to add it, then refresh once so Supabase
    // sees `authenticated` instead of `anon`.
    if (claims?.role !== 'authenticated' && expiresAt - now > 60) {
      await ensureSupabaseRoleClaim(token);
      const refreshed = await user.getIdToken(true);
      const refreshedClaims = claimsOf(refreshed);
      const refreshedExpiry = typeof refreshedClaims?.exp === 'number' ? refreshedClaims.exp : now + 300;
      cached = { token: refreshed, expiresAt: refreshedExpiry };
      return refreshed;
    }

    cached = { token, expiresAt };
    return token;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: freshFirebaseToken,
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
  const code = (error as { code?: string } | null)?.code;
  console.error('Supabase Error:', { operation, table, code, message, userId: auth.currentUser?.uid });

  if (code === 'PGRST301') {
    throw new Error(
      'Supabase rejected the Firebase token. Enable Firebase under Authentication → Third-party Auth ' +
        `for project ${supabaseUrl ?? '(missing URL)'}, then refresh the page.`,
    );
  }

  throw new Error(message);
}
