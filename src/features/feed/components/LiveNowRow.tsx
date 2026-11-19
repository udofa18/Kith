import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowUpRight, Radio, Sparkles } from 'lucide-react';
import { db } from '../../../firebase';
import { feedService } from '../../../services/feedService';
import { queryKeys } from '../../../lib/queryClient';
import { eventHref, liveRoomPath } from '../../../lib/eventLinks';
import { useLiveStatus } from '../../../contexts/LiveStatusContext';
import { useCurrentUser } from '../../../contexts/CurrentUserContext';
import { displayName, photoOf } from '../../profile/api';
import { fetchViewerContext } from '../api/viewer';

function guestAvatar(id: string, person: Record<string, any> | null | undefined): string {
  const photo = person ? photoOf(person) : '';
  return photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(id)}`;
}

/** Each room gets its own accent so a long row of live rooms stays readable. */
const ROOM_ACCENTS = [
  { border: '#5eead4', title: 'text-[#9dc4ef]' },
  { border: '#f0a6d8', title: 'text-[#f7a6e0]' },
  { border: '#ffb65c', title: 'text-[#ffc078]' },
] as const;

/**
 * The feed's live doorway: rooms that are on air right now, plus a one-tap
 * path for anyone who wants to open their own room.
 */
export default function LiveNowRow({ onGoLive }: { onGoLive?: () => void }) {
  const user = useCurrentUser();
  const uid = user?.uid ?? null;

  // Followers-only rooms are discoverable for the host and their followers.
  // The viewer query is shared with the feed, so this costs no extra request.
  const { data: viewer } = useQuery({
    queryKey: queryKeys.feedViewer(uid),
    queryFn: () => fetchViewerContext(uid),
    staleTime: 1000 * 60 * 5,
    enabled: !!uid,
  });

  // Presence is the source of truth for "on air". It also tells us which
  // followers-only rooms are worth reading, since those documents are not
  // readable through a broad query.
  const { liveByUser, myLiveEvent, ready } = useLiveStatus();
  const onAirIds = useMemo(
    () =>
      [...new Set([...liveByUser.values()].map((event) => event.id).filter(Boolean))].sort(),
    [liveByUser],
  );
  const onAirKey = onAirIds.join('|');

  // A room can start after the feed's scheduled-events list was cached, so the
  // rail fetches its own data and refreshes while it is on screen.
  const { data } = useQuery({
    queryKey: [...queryKeys.liveNowEvents(), onAirKey],
    queryFn: () => feedService.getLiveNowEvents(onAirIds),
    staleTime: 0,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });

  const followingIds = viewer?.followingIds;

  const live = useMemo(() => {
    const onAir = new Set(onAirIds);
    return (data ?? [])
      .filter((event: any) => {
        if (ready && !onAir.has(event.id)) return false;
        if (event.visibility !== 'followers') return true;
        if (!uid) return false;
        const managers = [
          event.hostId,
          ...(Array.isArray(event.coHostIds) ? event.coHostIds : []),
        ];
        return managers.includes(uid) || (followingIds?.has(event.hostId) ?? false);
      })
      .slice(0, 4);
  }, [data, onAirIds, ready, uid, followingIds]);

  // The event document does not always carry the host's profile (instant rooms
  // omit it), so load host/co-host names and photos for the live bars.
  const peopleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of live) {
      if (typeof event.hostId === 'string' && event.hostId) ids.add(event.hostId);
      for (const id of Array.isArray(event.coHostIds) ? event.coHostIds : []) {
        if (typeof id === 'string' && id) ids.add(id);
      }
    }
    return [...ids].sort();
  }, [live]);

  const { data: people } = useQuery({
    queryKey: ['live-now-people', peopleIds.join('|')],
    enabled: peopleIds.length > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const entries = await Promise.all(
        peopleIds.map(async (id) => {
          const snapshot = await getDoc(doc(db, 'users', id)).catch(() => null);
          return [id, snapshot?.exists() ? snapshot.data() : null] as const;
        }),
      );
      return new Map(entries);
    },
  });

  if (live.length > 0) {
    // Someone who is already on air goes back into their room. Offering "Go
    // live" again would start a second session on top of the first.
    const myRoom = myLiveEvent
      ? live.find((event: any) => event.id === myLiveEvent.id) ?? myLiveEvent
      : null;

    return (
      <section aria-label="Live now" className="px-4 pt-3 pb-4 sm:px-5">
        <div className="flex items-center gap-3">
          {/* One row, left to right. On narrow screens the rooms scroll while the
              action on the right stays put. */}
          <div className="-mx-1 flex min-w-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {live.map((event: any, index: number) => {
              const host = people?.get(event.hostId) ?? null;
              const ownName = event.hostId === uid ? user?.displayName || user?.username : '';
              const hostName =
                (typeof event.hostName === 'string' && event.hostName) ||
                ownName ||
                (host ? displayName(host) : '');
              const managerIds = [
                event.hostId,
                ...(Array.isArray(event.coHostIds) ? event.coHostIds : []),
              ].filter((id): id is string => typeof id === 'string' && !!id);
              const avatars = [...new Set(managerIds)].slice(0, 3);
              const attendeeCount = Math.max(0, Number(event.attendeeCount) || 0);
              const accent = ROOM_ACCENTS[index % ROOM_ACCENTS.length];

              return (
                <Link
                  key={event.id}
                  to={eventHref(event)}
                  className="relative flex w-[240px] shrink-0 snap-start items-center gap-2.5 overflow-hidden rounded-[22px] bg-[#1b1720] px-4 py-3.5 text-[#f7f2e8] shadow-[0_18px_50px_-30px_rgba(14,11,19,0.9)] transition-transform hover:-translate-y-0.5 sm:w-[330px] sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-snug">
                      {hostName || 'Someone'}{' '}
                      <span className="font-medium text-[#f7f2e8]/60">is Live</span>
                    </p>
                    <p
                      className={`mt-1 line-clamp-2 font-display text-[15px] font-semibold leading-snug tracking-[-0.02em] ${accent.title}`}
                    >
                      {event.title || 'Live room'}
                    </p>
                  </div>

                  <span
                    className="relative flex shrink-0 items-center gap-1.5 rounded-full border-2 bg-[#1b1720] py-1 pl-1 pr-2.5"
                    style={{ borderColor: accent.border }}
                  >
                    <span className="flex -space-x-2.5">
                      {avatars.length > 0 ? (
                        avatars.map((id, avatarIndex) => (
                          <img
                            key={id}
                            src={guestAvatar(id, people?.get(id))}
                            alt=""
                            className={`h-7 w-7 rounded-full object-cover ring-2 ring-[#1b1720] ${
                              avatarIndex === 2 ? 'hidden sm:block' : ''
                            }`}
                            referrerPolicy="no-referrer"
                          />
                        ))
                      ) : (
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2a2234] text-[#f7f2e8]">
                          <Radio size={13} />
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] font-extrabold leading-none text-[#f7f2e8]">
                      {attendeeCount > 0 ? `+${attendeeCount}` : 'Live'}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="shrink-0">
            {myRoom ? (
              <Link
                to={liveRoomPath(myRoom)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3b7fa4] px-4 py-3 text-[13px] font-bold text-white transition-colors hover:bg-[#4890b8] active:scale-[0.98] sm:px-5"
              >
                Enter live
              </Link>
            ) : onGoLive ? (
              <button
                type="button"
                onClick={onGoLive}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3b7fa4] px-4 py-3 text-[13px] font-bold text-white transition-colors hover:bg-[#4890b8] active:scale-[0.98] sm:px-5"
              >
                Go live
              </button>
            ) : (
              <Link
                to="/login"
                state={{ from: { pathname: '/feed' } }}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3b7fa4] px-4 py-3 text-[13px] font-bold text-white transition-colors hover:bg-[#4890b8] active:scale-[0.98] sm:px-5"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Nothing is on air: keep the original quiet doorway.
  return (
    <section aria-label="Live now" className="px-4 pt-3 pb-4 sm:px-5">
      <div className="relative overflow-hidden rounded-[24px] bg-[#211a28] px-4 py-4 text-[#f7f2e8] shadow-[0_18px_50px_-30px_rgba(14,11,19,0.9)] sm:px-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.38),transparent_68%)] blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.2),transparent_70%)] blur-2xl" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3 sm:w-[190px] sm:shrink-0">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#ff6b4a]/25 bg-[#ff6b4a]/10 text-[#ffb09d]">
              <Radio size={17} />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 ring-2 ring-[#211a28]" />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#f7f2e8]/38">Live now</p>
              <p className="mt-0.5 truncate font-display text-[15px] font-semibold tracking-[-0.03em]">
                The room is quiet
              </p>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[12px] leading-relaxed text-[#f7f2e8]/52">
              <Sparkles size={13} className="shrink-0 text-[#ffb65c]" />
              Nobody has opened a room yet. Start one and your people will see it here.
            </p>
          </div>

          {onGoLive ? (
            <button
              onClick={onGoLive}
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#ff6b4a] px-4 py-2 text-[12px] font-bold text-[#1a1210] transition-all hover:bg-[#ff7d61] active:scale-[0.98]"
            >
              Go live
              <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          ) : (
            <Link
              to="/login"
              state={{ from: { pathname: '/feed' } }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#f7f2e8] px-4 py-2 text-[12px] font-bold text-[#211a28] transition-colors hover:bg-white"
            >
              Sign in to go live
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
