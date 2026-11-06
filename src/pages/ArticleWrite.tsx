import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from '../lib/storage';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Eye,
  Globe,
  Image as ImageIcon,
  Link2,
  Loader2,
  Save,
  Send,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { auth, db } from '../firebase';
import { cn } from '../lib/cn';
import {
  Dialog,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from '../components/ui';
import { RichTextEditor } from '../components/ui/RichTextEditor';
import ArticleCover from '../components/articles/ArticleCover';
import { ARTICLE_CATEGORIES, type ArticleDifficulty } from '../types/articles';
import { plainText, wordCount } from '../components/articles/articleVisuals';

const DIFFICULTIES: ArticleDifficulty[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

const COVER_PRESETS = [
  { label: 'Writing desk', url: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1400&q=80' },
  { label: 'Team table', url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1400&q=80' },
  { label: 'People talking', url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1400&q=80' },
  { label: 'Studio desk', url: 'https://images.unsplash.com/photo-1523726491678-bf852e717f6a?auto=format&fit=crop&w=1400&q=80' },
  { label: 'Code window', url: 'https://images.unsplash.com/photo-1484417894907-623942c8ee29?auto=format&fit=crop&w=1400&q=80' },
  { label: 'Quiet room', url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1400&q=80' },
];

export default function ArticleWrite() {
  const { articleId } = useParams();
  const navigate = useNavigate();

  const [id] = useState<string>(articleId || doc(collection(db, 'articles')).id);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [primaryCategory, setPrimaryCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [difficulty, setDifficulty] = useState<ArticleDifficulty>('Intermediate');
  const [isFeatured, setIsFeatured] = useState(false);

  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [seoSlug, setSeoSlug] = useState('');

  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(articleId));
  const [hydrated, setHydrated] = useState(!articleId);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const skipAutoSave = useRef(Boolean(articleId));

  const words = wordCount(content);
  const readingTime = Math.max(1, Math.ceil(words / 220));
  const category = ARTICLE_CATEGORIES.find((item) => item.id === primaryCategory);
  const slugValue = seoSlug.trim() || generateSlug(title);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://kith.app';
  const canonical = `${origin}/article/${id}`;
  const seoTitle = metaTitle.trim() || title.trim() || 'Your story title';
  const seoDescription =
    metaDescription.trim() || subtitle.trim() || plainText(content).slice(0, 158).trim() || 'A story from the Kith Journal.';

  const readiness = useMemo(
    () => [
      { label: 'A headline people can feel', done: title.trim().length > 6 },
      { label: 'A category and level', done: Boolean(primaryCategory) },
      { label: 'A cover image or generated art', done: Boolean(coverImage) },
      { label: 'At least three tags', done: tags.length >= 3 },
      { label: '300+ words of substance', done: words >= 300 },
      {
        label: 'Search description (70+ chars)',
        done: seoDescription.length >= 70,
      },
    ],
    [title, primaryCategory, coverImage, tags.length, words, seoDescription],
  );
  const readyCount = readiness.filter((item) => item.done).length;

  useEffect(() => {
    if (articleId) void loadArticle(articleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const loadArticle = async (docId: string) => {
    try {
      const docRef = doc(db, 'articles', docId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.authorUid !== auth.currentUser?.uid) {
          toast.error('You can only edit your own stories');
          navigate('/articles', { replace: true });
          return;
        }
        setTitle(data.title || '');
        setSubtitle(data.subtitle || '');
        setCoverImage(data.coverImage || '');
        setContent(data.content || '');
        setTags(Array.isArray(data.tags) ? data.tags : []);
        setStatus(data.status === 'published' ? 'published' : 'draft');
        setPrimaryCategory(data.primaryCategoryId || '');
        setSubcategory(data.subcategory || '');
        setDifficulty(data.difficulty || 'Intermediate');
        setIsFeatured(Boolean(data.isFeatured));
        setMetaTitle(data.seo?.metaTitle || '');
        setMetaDescription(data.seo?.metaDescription || '');
        setSeoSlug(data.seo?.slug || '');
      }
    } catch (error) {
      console.error('Error loading article:', error);
      toast.error('Could not load this draft.');
    } finally {
      setLoading(false);
      setHydrated(true);
      skipAutoSave.current = true;
    }
  };

  const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('That image is over 5MB. Compress it and try again.');
      return;
    }

    setUploadingCover(true);
    try {
      const storageRef = ref(null, `article_covers/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        null,
        (error) => {
          console.error(error);
          toast.error(error.message || 'Upload failed');
          setUploadingCover(false);
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setCoverImage(url);
          setCoverUrlInput(url);
          setShowCoverModal(false);
          setUploadingCover(false);
          toast.success('Cover updated');
        },
      );
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Upload failed');
      setUploadingCover(false);
    } finally {
      if (coverFileInputRef.current) coverFileInputRef.current.value = '';
    }
  };

  const handleSave = useCallback(
    async (isPublishing = false, notify = false) => {
      if (!auth.currentUser) {
        toast.error('Sign in to save your story');
        return;
      }
      if (!title.trim()) {
        if (notify || isPublishing) toast.error('Add a headline first');
        return;
      }
      if (isPublishing && !primaryCategory) {
        toast.error('Choose a category before publishing');
        return;
      }
      if (isPublishing && plainText(content).length < 30) {
        toast.error('Write a little more before publishing');
        return;
      }

      setSaving(true);
      try {
        const articleRef = doc(db, 'articles', id);
        const existing = await getDoc(articleRef);
        const isNew = !existing.exists();
        const cleanTags = tags.slice(0, 5);

        const payload: Record<string, any> = {
          id,
          authorUid: auth.currentUser.uid,
          authorName: auth.currentUser.displayName || 'A Kith writer',
          authorPhoto: auth.currentUser.photoURL || '',
          title: title.trim(),
          subtitle: subtitle.trim(),
          coverImage: coverImage || '',
          content,
          tags: cleanTags,
          primaryCategoryId: primaryCategory,
          subcategory,
          difficulty,
          isFeatured,
          status: isPublishing ? 'published' : status,
          readingTime,
          updatedAt: serverTimestamp(),
          seo: {
            metaTitle: metaTitle.trim() || title.trim(),
            metaDescription: seoDescription,
            keywords: cleanTags,
            slug: generateSlug(slugValue),
            canonicalUrl: canonical,
            ogType: 'article',
            ogImage: coverImage || '',
            twitterCard: 'summary_large_image',
          },
        };

        if (isNew) {
          Object.assign(payload, {
            createdAt: serverTimestamp(),
            viewsCount: 0,
            likesCount: 0,
            commentsCount: 0,
          });
        }
        if (isPublishing && status !== 'published') {
          payload.publishedAt = serverTimestamp();
        }

        await setDoc(articleRef, payload, { merge: true });
        setStatus(isPublishing ? 'published' : status);
        setLastSaved(new Date());
        if (notify) toast.success(isPublishing ? 'Your story is live' : 'Draft saved');
        if (isPublishing) navigate(`/article/${id}`);
      } catch (error) {
        console.error('Error saving article:', error);
        toast.error('Could not save the story. Try again.');
      } finally {
        setSaving(false);
      }
    },
    [
      id,
      title,
      subtitle,
      coverImage,
      content,
      tags,
      primaryCategory,
      subcategory,
      difficulty,
      isFeatured,
      status,
      readingTime,
      metaTitle,
      seoDescription,
      slugValue,
      canonical,
      navigate,
    ],
  );

  // A quiet autosave for drafts. Publishing is always an explicit action.
  useEffect(() => {
    if (!hydrated || loading || status === 'published' || !title.trim()) return;
    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }
    const timeout = window.setTimeout(() => {
      void handleSave(false, false);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [
    hydrated,
    loading,
    status,
    title,
    subtitle,
    coverImage,
    content,
    tags,
    primaryCategory,
    subcategory,
    difficulty,
    isFeatured,
    metaTitle,
    metaDescription,
    seoSlug,
    handleSave,
  ]);

  const addTagValue = (raw: string) => {
    const clean = raw.trim().replace(/^#/, '').slice(0, 26);
    if (!clean) return;
    if (tags.length >= 5) {
      toast.error('Five tags is plenty');
      return;
    }
    if (tags.some((tag) => tag.toLowerCase() === clean.toLowerCase())) {
      setTagInput('');
      return;
    }
    setTags((current) => [...current, clean]);
    setTagInput('');
  };

  const onTagKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTagValue(tagInput);
    }
    if (event.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags((current) => current.slice(0, -1));
    }
  };

  const openCoverModal = () => {
    setCoverUrlInput(coverImage || '');
    setShowCoverModal(true);
  };

  const applyCoverUrl = () => {
    if (!coverUrlInput.trim()) {
      toast.error('Paste a link or choose a shelf image');
      return;
    }
    setCoverImage(coverUrlInput.trim());
    setShowCoverModal(false);
    toast.success('Cover updated');
  };

  const manualSave = () => void handleSave(false, true);
  const publish = () => void handleSave(true, true);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={26} className="animate-spin text-primary" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">Opening the studio</p>
        </div>
      </div>
    );
  }

  const canPreview = Boolean(articleId || lastSaved);

  return (
    <div className="min-h-full bg-background pb-24 text-foreground">
      <Helmet>
        <title>{status === 'published' ? 'Edit story' : 'New story'} — Kith Journal</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      {/* Studio header */}
      <div className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center gap-2 px-3 py-2 sm:px-6">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/articles')} aria-label="Back to journal">
            <ArrowLeft size={18} />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold tracking-[-0.02em]">
              {status === 'published' ? 'Editing a published story' : 'New story'}
            </p>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              {saving ? (
                <>
                  <Loader2 size={11} className="animate-spin text-primary" />
                  Saving…
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircle2 size={11} className="text-success" />
                  Saved {lastSaved.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </>
              ) : (
                <>
                  <Cloud size={11} />
                  Autosaves after 3s
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={manualSave}
              disabled={saving || !title.trim()}
              leftIcon={<Save size={14} />}
              className="hidden sm:inline-flex"
            >
              {status === 'published' ? 'Save changes' : 'Save draft'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(`/article/${id}`, '_blank', 'noopener,noreferrer')}
              disabled={!canPreview || saving}
              leftIcon={<Eye size={14} />}
              className="hidden sm:inline-flex"
            >
              Preview
            </Button>
            <Button
              size="sm"
              onClick={publish}
              loading={saving}
              disabled={!title.trim()}
              leftIcon={<Send size={14} />}
            >
              <span className="hidden sm:inline">{status === 'published' ? 'Update' : 'Publish'}</span>
              <span className="sm:hidden">Publish</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
          {/* Editor ------------------------------------------------------ */}
          <main className="min-w-0 space-y-4">
            {/* Cover */}
            <div className="overflow-hidden rounded-panel border border-border">
              {coverImage ? (
                <div className="group relative">
                  <ArticleCover
                    src={coverImage}
                    title={title}
                    categoryId={primaryCategory}
                    seed={id}
                    priority
                    showStamp
                    className="aspect-[21/9] w-full"
                  />
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#0e0b13]/45 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
                    <Button variant="secondary" size="sm" onClick={openCoverModal} leftIcon={<ImageIcon size={14} />}>
                      Change cover
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setCoverImage('')}
                      leftIcon={<X size={14} />}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openCoverModal}
                  className="group flex w-full items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-muted/60"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/15 transition-transform group-hover:scale-105">
                    <ImageIcon size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-sm font-semibold tracking-[-0.02em] text-foreground">
                      Add a cover
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Upload your own or start from the editorial shelf
                    </span>
                  </span>
                  <ImageIcon size={16} className="shrink-0 text-faint" />
                </button>
              )}
            </div>

            {/* Headline */}
            <div className="px-1">
              <textarea
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Give your story a headline…"
                aria-label="Article title"
                rows={2}
                maxLength={280}
                className="w-full resize-none bg-transparent font-serif text-[clamp(2rem,5vw,3.45rem)] font-normal leading-[1.02] tracking-[-0.025em] text-foreground outline-none placeholder:text-faint"
              />
              <textarea
                value={subtitle}
                onChange={(event) => setSubtitle(event.target.value)}
                placeholder="A subtitle that earns the click (optional)…"
                aria-label="Article subtitle"
                rows={2}
                maxLength={220}
                className="mt-1 w-full resize-none bg-transparent text-sm leading-relaxed text-muted-foreground outline-none placeholder:text-faint sm:text-base"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                <span>{words.toLocaleString()} words</span>
                <span className="h-1 w-1 rounded-full bg-faint" />
                <span>{readingTime} min read</span>
                {status === 'published' && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-faint" />
                    <span className="inline-flex items-center gap-1 text-success">
                      <Globe size={11} /> Live
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Tags */}
            <section className="border-t border-border pt-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Tags</p>
                <span className="text-[10px] font-semibold text-faint">{tags.length}/5</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 py-1 pl-2.5 pr-1 text-[10px] font-bold uppercase tracking-[0.1em] text-primary"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                      aria-label={`Remove ${tag} tag`}
                      className="grid h-5 w-5 place-items-center rounded-full transition-colors hover:bg-primary/15"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {tags.length < 5 && (
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={onTagKeyDown}
                    onBlur={() => addTagValue(tagInput)}
                    placeholder="Add a tag and press Enter"
                    className="min-w-[180px] flex-1 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-faint"
                    aria-label="Add a tag"
                  />
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Tags power search, related stories and the keywords in your SEO metadata.
              </p>
            </section>

            {/* Editor */}
            <section className="border-t border-border pt-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  <Sparkles size={12} className="text-primary" />
                  The story
                </p>
                <p className="text-[10px] font-semibold text-faint">Headings become your table of contents</p>
              </div>
              <RichTextEditor content={content} onChange={setContent} />
            </section>

            <div className="flex items-center justify-between gap-2 px-1 lg:hidden">
              <Button variant="secondary" onClick={manualSave} disabled={saving || !title.trim()} leftIcon={<Save size={14} />}>
                Save draft
              </Button>
              <Button onClick={publish} loading={saving} disabled={!title.trim()} leftIcon={<Send size={14} />}>
                Publish
              </Button>
            </div>
          </main>

          {/* Rail -------------------------------------------------------- */}
          <aside className="custom-scrollbar min-w-0 space-y-6 self-start lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto lg:border-l lg:border-border lg:pl-5 lg:pr-1">
            {/* Readiness */}
            <section className="border-t border-border pt-5 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-[-0.03em]">
                  <CheckCircle2 size={15} className={readyCount === readiness.length ? 'text-success' : 'text-primary'} />
                  Ready to publish?
                </h2>
                <Badge variant={readyCount === readiness.length ? 'success' : 'neutral'}>
                  {readyCount}/{readiness.length}
                </Badge>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${(readyCount / readiness.length) * 100}%` }}
                />
              </div>
              <ul className="mt-3 space-y-1.5">
                {readiness.map((item) => (
                  <li key={item.label} className="flex items-start gap-2 text-[11px] leading-relaxed">
                    {item.done ? (
                      <Check size={13} className="mt-0.5 shrink-0 text-success" />
                    ) : (
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-border-strong" />
                    )}
                    <span className={item.done ? 'text-foreground/70' : 'text-muted-foreground'}>{item.label}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Publishing */}
            <section className="border-t border-border pt-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-[15px] font-semibold tracking-[-0.03em]">Publishing</h2>
                <Badge variant={status === 'published' ? 'success' : 'neutral'} dot>
                  {status === 'published' ? 'Published' : 'Draft'}
                </Badge>
              </div>

              <div className="mt-3 space-y-3">
                <Field label="Category">
                  <Select
                    value={primaryCategory}
                    onChange={(event) => {
                      setPrimaryCategory(event.target.value);
                      setSubcategory('');
                    }}
                  >
                    <option value="">Choose a category</option>
                    {ARTICLE_CATEGORIES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Subcategory">
                  <Select
                    value={subcategory}
                    onChange={(event) => setSubcategory(event.target.value)}
                    disabled={!category}
                  >
                    <option value="">Choose a subcategory</option>
                    {category?.subcategories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Reading level
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {DIFFICULTIES.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDifficulty(level)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] transition-colors',
                          difficulty === level
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                        )}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-foreground">Feature on the journal</span>
                    <span className="block text-[10px] leading-snug text-muted-foreground">
                      Featured stories lead the discovery page.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(event) => setIsFeatured(event.target.checked)}
                    className="h-4 w-4 shrink-0 accent-[var(--ds-primary)]"
                  />
                </label>
              </div>
            </section>

            {/* SEO */}
            <section className="border-t border-border pt-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-[-0.03em]">
                  <Link2 size={15} className="text-primary" />
                  Search & social
                </h2>
                <Badge variant={seoDescription.length >= 70 && seoTitle.length >= 20 ? 'success' : 'warning'}>
                  {seoDescription.length >= 70 && seoTitle.length >= 20 ? 'Ready' : 'Check'}
                </Badge>
              </div>

              <div className="mt-3 space-y-3">
                <Field
                  label="Meta title"
                  hint={`${seoTitle.length}/60 characters`}
                >
                  <Input
                    value={metaTitle}
                    onChange={(event) => setMetaTitle(event.target.value)}
                    placeholder={title || 'Your story title'}
                    maxLength={70}
                    className="h-10"
                  />
                </Field>

                <Field
                  label="Meta description"
                  hint={`${seoDescription.length}/160 characters`}
                >
                  <Textarea
                    value={metaDescription}
                    onChange={(event) => setMetaDescription(event.target.value)}
                    placeholder={subtitle || plainText(content).slice(0, 150) || 'A short, useful summary for search engines.'}
                    maxLength={180}
                    className="min-h-[84px] py-2 text-xs leading-relaxed"
                  />
                </Field>

                <Field label="Slug" hint="Keep it short and readable.">
                  <div className="flex items-center rounded-control border border-border bg-surface pl-2.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
                    <span className="text-[10px] text-faint">/article/</span>
                    <input
                      value={seoSlug}
                      onChange={(event) =>
                        setSeoSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                      }
                      placeholder={generateSlug(title) || 'your-story'}
                      className="h-10 min-w-0 flex-1 bg-transparent px-1 text-xs text-foreground outline-none placeholder:text-faint"
                    />
                  </div>
                </Field>

                <details className="group border-t border-border pt-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground [&::-webkit-details-marker]:hidden">
                    Preview search & social
                    <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 border-t border-border p-3">
                    <div>
                      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-faint">Google</p>
                      <div className="border-l-2 border-border pl-3">
                        <p className="truncate text-[10px] text-muted-foreground">
                          {origin.replace(/^https?:\/\//, '')} › article › {slugValue || 'your-story'}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[15px] font-medium leading-snug text-info">{seoTitle}</p>
                        <p className="mt-0.5 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                          {seoDescription}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-faint">Social card</p>
                      <div className="overflow-hidden">
                        <ArticleCover
                          src={coverImage}
                          title={seoTitle}
                          categoryId={primaryCategory}
                          seed={id}
                          hideWordmark
                          className="aspect-[1.91/1] w-full"
                        />
                        <div className="p-2.5">
                          <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-faint">
                            {origin.replace(/^https?:\/\//, '')}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-snug">{seoTitle}</p>
                          <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                            {seoDescription}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Cover dialog */}
      <Dialog
        open={showCoverModal}
        onClose={() => setShowCoverModal(false)}
        title="Choose a cover"
        description="Upload a photo, paste a link, or start from the editorial shelf."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCoverModal(false)}>
              Cancel
            </Button>
            <Button onClick={applyCoverUrl} disabled={!coverUrlInput.trim()}>
              Use this image
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Image URL" hint="Use a wide image — around 1600×900 works well.">
            <Input
              value={coverUrlInput}
              onChange={(event) => setCoverUrlInput(event.target.value)}
              placeholder="https://…"
              type="url"
            />
          </Field>

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              From the shelf
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COVER_PRESETS.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => {
                    setCoverImage(preset.url);
                    setCoverUrlInput(preset.url);
                    setShowCoverModal(false);
                    toast.success('Cover updated');
                  }}
                  className={cn(
                    'group relative aspect-[16/10] overflow-hidden rounded-control border-2 transition-all',
                    coverUrlInput === preset.url
                      ? 'border-primary shadow-soft'
                      : 'border-transparent hover:border-border-strong',
                  )}
                >
                  <img
                    src={preset.url}
                    alt={preset.label}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-[#ffffff]">
                    {preset.label}
                  </span>
                  {coverUrlInput === preset.url && (
                    <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverUpload}
              className="hidden"
            />
            <Button
              variant="secondary"
              size="sm"
              loading={uploadingCover}
              leftIcon={<UploadCloud size={14} />}
              onClick={() => coverFileInputRef.current?.click()}
            >
              Upload from device
            </Button>
            <p className="text-[11px] text-muted-foreground">JPG, PNG or WebP · up to 5MB</p>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function generateSlug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}
