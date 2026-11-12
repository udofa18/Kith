import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Token gating decides who may enter a live room. These tests drive the
 * Firestore reads with an in-memory fake so the policy is checked without a
 * project, and they cover the guest/follower/community/ticket paths that are
 * easy to regress.
 */
const store = vi.hoisted(() => {
  const docs = new Map<string, Record<string, any>>();
  const makeDoc = (path: string) => ({
    get: async () => {
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data };
    },
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => {
        const base = `${name}/${id}`;
        return {
          ...makeDoc(base),
          collection: (sub: string) => ({
            doc: (subId: string) => makeDoc(`${base}/${sub}/${subId}`),
          }),
        };
      },
    }),
  };
  return { docs, db };
});

vi.mock('../api/_lib/firebaseApp', () => ({
  firestoreAdmin: () => store.db,
}));

import { eventJoinError, issueLivekitToken } from '../api/_lib/livekitToken';

const host = 'host-1';
const now = Date.now();

function seedEvent(overrides: Record<string, any> = {}) {
  store.docs.set('events/e1', {
    hostId: host,
    visibility: 'public',
    status: 'live',
    startDate: new Date(now - 60_000).toISOString(),
    endDate: new Date(now + 60 * 60_000).toISOString(),
    ...overrides,
  });
}

beforeEach(() => {
  store.docs.clear();
  delete process.env.LIVEKIT_URL;
  delete process.env.VITE_LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
});

describe('live room token gating', () => {
  it('lets a guest into a public room and returns routing info', async () => {
    seedEvent();
    const result = await eventJoinError('e1', 'guest_abc', false);
    expect(result.error).toBeNull();
    expect(result.event?.type).toBe(undefined);
    expect(result.event?.hostId).toBe(host);
  });

  it('lets a guest into an unlisted room, because the link is the invite', async () => {
    seedEvent({ visibility: 'unlisted' });
    await expect(eventJoinError('e1', 'guest_abc', false)).resolves.toMatchObject({ error: null });
  });

  it('rejects an ended session before any other check', async () => {
    seedEvent({ status: 'ended' });
    await expect(eventJoinError('e1', 'guest_abc', false)).resolves.toMatchObject({
      error: 'This session has ended',
    });
  });

  it('rejects a session that has not started yet', async () => {
    seedEvent({
      status: 'scheduled',
      startDate: new Date(now + 60 * 60_000).toISOString(),
      endDate: new Date(now + 2 * 60 * 60_000).toISOString(),
    });
    await expect(eventJoinError('e1', 'guest_abc', false)).resolves.toMatchObject({
      error: 'This session has not started yet',
    });
  });

  it('opens the room five minutes before the scheduled start', async () => {
    seedEvent({
      status: 'scheduled',
      startDate: new Date(now + 2 * 60_000).toISOString(),
      endDate: new Date(now + 60 * 60_000).toISOString(),
    });
    await expect(eventJoinError('e1', 'guest_abc', false)).resolves.toMatchObject({ error: null });
  });

  it('closes the room once the end date has passed', async () => {
    seedEvent({
      status: 'scheduled',
      startDate: new Date(now - 2 * 60 * 60_000).toISOString(),
      endDate: new Date(now - 60 * 60_000).toISOString(),
    });
    await expect(eventJoinError('e1', 'guest_abc', false)).resolves.toMatchObject({
      error: 'This session has not started yet',
    });
  });

  it('always admits the host, even before the start time', async () => {
    seedEvent({
      status: 'scheduled',
      startDate: new Date(now + 24 * 60 * 60_000).toISOString(),
    });
    await expect(eventJoinError('e1', host, true)).resolves.toMatchObject({ error: null });
  });

  it('always admits a co-host', async () => {
    seedEvent({ coHostIds: ['co-1'] });
    await expect(eventJoinError('e1', 'co-1', true)).resolves.toMatchObject({ error: null });
  });

  it('requires a signed-in follower for a followers-only room', async () => {
    seedEvent({ visibility: 'followers' });
    await expect(eventJoinError('e1', 'guest_abc', false)).resolves.toMatchObject({
      error: 'Follow the host to join this room',
    });
    await expect(eventJoinError('e1', 'user-2', true)).resolves.toMatchObject({
      error: 'Follow the host to join this room',
    });

    store.docs.set(`users/user-2/following/${host}`, { createdAt: now });
    await expect(eventJoinError('e1', 'user-2', true)).resolves.toMatchObject({ error: null });
  });

  it('treats the link as the invite for an instant session, even followers-only', async () => {
    seedEvent({ type: 'instant', isInstant: true, visibility: 'followers' });

    // A signed-in member who does not follow the host, and a guest.
    await expect(eventJoinError('e1', 'user-2', true)).resolves.toMatchObject({ error: null });
    await expect(eventJoinError('e1', 'guest_abc', false)).resolves.toMatchObject({ error: null });
  });

  it('closes an instant session at its expiry even if the status is still live', async () => {
    seedEvent({
      type: 'instant',
      isInstant: true,
      visibility: 'followers',
      status: 'live',
      endDate: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now - 60_000).toISOString(),
    });
    await expect(eventJoinError('e1', 'user-2', true)).resolves.toMatchObject({
      error: 'This session has ended',
    });
  });

  it('requires membership for a community room', async () => {
    seedEvent({ visibility: 'community', communityId: 'c1' });
    await expect(eventJoinError('e1', 'user-2', true)).resolves.toMatchObject({
      error: 'Join this community to enter the room',
    });

    store.docs.set('communities/c1/members/user-2', { role: 'member' });
    await expect(eventJoinError('e1', 'user-2', true)).resolves.toMatchObject({ error: null });
  });

  it('requires a ticket for a paid room, even when it is public', async () => {
    seedEvent({ isPaid: true });
    await expect(eventJoinError('e1', 'guest_abc', false)).resolves.toMatchObject({
      error: 'A ticket is required to join this room',
    });
    await expect(eventJoinError('e1', 'user-2', true)).resolves.toMatchObject({
      error: 'A ticket is required to join this room',
    });

    store.docs.set('events/e1/registrations/user-2', { status: 'confirmed' });
    await expect(eventJoinError('e1', 'user-2', true)).resolves.toMatchObject({ error: null });
  });

  it('rejects rooms whose visibility it does not recognise', async () => {
    seedEvent({ visibility: 'secret' });
    await expect(eventJoinError('e1', 'user-2', true)).resolves.toMatchObject({
      error: 'This room is private',
    });
  });

  it('reports a missing event instead of guessing', async () => {
    await expect(eventJoinError('missing', 'guest_abc', false)).resolves.toMatchObject({
      error: 'This room does not exist',
    });
  });

  it('mints a token for an allowed guest and includes the event slice', async () => {
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret-that-is-long-enough-for-livekit';
    seedEvent({ type: 'instant', isInstant: true });

    const result = await issueLivekitToken({
      eventId: 'e1',
      userId: 'guest_abc',
      username: 'Guest',
    });

    expect(result.status).toBe(200);
    expect(typeof result.body.token).toBe('string');
    expect(result.body.event).toMatchObject({
      id: 'e1',
      type: 'instant',
      isInstant: true,
      hostId: host,
    });
  });

  it('refuses to mint a token for a denied join', async () => {
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret-that-is-long-enough-for-livekit';
    seedEvent({ visibility: 'followers' });

    const result = await issueLivekitToken({
      eventId: 'e1',
      userId: 'guest_abc',
      username: 'Guest',
    });

    expect(result.status).toBe(401);
    expect(result.body.error).toBe('Follow the host to join this room');
    expect(result.body.token).toBeUndefined();
  });
});
