import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../../firebase';
import { usersRepository } from '../../services/db/usersRepository';
import { followUser, unfollowUser, isOpenCommunity, joinCommunity, leaveCommunity } from '../../services/socialService';
import { interestsFromTopics } from '../../lib/onboarding-topics';
import VerifiedBadge from '../VerifiedBadge';
import StepLayout from './StepLayout';

const CREATOR_COUNT = 5;
const COMMUNITY_COUNT = 4;

interface ConnectStepProps {
  uid: string;
  displayName: string;
  topics: string[];
  onBack: () => void;
  onFinish: () => Promise<void>;
}

/** Top creators, ranked by how many of the chosen topics they list as skills, then by XP. */
async function fetchCreators(uid: string, topics: string[]) {
  const wanted = new Set(topics);
  const users = await usersRepository.getTopByXp(25);
  return users
    .filter(u => u.id !== uid && u.onboardingCompleted !== false)
    .map(u => ({ ...u, xp: (u.xp as number) || 0, overlap: ((u.skills as string[]) || []).filter(s => wanted.has(s)).length }))
    .sort((a, b) => b.overlap - a.overlap || b.xp - a.xp)
    .slice(0, CREATOR_COUNT);
}

/** Open communities in the chosen categories, topped up with the largest open communities. */
async function fetchCommunities(categories: string[]) {
  const snaps = await Promise.all([
    categories.length
      ? getDocs(query(collection(db, 'communities'), where('category', 'in', categories.slice(0, 10)), limit(20)))
      : null,
    getDocs(query(collection(db, 'communities'), orderBy('memberCount', 'desc'), limit(20))),
  ]);
  const seen = new Set<string>();
  const byMembers = (a: any, b: any) => (b.memberCount || 0) - (a.memberCount || 0);
  return snaps
    .map(snap => (snap?.docs ?? []).map(d => ({ id: d.id, ...d.data() } as any)).filter(isOpenCommunity).sort(byMembers))
    .flat()
    .filter(c => !seen.has(c.id) && seen.add(c.id))
    .slice(0, COMMUNITY_COUNT);
}

export default function ConnectStep({ uid, displayName, topics, onBack, onFinish }: ConnectStepProps) {
  const [creators, setCreators] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { categories } = interestsFromTopics(topics);
    Promise.allSettled([fetchCreators(uid, topics), fetchCommunities(categories)]).then(([c, m]) => {
      if (cancelled) return;
      if (c.status === 'fulfilled') setCreators(c.value); else console.error('Creator suggestions failed:', c.reason);
      if (m.status === 'fulfilled') setCommunities(m.value); else console.error('Community suggestions failed:', m.reason);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [uid, topics]);

  const withPending = async (id: string, fn: () => Promise<void>) => {
    setPending(prev => new Set(prev).add(id));
    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong. Try again.');
    } finally {
      setPending(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const toggleSet = (setter: typeof setFollowing, id: string, on: boolean) =>
    setter(prev => { const next = new Set(prev); on ? next.add(id) : next.delete(id); return next; });

  const toggleFollow = (id: string) => {
    const isFollowing = following.has(id);
    return withPending(id, async () => {
      await (isFollowing ? unfollowUser : followUser)(uid, id);
      toggleSet(setFollowing, id, !isFollowing);
    });
  };

  const toggleJoin = (community: any) => {
    const isJoined = joined.has(community.id);
    return withPending(community.id, async () => {
      if (isJoined) await leaveCommunity(uid, community.id);
      else await joinCommunity(uid, displayName, community);
      toggleSet(setJoined, community.id, !isJoined);
    });
  };

  const followAll = () => Promise.all(creators.filter(c => !following.has(c.id)).map(c => toggleFollow(c.id)));

  const finish = async () => {
    setFinishing(true);
    try {
      await onFinish();
    } finally {
      setFinishing(false);
    }
  };

  const empty = !loading && creators.length === 0 && communities.length === 0;

  return (
    <StepLayout
      title="Follow a few people"
      subtitle="Your feed starts with the people and communities you follow. You can change this anytime."
      onBack={onBack}
      primaryLabel="Go to my feed"
      onPrimary={finish}
      busy={finishing}
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : empty ? (
        <div className="py-10 text-center text-white/40">
          <Users size={28} className="mx-auto mb-3" />
          No suggestions yet. You'll find people to follow in your feed.
        </div>
      ) : (
        <div className="space-y-8 max-h-[52vh] overflow-y-auto pr-1 -mr-1 custom-scrollbar">
          {creators.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">Creators</h2>
                {creators.some(c => !following.has(c.id)) && (
                  <button onClick={followAll} className="text-xs font-semibold text-primary hover:underline">Follow all</button>
                )}
              </div>
              <div className="space-y-2">
                {creators.map(user => (
                  <Row
                    key={user.id}
                    image={user.profileImage || user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`}
                    title={<>{user.displayName || user.username} <VerifiedBadge verified={user.verified} /></>}
                    subtitle={`@${user.username}`}
                    active={following.has(user.id)}
                    busy={pending.has(user.id)}
                    onToggle={() => toggleFollow(user.id)}
                    labels={['Follow', 'Following']}
                  />
                ))}
              </div>
            </section>
          )}

          {communities.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Communities</h2>
              <div className="space-y-2">
                {communities.map(community => (
                  <Row
                    key={community.id}
                    image={community.image || `https://picsum.photos/seed/${community.id}/100/100`}
                    rounded="rounded-lg"
                    title={community.name}
                    subtitle={`${community.memberCount || 0} members`}
                    active={joined.has(community.id)}
                    busy={pending.has(community.id)}
                    onToggle={() => toggleJoin(community)}
                    labels={['Join', 'Joined']}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </StepLayout>
  );
}

function Row({ image, rounded = 'rounded-full', title, subtitle, active, busy, onToggle, labels }: {
  image: string;
  rounded?: string;
  title: React.ReactNode;
  subtitle: string;
  active: boolean;
  busy: boolean;
  onToggle: () => void;
  labels: [string, string];
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
      <img src={image} alt="" referrerPolicy="no-referrer" className={`w-10 h-10 shrink-0 object-cover bg-white/10 ${rounded}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate flex items-center gap-1">{title}</p>
        <p className="text-xs text-white/40 truncate">{subtitle}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={busy}
        aria-pressed={active}
        className={`min-w-[88px] flex justify-center px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
          active ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-primary text-white hover:bg-primary/90'
        }`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : labels[active ? 1 : 0]}
      </button>
    </div>
  );
}
