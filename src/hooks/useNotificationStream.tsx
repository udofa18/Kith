import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Bell, ChevronRight } from 'lucide-react';
import { db } from '../firebase';
import { playNotificationSound } from '../lib/sounds';
import { isDirectMessageType } from '../lib/notificationTaxonomy';
import { notificationTarget } from '../lib/notificationRouting';
import { isLiveInviteNotification, openLiveSessionModal } from '../lib/liveSessionModal';

interface StreamNotification {
  id: string;
  type?: string;
  senderId?: string;
  senderName?: string;
  senderPhoto?: string;
  content?: string;
  relatedId?: string;
  channelId?: string;
  liveInvite?: boolean;
  createdAt?: unknown;
}

const STREAM_LIMIT = 25;
const RECENT_INVITE_MS = 30 * 60_000;

function timestampMs(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value instanceof Date) return value.getTime();
  const candidate = value as { toMillis?: () => number; seconds?: number };
  if (typeof candidate.toMillis === 'function') return candidate.toMillis();
  if (typeof candidate.seconds === 'number') return candidate.seconds * 1000;
  return null;
}

/**
 * Invites are only worth interrupting someone for while the room is still
 * likely open. A missing timestamp is treated as fresh: better to show an
 * unread invite than silently swallow it on a cold start.
 */
function liveInviteIsRecent(item: StreamNotification): boolean {
  const created = timestampMs(item.createdAt);
  return created === null || Date.now() - created < RECENT_INVITE_MS;
}

/**
 * Watches the signed-in user's unread notifications and surfaces new arrivals as
 * a quiet in-app toast, with the same routing and sound rules as the centre.
 * Direct messages are skipped: the Messages badge and chat already cover them.
 */
export function useNotificationStream(user: any) {
  const navigate = useNavigate();
  const location = useLocation();
  const seen = useRef<Set<string>>(new Set());
  const hydrated = useRef(false);
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const onNotificationsPage = location.pathname === '/feed'
    && new URLSearchParams(location.search).get('view') === 'notifications';
  const onNotificationsPageRef = useRef(onNotificationsPage);
  onNotificationsPageRef.current = onNotificationsPage;

  useEffect(() => {
    const userId = user?.uid;

    seen.current = new Set();
    hydrated.current = false;

    if (!userId) return;

    const streamQuery = query(
      collection(db, 'notifications'),
      where('recipientId', '==', userId),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(STREAM_LIMIT),
    );

    const unsubscribe = onSnapshot(
      streamQuery,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<StreamNotification, 'id'>),
        }));

        const fresh = items.filter((item) => !seen.current.has(item.id));
        items.forEach((item) => seen.current.add(item.id));

        const dispatchInvite = (item: StreamNotification) => {
          if (!item.relatedId || !isLiveInviteNotification(item)) return;
          // No need to interrupt someone who is already in that room.
          if (pathnameRef.current === `/live/${item.relatedId}`) return;
          openLiveSessionModal({
            eventId: item.relatedId,
            notificationId: item.id,
            source: 'notification',
          });
        };

        // The first snapshot is the existing backlog, not a new event. Still
        // surface one recent unread invite so an invite that landed while the
        // tab was closed is not lost.
        if (!hydrated.current) {
          hydrated.current = true;
          const recentInvite = fresh.find(
            (item) => isLiveInviteNotification(item) && liveInviteIsRecent(item),
          );
          if (recentInvite) dispatchInvite(recentInvite);
          return;
        }

        const liveInvites = fresh.filter(isLiveInviteNotification);
        const incoming = fresh.filter(
          (item) =>
            !isLiveInviteNotification(item)
            && !isDirectMessageType(item.type, item.content, item.channelId),
        );
        if (liveInvites.length === 0 && incoming.length === 0) return;

        liveInvites.forEach(dispatchInvite);

        // An open channel already plays its own chime for mentions.
        if (
          liveInvites.length > 0
          || incoming.some((item) => item.type !== 'channel_mention')
        ) {
          playNotificationSound();
        }

        if (onNotificationsPageRef.current) return;
        if (incoming.length === 0) return;

        const newest = incoming[0];
        const grouped = incoming.length > 1;
        const target = grouped ? '/feed?view=notifications' : notificationTarget(newest);

        toast.custom(
          (instance) => (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                toast.dismiss(instance.id);
                if (target) navigate(target);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toast.dismiss(instance.id);
                  if (target) navigate(target);
                }
              }}
              className="pointer-events-auto flex w-[360px] max-w-[calc(100vw-2rem)] cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left shadow-2xl transition-colors hover:border-primary/30"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                {newest.senderPhoto?.trim() ? (
                  <img
                    src={newest.senderPhoto}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Bell size={16} className="text-primary" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-foreground">
                  {grouped ? `${incoming.length} new notifications` : newest.senderName || 'Kith'}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {grouped
                    ? `${newest.senderName || 'Someone'} ${newest.content || 'sent you something'} and ${incoming.length - 1} more`
                    : newest.content}
                </p>
                <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-primary">
                  Open notifications
                </p>
              </div>

              <ChevronRight size={14} className="mt-1 shrink-0 text-faint" />
            </div>
          ),
          { id: `notification-${newest.id}`, duration: 5500 },
        );
      },
      (error) => {
        console.warn('Notification stream listener error:', error);
      },
    );

    return unsubscribe;
  }, [user?.uid, navigate]);
}
