import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The lobby endpoint is the public face of a room: it must expose the title,
 * host, phase and a participant count without letting a denied viewer read a
 * private room's content or minting a token. Counts come from LiveKit when
 * configured, otherwise from the webhook's recent counter or presence docs.
 */
const fake = vi.hoisted(() => {
  const store = new Map<string, Record<string, any>>();

  const makeDoc = (path: string) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    collection: (name: string) => makeCollection(`${path}/${name}`),
  });

  const makeCollection = (path: string) => ({
    doc: (id: string) => makeDoc(`${path}/${id}`),
    get: async () => ({
      docs: [...store.entries()]
        .filter(([key]) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1)
        .map(([key, data]) => ({ id: key.split('/').pop() as string, data: () => data })),
    }),
  });

  return { store, makeCollection };
});

vi.mock('../api/_lib/firebaseApp', () => ({
  firestoreAdmin: () => ({ collection: fake.makeCollection }),
  uidFromAuthHeader: async (authorization?: string) => {
    if (authorization === 'Bearer host-token') return 'host-1';
    if (authorization === 'Bearer cohost-token') return 'co-1';
    if (authorization === 'Bearer attendee-token') return 'attendee-2';
    return null;
  },
}));

import { getLiveSessionInfo } from '../api/_lib/liveSessionInfo';

const now = Date.now();

function seedRoom(overrides: Record<string, any> = {}) {
  fake.store.set('events/e1', {
    title: 'Friday hangout',
    description: 'Come say hello',
    hostId: 'host-1',
    coHostIds: ['co-1'],
    visibility: 'public',
    type: 'instant',
    isInstant: true,
    status: 'live',
    startDate: new Date(now - 60_000).toISOString(),
    endDate: new Date(now + 30 * 60_000).toISOString(),
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
    ...overrides,
  });
  fake.store.set('users/host-1', { displayName: 'Ada', username: 'ada', profileImage: 'ada.png' });
  fake.store.set('users/co-1', { displayName: 'Grace', username: 'grace' });
}

beforeEach(() => {
  fake.store.clear();
  delete process.env.LIVEKIT_URL;
  delete process.env.VITE_LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
});

describe('live session lobby info', () => {
  it('lets a guest see a public room and its host', async () => {
    seedRoom();
    const { status, body } = await getLiveSessionInfo('e1');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      phase: 'live',
      participantCount: 0,
      countIsLive: false,
      viewer: { signedIn: false, isManager: false, joinable: true, reason: null },
      host: { uid: 'host-1', name: 'Ada', username: 'ada' },
    });
    expect((body.event as any).description).toBe('Come say hello');
    expect((body.coHosts as any[])[0]).toMatchObject({ uid: 'co-1', name: 'Grace' });
  });

  it('marks the host as a manager who can always enter', async () => {
    seedRoom();
    const { body } = await getLiveSessionInfo('e1', 'Bearer host-token');
    expect(body.viewer).toMatchObject({ signedIn: true, isManager: true, joinable: true });
  });

  it('keeps private room content hidden from a denied guest', async () => {
    seedRoom({ visibility: 'community', communityId: 'c1', type: undefined, isInstant: undefined });
    const { body } = await getLiveSessionInfo('e1');
    expect(body.viewer).toMatchObject({ joinable: false, reason: 'Join this community to enter the room' });
    expect((body.event as any).description).toBe('');
    expect((body.event as any).banner).toBeUndefined();
  });

  it('treats an instant link as the invite for a followers-only room', async () => {
    seedRoom({ visibility: 'followers' });

    // A signed-in member who does not follow the host.
    const member = await getLiveSessionInfo('e1', 'Bearer attendee-token');
    expect(member.body.viewer).toMatchObject({ signedIn: true, joinable: true, reason: null });
    expect((member.body.event as any).description).toBe('Come say hello');

    // The same invite opened without an account.
    const guest = await getLiveSessionInfo('e1');
    expect(guest.body.viewer).toMatchObject({ signedIn: false, joinable: true, reason: null });
  });

  it('treats a legacy type-only instant marker as an instant room', async () => {
    seedRoom({ isInstant: undefined });
    const { body } = await getLiveSessionInfo('e1');
    expect((body.event as any).isInstant).toBe(true);
    expect(body.viewer).toMatchObject({ joinable: true, reason: null });
  });

  it('reports an ended instant room as ended and unjoinable', async () => {
    seedRoom({
      status: 'live',
      endDate: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now - 60_000).toISOString(),
    });
    const { body } = await getLiveSessionInfo('e1', 'Bearer attendee-token');
    expect(body).toMatchObject({ phase: 'ended', viewer: { joinable: false } });
  });

  it('falls back to fresh presence documents without LiveKit credentials', async () => {
    seedRoom();
    fake.store.set('eventSessions/e1/participants/attendee-2', { lastSeenAt: now });
    fake.store.set('eventSessions/e1/participants/attendee-3', { lastSeenAt: now - 10_000 });
    fake.store.set('eventSessions/e1/participants/stale-4', { lastSeenAt: now - 5 * 60_000 });

    const { body } = await getLiveSessionInfo('e1');
    expect(body).toMatchObject({ participantCount: 2, countIsLive: false });
  });

  it('uses a recent webhook counter when presence docs are missing', async () => {
    seedRoom();
    fake.store.set('eventSessions/e1', {
      participantCount: 4,
      livekitUpdatedAt: new Date(now - 15_000).toISOString(),
    });

    const { body } = await getLiveSessionInfo('e1');
    expect(body).toMatchObject({ participantCount: 4, countIsLive: false });
  });

  it('validates the room id and reports a missing room', async () => {
    await expect(getLiveSessionInfo('not a room')).resolves.toMatchObject({ status: 400 });
    await expect(getLiveSessionInfo('missing')).resolves.toMatchObject({ status: 404 });
  });
});
