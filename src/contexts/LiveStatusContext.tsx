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

const isStillLive = (event: LiveEvent) => {
  if (event.status === 'ended') return false;
  if (!event.endDate) return true;
  return new Date(event.endDate).getTime() > Date.now();
};

const sortLive = (events: LiveEvent[]) =>
  [...events].sort((a, b) => {
    const at = new Date(a.startDate || 0).getTime();
    const bt = new Date(b.startDate || 0).getTime();
    return bt - at;
  });

/**
 * A single public live-events listener powers the red ring on every avatar.
 * Follower-only rooms are intentionally not queried here: Firestore list rules
 * cannot prove access to them without a per-host query.
 */
export function LiveStatusProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const uid: string | null = user?.uid ?? null;
  const [publicLive, setPublicLive] = useState<LiveEvent[]>([]);
  const [ownLive, setOwnLive] = useState<LiveEvent | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const publicQuery = query(
      collection(db, 'events'),
      where('visibility', '==', 'public'),
      where('status', '==', 'live'),
    );

    const unsubscribe = onSnapshot(
      publicQuery,
      (snapshot) => {
        if (!active) return;
        setPublicLive(
          snapshot.docs
            .map((entry) => ({ id: entry.id, ...entry.data() } as LiveEvent))
            .filter((event) => event.hostId && isStillLive(event)),
        );
        setReady(true);
      },
      (error) => {
        console.warn('Live status listener is unavailable:', error);
        if (active) {
          setPublicLive([]);
          setReady(true);
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!uid) {
      setOwnLive(null);
      return;
    }

    const ownQuery = query(
      collection(db, 'events'),
      where('hostId', '==', uid),
      where('status', '==', 'live'),
    );

    return onSnapshot(
      ownQuery,
      (snapshot) => {
        const mine = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() } as LiveEvent))
          .filter(isStillLive)
          .sort((a, b) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime());
        setOwnLive(mine[0] ?? null);
      },
      () => setOwnLive(null),
    );
  }, [uid]);

  const liveEvents = useMemo(() => {
    const byId = new Map<string, LiveEvent>();
    for (const event of publicLive) byId.set(event.id, event);
    if (ownLive) byId.set(ownLive.id, ownLive);
    return sortLive([...byId.values()]);
  }, [publicLive, ownLive]);

  const liveByUser = useMemo(() => {
    const next = new Map<string, LiveEvent>();
    for (const event of liveEvents) {
      if (event.hostId) next.set(event.hostId, event);
    }
    return next;
  }, [liveEvents]);

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
