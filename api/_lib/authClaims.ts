/**
 * Add the `role: 'authenticated'` custom claim Supabase third-party auth expects.
 * Idempotent: calling it for an already-claimed user does nothing.
 */
import { firebaseApp, uidFromAuthHeader } from './firebaseApp.js';

interface ClaimResult {
  status: number;
  body: Record<string, unknown>;
}

export async function ensureFirebaseRoleClaim(authorization?: string): Promise<ClaimResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return { status: 401, body: { error: 'Sign in required' } };

  try {
    const adminAuth = firebaseApp().auth();
    const user = await adminAuth.getUser(uid);
    if (user.customClaims?.role === 'authenticated') {
      return { status: 200, body: { updated: false } };
    }
    await adminAuth.setCustomUserClaims(uid, {
      ...user.customClaims,
      role: 'authenticated',
    });
    return { status: 200, body: { updated: true } };
  } catch (error) {
    console.error('Role claim error:', error);
    return { status: 500, body: { error: 'Could not prepare your account. Try again.' } };
  }
}
