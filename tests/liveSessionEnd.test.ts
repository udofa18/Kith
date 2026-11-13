import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ending a room is server-authoritative: the caller must be a host/co-host, and
 * only then are the event, the session document and every manager's presence
 * document marked/cleared in one transaction.
 */
const fake = vi.hoisted(() => {
  const store = new Map<string, Record<string, any>>();

  const makeRef = (path: string) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
  });

  const db = {
    collection: (name: string) => ({ doc: (id: string) => makeRef(`${name}/${id}`) }),
    runTransaction: async (run: (tx: any) => Promise<void>) => {
      const tx = {
        get: async (ref: any) => ({ exists: store.has(ref.path), data: () => store.get(ref.path) }),
        update: (ref: any, patch: Record<string, any>) => {
          store.set(ref.path, { ...(store.get(ref.path) || {}), ...patch });
        },
        set: (ref: any, patch: Record<string, any>) => {
          store.set(ref.path, { ...(store.get(ref.path) || {}), ...patch });
        },
        delete: (ref: any) => {
          store.delete(ref.path);
        },
      };
      return run(tx);
    },
  };

  return { store, db };
});

vi.mock('../api/_lib/firebaseApp', () => ({
  firestoreAdmin: () => fake.db,
  uidFromAuthHeader: async (authorization?: string) => {
    if (authorization === 'Bearer host-token') return 'host-1';
    if (authorization === 'Bearer cohost-token') return 'co-1';
    if (authorization === 'Bearer attendee-token') return 'attendee-2';
    return null;
  },
}));

import { endLiveSession } from '../api/_lib/liveSession';

const host = 'host-1';
const coHost = 'co-1';

function seedLiveRoom(overrides: Record<string, any> = {}) {
  fake.store.set('events/e1', {
    hostId: host,
    coHostIds: [coHost],
    status: 'live',
    endDate: new Date(Date.now() + 30 * 60_000).toISOString(),
    ...overrides,
  });
  fake.store.set('eventSessions/e1', { status: 'live' });
  fake.store.set(`liveStatus/${host}`, { uid: host, eventId: 'e1', active: true });
  fake.store.set(`liveStatus/${coHost}`, { uid: coHost, eventId: 'e1', active: true });
}

beforeEach(() => {
  fake.store.clear();
  delete process.env.LIVEKIT_URL;
  delete process.env.VITE_LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
});

describe('end live session', () => {
  it('requires a signed-in caller', async () => {
    seedLiveRoom();
    await expect(endLiveSession({ eventId: 'e1' })).resolves.toMatchObject({
      status: 401,
      body: { error: 'Sign in required' },
    });
  });

  it('rejects an invalid event id', async () => {
    await expect(endLiveSession({ eventId: 'not a room' }, 'Bearer host-token')).resolves.toMatchObject({
      status: 400,
    });
  });

  it('reports a missing event', async () => {
    await expect(endLiveSession({ eventId: 'gone' }, 'Bearer host-token')).resolves.toMatchObject({
      status: 404,
    });
  });

  it('refuses an attendee', async () => {
    seedLiveRoom();
    await expect(endLiveSession({ eventId: 'e1' }, 'Bearer attendee-token')).resolves.toMatchObject({
      status: 403,
      body: { error: 'Only the host or a co-host can end this session' },
    });
    expect(fake.store.get('events/e1')?.status).toBe('live');
  });

  it('closes a scheduled room without ending the event', async () => {
    seedLiveRoom();
    const scheduledEnd = fake.store.get('events/e1')?.endDate;

    const result = await endLiveSession({ eventId: 'e1' }, 'Bearer host-token');

    expect(result).toMatchObject({ status: 200, body: { ok: true, eventId: 'e1' } });

    const event = fake.store.get('events/e1');
    // The room closed, but the event is still scheduled for its original date.
    expect(event?.status).toBe('upcoming');
    expect(event?.endDate).toBe(scheduledEnd);
    expect(typeof event?.endedAt).toBe('string');
    expect(fake.store.get('eventSessions/e1')?.status).toBe('ended');
    expect(fake.store.get('eventSessions/e1')?.endedBy).toBe(host);

    // Presence docs are gone so no avatar keeps the red ring.
    expect(fake.store.has(`liveStatus/${host}`)).toBe(false);
    expect(fake.store.has(`liveStatus/${coHost}`)).toBe(false);
  });

  it('ends an instant room together with its event', async () => {
    seedLiveRoom({ type: 'instant' });

    await expect(endLiveSession({ eventId: 'e1' }, 'Bearer host-token')).resolves.toMatchObject({
      status: 200,
    });

    const event = fake.store.get('events/e1');
    expect(event?.status).toBe('ended');
    expect(typeof event?.endDate).toBe('string');
    expect(event?.endedAt).toBe(event?.endDate);
    expect(fake.store.get('eventSessions/e1')?.status).toBe('ended');
  });

  it('treats isInstant as an instant session too', async () => {
    seedLiveRoom({ isInstant: true });

    await endLiveSession({ eventId: 'e1' }, 'Bearer host-token');

    expect(fake.store.get('events/e1')?.status).toBe('ended');
  });

  it('keeps a scheduled event ended once its scheduled end has passed', async () => {
    const pastEnd = new Date(Date.now() - 60 * 60_000).toISOString();
    seedLiveRoom({ endDate: pastEnd });

    await endLiveSession({ eventId: 'e1' }, 'Bearer host-token');

    const event = fake.store.get('events/e1');
    expect(event?.status).toBe('ended');
    // The historical end date is preserved rather than rewritten to "now".
    expect(event?.endDate).toBe(pastEnd);
  });

  it('allows a co-host to end the room', async () => {
    seedLiveRoom();
    await expect(endLiveSession({ eventId: 'e1' }, 'Bearer cohost-token')).resolves.toMatchObject({
      status: 200,
    });
    expect(fake.store.get('eventSessions/e1')?.endedBy).toBe(coHost);
  });

  it('keeps other rooms\u2019 presence untouched', async () => {
    seedLiveRoom();
    fake.store.set('liveStatus/someone-else', { uid: 'someone-else', eventId: 'e2', active: true });

    await endLiveSession({ eventId: 'e1' }, 'Bearer host-token');

    expect(fake.store.get('liveStatus/someone-else')).toMatchObject({ eventId: 'e2', active: true });
  });
});
