import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  Bell, BellOff, CalendarDays, Camera, Flame, Github, Link2, Linkedin, MapPin, MessageCircle, Share2, Twitter, Zap,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../../firebase';
import Avatar from '../../components/ui/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import { activeStreak } from '../shiplog/streak';
import { fetchUserStatuses, isSeen, type StatusGroup } from '../status/api';
import StatusViewer from '../status/StatusViewer';
import { displayName, photoOf, toDate, uploadBanner, type Profile, type Relationship } from './api';
import FollowButton from './FollowButton';
import FollowListDialog, { type FollowListKind } from './FollowListDialog';

const compact = (n: number) => Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Soft, stable cover colour for people who haven't uploaded one. */
function fallbackCover(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 60%), hsl(${(h + 50) % 360} 65% 45%))`;
}

const domainOf = (url: string) => {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); } catch { return url; }
};
const href = (url: string) => (url.startsWith('http') ? url : `https://${url}`);

export default function ProfileHeader({ profile, relationship, me, myFollowing }: {
  profile: Profile;
  relationship?: Relationship;
  me: string | null;
  myFollowing: Set<string>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id, data: u } = profile;
  const isMe = me === id;
  const name = displayName(u);
  const [list, setList] = useState<FollowListKind | null>(null);
  const [followDelta, setFollowDelta] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingStatus, setViewingStatus] = useState(false);
  const bannerInput = useRef<HTMLInputElement>(null);

  // Statuses are follower-only, so only ask when the rules would allow it.
  const canSeeStatus = !!me && (isMe || !!relationship?.youFollow);
  const { data: statuses = [] } = useQuery({
    queryKey: ['profile-statuses', id],
    queryFn: () => fetchUserStatuses(id).catch(() => []),
    enabled: canSeeStatus && !!u.statusUntil && (toDate(u.statusUntil)?.getTime() ?? 0) > Date.now(),
    staleTime: 60_000,
  });
  const statusGroup: StatusGroup | null = statuses.length
    ? { uid: id, name, photo: photoOf(u), items: statuses, isMine: isMe }
    : null;

  const { data: notificationsOn = false } = useQuery({
    queryKey: ['notify-prefs', me, id],
    queryFn: async () => (await getDoc(doc(db, 'users', me!, 'notificationPrefs', id))).exists(),
    enabled: !!me && !isMe,
  });

  const toggleNotifications = async () => {
    if (!me) return;
    const prefRef = doc(db, 'users', me, 'notificationPrefs', id);
    const subRef = doc(db, 'users', id, 'subscribers', me);
    try {
      if (notificationsOn) {
        await Promise.all([deleteDoc(prefRef), deleteDoc(subRef)]);
        toast.success(`You won't be notified when ${name} posts`);
      } else {
        await Promise.all([
          setDoc(prefRef, { authorId: id, authorName: name, enabled: true, createdAt: serverTimestamp() }),
          setDoc(subRef, { subscriberId: me, subscriberName: '', createdAt: serverTimestamp() }),
        ]);
        toast.success(`You'll be notified when ${name} posts`);
      }
      queryClient.setQueryData(['notify-prefs', me, id], !notificationsOn);
    } catch {
      toast.error("Couldn't update notifications");
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/creators/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Profile link copied');
      }
    } catch { /* share sheet dismissed */ }
  };

  const changeBanner = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Choose an image');
    if (file.size > 8 * 1024 * 1024) return toast.error('Images must be under 8 MB');
    setUploading(true);
    try {
      setBanner(await uploadBanner(id, file));
      toast.success('Cover updated');
    } catch {
      toast.error("Couldn't update your cover");
    } finally {
      setUploading(false);
    }
  };

  const cover = banner || (u.bannerImage?.trim() ? u.bannerImage : null);
  const joined = toDate(u.createdAt);
  const streak = activeStreak(u.streak);
  const followers = (relationship?.followers ?? 0) + followDelta;
  const iconBtn = 'w-10 h-10 shrink-0 rounded-full border border-black/15 dark:border-white/20 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors';
  const socials = [
    { url: u.githubUrl, icon: Github, label: 'GitHub' },
    { url: u.twitterUrl, icon: Twitter, label: 'X / Twitter' },
    { url: u.linkedinUrl, icon: Linkedin, label: 'LinkedIn' },
  ].filter(s => typeof s.url === 'string' && s.url.trim());

  return (
    <div>
      {/* Cover */}
      <div className="relative aspect-[3/1] max-h-[240px] w-full overflow-hidden bg-black/5 dark:bg-white/5" style={cover ? undefined : { background: fallbackCover(id) }}>
        {cover && <img src={cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
        {isMe && (
          <>
            <button
              onClick={() => bannerInput.current?.click()}
              disabled={uploading}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 text-xs font-medium backdrop-blur-sm hover:bg-black/70 transition-colors disabled:opacity-60"
              style={{ color: '#fff' }}
            >
              <Camera size={14} /> {uploading ? 'Uploading…' : 'Change cover'}
            </button>
            <input ref={bannerInput} type="file" accept="image/*" hidden onChange={e => { changeBanner(e.target.files?.[0]); e.target.value = ''; }} />
          </>
        )}
      </div>

      <div className="px-4 sm:px-5">
        {/* Avatar + actions */}
        <div className="flex items-end justify-between gap-3">
          <button
            onClick={() => statusGroup && setViewingStatus(true)}
            disabled={!statusGroup}
            aria-label={statusGroup ? `View ${name}'s status` : undefined}
            className={`relative z-10 -mt-12 sm:-mt-16 rounded-full p-[3px] shrink-0 ${statusGroup ? (statusGroup.items.every(s => isSeen(s.id)) ? 'bg-black/15 dark:bg-white/25' : 'bg-gradient-to-tr from-primary via-fuchsia-500 to-amber-400') : 'bg-background'} disabled:cursor-default`}
          >
            <span className="block rounded-full p-[3px] bg-background">
              <span className="block sm:hidden"><Avatar src={photoOf(u)} seed={id} size={84} alt={name} /></span>
              <span className="hidden sm:block"><Avatar src={photoOf(u)} seed={id} size={120} alt={name} /></span>
            </span>
          </button>

          <div className="flex items-center gap-2 pt-3">
            <button onClick={share} aria-label="Share profile" title="Share profile" className={iconBtn}><Share2 size={17} /></button>
            {isMe ? (
              <Link to="/settings?tab=profile" className="px-5 py-2 rounded-full border border-black/15 dark:border-white/20 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                Edit profile
              </Link>
            ) : (
              <>
                {me && (
                  <>
                    <button onClick={() => navigate(`/feed?view=messages&userId=${id}`)} aria-label="Message" title="Message" className={iconBtn}><MessageCircle size={17} /></button>
                    <button
                      onClick={toggleNotifications}
                      aria-label={notificationsOn ? 'Turn off post notifications' : 'Get notified when they post'}
                      title={notificationsOn ? 'Notifications on' : 'Get notified when they post'}
                      className={`${iconBtn} ${notificationsOn ? 'text-primary border-primary/40' : ''}`}
                    >
                      {notificationsOn ? <Bell size={17} fill="currentColor" /> : <BellOff size={17} />}
                    </button>
                  </>
                )}
                <FollowButton
                  me={me}
                  targetId={id}
                  following={!!relationship?.youFollow}
                  followsYou={relationship?.followsYou}
                  onChange={now => setFollowDelta(Number(now) - Number(!!relationship?.youFollow))}
                />
              </>
            )}
          </div>
        </div>

        {/* Identity */}
        <div className="mt-3">
          <h1 className="flex items-center gap-1.5 text-xl sm:text-2xl font-bold leading-tight">
            <span className="truncate">{name}</span>
            <VerifiedBadge verified={!!u.verified} size={20} />
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-[15px] text-black/50 dark:text-white/50">
            {u.username && <span>@{u.username}</span>}
            {relationship?.followsYou && (
              <span className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-xs font-medium text-black/60 dark:text-white/60">Follows you</span>
            )}
            {u.accountType === 'brand' && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">Brand</span>}
            {u.userType === 'creator' && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">Creator</span>}
          </div>
        </div>

        {u.bio ? (
          <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line break-words">{u.bio}</p>
        ) : isMe ? (
          <Link to="/settings?tab=profile" className="mt-3 inline-block text-[15px] text-primary hover:underline">Add a bio so people know what you're about</Link>
        ) : null}

        {/* Details */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-black/55 dark:text-white/55">
          {u.location && <span className="flex items-center gap-1"><MapPin size={15} />{u.location}</span>}
          {u.websiteUrl?.trim() && (
            <a href={href(u.websiteUrl)} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 text-primary hover:underline">
              <Link2 size={15} />{domainOf(u.websiteUrl)}
            </a>
          )}
          {joined && <span className="flex items-center gap-1"><CalendarDays size={15} />Joined {joined.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>}
          {socials.map(({ url, icon: Icon, label }) => (
            <a key={label} href={href(url)} target="_blank" rel="noopener noreferrer nofollow" aria-label={label} title={label} className="hover:text-primary transition-colors">
              <Icon size={16} />
            </a>
          ))}
        </div>

        {/* Counts */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <button onClick={() => setList('following')} className="hover:underline">
            <span className="font-semibold">{compact(relationship?.following ?? 0)}</span> <span className="text-black/55 dark:text-white/55">Following</span>
          </button>
          <button onClick={() => setList('followers')} className="hover:underline">
            <span className="font-semibold">{compact(followers)}</span> <span className="text-black/55 dark:text-white/55">{followers === 1 ? 'Follower' : 'Followers'}</span>
          </button>
          {streak > 0 && (
            <span className="flex items-center gap-1 text-orange-500" title="Days in a row with a progress update">
              <Flame size={15} /><span className="font-semibold">{streak}</span><span className="text-black/55 dark:text-white/55">day streak</span>
            </span>
          )}
          <span className="flex items-center gap-1" title="Earned by posting and helping others">
            <Zap size={15} className="text-amber-500" /><span className="font-semibold">{compact(u.xp || 0)}</span><span className="text-black/55 dark:text-white/55">XP</span>
          </span>
        </div>

        {relationship && relationship.mutualCount > 0 && (
          <button onClick={() => setList('followers')} className="mt-3 flex items-center gap-2 text-[13px] text-black/55 dark:text-white/55 hover:underline text-left">
            <span className="flex -space-x-2">
              {relationship.mutuals.map(m => (
                <span key={m.id} className="rounded-full ring-2 ring-background"><Avatar src={m.photo} seed={m.id} size={22} /></span>
              ))}
            </span>
            <span className="line-clamp-1">
              Followed by {relationship.mutuals.map(m => m.name.split(' ')[0]).join(', ')}
              {relationship.mutualCount > relationship.mutuals.length && ` and ${relationship.mutualCount - relationship.mutuals.length} more you follow`}
            </span>
          </button>
        )}
      </div>

      {list && (
        <FollowListDialog userId={id} name={name} kind={list} onKindChange={setList} onClose={() => setList(null)} me={me} myFollowing={myFollowing} />
      )}
      {viewingStatus && statusGroup && (
        <StatusViewer groups={[statusGroup]} startIndex={0} onClose={() => setViewingStatus(false)} />
      )}
    </div>
  );
}
