import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  Ban, Bell, BellOff, CalendarDays, Clock, Download, FileText, Image as ImageIcon, Link2, MapPin, Pin, PinOff, Play, UserRound, X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../firebase';
import { queryKeys } from '../lib/queryClient';
import { isFavourited, isMuted, type ConversationData } from '../lib/messaging';
import { extractLinksFromMessages } from '../lib/chatMedia';
import { fetchViewerContext } from '../features/feed/api/viewer';
import { fetchRelationship } from '../features/profile/api';
import { blockUser, fetchSharedFiles, presenceLabel, respondToRequest, setMuted, setPinned, toDate, type SharedFile } from '../features/messages/api';
import { fileSize, nameOf, photoOf } from '../features/messages/format';
import Avatar from './ui/Avatar';
import VerifiedBadge from './VerifiedBadge';
import ConfirmModal from './ConfirmModal';

interface ChatMessageLike {
  id: string;
  senderId: string;
  content?: string;
  createdAt?: any;
  type?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
}

type Tab = 'media' | 'files' | 'links';

/** Who you're talking to, quick actions, and everything shared in the chat. */
export default function ChatDetailsSidebar({ me, userId, conv, exists, messages, onClose, onBlocked, className = '' }: {
  me: string;
  userId: string;
  conv: ConversationData;
  /** False for a chat that hasn't started yet (nothing to pin, mute or list). */
  exists: boolean;
  messages: ChatMessageLike[];
  onClose: () => void;
  onBlocked: () => void;
  className?: string;
}) {
  const [profile, setProfile] = useState<any>(conv.otherUser ?? null);
  const [tab, setTab] = useState<Tab>('media');
  const [lightbox, setLightbox] = useState<SharedFile | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => onSnapshot(doc(db, 'users', userId), s => setProfile(s.exists() ? s.data() : null), () => undefined), [userId]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data: viewer, isLoading: viewerLoading } = useQuery({
    queryKey: queryKeys.feedViewer(me),
    queryFn: () => fetchViewerContext(me),
    staleTime: 5 * 60_000,
  });
  const { data: relationship } = useQuery({
    queryKey: ['relationship', userId, me],
    queryFn: () => fetchRelationship(userId, me, [...(viewer?.followingIds ?? [])]),
    enabled: !viewerLoading,
    staleTime: 60_000,
  });

  // Shared files come from a query over the whole chat; fall back to loaded messages if that fails
  // (for example while the index is still building).
  const { data: queried, isError } = useQuery({
    queryKey: ['chat-files', conv.id, messages.filter(m => m.type === 'attachment').length],
    queryFn: () => fetchSharedFiles(conv.id),
    enabled: exists,
    staleTime: 30_000,
    retry: false,
  });
  const shared: SharedFile[] = useMemo(() => {
    if (queried && !isError) return queried;
    return messages
      .filter(m => m.type === 'attachment' && m.attachmentUrl)
      .map(m => ({ id: m.id, url: m.attachmentUrl!, name: m.attachmentName || 'Attachment', type: m.attachmentType || '', size: m.attachmentSize, senderId: m.senderId, createdAt: toDate(m.createdAt) }))
      .reverse();
  }, [queried, isError, messages]);

  const media = shared.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
  const files = shared.filter(f => !f.type.startsWith('image/') && !f.type.startsWith('video/'));
  const links = useMemo(() => extractLinksFromMessages(messages), [messages]);

  const name = nameOf(profile);
  const first = name.split(' ')[0];
  const presence = presenceLabel(profile?.lastActiveAt, now);
  const localTime = localTimeIn(profile?.timezone, now);
  const joined = toDate(profile?.createdAt);
  const pinned = isFavourited(conv, me);
  const muted = isMuted(conv, me);

  const connection = relationship
    ? relationship.youFollow && relationship.followsYou ? 'You follow each other'
      : relationship.followsYou ? 'Follows you'
        : relationship.youFollow ? 'You follow them'
          : null
    : null;

  const togglePin = () => setPinned(conv.id, me, !pinned, conv.favouritedBy)
    .then(() => toast.success(pinned ? 'Chat unpinned' : 'Chat pinned'))
    .catch(() => toast.error('Something went wrong'));
  const toggleMute = () => setMuted(conv.id, me, !muted, conv.mutedBy)
    .then(() => toast.success(muted ? 'Notifications on' : `You won't be notified about messages from ${first}`))
    .catch(() => toast.error('Something went wrong'));

  const block = async () => {
    setConfirmBlock(false);
    try {
      await blockUser(me, userId);
      if (exists && conv.status === 'pending' && conv.requestedBy === userId) await respondToRequest(conv.id, false);
      toast.success(`${first} is blocked`);
      onBlocked();
    } catch {
      toast.error("Couldn't block");
    }
  };

  const who = (senderId: string) => (senderId === me ? 'You' : first);

  return (
    <aside className={`flex flex-col h-full min-h-0 bg-background text-black dark:text-white ${className}`}>
      <div className="shrink-0 flex items-center justify-between px-4 h-[60px] border-b border-black/10 dark:border-white/10">
        <h2 className="font-semibold">Details</h2>
        <button onClick={onClose} aria-label="Close details" className="p-2 -mr-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={18} /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Person */}
        <div className="px-5 pt-6 pb-5 text-center">
          <Link to={`/creators/${userId}`} className="inline-block relative">
            <Avatar src={photoOf(profile)} seed={userId} size={80} alt={name} />
            {presence === 'Active now' && <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-green-500 ring-[3px] ring-background" />}
          </Link>
          <Link to={`/creators/${userId}`} className="mt-3 flex items-center justify-center gap-1 text-lg font-bold hover:underline">
            <span className="truncate">{name}</span><VerifiedBadge verified={!!profile?.verified} size={17} />
          </Link>
          <p className="text-sm text-black/50 dark:text-white/50">
            {profile?.username && <>@{profile.username}</>}
            {profile?.username && presence && ' · '}
            {presence && <span className={presence === 'Active now' ? 'text-green-600 dark:text-green-400' : ''}>{presence}</span>}
          </p>
          {connection && (
            <span className="mt-2 inline-block px-2.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-xs font-medium text-black/65 dark:text-white/65">{connection}</span>
          )}
          {profile?.bio && <p className="mt-3 text-sm leading-relaxed text-black/75 dark:text-white/75 line-clamp-3">{profile.bio}</p>}

          {(profile?.location || localTime || joined) && (
            <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-black/55 dark:text-white/55">
              {profile?.location && <span className="flex items-center gap-1"><MapPin size={13} />{profile.location}</span>}
              {localTime && <span className="flex items-center gap-1"><Clock size={13} />{localTime} their time</span>}
              {joined && <span className="flex items-center gap-1"><CalendarDays size={13} />Joined {joined.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>}
            </div>
          )}

          {relationship && relationship.mutualCount > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-black/55 dark:text-white/55">
              <span className="flex -space-x-1.5">
                {relationship.mutuals.map(m => <span key={m.id} className="rounded-full ring-2 ring-background"><Avatar src={m.photo} seed={m.id} size={18} /></span>)}
              </span>
              <span className="line-clamp-1">
                Followed by {relationship.mutuals.map(m => m.name.split(' ')[0]).join(', ')}
                {relationship.mutualCount > relationship.mutuals.length && ` +${relationship.mutualCount - relationship.mutuals.length}`}
              </span>
            </div>
          )}

          {/* Quick actions */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Action icon={UserRound} label="Profile" to={`/creators/${userId}`} />
            <Action icon={pinned ? PinOff : Pin} label={pinned ? 'Unpin' : 'Pin'} onClick={togglePin} disabled={!exists} active={pinned} />
            <Action icon={muted ? BellOff : Bell} label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} disabled={!exists} active={muted} />
          </div>
        </div>

        {/* Shared */}
        <div className="border-t border-black/10 dark:border-white/10">
          <div className="flex">
            {([
              { id: 'media', label: 'Media', count: media.length },
              { id: 'files', label: 'Files', count: files.length },
              { id: 'links', label: 'Links', count: links.length },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex-1 py-3 text-sm font-semibold transition-colors ${tab === t.id ? '' : 'text-black/50 dark:text-white/50 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}
              >
                {t.label}{t.count > 0 && <span className="ml-1 font-normal text-black/40 dark:text-white/40">{t.count}</span>}
                {tab === t.id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-primary" />}
              </button>
            ))}
          </div>

          <div className="border-t border-black/10 dark:border-white/10 min-h-[140px]">
            {tab === 'media' && (media.length === 0 ? <Empty icon={ImageIcon} text="Photos and videos you share will show up here." /> : (
              <div className="grid grid-cols-3 gap-0.5 p-0.5">
                {media.map(f => (
                  <button key={f.id} onClick={() => setLightbox(f)} className="relative aspect-square overflow-hidden bg-black/5 dark:bg-white/5">
                    {f.type.startsWith('video/') ? (
                      <>
                        <video src={`${f.url}#t=0.1`} preload="metadata" muted className="w-full h-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center"><span className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center" style={{ color: '#fff' }}><Play size={14} fill="currentColor" /></span></span>
                      </>
                    ) : (
                      <img src={f.url} alt={f.name} loading="lazy" className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                    )}
                  </button>
                ))}
              </div>
            ))}

            {tab === 'files' && (files.length === 0 ? <Empty icon={FileText} text="Documents you share will show up here." /> : (
              <div className="py-1">
                {files.map(f => (
                  <a key={f.id} href={f.url} download={f.name} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                    <span className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><FileText size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{f.name}</span>
                      <span className="block text-xs text-black/50 dark:text-white/50 truncate">
                        {[fileSize(f.size), who(f.senderId), f.createdAt && formatDistanceToNowStrict(f.createdAt, { addSuffix: true })].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Download size={16} className="shrink-0 text-black/40 dark:text-white/40" />
                  </a>
                ))}
              </div>
            ))}

            {tab === 'links' && (links.length === 0 ? <Empty icon={Link2} text="Links from recent messages will show up here." /> : (
              <div className="py-1">
                {links.map((l, i) => {
                  const { host, path } = splitUrl(l.url);
                  return (
                    <a key={`${l.url}-${i}`} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                      <span className="w-10 h-10 shrink-0 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center text-black/50 dark:text-white/50"><Link2 size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{host}</span>
                        <span className="block text-xs text-black/50 dark:text-white/50 truncate">{path || who(l.senderId)}{path && ` · ${who(l.senderId)}`}</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Privacy */}
        <div className="border-t border-black/10 dark:border-white/10 p-2">
          <button onClick={() => setConfirmBlock(true)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-500/5">
            <Ban size={17} /> Block {first}
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={block}
        title={`Block ${first}?`}
        message="They won't be able to message you, and you won't see their posts."
        confirmText="Block"
      />

      {lightbox && (
        <div className="keep-dark fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><X size={22} /></button>
          {lightbox.type.startsWith('video/') ? (
            <video src={lightbox.url} controls autoPlay className="max-w-full max-h-full rounded-lg" onClick={e => e.stopPropagation()} />
          ) : (
            <img src={lightbox.url} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          )}
        </div>
      )}
    </aside>
  );
}

function Action({ icon: Icon, label, onClick, to, disabled, active }: {
  icon: typeof Pin;
  label: string;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
  active?: boolean;
}) {
  const cls = `flex flex-col items-center gap-1.5 py-3 rounded-2xl text-xs font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${
    active ? 'bg-primary/10 text-primary' : 'bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/10'
  }`;
  if (to) return <Link to={to} className={cls}><Icon size={19} />{label}</Link>;
  return <button onClick={onClick} disabled={disabled} className={cls}><Icon size={19} />{label}</button>;
}

function Empty({ icon: Icon, text }: { icon: typeof Pin; text: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <Icon size={22} className="mx-auto text-black/25 dark:text-white/25" />
      <p className="mt-2 text-sm text-black/50 dark:text-white/50">{text}</p>
    </div>
  );
}

/** "4:12 PM" in the person's own timezone, or null if unknown/invalid. */
function localTimeIn(timezone: string | undefined, now: number): string | null {
  if (!timezone) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(now);
  } catch {
    return null;
  }
}

function splitUrl(url: string) {
  try {
    const u = new URL(url);
    const path = (u.pathname + u.search).replace(/\/$/, '');
    return { host: u.hostname.replace(/^www\./, ''), path: path.length > 1 ? path : '' };
  } catch {
    return { host: url, path: '' };
  }
}
