import { useMemo, useState } from 'react';
import { BellOff, PenSquare, Pin, Search } from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import {
  filterConversations, getCategoryCounts, isFavourited, isIncomingRequest, isMuted, isOutgoingRequest, unreadFor,
  type ConversationData, type MessageCategory,
} from '../../lib/messaging';
import { isTyping, presenceLabel, toDate } from './api';
import { nameOf, photoOf, shortTime } from './format';

/** Conversation list with All / Unread / Requests filters and a search box. */
export default function Inbox({ me, conversations, loading, selectedId, onSelect, onNewMessage }: {
  me: string;
  conversations: ConversationData[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (conv: ConversationData) => void;
  onNewMessage: () => void;
}) {
  const [category, setCategory] = useState<MessageCategory>('all');
  const [search, setSearch] = useState('');
  const counts = useMemo(() => getCategoryCounts(conversations, me), [conversations, me]);
  const visible = useMemo(() => filterConversations(conversations, category, me, search), [conversations, category, me, search]);

  const tabs: { id: MessageCategory; label: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread', count: counts.unread },
    { id: 'requests', label: 'Requests', count: counts.requests },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-4 pb-3 space-y-3 border-b border-black/10 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Messages</h1>
          <button
            onClick={onNewMessage}
            aria-label="New message"
            title="New message"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <PenSquare size={19} />
          </button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full pl-10 pr-4 py-2 rounded-full bg-black/5 dark:bg-white/[0.06] border border-transparent text-sm outline-none focus:border-primary focus:bg-transparent transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setCategory(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === t.id ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/[0.06] text-black/70 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10'
              }`}
            >
              {t.label}
              {!!t.count && (
                <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold flex items-center justify-center ${category === t.id ? 'bg-white/25' : 'bg-primary text-white'}`}>
                  {t.count > 99 ? '99+' : t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-black/10 dark:bg-white/10" />
              <div className="flex-1 space-y-2"><div className="h-3 w-28 rounded bg-black/10 dark:bg-white/10" /><div className="h-3 w-44 rounded bg-black/10 dark:bg-white/10" /></div>
            </div>
          ))
        ) : visible.length === 0 ? (
          <EmptyInbox category={category} searching={!!search.trim()} onNewMessage={onNewMessage} />
        ) : (
          visible.map(conv => <Row key={conv.id} conv={conv} me={me} selected={conv.id === selectedId} onSelect={onSelect} />)
        )}
      </div>
    </div>
  );
}

function Row({ conv, me, selected, onSelect }: { conv: ConversationData; me: string; selected: boolean; onSelect: (c: ConversationData) => void }) {
  const other = conv.otherUser;
  const otherId = conv.participants.find(p => p !== me) ?? me;
  const unread = unreadFor(conv, me);
  const typing = isTyping(conv, otherId);
  const active = presenceLabel(other?.lastActiveAt, Date.now(), other) === 'Active now';
  const fromMe = conv.lastSenderId === me;
  const pinned = isFavourited(conv, me);
  const muted = isMuted(conv, me);
  const seen = fromMe && (toDate(conv.readAt?.[otherId])?.getTime() ?? 0) >= (toDate(conv.lastMessageAt)?.getTime() ?? Infinity);

  let preview: React.ReactNode = conv.lastMessage || 'Say hello';
  if (typing) preview = <span className="text-primary">typing…</span>;
  else if (isIncomingRequest(conv, me)) preview = <>Wants to message you · {conv.lastMessage}</>;
  else if (isOutgoingRequest(conv, me)) preview = <>Request sent · {conv.lastMessage}</>;
  else if (fromMe) preview = <>You: {conv.lastMessage}</>;

  return (
    <button
      onClick={() => onSelect(conv)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${selected ? 'bg-primary/10' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}
    >
      <span className="relative shrink-0">
        <Avatar src={photoOf(other)} seed={otherId} size={48} />
        {active && <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-green-500 ring-2 ring-background" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={`truncate ${unread ? 'font-bold' : 'font-semibold'}`}>{nameOf(other)}</span>
          <VerifiedBadge verified={!!other?.verified} />
          {pinned && <Pin size={12} className="shrink-0 text-black/40 dark:text-white/40 rotate-45" />}
          {muted && <BellOff size={12} className="shrink-0 text-black/40 dark:text-white/40" />}
          <span className={`ml-auto shrink-0 text-xs ${unread ? 'text-primary font-semibold' : 'text-black/45 dark:text-white/45'}`}>
            {shortTime(toDate(conv.lastMessageAt))}
          </span>
        </span>
        <span className="flex items-center gap-2 mt-0.5">
          <span className={`truncate text-sm flex-1 ${unread ? 'text-black dark:text-white font-medium' : 'text-black/55 dark:text-white/55'}`}>
            {preview}
          </span>
          {unread > 0 ? (
            <span className={`shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center ${muted ? 'bg-black/15 dark:bg-white/20' : 'bg-primary text-white'}`}>
              {unread > 99 ? '99+' : unread}
            </span>
          ) : seen ? (
            <span className="shrink-0 text-[11px] text-black/40 dark:text-white/40">Seen</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function EmptyInbox({ category, searching, onNewMessage }: { category: MessageCategory; searching: boolean; onNewMessage: () => void }) {
  const text = searching
    ? 'No chats match your search.'
    : category === 'requests'
      ? "No message requests. When someone you don't follow back messages you, it shows up here."
      : category === 'unread'
        ? "You're all caught up."
        : 'No conversations yet. Start one with someone you follow.';
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm text-black/55 dark:text-white/55">{text}</p>
      {category === 'all' && !searching && (
        <button onClick={onNewMessage} className="mt-4 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
          New message
        </button>
      )}
    </div>
  );
}
