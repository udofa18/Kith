import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { queryKeys } from '../../lib/queryClient';
import { fetchViewerContext } from '../feed/api/viewer';
import Avatar from '../../components/ui/Avatar';
import { fetchStatusTray, isSeen, type StatusGroup } from './api';
import StatusViewer from './StatusViewer';
import StatusComposer from './StatusComposer';

export const statusTrayKey = (uid: string | null) => ['status-tray', uid] as const;

/** Row of status bubbles at the top of the feed: yours first, then people you follow. */
export default function StatusTray() {
  const user = useCurrentUser();
  const uid: string | null = user?.uid ?? null;
  const [viewing, setViewing] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  // Bumped when the viewer closes so rings re-read the seen state.
  const [, setSeenVersion] = useState(0);

  const { data: viewer } = useQuery({
    queryKey: queryKeys.feedViewer(uid),
    queryFn: () => fetchViewerContext(uid),
    staleTime: 1000 * 60 * 5,
    enabled: !!uid,
  });
  const { data: groups = [] } = useQuery({
    queryKey: [...statusTrayKey(uid), viewer?.followingIds.size ?? 0],
    queryFn: () => fetchStatusTray(uid!, viewer!.followingIds),
    enabled: !!uid && !!viewer,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!uid) return null;

  const mine = groups.find(g => g.isMine);
  const others = groups.filter(g => !g.isMine);
  // Unseen first, keeping the "latest first" order within each half.
  const ordered: StatusGroup[] = [
    ...(mine ? [mine] : []),
    ...others.filter(g => !allSeen(g)),
    ...others.filter(allSeen),
  ];

  const open = (g: StatusGroup) => setViewing(ordered.indexOf(g));

  return (
    <section aria-label="Statuses" className="px-4 pt-3 pb-2 border-b border-black/10 dark:border-white/10">
      <div className="flex gap-4 overflow-x-auto no-scrollbar">
        <div className="shrink-0 w-[68px] flex flex-col items-center gap-1">
          <div className="relative">
            <button
              onClick={() => (mine ? open(mine) : setComposing(true))}
              aria-label={mine ? 'View your status' : 'Add a status'}
              className={`rounded-full p-[3px] ${mine ? ringClass(allSeen(mine)) : ''}`}
            >
              <span className="block rounded-full p-[2px] bg-background">
                <Avatar src={user.profileImage || user.photoURL} seed={uid} size={56} />
              </span>
            </button>
            <button
              onClick={() => setComposing(true)}
              aria-label="Add a status"
              className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center ring-2 ring-background"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
          </div>
          <span className="text-xs text-black/60 dark:text-white/60 truncate w-full text-center">Your status</span>
        </div>

        {ordered.filter(g => !g.isMine).map(g => (
          <button key={g.uid} onClick={() => open(g)} className="shrink-0 w-[68px] flex flex-col items-center gap-1">
            <span className={`rounded-full p-[3px] ${ringClass(allSeen(g))}`}>
              <span className="block rounded-full p-[2px] bg-background">
                <Avatar src={g.photo} seed={g.uid} size={56} />
              </span>
            </span>
            <span className={`text-xs truncate w-full text-center ${allSeen(g) ? 'text-black/50 dark:text-white/50' : 'font-medium'}`}>
              {g.name.split(' ')[0]}
            </span>
          </button>
        ))}

        {others.length === 0 && (
          <p className="self-center text-sm text-black/50 dark:text-white/50 pl-1 pr-4">
            Share a moment. Statuses disappear after 24 hours and only your followers see them.
          </p>
        )}
      </div>

      {viewing !== null && ordered[viewing] && (
        <StatusViewer
          groups={ordered}
          startIndex={viewing}
          onClose={() => { setViewing(null); setSeenVersion(v => v + 1); }}
        />
      )}
      <StatusComposer open={composing} onClose={() => setComposing(false)} />
    </section>
  );
}

const allSeen = (g: StatusGroup) => g.items.every(s => isSeen(s.id));

const ringClass = (seen: boolean) =>
  seen ? 'bg-black/15 dark:bg-white/20' : 'bg-gradient-to-tr from-primary via-fuchsia-500 to-amber-400';
