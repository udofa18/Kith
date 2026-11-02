import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ArrowLeft, Check, Lock, Users, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { CHANNEL_TYPES, toChannelSlug, type ChannelTypeId } from '../lib/channelTypes';

interface CreateChannelModalProps {
  communityId: string;
  isOpen: boolean;
  onClose: () => void;
  roles?: any[];
  initialCategoryId?: string;
}

/** Two steps: pick what kind of channel, then name it and choose who can see it. */
export default function CreateChannelModal({ communityId, isOpen, onClose, roles = [], initialCategoryId }: CreateChannelModalProps) {
  const [step, setStep] = useState<0 | 1>(0);
  const [type, setType] = useState<ChannelTypeId>('chat');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategoryId || '');
  const [categories, setCategories] = useState<any[]>([]);
  const [restricted, setRestricted] = useState(false);
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!communityId || !isOpen) return;
    return onSnapshot(query(collection(db, 'communities', communityId, 'categories'), orderBy('order', 'asc')), snap => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [communityId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setCategoryId(initialCategoryId || '');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [initialCategoryId, isOpen]);

  if (!isOpen) return null;

  const info = CHANNEL_TYPES.find(t => t.id === type)!;
  const slug = toChannelSlug(name);

  const reset = () => {
    setStep(0); setType('chat'); setName(''); setDescription(''); setRestricted(false); setAllowedRoles([]);
  };
  const close = () => { reset(); onClose(); };

  const create = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!slug || !communityId) return;
    if (restricted && allowedRoles.length === 0) return toast.error('Pick at least one role, or let everyone see it.');
    setLoading(true);
    try {
      const roleIds = restricted ? allowedRoles : [];
      await addDoc(collection(db, 'communities', communityId, 'channels'), {
        name: slug,
        description: description.trim(),
        type,
        categoryId: categoryId || 'uncategorized',
        // `isPremium` is how the rest of the app marks role-restricted channels.
        isPremium: roleIds.length > 0,
        allowedRoles: roleIds,
        creatorId: auth.currentUser?.uid,
        owners: [auth.currentUser?.uid],
        createdAt: new Date().toISOString(),
        order: Date.now(),
        messageCount: 0,
      });
      toast.success(`#${slug} created`);
      close();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `communities/${communityId}/channels`);
      toast.error("Couldn't create the channel");
    } finally {
      setLoading(false);
    }
  };

  const input = 'mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/10 dark:border-white/15 outline-none focus:border-primary text-sm placeholder:text-black/35 dark:placeholder:text-white/35';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label="Create a channel" className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg flex flex-col bg-background text-black dark:text-white sm:rounded-3xl sm:border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-black/10 dark:border-white/10">
          <button onClick={() => (step === 1 ? setStep(0) : close())} aria-label={step === 1 ? 'Back' : 'Close'} className="p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
            {step === 1 ? <ArrowLeft size={20} /> : <X size={20} />}
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{step === 0 ? 'What kind of channel?' : `New ${info.label.toLowerCase()} channel`}</h2>
            <p className="text-xs text-black/50 dark:text-white/50">Step {step + 1} of 2</p>
          </div>
        </div>

        {step === 0 ? (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {CHANNEL_TYPES.map(t => {
              const Icon = t.icon;
              const active = type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setType(t.id); setStep(1); }}
                  className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-colors ${active ? 'border-primary bg-primary/5' : 'border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}
                >
                  <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${active ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/10'}`}><Icon size={19} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t.label}</span>
                    <span className="block text-sm text-black/60 dark:text-white/60">{t.description}</span>
                    <span className="block mt-1 text-xs text-black/45 dark:text-white/45">{t.whoPosts}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <form onSubmit={create} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-primary/5">
              <info.icon size={18} className="text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-black/70 dark:text-white/70">{info.description} <span className="text-black/50 dark:text-white/50">{info.whoPosts}.</span></p>
            </div>

            <div>
              <label htmlFor="ch-name" className="text-sm font-medium">Name</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 mt-[3px] text-black/40 dark:text-white/40">#</span>
                <input id="ch-name" autoFocus value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder={info.suggestions[0]} className={`${input} pl-8`} />
              </div>
              {name && slug !== name && <p className="mt-1 text-xs text-black/50 dark:text-white/50">Will appear as <span className="font-medium">#{slug || '…'}</span></p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {info.suggestions.map(sug => (
                  <button key={sug} type="button" onClick={() => setName(sug)} className="px-2.5 py-1 rounded-full text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15">#{sug}</button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="ch-desc" className="text-sm font-medium">Description <span className="font-normal text-black/45 dark:text-white/45">(optional)</span></label>
              <textarea id="ch-desc" value={description} maxLength={200} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What should people use this channel for?" className={`${input} resize-none`} />
            </div>

            {categories.length > 0 && (
              <div>
                <label htmlFor="ch-cat" className="text-sm font-medium">Section</label>
                <select id="ch-cat" value={categoryId || 'uncategorized'} onChange={e => setCategoryId(e.target.value)} className={input}>
                  <option value="uncategorized">No section</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <p className="text-sm font-medium">Who can see it?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Choice active={!restricted} onClick={() => setRestricted(false)} icon={Users} title="Everyone" body="All members of the community." />
                <Choice active={restricted} onClick={() => setRestricted(true)} icon={Lock} title="Certain roles" body="Only members with the roles you pick." disabled={roles.length === 0} />
              </div>
              {roles.length === 0 && <p className="mt-1.5 text-xs text-black/45 dark:text-white/45">Create roles in community settings to make role-only channels.</p>}
              {restricted && roles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {roles.map(role => {
                    const on = allowedRoles.includes(role.id);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setAllowedRoles(prev => (on ? prev.filter(r => r !== role.id) : [...prev, role.id]))}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border ${on ? 'bg-primary/10' : 'border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10'}`}
                        style={on ? { borderColor: role.color, color: role.color } : undefined}
                      >
                        {on && <Check size={13} />} {role.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading || !slug} className="w-full py-3 rounded-full bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors">
              {loading ? 'Creating…' : `Create #${slug || 'channel'}`}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Choice({ active, onClick, icon: Icon, title, body, disabled }: { active: boolean; onClick: () => void; icon: typeof Users; title: string; body: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={`p-3 rounded-2xl border text-left transition-colors disabled:opacity-40 ${active ? 'border-primary bg-primary/5' : 'border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}>
      <Icon size={17} className={active ? 'text-primary' : 'text-black/45 dark:text-white/45'} />
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <p className="text-xs text-black/55 dark:text-white/55">{body}</p>
    </button>
  );
}
