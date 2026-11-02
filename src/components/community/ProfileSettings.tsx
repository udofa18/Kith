import { useRef, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Card, SaveBar, inputClass } from './settingsUi';
import { COMMUNITY_CATEGORIES, categoryOf } from '../../lib/communityCategories';

const MAX_IMAGE_MB = 5;
const MAX_RULES = 15;

const handle = (v: string, prefixes: RegExp) => v.trim().replace(prefixes, '').replace(/^@/, '').replace(/\/+$/, '');
const validUrl = (url: string) => { try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; } };

/** What gets stored, tidied up. Comparing two of these tells us whether anything changed. */
const normalise = (c: any) => ({
  name: (c?.name || '').trim(),
  category: c?.category || '',
  description: (c?.description || '').trim(),
  website: (c?.website || '').trim(),
  socials: {
    twitter: handle(c?.socials?.twitter || '', /^https?:\/\/(www\.)?(twitter|x)\.com\//i),
    github: handle(c?.socials?.github || '', /^https?:\/\/(www\.)?github\.com\//i),
    linkedin: handle(c?.socials?.linkedin || '', /^https?:\/\/(www\.)?linkedin\.com\/in\//i),
    discord: (c?.socials?.discord || '').trim(),
  },
  rules: (c?.rules || []).map((r: string) => r.trim()).filter(Boolean),
});

interface Props {
  form: any;
  setForm: (f: any) => void;
  saved: any;
  isUploading: boolean;
  onUpload: (file: File, type: 'image' | 'backdrop') => void;
  onRemoveImage: (type: 'image' | 'backdrop') => void;
  onSave: (updates: any) => Promise<void> | void;
}

function ImagePicker({ label, hint, src, shape, busy, onPick, onRemove }: {
  label: string; hint: string; src?: string; shape: 'square' | 'wide'; busy: boolean; onPick: (f: File) => void; onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const choose = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file.');
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) return toast.error(`Images must be under ${MAX_IMAGE_MB} MB.`);
    onPick(file);
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className={`overflow-hidden rounded-lg border border-foreground/15 bg-foreground/5 flex items-center justify-center text-foreground/40 text-sm ${shape === 'square' ? 'w-28 h-28' : 'w-full h-28'}`}>
        {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : 'Not set'}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => input.current?.click()} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-foreground/15 text-sm hover:bg-foreground/5 disabled:opacity-50">
          <Upload size={14} />{busy ? 'Uploading…' : src ? 'Change' : 'Upload'}
        </button>
        {src && <button onClick={onRemove} disabled={busy} className="text-sm text-foreground/55 hover:text-red-500">Remove</button>}
      </div>
      <p className="text-xs text-foreground/45">{hint}</p>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

export default function ProfileSettings({ form, setForm, saved, isUploading, onUpload, onRemoveImage, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const draft = normalise(form);
  const dirty = JSON.stringify(draft) !== JSON.stringify(normalise(saved));
  const category = form.category && COMMUNITY_CATEGORIES.some(c => c.id === form.category) ? form.category : '';
  const suggested = categoryOf({ name: form.name, description: form.description });

  const error = !draft.name ? 'Give your community a name.'
    : draft.website && !validUrl(draft.website) ? 'The website must start with https://'
    : draft.socials.discord && !validUrl(draft.socials.discord) ? 'The Discord link must start with https://'
    : null;

  const setSocial = (key: string, value: string) => setForm({ ...form, socials: { ...(form.socials || {}), [key]: value } });
  const rules: string[] = form.rules || [];

  const save = async () => {
    if (error) return;
    setSaving(true);
    try { await onSave({ name: draft.name, category: draft.category, description: draft.description, website: draft.website, socials: draft.socials, rules: draft.rules }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <Card title="Images" description="Photos upload as soon as you choose them.">
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6">
          <ImagePicker label="Photo" hint="Square works best." src={saved?.image} shape="square" busy={isUploading} onPick={f => onUpload(f, 'image')} onRemove={() => onRemoveImage('image')} />
          <ImagePicker label="Banner" hint="Wide image shown at the top of your community." src={saved?.backdrop} shape="wide" busy={isUploading} onPick={f => onUpload(f, 'backdrop')} onRemove={() => onRemoveImage('backdrop')} />
        </div>
      </Card>

      <Card title="About">
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Name</span>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={60} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Category</span>
            <select value={category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputClass}>
              <option value="">Not set{!category ? ` (shown as ${COMMUNITY_CATEGORIES.find(c => c.id === suggested)?.label ?? 'General'})` : ''}</option>
              {COMMUNITY_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <span className="block text-xs text-foreground/45">Helps people find you in discovery.</span>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Description</span>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} maxLength={1000} rows={4}
              placeholder="What is this community about?" className={`${inputClass} resize-none`} />
            <span className="block text-xs text-foreground/45 text-right">{(form.description || '').length}/1000</span>
          </label>
        </div>
      </Card>

      <Card title="Links" description="Shown on your community page.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'website', label: 'Website', ph: 'https://example.com', value: form.website, set: (v: string) => setForm({ ...form, website: v }) },
            { key: 'discord', label: 'Discord invite', ph: 'https://discord.gg/…', value: form.socials?.discord || '', set: (v: string) => setSocial('discord', v) },
            { key: 'twitter', label: 'X / Twitter', ph: 'username', value: form.socials?.twitter || '', set: (v: string) => setSocial('twitter', v) },
            { key: 'github', label: 'GitHub', ph: 'username or org', value: form.socials?.github || '', set: (v: string) => setSocial('github', v) },
            { key: 'linkedin', label: 'LinkedIn', ph: 'profile name', value: form.socials?.linkedin || '', set: (v: string) => setSocial('linkedin', v) },
          ].map(f => (
            <label key={f.key} className="block space-y-1">
              <span className="text-sm font-medium">{f.label}</span>
              <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph} className={inputClass} />
            </label>
          ))}
        </div>
      </Card>

      <Card title="Community rules" description="A short list members see on your community page.">
        <div className="space-y-2">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-sm text-foreground/45 text-right">{i + 1}.</span>
              <input value={rule} onChange={e => setForm({ ...form, rules: rules.map((r, j) => j === i ? e.target.value : r) })} maxLength={200} aria-label={`Rule ${i + 1}`} className={inputClass} />
              <button onClick={() => setForm({ ...form, rules: rules.filter((_, j) => j !== i) })} aria-label={`Remove rule ${i + 1}`} className="p-2 rounded-lg text-foreground/40 hover:text-red-500 hover:bg-red-500/10"><Trash2 size={16} /></button>
            </div>
          ))}
          {rules.length === 0 && <p className="text-sm text-foreground/50">No rules yet.</p>}
          {rules.length < MAX_RULES && (
            <button onClick={() => setForm({ ...form, rules: [...rules, ''] })} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <Plus size={15} /> Add rule
            </button>
          )}
        </div>
      </Card>

      <SaveBar dirty={dirty} saving={saving} error={error} onSave={save}
        onDiscard={() => setForm({ ...form, name: saved?.name || '', category: saved?.category || '', description: saved?.description || '', website: saved?.website || '', socials: { twitter: '', discord: '', github: '', linkedin: '', ...(saved?.socials || {}) }, rules: saved?.rules || [] })} />
    </div>
  );
}
