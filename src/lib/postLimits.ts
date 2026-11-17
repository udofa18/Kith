/**
 * How much text a post may contain.
 *
 * Premium memberships will raise the ceiling in a later update, so the check
 * already takes a flag and call sites only need to pass it once premium tiers
 * exist. Keep this shared by the composer and the edit form so the rules can
 * never drift apart.
 */
export const POST_CHAR_LIMIT = 500;
export const PREMIUM_POST_CHAR_LIMIT = 2000;

export function postCharLimit(isPremium = false): number {
  return isPremium ? PREMIUM_POST_CHAR_LIMIT : POST_CHAR_LIMIT;
}
