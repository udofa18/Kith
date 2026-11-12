import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from '../lib/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  Wallet,
} from 'lucide-react';
import { auth, db } from '../firebase';
import { generateProductDescription } from '../services/geminiService';
import { Badge, Button, Card, EmptyState, Field, Input, Skeleton, Textarea } from '../components/ui';
import { PRODUCT_TYPES } from '../lib/marketplace';
import { loadLessons, LessonInput, syncLessons, syncProductToStore } from '../lib/productSync';
import { formatPrice, PAYMENT_CURRENCY, toMinorUnits, type CheckoutCurrency } from '../lib/payments';
import { cn } from '../lib/cn';

const STEPS = ['Details', 'Files & cover', 'Curriculum', 'Price & publish'] as const;
const PLATFORM_FEE_PERCENT = 10;
const TYPES = PRODUCT_TYPES.filter(t => t.id !== 'all');

interface FormState {
  title: string;
  tagline: string;
  productType: string;
  description: string;
  tags: string;
  fileUrl: string;
  fileName: string;
  previewImage: string;
  price: string;
  currency: CheckoutCurrency;
}

interface LessonDraft {
  key: string;
  id?: string;
  section_title: string;
  title: string;
  content: string;
  duration_minutes: string;
  is_preview: boolean;
}

const emptyForm: FormState = {
  title: '',
  tagline: '',
  productType: 'course',
  description: '',
  tags: '',
  fileUrl: '',
  fileName: '',
  previewImage: '',
  price: '',
  currency: PAYMENT_CURRENCY,
};

const newLesson = (section = 'Introduction'): LessonDraft => ({
  key: Math.random().toString(36).slice(2),
  section_title: section,
  title: '',
  content: '',
  duration_minutes: '',
  is_preview: false,
});

const fileNameFromPath = (url: string) => {
  const marker = url.match(/^supabase:\/\/([^/]+)\/(.+)$/);
  const publicUrl = url.match(/\/storage\/v1\/object\/public\/[^/]+\/([^?]+)/);
  const firebase = url.match(/\/o\/([^?]+)/);
  const path = marker
    ? marker[2]
    : publicUrl
      ? decodeURIComponent(publicUrl[1])
      : firebase
        ? decodeURIComponent(firebase[1])
        : '';
  return path.split('/').pop()?.replace(/^\d+_/, '') ?? '';
};

function uploadToStorage(file: File, folder: string, uid: string, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const target = ref(null, `${folder}/${uid}/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(target, file);
    task.on(
      'state_changed',
      snap => onProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref)),
    );
  });
}

export default function ProductEditor() {
  const { id: pathId } = useParams();
  const [searchParams] = useSearchParams();
  const routeId = pathId ?? searchParams.get('edit') ?? undefined;
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [authReady, setAuthReady] = useState(!!auth.currentUser);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [lessons, setLessons] = useState<LessonDraft[]>([]);
  const [originalLessonIds, setOriginalLessonIds] = useState<string[]>([]);
  const [productId, setProductId] = useState<string | null>(routeId ?? null);
  const [status, setStatus] = useState<'draft' | 'published' | null>(null);
  const [loading, setLoading] = useState(!!routeId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | 'draft' | 'publish'>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<null | 'file' | 'cover'>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const isEdit = !!routeId;
  const isPublished = status === 'published';

  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      setUid(user?.uid ?? null);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!routeId || !authReady) return;
    if (!uid) {
      setLoadError('Sign in to edit this product.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'products', routeId));
        if (cancelled) return;
        if (!snap.exists() || snap.data().creatorUid !== uid) {
          setLoadError("You can't edit this product, or it doesn't exist.");
          return;
        }
        const data = snap.data();
        // Keep the listing's own currency. Switching currency or reinterpreting the number would
        // change the price the creator agreed to, so existing values are never converted.
        const rawCurrency: CheckoutCurrency = data.currency === 'NGN' ? 'NGN' : 'USD';
        setStatus(data.status === 'draft' ? 'draft' : 'published');
        setForm({
          title: data.title ?? '',
          tagline: data.tagline ?? '',
          productType: data.productType ?? 'other',
          description: data.description ?? '',
          tags: Array.isArray(data.tags) ? data.tags.join(', ') : '',
          fileUrl: data.fileUrl ?? '',
          fileName: data.fileUrl ? fileNameFromPath(data.fileUrl) : '',
          previewImage: data.previewImage ?? '',
          price: Number(data.price) > 0 ? String(data.price) : '',
          currency: rawCurrency,
        });
        const rows = await loadLessons(routeId);
        if (cancelled) return;
        setLessons(
          rows.map(r => ({
            key: r.id,
            id: r.id,
            section_title: r.section_title,
            title: r.title,
            content: r.content ?? '',
            duration_minutes: r.duration_seconds ? String(Math.round(r.duration_seconds / 60)) : '',
            is_preview: r.is_preview,
          })),
        );
        setOriginalLessonIds(rows.map(r => r.id));
      } catch {
        if (!cancelled) setLoadError('We could not load this product.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeId, uid, authReady]);

  const set = (patch: Partial<FormState>) => {
    setStepError(null);
    setForm(prev => ({ ...prev, ...patch }));
  };

  const priceMinor = Math.round(Number(form.price || 0) * 100);
  const isFree = !(priceMinor > 0);
  const feeMinor = Math.round((priceMinor * PLATFORM_FEE_PERCENT) / 100);

  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!form.title.trim()) return 'Give your product a title.';
      if (!form.productType) return 'Choose a product type.';
    }
    return null;
  };

  const goTo = (next: number) => {
    if (next > step) {
      const err = validateStep(step);
      if (err) return setStepError(err);
    }
    setStepError(null);
    setStep(next);
  };

  const pickFile = async (file: File | undefined, kind: 'file' | 'cover') => {
    if (!file || !uid) return;
    setUploading(kind);
    setUploadPct(0);
    try {
      const url = await uploadToStorage(file, kind === 'file' ? 'private_products' : 'previews', uid, setUploadPct);
      if (kind === 'file') set({ fileUrl: url, fileName: file.name });
      else set({ previewImage: url });
      toast.success(kind === 'file' ? 'File uploaded' : 'Cover uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const writeAi = async () => {
    if (!form.title.trim()) return setStepError('Add a title first so the assistant knows what to write about.');
    setAiBusy(true);
    try {
      const text = await generateProductDescription({ title: form.title, tagline: form.tagline, category: form.productType });
      if (!text) throw new Error('Empty response');
      set({ description: text });
    } catch {
      toast.error('The assistant could not write a description. Try again.');
    } finally {
      setAiBusy(false);
    }
  };

  const updateLesson = (key: string, patch: Partial<LessonDraft>) =>
    setLessons(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const moveLesson = (index: number, dir: -1 | 1) =>
    setLessons(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  const save = async (mode: 'draft' | 'publish') => {
    if (!uid || !auth.currentUser) return;
    const titleErr = validateStep(0);
    if (titleErr) {
      setStep(0);
      return setStepError(titleErr);
    }
    if (mode === 'publish') {
      if (!form.fileUrl && lessons.filter(l => l.title.trim()).length === 0) {
        setStep(1);
        return setStepError('Upload a file or add at least one lesson before publishing.');
      }
    }

    if (form.price.trim()) {
      try {
        toMinorUnits(form.price, form.currency);
      } catch (e) {
        setStep(3);
        return setStepError(e instanceof Error ? e.message : 'Enter a valid price.');
      }
    }

    setSaving(mode);
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 12);
      const nextStatus = mode === 'publish' ? 'published' : 'draft';
      const payload = {
        title: form.title.trim(),
        tagline: form.tagline.trim(),
        productType: form.productType,
        description: form.description.trim(),
        tags,
        price: isFree ? 0 : Number(form.price),
        currency: form.currency,
        previewImage: form.previewImage,
        fileUrl: form.fileUrl,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };

      let id = productId;
      if (isEdit && id) {
        await updateDoc(doc(db, 'products', id), payload);
      } else {
        const created = await addDoc(collection(db, 'products'), {
          ...payload,
          creatorUid: uid,
          creatorName: auth.currentUser.displayName || 'Anonymous',
          creatorPhoto: auth.currentUser.photoURL || '',
          createdAt: new Date().toISOString(),
          salesCount: 0,
          impressions: 0,
          likes: 0,
          avgRating: 0,
          reviewCount: 0,
        });
        id = created.id;
        setProductId(id);
      }

      await syncProductToStore(id!, {
        title: payload.title,
        description: payload.description,
        productType: payload.productType,
        tags,
        price: payload.price,
        currency: form.currency,
        previewImage: payload.previewImage,
        fileUrl: payload.fileUrl,
        status: nextStatus,
      });

      const keptIds = new Set(lessons.map(l => l.id).filter(Boolean) as string[]);
      const removed = originalLessonIds.filter(lid => !keptIds.has(lid));
      const payloadLessons: LessonInput[] = lessons
        .filter(l => l.title.trim())
        .map((l, position) => ({
          ...(l.id ? { id: l.id } : {}),
          section_title: l.section_title.trim() || 'Lessons',
          title: l.title.trim(),
          content: l.content.trim() || null,
          duration_seconds: l.duration_minutes ? Math.max(0, Math.round(Number(l.duration_minutes) * 60)) : null,
          is_preview: l.is_preview,
          position,
        }));
      await syncLessons(id!, payloadLessons, removed);

      setStatus(nextStatus);
      toast.success(mode === 'publish' ? 'Published to the market' : 'Draft saved');
      navigate(`/products/${id}`);
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const summaryLessons = useMemo(() => lessons.filter(l => l.title.trim()).length, [lessons]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[880px] space-y-6 px-6 py-10">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-20">
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title="Can't open this product"
          description={loadError}
          action={<Link to="/dashboard" className="text-sm font-semibold text-primary hover:underline">Back to dashboard</Link>}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar text-foreground">
      <div className="mx-auto max-w-[880px] space-y-8 px-6 pb-20 pt-8">
        <div className="space-y-1">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{isEdit ? 'Edit product' : 'Create a product'}</h1>
          {isEdit && status && (
            <Badge variant={isPublished ? 'success' : 'neutral'} className="mt-2">
              {isPublished ? 'Published' : 'Draft'}
            </Badge>
          )}
        </div>

        <Stepper current={step} onSelect={goTo} />

        {form.currency === 'NGN' && !isFree && (
          <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4 text-sm">
            <Wallet size={18} className="mt-0.5 shrink-0 text-primary" />
            <p>
              This product is priced in Nigerian naira. Both NGN and USD checkout are processed by
              Paystack for now. Amounts are never converted between currencies.
            </p>
          </div>
        )}

        <Card variant="elevated" className="space-y-8 p-6 md:p-8">
          {step === 0 && (
            <div className="space-y-6">
              <Field label="Title" htmlFor="p-title">
                <Input id="p-title" value={form.title} onChange={e => set({ title: e.target.value })} maxLength={120} placeholder="e.g. Launch your first digital product" />
              </Field>
              <Field label="Tagline" optional htmlFor="p-tagline">
                <Input id="p-tagline" value={form.tagline} onChange={e => set({ tagline: e.target.value })} maxLength={140} placeholder="One line that sells it" />
              </Field>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Type</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TYPES.map(t => {
                    const active = form.productType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => set({ productType: t.id })}
                        className={cn(
                          'rounded-control border px-3 py-3 text-sm font-semibold transition-colors',
                          active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field
                label="Description"
                htmlFor="p-desc"
                optional
                hint="Plain text. Say what buyers get and who it's for."
              >
                <div className="space-y-2">
                  <Textarea id="p-desc" rows={7} value={form.description} onChange={e => set({ description: e.target.value })} maxLength={5000} />
                  <div className="flex justify-end">
                    <Button variant="soft" size="sm" onClick={writeAi} loading={aiBusy} leftIcon={<Sparkles size={14} />}>
                      Write it for me
                    </Button>
                  </div>
                </div>
              </Field>

              <Field label="Tags" optional htmlFor="p-tags" hint="Comma separated, up to 12.">
                <Input id="p-tags" value={form.tags} onChange={e => set({ tags: e.target.value })} placeholder="design, notion, beginner" />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-8">
              <div className="space-y-3">
                <p className="text-sm font-semibold">Main file</p>
                <p className="text-sm text-muted-foreground">
                  The file buyers download. It stays private and is only shared with people who buy it.
                </p>
                <input ref={fileInput} type="file" hidden onChange={e => pickFile(e.target.files?.[0], 'file')} />
                <DropZone
                  busy={uploading === 'file'}
                  progress={uploadPct}
                  onClick={() => fileInput.current?.click()}
                  icon={<FileText size={22} />}
                  label={form.fileUrl ? form.fileName || 'File uploaded' : 'Upload the file'}
                  hint={form.fileUrl ? 'Click to replace it' : 'PDF, ZIP, video, or any file'}
                  done={!!form.fileUrl}
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold">Cover image <span className="font-normal text-muted-foreground">(optional)</span></p>
                <input ref={coverInput} type="file" accept="image/*" hidden onChange={e => pickFile(e.target.files?.[0], 'cover')} />
                <div className="flex items-center gap-5">
                  <div className="grid h-28 w-40 place-items-center overflow-hidden rounded-card border border-border bg-muted">
                    {form.previewImage ? (
                      <img src={form.previewImage} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon size={24} className="text-faint" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" onClick={() => coverInput.current?.click()} loading={uploading === 'cover'} leftIcon={<UploadCloud size={14} />}>
                      {form.previewImage ? 'Replace cover' : 'Upload cover'}
                    </Button>
                    <p className="text-xs text-muted-foreground">A 4:3 image looks best.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <CurriculumEditor
              lessons={lessons}
              onAdd={() => setLessons(prev => [...prev, newLesson(prev.at(-1)?.section_title)])}
              onUpdate={updateLesson}
              onRemove={key => setLessons(prev => prev.filter(l => l.key !== key))}
              onMove={moveLesson}
            />
          )}

          {step === 3 && (
            <div className="space-y-8">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold">Price</p>
                  <p className="text-sm text-muted-foreground">Leave it free, or set a price. Choose the currency explicitly.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant={isFree ? 'primary' : 'outline'} size="sm" onClick={() => set({ price: '' })}>Free</Button>
                  <Button variant={!isFree ? 'primary' : 'outline'} size="sm" onClick={() => set({ price: form.price || '10' })}>Paid</Button>
                </div>
                {!isFree && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-4">
                      <Field label="Price" htmlFor="p-price">
                        <Input id="p-price" type="number" min={1} step={0.5} value={form.price} onChange={e => set({ price: e.target.value })} placeholder="10" />
                      </Field>
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Currency</p>
                        <div className="flex gap-2">
                          {(['USD', 'NGN'] as const).map(code => (
                            <button
                              key={code}
                              type="button"
                              aria-pressed={form.currency === code}
                              onClick={() => set({ currency: code })}
                              className={cn(
                                'rounded-control border px-3 py-2 text-sm font-semibold transition-colors',
                                form.currency === code
                                  ? 'border-primary bg-primary/10 text-foreground'
                                  : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
                              )}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {form.currency === 'NGN'
                            ? 'Charged with Paystack. Naira prices are stored as kobo. Switching currency never converts the number.'
                            : 'Charged with Paystack. US dollar prices are stored as cents. Switching currency never converts the number.'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1 self-start rounded-control bg-muted p-4 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Platform fee ({PLATFORM_FEE_PERCENT}%)</span>
                        <span>{formatPrice(feeMinor, form.currency)}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>You receive</span>
                        <span>{formatPrice(priceMinor - feeMinor, form.currency)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {!isFree && (
                <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4 text-sm">
                  <Wallet size={18} className="mt-0.5 shrink-0 text-primary" />
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold">Payouts are coming soon</p>
                    <p className="text-muted-foreground">
                      You can still sell paid products. Earnings stay in your Kith balance until
                      withdrawals open.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3 rounded-card border border-border p-5">
                <p className="text-sm font-semibold">Summary</p>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Title</dt>
                  <dd className="truncate">{form.title || '—'}</dd>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{TYPES.find(t => t.id === form.productType)?.label ?? '—'}</dd>
                  <dt className="text-muted-foreground">File</dt>
                  <dd>{form.fileUrl ? 'Uploaded' : 'None'}</dd>
                  <dt className="text-muted-foreground">Lessons</dt>
                  <dd>{summaryLessons}</dd>
                  <dt className="text-muted-foreground">Price</dt>
                  <dd>{isFree ? 'Free' : formatPrice(priceMinor, form.currency)}</dd>
                </dl>
              </div>
            </div>
          )}
        </Card>

        {stepError && (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle size={16} /> {stepError}
          </p>
        )}

        {uploading && (
          <p className="text-sm text-muted-foreground">
            Uploading… {Math.round(uploadPct)}%
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => goTo(Math.max(0, step - 1))} disabled={step === 0} leftIcon={<ArrowLeft size={16} />}>
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => goTo(step + 1)} rightIcon={<ArrowRight size={16} />}>
              Continue
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => save('draft')} loading={saving === 'draft'} disabled={!!saving}>
                Save draft
              </Button>
              <Button onClick={() => save('publish')} loading={saving === 'publish'} disabled={!!saving || !!uploading} leftIcon={<CheckCircle2 size={16} />}>
                {isPublished ? 'Save changes' : 'Publish'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ current, onSelect }: { current: number; onSelect: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={active ? 'step' : undefined}
              className={cn('flex w-full items-center gap-2 rounded-control border px-3 py-2.5 text-left text-xs font-semibold transition-colors sm:text-sm', active ? 'border-primary bg-primary/10' : done ? 'border-border text-foreground' : 'border-border text-muted-foreground')}
            >
              <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]', done || active ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                {done ? '✓' : i + 1}
              </span>
              <span className="truncate">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function DropZone({
  busy,
  progress,
  onClick,
  icon,
  label,
  hint,
  done,
}: {
  busy: boolean;
  progress: number;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
  done: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed p-8 text-center transition-colors',
        done ? 'border-success/50 bg-success/5' : 'border-border-strong hover:bg-muted',
      )}
    >
      <span className={cn('grid h-11 w-11 place-items-center rounded-full', done ? 'bg-success/15 text-success' : 'bg-primary/12 text-primary')}>
        {busy ? <Loader2 className="animate-spin" size={20} /> : done ? <CheckCircle2 size={20} /> : icon}
      </span>
      <span className="text-sm font-semibold">{busy ? `Uploading ${Math.round(progress)}%` : label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

function CurriculumEditor({
  lessons,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: {
  lessons: LessonDraft[];
  onAdd: () => void;
  onUpdate: (key: string, patch: Partial<LessonDraft>) => void;
  onRemove: (key: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold">Curriculum</p>
        <p className="text-sm text-muted-foreground">
          Lessons are optional, but they're how a course is sold. Mark a lesson as a preview to let anyone read it before buying.
        </p>
      </div>

      {lessons.length === 0 && (
        <p className="rounded-control border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
          No lessons yet.
        </p>
      )}

      <ol className="space-y-4">
        {lessons.map((l, i) => (
          <li key={l.key} className="space-y-3 rounded-card border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
              <Input aria-label={`Lesson ${i + 1} title`} value={l.title} onChange={e => onUpdate(l.key, { title: e.target.value })} placeholder="Lesson title" maxLength={120} className="flex-1" />
              <button type="button" aria-label="Move up" onClick={() => onMove(i, -1)} disabled={i === 0} className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp size={16} /></button>
              <button type="button" aria-label="Move down" onClick={() => onMove(i, 1)} disabled={i === lessons.length - 1} className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown size={16} /></button>
              <button type="button" aria-label="Remove lesson" onClick={() => onRemove(l.key)} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input aria-label={`Lesson ${i + 1} section`} value={l.section_title} onChange={e => onUpdate(l.key, { section_title: e.target.value })} placeholder="Section" maxLength={80} />
              <Input aria-label={`Lesson ${i + 1} minutes`} type="number" min={0} value={l.duration_minutes} onChange={e => onUpdate(l.key, { duration_minutes: e.target.value })} placeholder="Minutes" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={l.is_preview} onChange={e => onUpdate(l.key, { is_preview: e.target.checked })} className="h-4 w-4 accent-[var(--ds-primary)]" />
                Free preview
              </label>
            </div>
            <Textarea aria-label={`Lesson ${i + 1} content`} rows={4} value={l.content} onChange={e => onUpdate(l.key, { content: e.target.value })} placeholder="Lesson notes or text. Plain text." maxLength={20000} />
          </li>
        ))}
      </ol>

      <Button variant="outline" onClick={onAdd} leftIcon={<Plus size={16} />}>
        Add lesson
      </Button>
    </div>
  );
}
