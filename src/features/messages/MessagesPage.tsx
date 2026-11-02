import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { getConversationId, type ConversationData } from '../../lib/messaging';
import ChatDetailsSidebar from '../../components/ChatDetailsSidebar';
import { getUser, subscribeConversations, type Message, type Sender } from './api';
import { nameOf, photoOf } from './format';
import Inbox from './Inbox';
import ChatView from './ChatView';
import NewMessageDialog from './NewMessageDialog';

/**
 * Direct messages. The open chat lives in the URL (`?view=messages&c=<id>`), so the back button
 * and links work; `&userId=<uid>` (from profiles and hover cards) opens or starts a chat.
 * Phones show either the inbox or the chat; larger screens show both.
 */
export default function MessagesPage() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState<ConversationData | null>(null);
  const [composing, setComposing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);

  const uid: string | undefined = user?.uid;
  const me: Sender | null = useMemo(
    () => (uid ? { uid, name: nameOf(user), photo: photoOf(user) } : null),
    [uid, user?.displayName, user?.username, user?.profileImage, user?.photoURL],
  );

  useEffect(() => {
    if (!uid) return;
    return subscribeConversations(uid, convs => { setConversations(convs); setLoading(false); setError(false); }, () => { setLoading(false); setError(true); });
  }, [uid]);

  const openId = params.get('c');
  const targetUser = params.get('userId');

  const setOpen = useCallback((convId: string | null, replace = false) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('view', 'messages');
      next.delete('userId');
      if (convId) next.set('c', convId); else next.delete('c');
      return next;
    }, { replace });
  }, [setParams]);

  // `?userId=` → the conversation with that person (a draft if it doesn't exist yet).
  useEffect(() => {
    if (!uid || !targetUser || targetUser === uid) return;
    setOpen(getConversationId(uid, targetUser), true);
  }, [uid, targetUser, setOpen]);

  const existing = openId ? conversations.find(c => c.id === openId) ?? null : null;

  // Build a draft for a chat that hasn't started yet.
  useEffect(() => {
    if (!uid || !openId || existing || loading) { setDraft(null); return; }
    const otherId = openId.split('_').find(p => p !== uid);
    if (!otherId || !openId.split('_').includes(uid)) { setOpen(null, true); return; }
    let cancelled = false;
    getUser(otherId).then(other => {
      if (cancelled) return;
      if (!other) { setOpen(null, true); return; }
      setDraft({ id: openId, participants: [uid, otherId].sort(), lastMessage: '', lastMessageAt: null, otherUser: other });
    });
    return () => { cancelled = true; };
  }, [uid, openId, !!existing, loading]);

  // Details panel defaults open on wide screens.
  useEffect(() => {
    setShowDetails(!!openId && window.matchMedia('(min-width: 1280px)').matches);
  }, [openId]);

  if (!uid || !me) return null;

  const active = existing ?? draft;
  const otherId = active?.participants.find(p => p !== uid);
  const detailsProps = active && otherId ? {
    me: uid,
    userId: otherId,
    conv: active,
    exists: !!existing,
    messages: chatMessages,
    onClose: () => setShowDetails(false),
    onBlocked: () => { setShowDetails(false); setOpen(null, true); },
  } : null;

  return (
    <div className="h-full flex text-black dark:text-white bg-background">
      {/* Inbox */}
      <aside className={`${active ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[340px] lg:w-[380px] shrink-0 border-r border-black/10 dark:border-white/10 min-h-0`}>
        {error ? (
          <p className="p-6 text-sm text-black/60 dark:text-white/60">Couldn't load your messages. Check your connection and try again.</p>
        ) : (
          <Inbox
            me={uid}
            conversations={conversations}
            loading={loading}
            selectedId={openId}
            onSelect={c => setOpen(c.id)}
            onNewMessage={() => setComposing(true)}
          />
        )}
      </aside>

      {/* Chat */}
      <section className={`${active ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col min-h-0`}>
        {active ? (
          <ChatView
            key={active.id}
            me={me}
            conv={active}
            exists={!!existing}
            onBack={() => setOpen(null)}
            onClosed={() => setOpen(null, true)}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails(v => !v)}
            onMessagesChange={setChatMessages}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <span className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><MessageCircle size={26} /></span>
            <p className="mt-4 text-lg font-semibold">Your messages</p>
            <p className="mt-1 text-sm text-black/55 dark:text-white/55 max-w-xs">Pick a chat, or start a new one with someone you follow.</p>
            <button onClick={() => setComposing(true)} className="mt-5 px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90">New message</button>
          </div>
        )}
      </section>

      {/* Details */}
      {detailsProps && showDetails && (
        <>
          <ChatDetailsSidebar key={active.id} {...detailsProps} className="hidden xl:flex w-[340px] shrink-0 border-l border-black/10 dark:border-white/10" />
          <div className="xl:hidden fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowDetails(false)} />
            <div className="relative w-full max-w-sm h-full shadow-2xl">
              <ChatDetailsSidebar {...detailsProps} className="h-full shadow-2xl" />
            </div>
          </div>
        </>
      )}

      {composing && (
        <NewMessageDialog
          me={uid}
          onClose={() => setComposing(false)}
          onPick={id => { setComposing(false); setOpen(getConversationId(uid, id)); }}
        />
      )}
    </div>
  );
}
