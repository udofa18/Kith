import { useRef } from 'react';
import { Download, FileText, Gift, Pencil, Phone, PhoneMissed, Reply, Smile, Trash2, Video } from 'lucide-react';
import AnimatedEmojiRenderer, { isSoloEmoji } from '../../components/AnimatedEmojiRenderer';
import SafeAnimatedEmoji from '../../components/SafeAnimatedEmoji';
import LinkPreview, { firstUrl } from '../../components/post/LinkPreview';
import type { Message } from './api';
import { clock, fileSize } from './format';

export const QUICK_REACTIONS = ['❤️', '😂', '👍', '🔥', '😮', '🙏'];

export type GroupPosition = 'single' | 'first' | 'middle' | 'last';

const URL_SPLIT = /(https?:\/\/[^\s]+)/g;

/** One message: content, reply quote, reactions, and a hover / long-press action bar. */
export default function MessageBubble({
  msg, isMe, me, position, otherName, actionsOpen, onOpenActions, onReply, onEdit, onDelete, onReact, onJumpTo, onOpenImage,
}: {
  msg: Message;
  isMe: boolean;
  me: string;
  position: GroupPosition;
  otherName: string;
  actionsOpen: boolean;
  onOpenActions: (open: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onJumpTo: (id: string) => void;
  onOpenImage: (url: string) => void;
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const solo = !msg.type || msg.type === 'text' ? isSoloEmoji(msg.content) : null;
  const isAttachment = msg.type === 'attachment';
  const isImage = isAttachment && msg.attachmentType?.startsWith('image/');
  const isVideo = isAttachment && msg.attachmentType?.startsWith('video/');
  const caption = isAttachment && msg.content !== msg.attachmentName && !msg.content.startsWith('sent an attachment') ? msg.content : '';
  const plain = solo || msg.type === 'gift' || msg.type === 'call_history' || ((isImage || isVideo) && !caption);
  const url = !msg.type || msg.type === 'text' ? firstUrl(msg.content) : null;

  // Bubble corners tighten on the side of the sender between grouped messages.
  const tight = isMe
    ? { single: '', first: 'rounded-br-md', middle: 'rounded-r-md', last: 'rounded-tr-md' }[position]
    : { single: '', first: 'rounded-bl-md', middle: 'rounded-l-md', last: 'rounded-tl-md' }[position];

  const reactions = Object.entries(msg.reactions ?? {}).filter(([, r]) => r?.count > 0);

  const touchStart = () => { pressTimer.current = setTimeout(() => onOpenActions(true), 450); };
  const touchEnd = () => clearTimeout(pressTimer.current);

  return (
    <div id={`message-${msg.id}`} className={`group flex ${isMe ? 'justify-end' : 'justify-start'} ${position === 'first' || position === 'single' ? 'mt-3' : 'mt-0.5'}`}>
      <div className={`relative max-w-[82%] sm:max-w-[70%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
        {msg.replyTo && (
          <button
            onClick={() => onJumpTo(msg.replyTo!.id)}
            className={`mb-1 max-w-full px-3 py-1.5 rounded-xl text-xs text-left bg-black/5 dark:bg-white/[0.07] text-black/60 dark:text-white/60 border-l-2 border-primary/60 hover:bg-black/10 dark:hover:bg-white/10 transition-colors`}
          >
            <span className="font-semibold text-black/70 dark:text-white/70">{msg.replyTo.senderId === me ? 'You' : otherName}</span>
            <span className="block truncate">{msg.replyTo.content}</span>
          </button>
        )}

        <div
          title={clock(msg.createdAt)}
          onContextMenu={e => { e.preventDefault(); onOpenActions(true); }}
          onTouchStart={touchStart}
          onTouchEnd={touchEnd}
          onTouchMove={touchEnd}
          className={
            plain
              ? ''
              : `px-3.5 py-2 rounded-[20px] ${tight} text-[15px] leading-snug whitespace-pre-wrap break-words ${
                  isMe ? 'bg-primary text-white' : 'bg-black/[0.06] dark:bg-white/10 text-black dark:text-white'
                } ${msg.pending ? 'opacity-70' : ''}`
          }
        >
          <Content msg={msg} isMe={isMe} solo={solo} caption={caption} isImage={!!isImage} isVideo={!!isVideo} onOpenImage={onOpenImage} />
        </div>

        {url && <div className="w-72 max-w-full -mt-1"><LinkPreview url={url} enabled compact /></div>}

        {reactions.length > 0 && (
          <div className={`-mt-1.5 z-[1] flex flex-wrap gap-1 ${isMe ? 'justify-end pr-2' : 'pl-2'}`}>
            {reactions.map(([emoji, r]) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                title={r.uids.includes(me) ? 'Remove reaction' : 'React'}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border bg-background shadow-sm ${
                  r.uids.includes(me) ? 'border-primary/50' : 'border-black/10 dark:border-white/15'
                }`}
              >
                <span>{emoji}</span>
                {r.count > 1 && <span className="text-[11px] text-black/60 dark:text-white/60">{r.count}</span>}
              </button>
            ))}
          </div>
        )}

        {msg.isEdited && <span className="mt-0.5 px-1 text-[11px] text-black/40 dark:text-white/40">Edited</span>}

        {/* Actions: on hover (desktop) or after a long press / right-click */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${isMe ? 'right-full mr-1.5' : 'left-full ml-1.5'} flex items-center gap-0.5 transition-opacity ${
            actionsOpen ? 'opacity-100' : 'opacity-0 pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto'
          }`}
        >
          <ActionButton label="React" onClick={() => onOpenActions(!actionsOpen)}><Smile size={16} /></ActionButton>
          <ActionButton label="Reply" onClick={onReply}><Reply size={16} /></ActionButton>
          {isMe && (!msg.type || msg.type === 'text') && <ActionButton label="Edit" onClick={onEdit}><Pencil size={15} /></ActionButton>}
          {isMe && <ActionButton label="Delete" onClick={onDelete} danger><Trash2 size={15} /></ActionButton>}
        </div>

        {actionsOpen && (
          <div className={`absolute bottom-full mb-1 z-20 flex items-center gap-0.5 p-1 rounded-full bg-background border border-black/10 dark:border-white/15 shadow-lg ${isMe ? 'right-0' : 'left-0'}`}>
            {QUICK_REACTIONS.map(e => (
              <button key={e} onClick={() => { onReact(e); onOpenActions(false); }} className="w-9 h-9 rounded-full text-xl hover:bg-black/5 dark:hover:bg-white/10 hover:scale-110 transition-transform">
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded-full flex items-center justify-center text-black/45 dark:text-white/45 hover:bg-black/5 dark:hover:bg-white/10 ${danger ? 'hover:text-red-500' : 'hover:text-black dark:hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function Content({ msg, isMe, solo, caption, isImage, isVideo, onOpenImage }: {
  msg: Message;
  isMe: boolean;
  solo: ReturnType<typeof isSoloEmoji>;
  caption: string;
  isImage: boolean;
  isVideo: boolean;
  onOpenImage: (url: string) => void;
}) {
  if (solo?.type === 'animated') return <div className="w-28 h-28"><SafeAnimatedEmoji emoji={solo.value as any} /></div>;
  if (solo?.type === 'standard') return <div className="text-5xl leading-none py-1">{solo.value}</div>;

  if (msg.type === 'gift') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10">
        <span className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center"><Gift size={20} /></span>
        <span>
          <span className="block text-sm font-semibold text-amber-600 dark:text-amber-400">{isMe ? `You sent ${msg.giftAmount} XP` : `${msg.giftAmount} XP for you`}</span>
          <span className="block text-xs text-black/50 dark:text-white/50">Gift</span>
        </span>
      </div>
    );
  }

  if (msg.type === 'call_history') {
    const status = msg.metadata?.status ?? 'ended';
    const failed = status !== 'ended';
    const media = msg.metadata?.media === 'video' ? 'video' : 'voice';
    const Icon = failed ? PhoneMissed : media === 'video' ? Video : Phone;
    const d = msg.metadata?.duration ?? 0;
    const title = status === 'ended' ? `${media === 'video' ? 'Video' : 'Voice'} call`
      : status === 'declined' ? (isMe ? `${media === 'video' ? 'Video' : 'Voice'} call declined` : `You declined a ${media} call`)
        : isMe ? `${media === 'video' ? 'Video' : 'Voice'} call · no answer` : `Missed ${media} call`;
    const sub = status === 'ended' ? (d >= 60 ? `${Math.floor(d / 60)}m ${d % 60}s` : `${d}s`) : isMe ? 'Outgoing' : 'Incoming';
    return (
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border ${failed && !isMe ? 'border-red-500/25 bg-red-500/5' : 'border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.05]'}`}>
        <span className={`w-9 h-9 rounded-full flex items-center justify-center ${failed ? 'bg-red-500/15 text-red-500' : 'bg-green-500/15 text-green-600 dark:text-green-400'}`}><Icon size={17} /></span>
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-black/50 dark:text-white/50">{sub}</span>
        </span>
      </div>
    );
  }

  if (isImage) {
    return (
      <>
        <img
          src={msg.attachmentUrl}
          alt={msg.attachmentName || ''}
          onClick={() => onOpenImage(msg.attachmentUrl!)}
          className={`max-h-80 w-auto max-w-full cursor-zoom-in object-cover ${caption ? 'rounded-xl -mx-1.5 -mt-0.5 mb-1.5' : 'rounded-2xl'}`}
        />
        {caption && <Linkified text={caption} isMe={isMe} />}
      </>
    );
  }

  if (isVideo) {
    return (
      <>
        <video src={msg.attachmentUrl} controls preload="metadata" className={`max-h-80 max-w-full ${caption ? 'rounded-xl -mx-1.5 -mt-0.5 mb-1.5' : 'rounded-2xl'}`} />
        {caption && <Linkified text={caption} isMe={isMe} />}
      </>
    );
  }

  if (msg.type === 'attachment') {
    return (
      <>
        <a href={msg.attachmentUrl} download={msg.attachmentName} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 min-w-[200px] py-1">
          <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${isMe ? 'bg-white/20' : 'bg-primary/10 text-primary'}`}><FileText size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium truncate">{msg.attachmentName}</span>
            <span className={`block text-xs ${isMe ? 'opacity-75' : 'text-black/50 dark:text-white/50'}`}>{fileSize(msg.attachmentSize) || 'File'}</span>
          </span>
          <Download size={16} className="opacity-70 shrink-0" />
        </a>
        {caption && <Linkified text={caption} isMe={isMe} />}
      </>
    );
  }

  return <Linkified text={msg.content} isMe={isMe} />;
}

function Linkified({ text, isMe }: { text: string; isMe: boolean }) {
  return (
    <span>
      {text.split(URL_SPLIT).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" onClick={e => e.stopPropagation()} className={`underline underline-offset-2 break-all ${isMe ? '' : 'text-primary'}`}>
            {part}
          </a>
        ) : (
          <AnimatedEmojiRenderer key={i} content={part} size={22} />
        ),
      )}
    </span>
  );
}
