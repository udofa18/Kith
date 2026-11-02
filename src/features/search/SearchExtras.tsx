import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Avatar from '../../components/ui/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import { searchPeople, searchTopics } from './api';

/** People and topics matching a text search, shown above the post results. */
export default function SearchExtras({ term }: { term: string }) {
  const [showAllPeople, setShowAllPeople] = useState(false);
  const key = term.trim().toLowerCase();
  const { data: people = [] } = useQuery({
    queryKey: ['search-people', key, 'page'],
    queryFn: () => searchPeople(term, 9),
    enabled: key.length >= 2,
    staleTime: 60_000,
  });
  const { data: topics = [] } = useQuery({
    queryKey: ['search-topics', key],
    queryFn: () => searchTopics(term, 3),
    enabled: key.length >= 2,
    staleTime: 60_000,
  });

  if (people.length === 0 && topics.length === 0) return null;
  const visible = showAllPeople ? people : people.slice(0, 3);

  return (
    <div className="border-b border-black/10 dark:border-white/10">
      {people.length > 0 && (
        <section className="pt-3">
          <h2 className="px-4 pb-1 text-sm font-semibold text-black/60 dark:text-white/60">People</h2>
          {visible.map(p => (
            <Link
              key={p.id}
              to={`/creators/${p.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
            >
              <Avatar src={p.photo} seed={p.id} size={44} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold truncate">{p.displayName}<VerifiedBadge verified={p.verified} /></p>
                {p.username && <p className="text-sm text-black/50 dark:text-white/50 truncate">@{p.username}</p>}
                {p.bio && <p className="text-sm text-black/70 dark:text-white/70 line-clamp-1">{p.bio}</p>}
              </div>
            </Link>
          ))}
          {people.length > 3 && (
            <button
              onClick={() => setShowAllPeople(v => !v)}
              className="w-full px-4 py-2.5 text-left text-sm text-primary hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
            >
              {showAllPeople ? 'Show fewer' : `Show all ${people.length} people`}
            </button>
          )}
        </section>
      )}

      {topics.length > 0 && (
        <section className="px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-black/60 dark:text-white/60 mr-1">Topics</span>
          {topics.map(t => (
            <Link
              key={t.tag}
              to={`/feed?hashtag=${encodeURIComponent(t.tag)}`}
              className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15 transition-colors"
            >
              #{t.tag}
            </Link>
          ))}
        </section>
      )}

      <h2 className="px-4 pt-3 pb-1 text-sm font-semibold text-black/60 dark:text-white/60">Posts</h2>
    </div>
  );
}
