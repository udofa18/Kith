/**
 * Feature switches for parts of Kith that are not ready for everyone yet.
 *
 * These are compile-time constants rather than remote flags: flipping one back
 * to `true` (or launching the feature) restores the routes, navigation and
 * promo surfaces in one place.
 */

/** Challenges/Bounties are being reworked and stay hidden until launch. */
export const CHALLENGES_ENABLED = false;

const ADMIN_EMAILS = ['danieludofa452@gmail.com'];

type MaybeUser = { role?: string; email?: string | null } | null | undefined;

/** Admins can preview unfinished features before they are public. */
export function isAdminUser(user: MaybeUser): boolean {
  return !!user && (user.role === 'admin' || ADMIN_EMAILS.includes(user.email || ''));
}

/** Whether this viewer may see Challenges/Bounties right now. */
export function canSeeChallenges(user: MaybeUser): boolean {
  return CHALLENGES_ENABLED || isAdminUser(user);
}
