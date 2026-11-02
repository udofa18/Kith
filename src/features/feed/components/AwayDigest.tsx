import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { generateDigest } from '../../../services/geminiService';
import { queryKeys } from '../../../lib/queryClient';
import { fetchPostsSince } from '../api/sources';
import { engagementOf } from '../ranking/score';
import type { ViewerContext } from '../types';

const AWAY_MS = 8 * 60 * 60 * 1000;
const POOL = 60;
const MAX_POSTS = 12;
const MIN_POSTS = 3;

const visitKey = (uid: string) => `kith:last-feed-visit:${uid}`;
const sinceKey = (uid: string) => `kith:digest-since:${uid}`;
const dismissKey = (uid: string, since: number) => `kith:digest-dismissed:${uid}:${since}`;

/**
 * "While you were away": after 8+ hours away, an AI summary of the most engaged posts since the last visit.
 * Shows nothing if the viewer was away briefly, little happened, or the AI call fails.
 */
export default function AwayDigest({ uid }: { uid: string }) {
  const queryClient = useQueryClient();
  // The previous visit, pinned for this browser session so the digest survives navigating
  // to a post and back. Every mount still records "now" as the latest visit.
  const [since] = useState(() => {
    const pinned = sessionStorage.getItem(sinceKey(uid));
    if (pinned !== null) return Number(pinned);
    const prev = Number(localStorage.getItem(visitKey(uid))) || 0;
    sessionStorage.setItem(sinceKey(uid), String(prev));
    return prev;
  });
  const [dismissed, setDismissed] = useState(() => !!sessionStorage.getItem(dismissKey(uid, since)));
  useEffect(() => localStorage.setItem(visitKey(uid), String(Date.now())), [uid]);

  const away = since > 0 && Date.now() - since >= AWAY_MS;

  const { data } = useQuery({
    queryKey: ['away-digest', uid, since],
    enabled: away && !dismissed,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const viewer = queryClient.getQueryData<ViewerContext>(queryKeys.feedViewer(uid));
      const hidden = new Set([...(viewer?.blockedIds ?? []), ...(viewer?.preferences.mutedCreatorIds ?? [])]);
      const top = (await fetchPostsSince(new Date(since), POOL))
        .filter(p => p.data.authorUid !== uid && !hidden.has(p.data.authorUid) && engagementOf(p.data) > 0)
        .sort((a, b) => engagementOf(b.data) - engagementOf(a.data))
        .slice(0, MAX_POSTS);
      if (top.length < MIN_POSTS) return null;
      const items = await generateDigest(top.map(p => ({
        id: p.id,
        author: p.data.authorName,
        content: p.data.content,
        likes: p.data.likesCount || 0,
        comments: p.data.commentsCount || 0,
      })));
      return items?.length ? items : null;
    },
  });

  if (!data || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(dismissKey(uid, since), '1');
    setDismissed(true);
  };

  return (
    <section className="mx-5 my-4 p-4 rounded-2xl border border-primary/20 bg-primary/5">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-[15px] font-bold">While you were away</h2>
          <p className="text-xs text-black/50 dark:text-white/50 flex items-center gap-1">
            <Sparkles size={11} /> Summarized with AI from popular posts
          </p>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="p-1 -m-1 rounded-lg text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white">
          <X size={16} />
        </button>
      </div>
      <ul className="space-y-1">
        {data.map(item => (
          <li key={item.postId}>
            <Link to={`/post/${item.postId}`} className="flex gap-2 text-sm text-black/80 dark:text-white/80 hover:text-primary transition-colors py-1">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
