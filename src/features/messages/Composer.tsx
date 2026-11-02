import { useEffect, useRef, useState } from 'react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { FileText, Gift, Image as ImageIcon, Paperclip, Plus, Send, Smile, Sticker, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import AnimatedEmojiPicker from '../../components/AnimatedEmojiPicker';
import { MAX_ATTACHMENT_MB, type Message } from './api';
import { fileSize } from './format';

const GIFT_AMOUNTS = [10, 25, 50, 100];

const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export default function Composer({
  placeholder, extras, replyTo, replyName, editing, onCancelReply, onCancelEdit,
  onSend, onSendFile, onSaveEdit, onGift, onTyping, autoFocusKey,
}: {
  placeholder: string;
  /** Attachments, stickers and gifts (only once a chat is accepted). */
  extras: boolean;
  replyTo: Message | null;
  replyName: string;
  editing: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (text: string) => Promise<unknown>;
  onSendFile: (file: File, caption: string, onProgress: (p: number) => void) => Promise<unknown>;
  onSaveEdit: (text: string) => Promise<unknown>;
  onGift: (amount: number) => Promise<unknown>;
  onTyping: () => void;
  autoFocusKey: string;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [menu, setMenu] = useState<'none' | 'plus' | 'emoji' | 'sticker' | 'gift'>('none');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Focus on chat change (not on phones, where it would pop the keyboard).
  useEffect(() => { if (!isTouch()) inputRef.current?.focus(); }, [autoFocusKey]);

  useEffect(() => {
    if (editing) {
      setText(editing.content);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing?.id]);
  useEffect(() => { if (replyTo) inputRef.current?.focus(); }, [replyTo?.id]);

  // Auto-grow up to ~6 lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const attach = (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_MB * 1024 * 1024) return toast.error(`Files must be under ${MAX_ATTACHMENT_MB} MB`);
    setFile(f);
    setPreview(f.type.startsWith('image/') || f.type.startsWith('video/') ? URL.createObjectURL(f) : null);
    setMenu('none');
    inputRef.current?.focus();
  };
  const clearFile = () => { setFile(null); setPreview(null); };

  const busy = progress !== null;
  const canSend = !busy && (!!text.trim() || !!file);

  const submit = async () => {
    if (!canSend) return;
    const value = text;
    if (editing) {
      if (!value.trim()) return;
      setText('');
      await onSaveEdit(value);
      return;
    }
    if (file) {
      const f = file;
      setProgress(0);
      try {
        await onSendFile(f, value, setProgress);
        setText('');
        clearFile();
      } catch {
        toast.error("Couldn't send the file");
      } finally {
        setProgress(null);
      }
      return;
    }
    setText('');
    try {
      await onSend(value);
    } catch {
      setText(value);
      toast.error("Message didn't send");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouch() && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') {
      if (editing) { onCancelEdit(); setText(''); }
      else if (replyTo) onCancelReply();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (!extras) return;
    const pasted = [...e.clipboardData.files].find(f => f.type.startsWith('image/'));
    if (pasted) {
      e.preventDefault();
      attach(pasted);
    }
  };

  const banner = editing ? (
    <Banner label="Editing message" body={editing.content} onClose={() => { onCancelEdit(); setText(''); }} />
  ) : replyTo ? (
    <Banner label={`Replying to ${replyName}`} body={replyTo.content} onClose={onCancelReply} />
  ) : null;

  return (
    <div className="shrink-0 border-t border-black/10 dark:border-white/10 bg-background px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      {banner}

      {file && (
        <div className="mb-2 flex items-center gap-3 p-2 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]">
          {preview && file.type.startsWith('image/') ? (
            <img src={preview} alt="" className="w-14 h-14 rounded-xl object-cover" />
          ) : preview ? (
            <video src={preview} className="w-14 h-14 rounded-xl object-cover" muted />
          ) : (
            <span className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><FileText size={22} /></span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium truncate">{file.name}</span>
            <span className="block text-xs text-black/50 dark:text-white/50">
              {busy ? `Uploading… ${Math.round((progress ?? 0) * 100)}%` : fileSize(file.size)}
            </span>
            {busy && <span className="mt-1 block h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden"><span className="block h-full bg-primary transition-all" style={{ width: `${(progress ?? 0) * 100}%` }} /></span>}
          </span>
          {!busy && <button onClick={clearFile} aria-label="Remove attachment" className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={16} /></button>}
        </div>
      )}

      <div className="relative flex items-end gap-1.5">
        {extras && !editing && (
          <IconButton label="More" active={menu === 'plus'} onClick={() => setMenu(menu === 'plus' ? 'none' : 'plus')}><Plus size={20} /></IconButton>
        )}

        <div className="flex-1 flex items-end rounded-3xl bg-black/[0.05] dark:bg-white/[0.07] border border-transparent focus-within:border-primary/50 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={e => { setText(e.target.value); if (e.target.value) onTyping(); }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={file ? 'Add a caption' : placeholder}
            aria-label="Message"
            className="flex-1 resize-none bg-transparent pl-4 py-2.5 text-[15px] leading-snug outline-none max-h-40 placeholder:text-black/40 dark:placeholder:text-white/40"
          />
          <button
            type="button"
            onClick={() => setMenu(menu === 'emoji' ? 'none' : 'emoji')}
            aria-label="Emoji"
            className={`p-2.5 shrink-0 transition-colors ${menu === 'emoji' ? 'text-primary' : 'text-black/45 dark:text-white/45 hover:text-black dark:hover:text-white'}`}
          >
            <Smile size={20} />
          </button>
        </div>

        <button
          onClick={submit}
          disabled={!canSend}
          aria-label={editing ? 'Save edit' : 'Send'}
          className="w-10 h-10 shrink-0 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-35 hover:bg-primary/90 active:scale-95 transition"
        >
          <Send size={18} className="-ml-0.5" />
        </button>

        {menu !== 'none' && <div className="fixed inset-0 z-30" onClick={() => setMenu('none')} />}

        {menu === 'plus' && (
          <div className="absolute bottom-full left-0 mb-2 z-40 w-56 py-1.5 rounded-2xl bg-background border border-black/10 dark:border-white/15 shadow-xl">
            <MenuItem icon={ImageIcon} label="Photo or video" onClick={() => { fileRef.current!.accept = 'image/*,video/*'; fileRef.current!.click(); }} />
            <MenuItem icon={Paperclip} label="File" onClick={() => { fileRef.current!.accept = ''; fileRef.current!.click(); }} />
            <MenuItem icon={Sticker} label="Animated sticker" onClick={() => setMenu('sticker')} />
            <MenuItem icon={Gift} label="Gift XP" onClick={() => setMenu('gift')} />
          </div>
        )}

        {menu === 'gift' && (
          <div className="absolute bottom-full left-0 mb-2 z-40 w-60 p-3 rounded-2xl bg-background border border-black/10 dark:border-white/15 shadow-xl">
            <p className="text-sm font-semibold mb-2">Gift XP</p>
            <div className="grid grid-cols-4 gap-1.5">
              {GIFT_AMOUNTS.map(a => (
                <button key={a} onClick={() => { setMenu('none'); onGift(a).catch(() => toast.error("Couldn't send gift")); }} className="py-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm font-semibold hover:bg-amber-500/20">
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {menu === 'sticker' && (
          <div className="absolute bottom-full left-0 mb-2 z-40">
            <AnimatedEmojiPicker onSelect={name => { setMenu('none'); onSend(`:animated-${name}:`); }} onClose={() => setMenu('none')} />
          </div>
        )}

        {menu === 'emoji' && (
          <div className="absolute bottom-full right-0 mb-2 z-40">
            <EmojiPicker
              theme={document.documentElement.classList.contains('light') ? Theme.LIGHT : Theme.DARK}
              onEmojiClick={d => { setText(t => t + d.emoji); inputRef.current?.focus(); }}
              lazyLoadEmojis
              width={320}
              height={380}
            />
          </div>
        )}

        <input ref={fileRef} type="file" hidden onChange={e => { attach(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    </div>
  );
}

function Banner({ label, body, onClose }: { label: string; body: string; onClose: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-2 pl-3 pr-1 py-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border-l-2 border-primary">
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-primary">{label}</span>
        <span className="block text-sm text-black/60 dark:text-white/60 truncate">{body}</span>
      </span>
      <button onClick={onClose} aria-label="Cancel" className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={16} /></button>
    </div>
  );
}

function IconButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-black/55 dark:text-white/55 hover:bg-black/5 dark:hover:bg-white/10'}`}
    >
      {children}
    </button>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
      <Icon size={18} className="text-black/55 dark:text-white/55" /> {label}
    </button>
  );
}
