import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { LIVE_HEARTBEAT_STALE_MS } from '../lib/livePresence';
import { useCurrentUser } from './CurrentUserContext';

export interface LiveEvent {
  id: string;
  hostId: string;
  title?: string;
  banner?: string;
  category?: string;
  status?: string;
  visibility?: string;
  attendeeCount?: number;
  startDate?: string;
  endDate?: string;
  expiresAt?: string;
  [key: string]: any;
}

interface LiveStatusValue {
  /** Every host we can prove is live right now, keyed by their user id. */
  liveByUser: Map<string, LiveEvent>;
  /** Public rooms plus the current user's own room, newest first. */
  liveEvents: LiveEvent[];
  myLiveEvent: LiveEvent | null;
  liveFor: (userId?: string | null) => LiveEvent | null;
  ready: boolean;
}

const EMPTY = new Map<string, LiveEvent>();

const LiveStatusContext = createContext<LiveStatusValue>({
  liveByUser: EMPTY,
  liveEvents: [],
  myLiveEvent: null,
  liveFor: () => null,
  ready: false,
});

const sortLive = (events: LiveEvent[]) =>
  [...events].sort((a, b) => {
    const at = new Date(a.startDate || 0).getTime();
    const bt = new Date(b.startDate || 0).getTime();
    return bt - at;
  });

const heartbeatMs = (data: Record<string, any>) => {
  const beat = data.heartbeatAt;
  if (typeof beat === 'number') return beat;
  if (typeof data.updatedAt === 'string') return new Date(data.updatedAt).getTime();
  if (typeof data.updatedAt?.toMillis === 'function') return data.updatedAt.toMillis();
  return null;
};

/**
 * A single listener over the `liveStatus` heartbeat collection powers the red
 * ring on avatars. Hosts write one document (keyed by their uid) while their
 * room is on air; the server deletes it when the room ends. Presence is kept
 * deliberately lightweight: just who is live and which event to open.
 */
export function LiveStatusProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const uid: string | null = user?.uid ?? null;
  // Raw documents plus a heartbeat flag. Deriving the visible map from `now`
  // means a host that disappears without cleaning up stops showing as live,
  // even when no further Firestore snapshot arrives.
  const [documents, setDocuments] = useState<Record<string, Record<string, any>>>({});
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const liveQuery = query(
      collection(db, 'liveStatus'),
      where('active', '==', true),
    );

    const unsubscribe = onSnapshot(
      liveQuery,
      (snapshot) => {
        const next: Record<string, Record<string, any>> = {};
        snapshot.docs.forEach((entry) => {
          const data = entry.data() as Record<string, any>;
          const hostId = typeof data.uid === 'string' ? data.uid : entry.id;
          if (!hostId) return;
          next[hostId] = { ...data, uid: hostId };
        });
        setDocuments(next);
        setNow(Date.now());
        setReady(true);
      },
      (error) => {
        // Keep `ready` false so views that filter by presence fall back to the
        // event date window instead of hiding every room.
        console.warn('Live status listener is unavailable:', error);
        setDocuments({});
      },
    );

    return unsubscribe;
  }, []);

  // Re-check staleness on a timer, at half the stale window so the ring
  // disappears within ~37s of the last heartbeat.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), Math.round(LIVE_HEARTBEAT_STALE_MS / 2));
    return () => clearInterval(timer);
  }, []);

  const liveByUser = useMemo(() => {
    const next = new Map<string, LiveEvent>();
    Object.values(documents).forEach((data) => {
      const hostId = typeof data.uid === 'string' ? data.uid : '';
      const eventId = typeof data.eventId === 'string' ? data.eventId : '';
      const beat = heartbeatMs(data);

      // A stale heartbeat means the host vanished; the room is no longer live.
      if (!hostId || !eventId) return;
      if (beat !== null && now - beat > LIVE_HEARTBEAT_STALE_MS) return;

      next.set(hostId, {
        id: eventId,
        hostId,
        status: 'live',
        visibility: data.visibility,
        startDate: data.startedAt,
      });
    });
    return next;
  }, [documents, now]);

  const liveEvents = useMemo(() => sortLive([...liveByUser.values()]), [liveByUser]);

  const liveFor = useCallback(
    (userId?: string | null) => (userId ? liveByUser.get(userId) ?? null : null),
    [liveByUser],
  );

  const value = useMemo<LiveStatusValue>(
    () => ({
      liveByUser,
      liveEvents,
      myLiveEvent: uid ? liveByUser.get(uid) ?? null : null,
      liveFor,
      ready,
    }),
    [liveByUser, liveEvents, liveFor, ready, uid],
  );

  return <LiveStatusContext.Provider value={value}>{children}</LiveStatusContext.Provider>;
}

/** Safe outside the provider too, so shared UI never crashes in isolated previews. */
export function useLiveStatus() {
  return useContext(LiveStatusContext);
}
