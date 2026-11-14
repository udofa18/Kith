import { describe, expect, it } from 'vitest';
import { memberAccess } from '../src/lib/membershipAccess';

const DAY = 86_400_000;
const now = Date.parse('2026-11-13T10:00:00.000Z');

describe('memberAccess', () => {
  it('treats a free or one-time member as permanent', () => {
    expect(memberAccess({ role: 'member' }, now)).toMatchObject({
      state: 'active',
      canUseChannels: true,
      canViewCommunity: true,
    });
  });

  it('allows channels until the paid period ends', () => {
    const access = memberAccess(
      {
        role: 'member',
        paid: true,
        subscriptionStatus: 'active',
        membershipExpiresAt: '2026-11-20T10:00:00.000Z',
        accessUntil: '2026-11-23T10:00:00.000Z',
      },
      now,
    );
    expect(access.state).toBe('active');
    expect(access.canUseChannels).toBe(true);
    expect(access.graceDaysLeft).toBeNull();
  });

  it('keeps the community visible but locks channels during grace', () => {
    const access = memberAccess(
      {
        role: 'member',
        paid: true,
        subscriptionStatus: 'attention',
        membershipExpiresAt: new Date(now - DAY).toISOString(),
        accessUntil: new Date(now + 2 * DAY).toISOString(),
      },
      now,
    );
    expect(access.state).toBe('grace');
    expect(access.canViewCommunity).toBe(true);
    expect(access.canUseChannels).toBe(false);
    expect(access.graceDaysLeft).toBe(2);
  });

  it('removes all access after grace', () => {
    const access = memberAccess(
      {
        role: 'member',
        paid: true,
        subscriptionStatus: 'cancelled',
        membershipExpiresAt: new Date(now - 10 * DAY).toISOString(),
        accessUntil: new Date(now - 7 * DAY).toISOString(),
      },
      now,
    );
    expect(access.state).toBe('expired');
    expect(access.canViewCommunity).toBe(false);
    expect(access.canUseChannels).toBe(false);
  });

  it('never locks out staff', () => {
    const access = memberAccess(
      { role: 'owner', membershipExpiresAt: new Date(now - DAY).toISOString() },
      now,
    );
    expect(access.state).toBe('staff');
    expect(access.canUseChannels).toBe(true);
  });

  it('marks a cancelled renewal as non-renewing while paid time remains', () => {
    const access = memberAccess(
      {
        role: 'member',
        paid: true,
        subscriptionStatus: 'non-renewing',
        membershipExpiresAt: new Date(now + 5 * DAY).toISOString(),
        accessUntil: new Date(now + 8 * DAY).toISOString(),
      },
      now,
    );
    expect(access.state).toBe('non-renewing');
    expect(access.canUseChannels).toBe(true);
  });
});
