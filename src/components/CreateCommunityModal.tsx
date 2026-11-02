import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { collection, doc, serverTimestamp, setDoc, addDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ArrowLeft, Camera, Globe, ImagePlus, Lock, ShieldCheck, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db, storage, handleFirestoreError, OperationType } from '../firebase';
import { queryKeys } from '../lib/queryClient';
import { COMMUNITY_CATEGORIES } from '../lib/communityCategories';
import { feeFields, validateFee, type CommunityFee } from '../lib/communityPricing';
import CommunityCard from './CommunityCard';
import FeeEditor from './community/FeeEditor';

const NAME_MAX = 50;
const ABOUT_MAX = 300;
const IMAGE_MAX_MB = 5;
const STEPS = ['Basics', 'Look', 'Access'] as const;

/** Channels every new community starts with. */
const STARTER_LAYOUT = [
  { name: 'Chat', channels: [
    { name: 'announcements', type: 'announcements', description: 'Important updates and news' },
    { name: 'general', type: 'chat', description: 'General discussion for everyone' },
    { name: 'showcase', type: 'feed', description: 'Share what you made. Members like and comment.' },
  ] },
  { name: 'Resources', channels: [{ name: 'resources', type: 'chat', description: 'Share helpful links and files' }] },
  { name: 'Voice and Stream', channels: [
    { name: 'lounge', type: 'voice', description: 'Drop in and talk' },
    { name: 'stage', type: 'live', description: 'Live sessions and talks' },
  ] },
];

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

async function upload(uid: string, file: File, kind: 'icon' | 'cover') {
  const r = ref(storage, `communities/${uid}/${Date.now()}_${kind}_${file.name.replace(/[^\w.-]/g, '_')}`);
  await uploadBytes(r, file, { contentType: file.type });
  return getDownloadURL(r);
}

/** Three short steps (basics, look, access) with a live preview of the community card. */
export default function CreateCommunityModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [category, setCategory] = useState('');
  const [icon, setIcon] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [fee, setFee] = useState<CommunityFee | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const iconUrl = useObjectUrl(icon);
  const coverUrl = useObjectUrl(cover);
  const iconInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, saving, onClose]);

  if (!isOpen) return null;

  const reset = () => {
    setStep(0); setName(''); setAbout(''); setCategory(''); setIcon(null); setCover(null); setIsPrivate(false); setFee(null);
  };

  const pickImage = (setter: (f: File | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('Choose an image');
    if (f.size > IMAGE_MAX_MB * 1024 * 1024) return toast.error(`Images must be under ${IMAGE_MAX_MB} MB`);
    setter(f);
  };

  const trimmedName = name.trim();
  const stepError = [
    trimmedName.length < 3 ? 'Give your community a name (at least 3 characters).' : !category ? 'Pick a category so people can find it.' : null,
    null,
    fee ? validateFee(fee) : null,
  ][step];

  const create = async () => {
    const user = auth.currentUser;
    if (!user || stepError) return;
    try {
      setSaving('Uploading images…');
      const [image, backdrop] = await Promise.all([
        icon ? upload(user.uid, icon, 'icon') : Promise.resolve(''),
        cover ? upload(user.uid, cover, 'cover') : Promise.resolve(''),
      ]);

      setSaving('Creating your community…');
      const communityRef = await addDoc(collection(db, 'communities'), {
        name: trimmedName,
        description: about.trim(),
        category,
        creatorId: user.uid,
        memberCount: 1,
        isPrivate,
        membershipControl: {
          accessType: isPrivate ? 'private' : 'public',
          approvalRequired: isPrivate,
          onboardingQuestions: [],
          memberVerificationRequired: false,
          profileCompletionRequired: false,
          autoRoles: [],
        },
        ...feeFields(fee),
        image,
        backdrop,
        createdAt: serverTimestamp(),
        stats: { messagesCount: 0, totalXp: 0 },
      });
      const id = communityRef.id;

      await setDoc(doc(db, 'communities', id, 'members', user.uid), {
        userId: user.uid,
        role: 'owner',
        joinedAt: serverTimestamp(),
        permissions: ['all'],
      });

      setSaving('Setting up channels…');
      await Promise.all(STARTER_LAYOUT.flatMap((group, gi) => {
        const categoryRef = doc(collection(db, 'communities', id, 'categories'));
        return [
          setDoc(categoryRef, { name: group.name, order: gi, createdAt: serverTimestamp() }),
          ...group.channels.map((ch, ci) => setDoc(doc(collection(db, 'communities', id, 'channels')), {
            ...ch,
            categoryId: categoryRef.id,
            order: ci + 1,
            createdAt: serverTimestamp(),
            messageCount: 0,
          })),
        ];
      }));

      queryClient.invalidateQueries({ queryKey: queryKeys.communities() });
      toast.success(`${trimmedName} is ready`);
      reset();
      onClose();
      navigate(`/feed?view=community&id=${id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'communities');
      toast.error("Couldn't create the community. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  const next = () => {
    if (stepError) return toast.error(stepError);
    if (step < STEPS.length - 1) setStep(step + 1);
    else create();
  };

  const preview = {
    id: trimmedName || 'preview',
    name: trimmedName || 'Your community',
    description: about.trim() || 'What your community is about will show here.',
    category,
    image: iconUrl,
    backdrop: coverUrl,
    memberCount: 1,
    creatorId: auth.currentUser?.uid,
    isPrivate,
    ...feeFields(fee),
  };

  const label = 'text-sm font-medium';
  const input = 'mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/10 dark:border-white/15 outline-none focus:border-primary text-sm placeholder:text-black/35 dark:placeholder:text-white/35';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Create a community" className="w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl flex flex-col bg-background text-black dark:text-white sm:rounded-3xl sm:border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-black/10 dark:border-white/10">
          <button onClick={() => (step > 0 ? setStep(step - 1) : onClose())} disabled={!!saving} aria-label={step > 0 ? 'Back' : 'Close'} className="p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40">
            {step > 0 ? <ArrowLeft size={20} /> : <X size={20} />}
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Create a community</h2>
            <p className="text-xs text-black/50 dark:text-white/50">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
          </div>
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-primary' : i < step ? 'w-3 bg-primary/50' : 'w-3 bg-black/15 dark:bg-white/20'}`} />)}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto grid lg:grid-cols-[1fr_280px]">
          {/* Form */}
          <div className="p-4 sm:p-6 space-y-5">
            {step === 0 && (
              <>
                <div>
                  <div className="flex justify-between"><label htmlFor="cc-name" className={label}>Name</label><span className="text-xs text-black/40 dark:text-white/40">{name.length}/{NAME_MAX}</span></div>
                  <input id="cc-name" autoFocus value={name} maxLength={NAME_MAX} onChange={e => setName(e.target.value)} placeholder="e.g. Lagos Photographers" className={input} />
                </div>
                <div>
                  <div className="flex justify-between"><label htmlFor="cc-about" className={label}>What's it about?</label><span className="text-xs text-black/40 dark:text-white/40">{about.length}/{ABOUT_MAX}</span></div>
                  <textarea id="cc-about" value={about} maxLength={ABOUT_MAX} onChange={e => setAbout(e.target.value)} rows={3} placeholder="Who is it for, and what will people do here?" className={`${input} resize-none`} />
                </div>
                <div>
                  <p className={label}>Category</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {COMMUNITY_CATEGORIES.map(c => (
                      <button key={c.id} type="button" onClick={() => setCategory(c.id)} aria-pressed={category === c.id} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${category === c.id ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/[0.07] hover:bg-black/10 dark:hover:bg-white/10'}`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <p className={label}>Icon</p>
                  <p className="text-xs text-black/50 dark:text-white/50">A square image works best. Without one, we use your first letter.</p>
                  <div className="mt-2 flex items-center gap-3">
                    <button type="button" onClick={() => iconInput.current?.click()} className="w-20 h-20 rounded-2xl border-2 border-dashed border-black/15 dark:border-white/20 flex items-center justify-center overflow-hidden hover:border-primary transition-colors">
                      {iconUrl ? <img src={iconUrl} alt="" className="w-full h-full object-cover" /> : <Camera size={22} className="text-black/40 dark:text-white/40" />}
                    </button>
                    {icon && <button type="button" onClick={() => setIcon(null)} className="text-sm text-black/55 dark:text-white/55 hover:text-red-500">Remove</button>}
                  </div>
                  <input ref={iconInput} type="file" accept="image/*" hidden onChange={pickImage(setIcon)} />
                </div>
                <div>
                  <p className={label}>Cover</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Shown across the top of your community. Wide images (3:1) look best.</p>
                  <button type="button" onClick={() => coverInput.current?.click()} className="mt-2 w-full aspect-[3/1] rounded-2xl border-2 border-dashed border-black/15 dark:border-white/20 flex items-center justify-center overflow-hidden hover:border-primary transition-colors">
                    {coverUrl ? <img src={coverUrl} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center gap-2 text-sm text-black/45 dark:text-white/45"><ImagePlus size={18} /> Add a cover</span>}
                  </button>
                  {cover && <button type="button" onClick={() => setCover(null)} className="mt-1.5 text-sm text-black/55 dark:text-white/55 hover:text-red-500">Remove cover</button>}
                  <input ref={coverInput} type="file" accept="image/*" hidden onChange={pickImage(setCover)} />
                </div>
                <p className="text-xs text-black/45 dark:text-white/45">You can skip this and add images later in settings.</p>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <p className={label}>Who can join?</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <AccessChoice active={!isPrivate} onClick={() => setIsPrivate(false)} icon={Globe} title="Public" body="Anyone can find it and join." />
                    <AccessChoice active={isPrivate} onClick={() => setIsPrivate(true)} icon={Lock} title="Private" body="People request to join and you approve." />
                  </div>
                </div>
                <div>
                  <p className={label}>Joining fee</p>
                  <div className="mt-2"><FeeEditor value={fee} onChange={setFee} /></div>
                </div>
                <p className="flex items-start gap-2 text-xs text-black/55 dark:text-white/55">
                  <ShieldCheck size={15} className="shrink-0 text-primary" />
                  You'll be the owner. We'll set up #announcements, #general, #showcase, #resources, a voice room and a live stage to get you started.
                </p>
              </>
            )}
          </div>

          {/* Preview */}
          <aside className={`${step === 1 ? 'block' : 'hidden'} lg:block p-4 sm:p-6 lg:pl-0`}>
            <p className="text-xs font-semibold text-black/50 dark:text-white/50 mb-2">Preview</p>
            <div className="pointer-events-none"><CommunityCard community={preview} onClick={() => undefined} /></div>
          </aside>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-black/10 dark:border-white/10 pb-[max(12px,env(safe-area-inset-bottom))]">
          <p className="text-xs text-black/50 dark:text-white/50 min-w-0 truncate">{saving ?? (stepError && step === 0 && trimmedName ? stepError : '')}</p>
          <div className="flex gap-2 shrink-0">
            {step > 0 && <button onClick={() => setStep(step - 1)} disabled={!!saving} className="px-4 py-2 rounded-full border border-black/15 dark:border-white/20 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40">Back</button>}
            <button onClick={next} disabled={!!saving || !!stepError} className="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors">
              {saving ? 'Creating…' : step < STEPS.length - 1 ? 'Next' : 'Create community'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AccessChoice({ active, onClick, icon: Icon, title, body }: { active: boolean; onClick: () => void; icon: typeof Globe; title: string; body: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`p-3.5 rounded-2xl border text-left transition-colors ${active ? 'border-primary bg-primary/5' : 'border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}>
      <Icon size={18} className={active ? 'text-primary' : 'text-black/45 dark:text-white/45'} />
      <p className="mt-1.5 text-sm font-semibold">{title}</p>
      <p className="text-xs text-black/55 dark:text-white/55">{body}</p>
    </button>
  );
}
