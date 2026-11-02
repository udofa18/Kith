import { useEffect, useMemo, useRef, useState } from 'react';
import { Hash, Plus, Smile, Trash2 } from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { Card, SwitchRow, SaveBar, inputClass } from './settingsUi';

const MAX_MESSAGE = 500;
const MAX_BUTTONS = 3;
const DEFAULT_MESSAGE = 'Welcome {username} to {community}! 🎉';
const VARIABLES = [
  { tag: '{username}', hint: "The new member's name" },
  { tag: '{community}', hint: 'This community' },
];

const normalise = (c: any) => ({
  enabled: !!c?.enabled,
  channelId: c?.channelId || '',
  message: c?.message ?? DEFAULT_MESSAGE,
  buttons: (c?.buttons || []).map((b: any) => ({ label: (b.label || '').trim(), url: (b.url || '').trim() })),
});

const validUrl = (url: string) => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };

interface Props {
  communityId: string;
  communityName: string;
  saved: any;
  onSave: (updates: any) => Promise<void> | void;
}

export default function WelcomeSettings({ communityId, communityName, saved, onSave }: Props) {
  const [draft, setDraft] = useState(() => normalise(saved));
  const [channels, setChannels] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mention, setMention] = useState<{ start: number; filter: string } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Pick up the saved config when it arrives or changes elsewhere, without clobbering edits in progress.
  const savedKey = JSON.stringify(normalise(saved));
  useEffect(() => { setDraft(normalise(saved)); }, [savedKey]);

  useEffect(() => onSnapshot(
    query(collection(db, 'communities', communityId, 'channels'), orderBy('order', 'asc')),
    snap => setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  ), [communityId]);

  // The welcome goes into a text channel, so voice and live rooms aren't offered.
  const postable = channels.filter(c => !['voice', 'live'].includes(c.type));
  const suggestions = useMemo(
    () => mention ? postable.filter(c => c.name.toLowerCase().includes(mention.filter.toLowerCase())).slice(0, 5) : [],
    [postable, mention]
  );

  const clean = { ...draft, message: draft.message.trim(), buttons: draft.buttons.filter(b => b.label || b.url) };
  const dirty = JSON.stringify(clean) !== JSON.stringify(normalise(saved));
  const buttonError = clean.buttons.find(b => !b.label || !validUrl(b.url));
  const error = !draft.enabled ? null
    : !draft.channelId ? 'Choose a channel to post the welcome in.'
    : !clean.message ? 'Write a message.'
    : draft.message.length > MAX_MESSAGE ? `Keep the message under ${MAX_MESSAGE} characters.`
    : buttonError ? 'Each button needs a label and a link starting with https://.'
    : null;

  const insert = (text: string, replaceFrom?: number) => {
    const el = textarea.current;
    const cursor = el?.selectionStart ?? draft.message.length;
    const start = replaceFrom ?? cursor;
    const message = draft.message.slice(0, start) + text + draft.message.slice(cursor);
    setDraft({ ...draft, message });
    setMention(null);
    setShowEmoji(false);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + text.length, start + text.length); });
  };

  const onType = (value: string, cursor: number) => {
    setDraft({ ...draft, message: value });
    const hash = value.lastIndexOf('#', cursor - 1);
    const filter = hash === -1 ? '' : value.slice(hash + 1, cursor);
    const startsWord = hash === 0 || /\s/.test(value[hash - 1] ?? ' ');
    setMention(hash !== -1 && startsWord && !/\s/.test(filter) ? { start: hash, filter } : null);
  };

  const updateButton = (i: number, patch: Partial<{ label: string; url: string }>) =>
    setDraft({ ...draft, buttons: draft.buttons.map((b, j) => j === i ? { ...b, ...patch } : b) });

  const save = async () => {
    if (error) return;
    setSaving(true);
    try { await onSave({ welcomeConfig: clean }); } finally { setSaving(false); }
  };

  const previewName = auth.currentUser?.displayName || 'Alex';
  const preview = clean.message.replace(/\{username\}/g, previewName).replace(/\{community\}/g, communityName || 'your community');

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-semibold">Welcome message</h3>
        <p className="text-sm text-foreground/55">Post a greeting in a channel whenever someone joins.</p>
      </div>

      <Card title="Status">
        <SwitchRow
          title="Send a welcome message" hint="When off, a short “{name} just joined” note is posted in #general instead."
          checked={draft.enabled} onChange={enabled => setDraft({ ...draft, enabled })}
        />
      </Card>

      <div className={draft.enabled ? 'space-y-5' : 'space-y-5 opacity-50 pointer-events-none'} aria-disabled={!draft.enabled}>
        <Card title="Where to post">
          <select value={draft.channelId} onChange={e => setDraft({ ...draft, channelId: e.target.value })} aria-label="Welcome channel" className={inputClass}>
            <option value="">Choose a channel…</option>
            {postable.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </select>
        </Card>

        <Card title="Message">
          <div className="relative">
            {suggestions.length > 0 && (
              <ul className="absolute bottom-full mb-1 left-0 w-64 bg-background border border-foreground/15 rounded-lg shadow-lg overflow-hidden z-20">
                {suggestions.map(c => (
                  <li key={c.id}>
                    <button type="button" onClick={() => insert(`#${c.name} `, mention!.start)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-foreground/5">
                      <Hash size={14} className="text-foreground/40" />{c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              ref={textarea} value={draft.message} rows={4} aria-label="Welcome message"
              onChange={e => onType(e.target.value, e.target.selectionStart || 0)}
              onKeyDown={e => {
                if (!mention || suggestions.length === 0) return;
                if (e.key === 'Enter') { e.preventDefault(); insert(`#${suggestions[0].name} `, mention.start); }
                if (e.key === 'Escape') setMention(null);
              }}
              className={`${inputClass} resize-none`} placeholder={DEFAULT_MESSAGE}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-foreground/55">Insert:</span>
              {VARIABLES.map(v => (
                <button key={v.tag} type="button" title={v.hint} onClick={() => insert(v.tag)} className="px-2 py-0.5 rounded border border-foreground/15 text-xs font-mono hover:bg-foreground/5">{v.tag}</button>
              ))}
              <div className="relative">
                <button type="button" onClick={() => setShowEmoji(s => !s)} aria-label="Insert emoji" className="p-1 rounded text-foreground/55 hover:text-foreground"><Smile size={16} /></button>
                {showEmoji && (
                  <div className="absolute top-full left-0 mt-2 z-30">
                    <div className="fixed inset-0" onClick={() => setShowEmoji(false)} />
                    <div className="relative">
                      <EmojiPicker
                        theme={document.documentElement.classList.contains('dark') ? Theme.DARK : Theme.LIGHT}
                        onEmojiClick={e => insert(e.emoji)} lazyLoadEmojis
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <span className={`text-xs ${draft.message.length > MAX_MESSAGE ? 'text-red-500' : 'text-foreground/45'}`}>{draft.message.length}/{MAX_MESSAGE}</span>
          </div>
          <p className="text-sm text-foreground/55 mt-2">Type # to mention a channel.</p>
        </Card>

        <Card title="Buttons" description={`Optional links under the message (up to ${MAX_BUTTONS}), such as your rules or website.`}>
          <div className="space-y-2">
            {draft.buttons.map((b, i) => (
              <div key={i} className="flex gap-2">
                <input value={b.label} onChange={e => updateButton(i, { label: e.target.value })} maxLength={30} placeholder="Label" aria-label={`Button ${i + 1} label`} className={`${inputClass} !w-40`} />
                <input value={b.url} onChange={e => updateButton(i, { url: e.target.value })} placeholder="https://" aria-label={`Button ${i + 1} link`} className={`${inputClass} ${b.url && !validUrl(b.url) ? '!border-red-500' : ''}`} />
                <button onClick={() => setDraft({ ...draft, buttons: draft.buttons.filter((_, j) => j !== i) })} aria-label="Remove button" className="p-2 rounded-lg text-foreground/40 hover:text-red-500 hover:bg-red-500/10"><Trash2 size={16} /></button>
              </div>
            ))}
            {draft.buttons.length < MAX_BUTTONS && (
              <button onClick={() => setDraft({ ...draft, buttons: [...draft.buttons, { label: '', url: 'https://' }] })} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <Plus size={15} /> Add button
              </button>
            )}
          </div>
        </Card>

        <Card title="Preview">
          <div className="flex gap-3">
            <img src="https://api.dicebear.com/7.x/bottts/svg?seed=system-bot" alt="" className="w-9 h-9 rounded-full bg-foreground/10" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">System Bot <span className="text-xs font-normal text-foreground/45 ml-1">just now</span></p>
              <p className="text-sm whitespace-pre-wrap break-words">{preview || <span className="text-foreground/40">Your message appears here.</span>}</p>
              {clean.buttons.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {clean.buttons.map((b, i) => <span key={i} className="px-3 py-1 rounded-md border border-foreground/15 text-sm">{b.label || 'Button'}</span>)}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-foreground/45 mt-3">Previewed with your name. Members see their own.</p>
        </Card>
      </div>

      <SaveBar dirty={dirty} saving={saving} error={error} onSave={save} onDiscard={() => setDraft(normalise(saved))} />
    </div>
  );
}
