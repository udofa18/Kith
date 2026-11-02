import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { followUser, unfollowUser } from '../../services/socialService';
import { queryKeys } from '../../lib/queryClient';

/** Follow / Following (hover: Unfollow) / Follow back, with an optimistic toggle. */
export default function FollowButton({ me, targetId, following, followsYou = false, size = 'md', onChange }: {
  me: string | null;
  targetId: string;
  following: boolean;
  followsYou?: boolean;
  size?: 'sm' | 'md';
  onChange?: (following: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState(following);
  const [busy, setBusy] = useState(false);
  useEffect(() => setState(following), [following]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!me) return toast.error('Sign in to follow people');
    const next = !state;
    setState(next);
    onChange?.(next);
    setBusy(true);
    try {
      await (next ? followUser : unfollowUser)(me, targetId);
      queryClient.invalidateQueries({ queryKey: queryKeys.feedViewer(me) });
      queryClient.invalidateQueries({ queryKey: ['relationship', targetId] });
      queryClient.invalidateQueries({ queryKey: ['hover-card', targetId] });
    } catch {
      setState(!next);
      onChange?.(!next);
      toast.error("Couldn't update follow");
    } finally {
      setBusy(false);
    }
  };

  const pad = size === 'sm' ? 'px-3.5 py-1 text-[13px]' : 'px-5 py-2 text-sm';
  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`group shrink-0 rounded-full font-semibold transition-colors disabled:opacity-60 ${pad} ${
        state
          ? 'border border-black/15 dark:border-white/20 hover:border-red-500/50 hover:text-red-500 hover:bg-red-500/5'
          : 'bg-primary text-white hover:bg-primary/90'
      }`}
    >
      {state ? (
        <><span className="group-hover:hidden">Following</span><span className="hidden group-hover:inline">Unfollow</span></>
      ) : followsYou ? 'Follow back' : 'Follow'}
    </button>
  );
}
