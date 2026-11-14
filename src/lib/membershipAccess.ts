/**
 * Client-side view of a paid membership. Mirrors the Firestore rule: channels need a period that
 * has not ended yet; the community stays visible during grace, then access is removed entirely.
 */
export type MemberAccessState = 'none' | 'staff' | 'active' | 'non-renewing' | 'grace' | 'expired';

export interface MemberAccess {
  state: MemberAccessState;
  /** Community and its about/members pages are visible. */
  canViewCommunity: boolean;
  /** Channels, messages and posting are allowed. */
  canUseChannels: boolean;
  /** Billing period end, when the member paid for a period. */
  expiresAt: string | null;
  /** End of grace, after which the membership is removed. */
  accessUntil: string | null;
  isPaid: boolean;
  graceDaysLeft: number | null;
}

const DAY = 86_400_000;
const GRACE_DAYS = 3;

function iso(value: unknown): string | null {
  if (typeof value === 'string' && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  // Firestore Timestamp in the browser SDK.
  if (value && typeof value === 'object' && typeof (value as any).toDate === 'function') {
    const parsed = (value as any).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

export function graceDaysLeft(accessUntil: string | null, now = Date.now()): number | null {
  if (!accessUntil) return null;
  const ms = new Date(accessUntil).getTime() - now;
  return ms > 0 ? Math.ceil(ms / DAY) : 0;
}

export function memberAccess(member: any | null | undefined, now = Date.now()): MemberAccess {
  if (!member) {
    return {
      state: 'none',
      canViewCommunity: false,
      canUseChannels: false,
      expiresAt: null,
      accessUntil: null,
      isPaid: false,
      graceDaysLeft: null,
    };
  }

  const role = member.role;
  const staff = role === 'owner' || role === 'admin' || role === 'moderator';
  const expiresAt = iso(member.membershipExpiresAt);
  const storedAccessUntil = iso(member.accessUntil);
  const accessUntil =
    storedAccessUntil ?? (expiresAt ? new Date(Date.parse(expiresAt) + GRACE_DAYS * DAY).toISOString() : null);
  const isPaid = member.paid === true || !!member.subscriptionStatus || !!expiresAt;

  if (staff) {
    return {
      state: 'staff',
      canViewCommunity: true,
      canUseChannels: true,
      expiresAt,
      accessUntil,
      isPaid,
      graceDaysLeft: null,
    };
  }

  // Free or one-time memberships have no expiry: access is permanent.
  if (!expiresAt) {
    return {
      state: 'active',
      canViewCommunity: true,
      canUseChannels: true,
      expiresAt: null,
      accessUntil: null,
      isPaid,
      graceDaysLeft: null,
    };
  }

  const expiresMs = Date.parse(expiresAt);
  if (expiresMs > now) {
    return {
      state: member.subscriptionStatus === 'non-renewing' ? 'non-renewing' : 'active',
      canViewCommunity: true,
      canUseChannels: true,
      expiresAt,
      accessUntil,
      isPaid,
      graceDaysLeft: null,
    };
  }

  const accessMs = accessUntil ? Date.parse(accessUntil) : 0;
  if (accessMs > now) {
    return {
      state: 'grace',
      canViewCommunity: true,
      canUseChannels: false,
      expiresAt,
      accessUntil,
      isPaid,
      graceDaysLeft: graceDaysLeft(accessUntil, now),
    };
  }

  return {
    state: 'expired',
    canViewCommunity: false,
    canUseChannels: false,
    expiresAt,
    accessUntil,
    isPaid,
    graceDaysLeft: 0,
  };
}
