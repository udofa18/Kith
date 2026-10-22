import { useEffect, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { getSupabase } from '../../../supabase';
import { shouldReadCollectionFromSupabase } from '../../../lib/database-config';
import { toDate } from '../ranking/score';

interface Options {
  enabled: boolean;
  /** Newest post time the viewer already has; anything after this counts as new. */
  since: number;
  uid: string | null;
  /** Only count posts from these authors (Following tab). */
  onlyFrom?: Set<string>;
  /** Never count these authors or post ids (muted, blocked, hidden). */
  excludeAuthors?: Set<string>;
  excludeIds?: Set<string>;
}

/**
 * True when public posts newer than `since` exist (excluding the viewer's own).
 * Drives the "New posts" button so the feed never reshuffles under the reader.
 */
export function useNewPosts({ enabled, since, uid, onlyFrom, excludeAuthors, excludeIds }: Options): boolean {
  const [hasNew, setHasNew] = useState(false);
  // Read filters through a ref so refreshed viewer data doesn't tear down the subscription.
  const filters = useRef({ onlyFrom, excludeAuthors, excludeIds });
  filters.current = { onlyFrom, excludeAuthors, excludeIds };

  useEffect(() => {
    setHasNew(false);
    if (!enabled) return;

    const isNew = (id: string, authorUid: string, createdAt: unknown) => {
      const f = filters.current;
      return authorUid !== uid &&
        (!f.onlyFrom || f.onlyFrom.has(authorUid)) &&
        !f.excludeAuthors?.has(authorUid) &&
        !f.excludeIds?.has(id) &&
        !!createdAt && toDate(createdAt).getTime() > since;
    };

    if (shouldReadCollectionFromSupabase('posts')) {
      const sb = getSupabase();
      const channel = sb
        .channel(`feed-new-posts-${since}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
          const row = payload.new as { id: string; author_uid: string; created_at: string; visibility: string };
          if (row.visibility === 'public' && isNew(row.id, row.author_uid, row.created_at)) setHasNew(true);
        })
        .subscribe();
      return () => { sb.removeChannel(channel); };
    }

    return onSnapshot(
      query(collection(db, 'posts'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(10)),
      snap => setHasNew(snap.docs.some(d => isNew(d.id, d.data().authorUid, d.data().createdAt))),
      err => console.warn('[feed] New-post listener failed:', err),
    );
  }, [enabled, since, uid]);

  return hasNew;
}
