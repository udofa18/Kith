import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import { queryKeys } from '../../lib/queryClient';
import { fetchViewerContext } from '../feed/api/viewer';
import { searchPeople, type PersonResult } from '../search/api';
import { getUser } from './api';
import { nameOf, photoOf } from './format';

/** Pick someone to message: people you follow first, or search everyone. */
export default function NewMessageDialog({ me, onPick, onClose }: {
  me: string;
  onPick: (userId: string) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 200);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data: viewer } = useQuery({
    queryKey: queryKeys.feedViewer(me),
    queryFn: () => fetchViewerContext(me),
    staleTime: 5 * 60_000,
  });
  const followingIds = [...(viewer?.followingIds ?? [])].slice(0, 20);
  const { data: following = [], isLoading: loadingFollowing } = useQuery({
    queryKey: ['dm-suggestions', me, followingIds.join(',')],
    queryFn: async () => (await Promise.all(followingIds.map(getUser))).filter(Boolean),
    enabled: !!viewer,
    staleTime: 60_000,
  });
  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search-people', debounced.toLowerCase(), 'dm'],
    queryFn: () => searchPeople(debounced, 12),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  const people: PersonResult[] = debounced.length >= 2
    ? results.filter(p => p.id !== me)
    : following.map((u: any) => ({ id: u.id, username: u.username || '', displayName: nameOf(u), photo: photoOf(u), bio: u.bio || '', verified: !!u.verified }));

  return createPortal(
    <div className="fixed inset-0 z-[90] flex sm:items-start justify-center bg-black/50 backdrop-blur-sm sm:pt-[10vh]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="New message" className="w-full h-full sm:h-auto sm:max-w-md sm:max-h-[70vh] flex flex-col bg-background text-black dark:text-white sm:rounded-2xl sm:border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-black/10 dark:border-white/10">
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={20} /></button>
          <p className="font-semibold">New message</p>
        </div>
        <div className="px-4 py-3 border-b border-black/10 dark:border-white/10">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 pointer-events-none" />
            <input
              autoFocus
              value={term}
              onChange={e => setTerm(e.target.value)}
              placeholder="Search people"
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-black/5 dark:bg-white/[0.06] border border-transparent text-sm outline-none focus:border-primary focus:bg-transparent transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {debounced.length < 2 && <p className="px-4 pt-3 pb-1 text-xs font-semibold text-black/50 dark:text-white/50">People you follow</p>}
          {(debounced.length >= 2 ? isFetching && !results.length : loadingFollowing) ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10" />
                <div className="h-3 w-32 rounded bg-black/10 dark:bg-white/10" />
              </div>
            ))
          ) : people.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-black/50 dark:text-white/50">
              {debounced.length >= 2 ? 'No one matches that name.' : "You're not following anyone yet. Search for someone above."}
            </p>
          ) : people.map(p => (
            <button key={p.id} onClick={() => onPick(p.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors">
              <Avatar src={p.photo} seed={p.id} size={40} />
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-semibold truncate">{p.displayName}<VerifiedBadge verified={p.verified} /></span>
                {p.username && <span className="block text-sm text-black/50 dark:text-white/50 truncate">@{p.username}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
