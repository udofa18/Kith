import { useState, useEffect } from 'react';
import { Check, Search, Zap } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, addDoc, doc, serverTimestamp, getDoc, writeBatch, increment } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { createNotification } from '../lib/notifications';
import { sendDirectMessage } from '../features/messages/api';
import { createStatus } from '../features/status/api';
import { normalizeSettings } from '../features/settings/preferences';
import Avatar from './ui/Avatar';
import ModalShell, { fieldInput, fieldLabel, ghostBtn, primaryBtn } from './ui/ModalShell';

interface CreateInstantSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateInstantSessionModal({ isOpen, onClose }: CreateInstantSessionModalProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0); // 0: topic, 1: invite
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && step === 1) {
      const fetchFriends = async () => {
        if (!auth.currentUser) return;
        setFriendsLoading(true);
        try {
          const followingSnap = await getDocs(collection(db, 'users', auth.currentUser.uid, 'following'));
          const followingIds = followingSnap.docs.map(d => d.id);

          if (followingIds.length === 0) {
            setFriends([]);
            return;
          }

          const userPromises = followingIds.map(async (id) => {
            const userDoc = await getDoc(doc(db, 'users', id));
            return userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : null;
          });

          const users = await Promise.all(userPromises);
          setFriends(users.filter(u => u !== null));
        } catch (error) {
          console.error("Error fetching friends:", error);
        } finally {
          setFriendsLoading(false);
        }
      };
      fetchFriends();
    }
  }, [isOpen, step]);

  const TOPICS = [
    { label: 'Open hangout', emoji: '☕️' },
    { label: 'Ask me anything', emoji: '💬' },
    { label: 'Build in public', emoji: '🛠️' },
    { label: 'Chill & chat', emoji: '🌙' },
    { label: 'Brainstorm', emoji: '💡' },
    { label: 'Quick Q&A', emoji: '⚡️' },
  ];

  const handleStartSession = async () => {
    if (!auth.currentUser || !title.trim()) return;
    setLoading(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60000);

      const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userData = userSnap.exists() ? userSnap.data() : null;
      const activitySettings = normalizeSettings(userData).activity;
      const instant = activitySettings.instantSessions;
      const visibility =
        instant.visibleTo === 'nobody' || instant.visibleTo === 'me'
          ? 'unlisted'
          : instant.visibleTo === 'everyone' && instant.appearInHappeningNow
            ? 'public'
            : instant.visibleTo === 'followers'
              ? 'followers'
              : 'unlisted';

      const eventData = {
        title: title.trim(),
        description: 'Instant live session',
        hostId: auth.currentUser.uid,
        eventType: 'user',
        type: 'instant',
        visibility,
        startDate: now.toISOString(),
        endDate: expiresAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        status: 'live',
        category: 'Community',
        banner: `https://picsum.photos/seed/${Math.random()}/1200/600`,
        onlineType: 'internal',
        createdAt: serverTimestamp(),
        attendeeCount: 0,
        isInstant: true,
        expiresAt: expiresAt.toISOString()
      };

      const docRef = await addDoc(collection(db, 'events'), eventData);
      const eventId = docRef.id;

      if (selectedFriends.length > 0) {
        toast.loading('Sending invitations...', { id: 'invites' });
        const inviteMessage = `Hey! I just started an instant live session: "${title.trim()}". Join me here: ${window.location.origin}/live/${eventId}`;
        
        for (const friendId of selectedFriends) {
          await sendDirectMessage(
            { uid: auth.currentUser.uid, name: auth.currentUser.displayName || 'Someone', photo: auth.currentUser.photoURL || '' },
            friendId,
            inviteMessage,
            false,
          );

          await createNotification({
            recipientId: friendId,
            senderId: auth.currentUser.uid,
            senderName: auth.currentUser.displayName || 'Someone',
            senderPhoto: auth.currentUser.photoURL || '',
            type: 'message',
            content: 'invited you to an instant session',
            relatedId: eventId
          });
        }
        toast.success('Invitations sent!', { id: 'invites' });
      }

      const senderName = userData?.displayName || auth.currentUser.displayName || 'Someone';

      if (instant.notifyFollowers && visibility === 'followers') {
        const followersSnap = await getDocs(collection(db, 'users', auth.currentUser.uid, 'followers')).catch(() => null);
        const followers = followersSnap?.docs.slice(0, 100) ?? [];
        await Promise.all(
          followers.map((follower) =>
            createNotification({
              recipientId: follower.id,
              senderId: auth.currentUser!.uid,
              senderName,
              senderPhoto: auth.currentUser!.photoURL || '',
              type: 'event_invite',
              content: `is live now: ${title.trim()}`,
              relatedId: eventId,
            }),
          ),
        ).catch(() => undefined);
      }

      if (instant.autoShareToStatus && instant.visibleTo !== 'me') {
        await createStatus(
          {
            uid: auth.currentUser.uid,
            name: senderName,
            username: userData?.username || auth.currentUser.email?.split('@')[0] || 'member',
            photo: auth.currentUser.photoURL || '',
          },
          {
            text: `Live now: ${title.trim()}\n${window.location.origin}/live/${eventId}`,
            audience: activitySettings.statusAudience === 'only-me' ? 'only-me' : 'followers',
          },
        ).catch(() => undefined);
      }

      toast.success('Session started!');
      setStep(0); setTitle(''); setSelectedFriends([]);
      navigate(`/live/${eventId}`);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    } finally {
      setLoading(false);
    }
  };

  const filteredFriends = friends.filter(f => 
    f.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  const close = () => { if (!loading) { setStep(0); onClose(); } };

  return (
    <ModalShell
      title="Instant session"
      subtitle={step === 0 ? 'A 30-minute live room' : 'Invite people you follow'}
      step={step} steps={2} busy={loading} wide={false}
      onBack={step > 0 ? () => setStep(0) : undefined} onClose={close}
      status={loading ? 'Starting your room…' : ''}
      footer={step === 0 ? (<>
        <button onClick={() => setStep(1)} disabled={!title.trim() || loading} className={ghostBtn}>Invite first</button>
        <button onClick={handleStartSession} disabled={!title.trim() || loading} className={primaryBtn}>Go live</button>
      </>) : (<>
        <button onClick={() => setStep(0)} disabled={loading} className={ghostBtn}>Back</button>
        <button onClick={handleStartSession} disabled={loading} className={primaryBtn}>
          {selectedFriends.length > 0 ? `Go live & invite ${selectedFriends.length}` : 'Go live'}
        </button>
      </>)}
    >
      {step === 0 ? (<>
        <div className="relative overflow-hidden rounded-[22px] border border-border bg-surface p-4">
          <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <Avatar src={auth.currentUser?.photoURL} seed={auth.currentUser?.uid || 'you'} size={44} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-red-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live preview
              </p>
              <p className="mt-1 truncate font-display text-[15px] font-semibold">{title.trim() || 'Your room name'}</p>
            </div>
            <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-1 font-mono text-[9px] font-bold text-muted-foreground">30:00</span>
          </div>
          <div className="relative mt-3 flex items-center justify-between border-t border-border pt-3 text-[10px] text-muted-foreground">
            <span className="truncate">{auth.currentUser?.displayName || 'You'} · host</span>
            <span className="inline-flex shrink-0 items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Ready to go</span>
          </div>
        </div>

        <div>
          <label htmlFor="is-title" className={fieldLabel}>What's it about?</label>
          <input
            id="is-title" autoFocus maxLength={80} value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && title.trim() && !loading) handleStartSession(); }}
            placeholder="Name your room" className={fieldInput}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {TOPICS.map(t => (
              <button key={t.label} type="button" onClick={() => setTitle(t.label)} aria-pressed={title === t.label}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${title === t.label ? 'bg-primary text-white' : 'bg-foreground/[0.05] hover:bg-foreground/10'}`}>
                <span className="text-[13px] leading-none">{t.emoji}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Zap size={15} className="shrink-0 text-primary" />
          Anyone with the link can drop in. The room wraps up on its own after 30 minutes and never appears in the events list.
        </p>
      </>) : (<>
        <div className="relative">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 pointer-events-none" />
          <input type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search people you follow" aria-label="Search people you follow"
            className="w-full pl-11 pr-4 py-2.5 rounded-full bg-black/5 dark:bg-white/[0.06] border border-transparent text-sm outline-none focus:border-primary focus:bg-transparent transition-colors" />
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto -mx-2">
          {friendsLoading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 mx-2 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />)
          ) : filteredFriends.length > 0 ? filteredFriends.map(f => {
            const on = selectedFriends.includes(f.id);
            return (
              <button key={f.id} type="button" aria-pressed={on}
                onClick={() => setSelectedFriends(prev => on ? prev.filter(id => id !== f.id) : [...prev, f.id])}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors text-left">
                <Avatar src={f.profileImage} seed={f.id} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{f.displayName || f.username}</span>
                  <span className="block text-xs text-black/50 dark:text-white/50 truncate">@{f.username}</span>
                </span>
                <span className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${on ? 'bg-primary border-primary text-white' : 'border-black/20 dark:border-white/25'}`}>
                  {on && <Check size={13} />}
                </span>
              </button>
            );
          }) : (
            <p className="py-10 text-center text-sm text-black/50 dark:text-white/50">
              {friends.length === 0 ? "You're not following anyone yet. You can still go live and share the link." : 'No one matches that search.'}
            </p>
          )}
        </div>
      </>)}
    </ModalShell>
  );
}
