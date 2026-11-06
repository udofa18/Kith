/**
 * Supabase treats Firebase ID tokens as `anon` unless they carry `role: 'authenticated'`.
 * Existing users had the claim set with scripts/set-firebase-role-claim.ts, but new sign-ups need
 * it too. This asks the API to add the claim, then the caller refreshes its token.
 */
import { auth } from '../firebase';

let claimConfirmed = false;
let attempt: Promise<void> | null = null;

function roleOf(token: string): unknown {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role;
  } catch {
    return null;
  }
}

export async function ensureSupabaseRoleClaim(token?: string): Promise<void> {
  if (claimConfirmed) return;
  const user = auth.currentUser;
  if (!user) return;
  const idToken = token ?? (await user.getIdToken());
  if (roleOf(idToken) === 'authenticated') {
    claimConfirmed = true;
    return;
  }
  if (attempt) return attempt;

  attempt = (async () => {
    try {
      const response = await fetch('/api/auth/role-claim', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (response.ok) claimConfirmed = true;
    } catch (error) {
      // Offline or the API isn't running; the token refresh below still helps existing users.
      console.warn('Could not set Supabase role claim:', error);
    } finally {
      attempt = null;
    }
  })();

  return attempt;
}
