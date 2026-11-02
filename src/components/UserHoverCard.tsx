import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarDays, Flag, Flame, MapPin, MessageCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { followUser, unfollowUser } from '../services/socialService';
import { queryKeys } from '../lib/queryClient';
import { fetchViewerContext } from '../features/feed/api/viewer';
import { activeStreak } from '../features/shiplog/streak';
import { fetchRelationship, toDate, type Relationship } from '../features/profile/api';
import ReportModal from './ReportModal';
import VerifiedBadge from './VerifiedBadge';
import Avatar from './ui/Avatar';

interface UserHoverCardProps {
  userId: string;
  children: ReactNode;
  communityId?: string;
}

const CARD_WIDTH = 320;
const OPEN_DELAY = 450;
const CLOSE_DELAY = 200;

interface CardData extends Relationship {
  user: any | null;
}

const compact = (n: number) => Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

async function fetchCard(userId: string, me: string | null, myFollowing: string[]): Promise<CardData> {
  const [userSnap, relationship] = await Promise.all([
    getDoc(doc(db, 'users', userId)),
    fetchRelationship(userId, me, myFollowing),
  ]);
  return { user: userSnap.exists() ? userSnap.data() : null, ...relationship };
}

/** Profile preview shown when hovering a name or avatar. */
export default function UserHoverCard({ userId, children, communityId }: UserHoverCardProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; above: boolean } | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Close if the page scrolls under the card.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const above = window.innerHeight - rect.bottom < 340 && rect.top > window.innerHeight - rect.bottom;
      // Line the card up with the start of the name or avatar, kept on screen.
      const left = Math.max(12, Math.min(window.innerWidth - CARD_WIDTH - 12, rect.left - 12));
      setPos(above ? { left, bottom: window.innerHeight - rect.top + 8, above } : { left, top: rect.bottom + 8, above });
      setOpen(true);
    }, OPEN_DELAY);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };
  const keepOpen = () => clearTimeout(timer.current);

  return (
    <>
      <div ref={triggerRef} className="inline-block" onMouseEnter={show} onMouseLeave={hide}>
        {children}
      </div>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              initial={{ opacity: 0, y: pos.above ? 6 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: pos.above ? 6 : -6 }}
              transition={{ duration: 0.14 }}
              style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: CARD_WIDTH, zIndex: 1000 }}
              onMouseEnter={keepOpen}
              onMouseLeave={hide}
              onClick={e => e.stopPropagation()}
            >
              <HoverCardBody userId={userId} communityId={communityId} onReport={() => { setOpen(false); setIsReportModalOpen(true); }} onNavigate={() => setOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {communityId && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          communityId={communityId}
          targetId={userId}
          targetType="user"
          contentSnippet={userId}
        />
      )}
    </>
  );
}

function HoverCardBody({ userId, communityId, onReport, onNavigate }: {
  userId: string;
  communityId?: string;
  onReport: () => void;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = auth.currentUser?.uid ?? null;
  const isSelf = me === userId;

  const { data: viewer, isLoading: viewerLoading } = useQuery({
    queryKey: queryKeys.feedViewer(me),
    queryFn: () => fetchViewerContext(me),
    staleTime: 1000 * 60 * 5,
    enabled: !!me,
  });
  const { data } = useQuery({
    queryKey: ['hover-card', userId, me],
    queryFn: () => fetchCard(userId, me, [...(viewer?.followingIds ?? [])]),
    enabled: !me || !viewerLoading,
    staleTime: 60_000,
  });

  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const isFollowing = following ?? data?.youFollow ?? false;

  const toggleFollow = async () => {
    if (!me) return toast.error('Sign in to follow people');
    setBusy(true);
    const next = !isFollowing;
    setFollowing(next);
    try {
      await (next ? followUser : unfollowUser)(me, userId);
      queryClient.invalidateQueries({ queryKey: queryKeys.feedViewer(me) });
      queryClient.invalidateQueries({ queryKey: ['hover-card', userId] });
    } catch (error) {
      setFollowing(!next);
      handleFirestoreError(error, OperationType.UPDATE, `users/${me}/following`);
    } finally {
      setBusy(false);
    }
  };

  const shell = 'rounded-2xl bg-background text-black dark:text-white border border-black/10 dark:border-white/10 shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden';

  if (!data) {
    return (
      <div className={`${shell} p-4`}>
        <div className="animate-pulse">
        <div className="flex justify-between">
          <div className="w-14 h-14 rounded-full bg-black/10 dark:bg-white/10" />
          <div className="w-20 h-8 rounded-full bg-black/10 dark:bg-white/10" />
        </div>
        <div className="mt-3 h-4 w-32 rounded bg-black/10 dark:bg-white/10" />
        <div className="mt-2 h-3 w-20 rounded bg-black/10 dark:bg-white/10" />
        <div className="mt-4 h-3 w-full rounded bg-black/10 dark:bg-white/10" />
        <div className="mt-2 h-3 w-2/3 rounded bg-black/10 dark:bg-white/10" />
        </div>
      </div>
    );
  }

  const u = data.user;
  if (!u) {
    return <div className={`${shell} p-4 text-sm text-black/60 dark:text-white/60`}>This account isn't available.</div>;
  }

  const name = u.displayName || u.username || 'Member';
  const joined = toDate(u.createdAt);
  const streak = activeStreak(u.streak);
  const profileUrl = `/creators/${userId}`;

  return (
    <div className={shell}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <Link to={profileUrl} onClick={onNavigate} className="rounded-full">
            <Avatar src={u.profileImage || u.photoURL} seed={userId} size={56} alt={name} />
          </Link>
          {!isSelf && (
            <button
              onClick={toggleFollow}
              disabled={busy}
              className={`group px-4 py-1.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-60 ${
                isFollowing
                  ? 'border border-black/15 dark:border-white/20 hover:border-red-500/50 hover:text-red-500'
                  : 'bg-primary text-white hover:bg-primary/90'
              }`}
            >
              {isFollowing ? (
                <><span className="group-hover:hidden">Following</span><span className="hidden group-hover:inline">Unfollow</span></>
              ) : data.followsYou ? 'Follow back' : 'Follow'}
            </button>
          )}
        </div>

        <Link to={profileUrl} onClick={onNavigate} className="block mt-3 group">
          <p className="flex items-center gap-1 font-bold text-[17px] leading-tight group-hover:underline">
            <span className="truncate">{name}</span>
            <VerifiedBadge verified={!!u.verified} size={16} />
          </p>
          <p className="flex items-center gap-2 text-sm text-black/50 dark:text-white/50">
            {u.username && <span className="truncate">@{u.username}</span>}
            {data.followsYou && (
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[11px] font-medium text-black/60 dark:text-white/60">Follows you</span>
            )}
          </p>
        </Link>

        {u.bio && <p className="mt-2.5 text-sm leading-relaxed line-clamp-3 text-black/80 dark:text-white/80">{u.bio}</p>}

        {(u.location || joined) && (
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-black/50 dark:text-white/50">
            {u.location && <span className="flex items-center gap-1"><MapPin size={13} />{u.location}</span>}
            {joined && <span className="flex items-center gap-1"><CalendarDays size={13} />Joined {joined.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link to={profileUrl} onClick={onNavigate} className="hover:underline">
            <span className="font-semibold">{compact(data.following)}</span> <span className="text-black/50 dark:text-white/50">Following</span>
          </Link>
          <Link to={profileUrl} onClick={onNavigate} className="hover:underline">
            <span className="font-semibold">{compact(data.followers + (following === null ? 0 : Number(following) - Number(data.youFollow)))}</span>{' '}
            <span className="text-black/50 dark:text-white/50">{data.followers === 1 ? 'Follower' : 'Followers'}</span>
          </Link>
          {streak > 1 && (
            <span className="flex items-center gap-1 text-orange-500" title={`${streak}-day streak`}>
              <Flame size={14} /><span className="font-semibold">{streak}</span>
            </span>
          )}
        </div>

        {data.mutualCount > 0 && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-black/50 dark:text-white/50">
            <div className="flex -space-x-2">
              {data.mutuals.map(m => (
                <span key={m.id} className="rounded-full ring-2 ring-background"><Avatar src={m.photo} seed={m.id} size={20} /></span>
              ))}
            </div>
            <span className="line-clamp-1">
              Followed by {data.mutuals.map(m => m.name.split(' ')[0]).join(', ')}
              {data.mutualCount > data.mutuals.length && ` and ${data.mutualCount - data.mutuals.length} more you follow`}
            </span>
          </div>
        )}
      </div>

      {!isSelf && me && (
        <div className="flex border-t border-black/10 dark:border-white/10 text-sm font-medium">
          <button
            onClick={() => { onNavigate(); navigate(`/feed?view=messages&userId=${userId}`); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
          >
            <MessageCircle size={15} /> Message
          </button>
          {communityId && (
            <button
              onClick={onReport}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-l border-black/10 dark:border-white/10 text-black/50 dark:text-white/50 hover:text-red-500 transition-colors"
              title="Report"
            >
              <Flag size={15} /> Report
            </button>
          )}
        </div>
      )}
    </div>
  );
}
