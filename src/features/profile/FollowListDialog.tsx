import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import { fetchFollowList } from './api';
import FollowButton from './FollowButton';

export type FollowListKind = 'followers' | 'following';

/** Followers / Following lists for a profile, with follow buttons. */
export default function FollowListDialog({ userId, name, kind, onKindChange, onClose, me, myFollowing }: {
  userId: string;
  name: string;
  kind: FollowListKind;
  onKindChange: (kind: FollowListKind) => void;
  onClose: () => void;
  me: string | null;
  myFollowing: Set<string>;
}) {
  const { data: people, isLoading } = useQuery({
    queryKey: ['follow-list', userId, kind],
    queryFn: () => fetchFollowList(userId, kind),
    staleTime: 60_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex sm:items-start justify-center bg-black/50 backdrop-blur-sm sm:pt-[10vh]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`${name} ${kind}`} className="w-full h-full sm:h-auto sm:max-w-md sm:max-h-[75vh] flex flex-col bg-background text-black dark:text-white sm:rounded-2xl sm:border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={20} /></button>
          <p className="font-semibold truncate">{name}</p>
        </div>
        <div className="flex border-b border-black/10 dark:border-white/10">
          {(['followers', 'following'] as const).map(k => (
            <button
              key={k}
              onClick={() => onKindChange(k)}
              className={`flex-1 py-3 text-sm font-semibold relative transition-colors ${kind === k ? '' : 'text-black/50 dark:text-white/50 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}
            >
              {k === 'followers' ? 'Followers' : 'Following'}
              {kind === k && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-[3px] rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-black/10 dark:bg-white/10" />
                <div className="flex-1 space-y-2"><div className="h-3 w-32 rounded bg-black/10 dark:bg-white/10" /><div className="h-3 w-20 rounded bg-black/10 dark:bg-white/10" /></div>
              </div>
            ))
          ) : !people?.length ? (
            <p className="px-6 py-12 text-center text-sm text-black/50 dark:text-white/50">
              {kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </p>
          ) : people.map(p => (
            <Link key={p.id} to={`/creators/${p.id}`} onClick={onClose} className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
              <Avatar src={p.photo} seed={p.id} size={44} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold truncate">{p.name}<VerifiedBadge verified={p.verified} /></p>
                {p.username && <p className="text-sm text-black/50 dark:text-white/50 truncate">@{p.username}</p>}
                {p.bio && <p className="text-sm text-black/70 dark:text-white/70 line-clamp-1">{p.bio}</p>}
              </div>
              {me && p.id !== me && <FollowButton me={me} targetId={p.id} following={myFollowing.has(p.id)} size="sm" />}
            </Link>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
