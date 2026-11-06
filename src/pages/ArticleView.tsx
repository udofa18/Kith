import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Bookmark,
  ChevronDown,
  Copy,
  Edit,
  Eye,
  Globe,
  Heart,
  Linkedin,
  ListTree,
  Lock,
  MessageCircle,
  MessageSquare,
  Minus,
  Plus,
  Share2,
  Twitter,
} from 'lucide-react';
import { auth, db } from '../firebase';
import { followUser, getFollowingIds, unfollowUser } from '../services/socialService';
import { cn } from '../lib/cn';
import Avatar from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Textarea } from '../components/ui/Input';
import ArticleCard from '../components/ArticleCard';
import ArticleCover from '../components/articles/ArticleCover';
import {
  authorName,
  authorSeed,
  categoryIconFor,
  categoryMeta,
  categoryToneFor,
  formatArticleDate,
  isPlaceholderCover,
  plainText,
  readMinutes,
} from '../components/articles/articleVisuals';

type TocItem = { id: string; text: string; level: 2 | 3 };

const FONT_SCALES = [1.0625, 1.125, 1.25] as const;

export default function ArticleView() {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const articleRef = useRef<HTMLElement>(null);

  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [followingAuthor, setFollowingAuthor] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [related, setRelated] = useState<any[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [activeHeading, setActiveHeading] = useState('');
  const [fontScale, setFontScale] = useState<number>(() => {
    if (typeof window === 'undefined') return FONT_SCALES[1];
    const stored = Number(window.localStorage.getItem('kith-article-font'));
    return FONT_SCALES.includes(stored as (typeof FONT_SCALES)[number]) ? stored : FONT_SCALES[1];
  });

  const progress = useScrollProgress(articleRef, Boolean(article));
  const { html, toc } = useMemo(() => prepareArticleContent(article?.content || ''), [article?.content]);
  useScrollSpy(articleRef, toc, Boolean(article), setActiveHeading);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('kith-article-font', String(fontScale));
    }
  }, [fontScale]);

  const fetchComments = useCallback(async (id: string) => {
    try {
      const snap = await getDocs(
        query(collection(db, `articles/${id}/comments`), orderBy('createdAt', 'desc')),
      );
      setComments(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  }, []);

  const fetchRelated = useCallback(async (currentId: string, categoryId?: string) => {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'articles'),
          where('status', '==', 'published'),
          orderBy('createdAt', 'desc'),
          limit(14),
        ),
      );
      const all: any[] = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, any>) }))
        .filter((item) => item.id !== currentId);
      const sameCategory = all.filter((item) => item.primaryCategoryId === categoryId);
      const rest = all.filter((item) => item.primaryCategoryId !== categoryId);
      setRelated([...sameCategory, ...rest].slice(0, 3));
    } catch (error) {
      console.error('Error fetching related articles:', error);
    }
  }, []);

  useEffect(() => {
    if (!articleId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'articles', articleId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          navigate('/articles', { replace: true });
          return;
        }

        const data = snap.data();
        const isAuthor = data.authorUid === auth.currentUser?.uid;
        if (data.status !== 'published' && !isAuthor) {
          navigate('/articles', { replace: true });
          return;
        }
        if (cancelled) return;

        setArticle({ id: snap.id, ...data });
        void fetchComments(snap.id);
        void fetchRelated(snap.id, data.primaryCategoryId);

        if (auth.currentUser) {
          const uid = auth.currentUser.uid;
          try {
            const [likeSnap, bookmarkSnap, viewSnap] = await Promise.all([
              getDoc(doc(db, 'articles', snap.id, 'likes', uid)),
              getDoc(doc(db, 'users', uid, 'bookmarkedArticles', snap.id)),
              getDoc(doc(db, 'articles', snap.id, 'views', uid)),
            ]);
            if (!cancelled) {
              setLiked(likeSnap.exists());
              setBookmarked(bookmarkSnap.exists());
            }
            if (data.authorUid && data.authorUid !== uid) {
              const following = await getFollowingIds(uid);
              if (!cancelled) setFollowingAuthor(following.includes(data.authorUid));
            }
            if (!viewSnap.exists() && data.authorUid !== uid) {
              await setDoc(doc(db, 'articles', snap.id, 'views', uid), {
                viewedAt: new Date().toISOString(),
              });
              await updateDoc(docRef, { viewsCount: increment(1) });
            }
          } catch (error) {
            console.error('Interaction lookup failed:', error);
          }
        } else {
          const key = `kith-view-${snap.id}`;
          if (!window.sessionStorage.getItem(key)) {
            window.sessionStorage.setItem(key, '1');
          }
        }
      } catch (error) {
        console.error('Error loading article:', error);
        toast.error('Could not load this story.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [articleId, navigate, fetchComments, fetchRelated]);

  const handlePostComment = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to join the conversation');
      return;
    }
    if (!newComment.trim() || !articleId || postingComment) return;

    setPostingComment(true);
    try {
      const commentData = {
        authorUid: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'A Kith reader',
        content: newComment.trim(),
        createdAt: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, `articles/${articleId}/comments`), commentData);
      setComments((prev) => [{ id: docRef.id, ...commentData }, ...prev]);
      setNewComment('');
      await updateDoc(doc(db, 'articles', articleId), { commentsCount: increment(1) });
      setArticle((prev: any) => ({ ...prev, commentsCount: (prev?.commentsCount || 0) + 1 }));
      toast.success('Comment posted');
    } catch (error) {
      console.error('Error posting comment:', error);
      toast.error('Could not post your comment.');
    } finally {
      setPostingComment(false);
    }
  };

  const handleLike = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to like stories');
      return;
    }
    if (!articleId) return;

    const uid = auth.currentUser.uid;
    const likeRef = doc(db, 'articles', articleId, 'likes', uid);
    const nextLiked = !liked;
    setLiked(nextLiked);
    setArticle((prev: any) => ({
      ...prev,
      likesCount: Math.max(0, (prev?.likesCount || 0) + (nextLiked ? 1 : -1)),
    }));

    try {
      if (nextLiked) {
        await setDoc(likeRef, { likedAt: new Date().toISOString() });
      } else {
        await deleteDoc(likeRef);
      }
      await updateDoc(doc(db, 'articles', articleId), {
        likesCount: increment(nextLiked ? 1 : -1),
      });
    } catch (error) {
      console.error('Error updating like:', error);
      setLiked(!nextLiked);
      setArticle((prev: any) => ({
        ...prev,
        likesCount: Math.max(0, (prev?.likesCount || 0) + (nextLiked ? -1 : 1)),
      }));
      toast.error('Could not update your reaction.');
    }
  };

  const toggleFollow = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to follow writers');
      return;
    }
    if (!article?.authorUid || followBusy || isAuthor) return;

    setFollowBusy(true);
    const next = !followingAuthor;
    try {
      await (next ? followUser : unfollowUser)(auth.currentUser.uid, article.authorUid);
      setFollowingAuthor(next);
      toast.success(next ? `Following ${authorName(article)}` : `Unfollowed ${authorName(article)}`);
    } catch (error) {
      console.error('Follow failed:', error);
      toast.error('Could not update follow state.');
    } finally {
      setFollowBusy(false);
    }
  };

  const handleBookmark = async () => {
    if (!auth.currentUser || !articleId) {
      toast.error('Sign in to save stories');
      return;
    }
    if (bookmarking) return;

    setBookmarking(true);
    try {
      const bookmarkRef = doc(db, 'users', auth.currentUser.uid, 'bookmarkedArticles', articleId);
      if (bookmarked) {
        await deleteDoc(bookmarkRef);
        setBookmarked(false);
        toast.success('Removed from your reading list');
      } else {
        await setDoc(bookmarkRef, {
          articleId,
          bookmarkedAt: new Date().toISOString(),
          title: article.title,
          subtitle: article.subtitle || '',
          coverImage: article.coverImage || '',
          authorName: authorName(article),
          readingTime: readMinutes(article),
          primaryCategoryId: article.primaryCategoryId || '',
        });
        setBookmarked(true);
        toast.success('Saved to your reading list');
      }
    } catch (error) {
      console.error('Error updating bookmark:', error);
      toast.error('Could not update your reading list.');
    } finally {
      setBookmarking(false);
    }
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareTitle = article?.title || 'A story from the Kith Journal';

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link copied');
      }
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const togglePublish = async () => {
    if (!articleId || !article) return;
    try {
      const next = article.status === 'published' ? 'draft' : 'published';
      await updateDoc(doc(db, 'articles', articleId), {
        status: next,
        updatedAt: new Date().toISOString(),
        ...(next === 'published' ? { publishedAt: new Date().toISOString() } : {}),
      });
      setArticle((prev: any) => ({ ...prev, status: next }));
      toast.success(next === 'published' ? 'Story published' : 'Moved back to drafts');
    } catch (error) {
      console.error(error);
      toast.error('Could not update the story.');
    }
  };

  const scrollToHeading = (id: string) => {
    const heading = document.getElementById(id);
    if (!heading) return;
    const scrollParent = getScrollParent(articleRef.current);
    const top =
      heading.getBoundingClientRect().top -
      scrollParent.getBoundingClientRect().top +
      scrollParent.scrollTop -
      76;
    scrollParent.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    setTocOpen(false);
  };

  if (loading) return <ArticleSkeleton />;
  if (!article) return null;

  const category = categoryMeta(article.primaryCategoryId);
  const tone = categoryToneFor(article.primaryCategoryId);
  const CategoryIcon = categoryIconFor(article.primaryCategoryId);
  const minutes = readMinutes(article);
  const isAuthor = auth.currentUser?.uid === article.authorUid;
  const wordTotal = plainText(article.content).split(/\s+/).filter(Boolean).length;
  const publishedLabel = formatArticleDate(article.publishedAt || article.createdAt);
  const publishedIso = toIso(article.publishedAt || article.createdAt);
  const updatedIso = toIso(article.updatedAt || article.publishedAt || article.createdAt);

  /* ---------------------------------------------------------------- SEO */
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://kith.app';
  const seo = article.seo || {};
  const authoredCanonical = typeof seo.canonicalUrl === 'string' ? seo.canonicalUrl : '';
  const pageUrl =
    authoredCanonical && !authoredCanonical.includes('creatorspace.app')
      ? authoredCanonical
      : `${origin}/article/${article.id}`;
  const pageTitle = seo.metaTitle || `${article.title} — The Kith Journal`;
  const pageDescription =
    seo.metaDescription ||
    article.subtitle ||
    `${plainText(article.content).slice(0, 158).trim()}…`;
  const pageKeywords =
    (Array.isArray(seo.keywords) && seo.keywords.length > 0 ? seo.keywords : article.tags)?.join(', ') || '';
  const rawImage = seo.ogImage || article.coverImage;
  const pageImage = isPlaceholderCover(rawImage)
    ? `${origin}/logo.jpg`
    : absoluteUrl(rawImage, origin);
  const isPublished = article.status !== 'draft';

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    headline: article.title,
    alternativeHeadline: article.subtitle || '',
    description: pageDescription,
    image: [pageImage],
    datePublished: publishedIso,
    dateModified: updatedIso,
    author: {
      '@type': 'Person',
      name: authorName(article),
      url: article.authorUid ? `${origin}/creators/${article.authorUid}` : undefined,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Kith',
      url: origin,
      logo: { '@type': 'ImageObject', url: `${origin}/logo.jpg` },
    },
    url: pageUrl,
    articleSection: category?.name || 'Journal',
    keywords: pageKeywords,
    wordCount: wordTotal,
    timeRequired: `PT${minutes}M`,
    inLanguage: 'en',
    isAccessibleForFree: true,
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: article.likesCount || 0,
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: article.commentsCount || 0,
      },
    ],
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Kith', item: origin },
      { '@type': 'ListItem', position: 2, name: 'The Journal', item: `${origin}/articles` },
      {
        '@type': 'ListItem',
        position: 3,
        name: article.title,
        item: pageUrl,
      },
    ],
  };

  return (
    <div className="min-h-full bg-background pb-24 text-foreground">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={pageKeywords} />
        <meta name="author" content={authorName(article)} />
        <meta name="robots" content={isPublished ? 'index,follow,max-image-preview:large' : 'noindex,nofollow'} />
        <link rel="canonical" href={pageUrl} />

        <meta property="og:type" content={seo.ogType || 'article'} />
        <meta property="og:site_name" content="Kith" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:image" content={pageImage} />
        <meta property="og:image:alt" content={article.title} />
        {publishedIso && <meta property="article:published_time" content={publishedIso} />}
        {updatedIso && <meta property="article:modified_time" content={updatedIso} />}
        {article.authorUid && <meta property="article:author" content={`${origin}/creators/${article.authorUid}`} />}
        {category?.name && <meta property="article:section" content={category.name} />}
        {(article.tags || []).slice(0, 8).map((tag: string) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}

        <meta name="twitter:card" content={seo.twitterCard || 'summary_large_image'} />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content={pageImage} />

        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <div className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex min-h-[53px] max-w-[1180px] items-center gap-2 px-3 py-2 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
              else navigate('/articles');
            }}
            aria-label="Go back"
            className="shrink-0"
          >
            <ArrowLeft size={18} />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold leading-tight tracking-[-0.03em] text-foreground">
              {article.title}
            </p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              {category?.name || 'Journal'} · {minutes} min read
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <div className="hidden items-center rounded-control border border-border bg-surface p-0.5 sm:flex">
              <button
                type="button"
                aria-label="Decrease text size"
                disabled={fontScale <= FONT_SCALES[0]}
                onClick={() =>
                  setFontScale(
                    FONT_SCALES[Math.max(0, FONT_SCALES.indexOf(fontScale as (typeof FONT_SCALES)[number]) - 1)],
                  )
                }
                className="grid h-7 w-7 place-items-center rounded-[0.55rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Minus size={13} />
              </button>
              <span className="px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-faint">Aa</span>
              <button
                type="button"
                aria-label="Increase text size"
                disabled={fontScale >= FONT_SCALES[FONT_SCALES.length - 1]}
                onClick={() =>
                  setFontScale(
                    FONT_SCALES[
                      Math.min(
                        FONT_SCALES.length - 1,
                        FONT_SCALES.indexOf(fontScale as (typeof FONT_SCALES)[number]) + 1,
                      )
                    ],
                  )
                }
                className="grid h-7 w-7 place-items-center rounded-[0.55rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Plus size={13} />
              </button>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleBookmark}
              aria-label={bookmarked ? 'Remove bookmark' : 'Save story'}
              aria-pressed={bookmarked}
              className={bookmarked ? 'text-primary' : undefined}
            >
              <Bookmark size={17} fill={bookmarked ? 'currentColor' : 'none'} />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={handleShare} aria-label="Share story">
              <Share2 size={17} />
            </Button>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-border">
          <div
            className="h-full bg-primary transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        {/* Article header */}
        <header className="mx-auto max-w-[640px] min-[1400px]:max-w-[700px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-[0.14em]', tone.badge)}>
              <CategoryIcon size={12} />
              {category?.name || 'Journal'}
            </span>
            {!isPublished && (
              <Badge variant="warning" size="md" dot>
                Draft preview
              </Badge>
            )}
          </div>

          <h1 className="mt-4 font-serif text-[clamp(2.6rem,6.2vw,4.9rem)] font-normal leading-[0.98] tracking-[-0.02em] text-foreground">
            {article.title}
          </h1>

          {article.subtitle && (
            <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              {article.subtitle}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={article.authorPhoto} seed={authorSeed(article)} size={42} ring alt="" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{authorName(article)}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                  <span>{publishedLabel}</span>
                  <span className="h-1 w-1 rounded-full bg-faint" />
                  <span>{minutes} min read</span>
                  {article.difficulty && (
                    <>
                      <span className="h-1 w-1 rounded-full bg-faint" />
                      <span>{article.difficulty}</span>
                    </>
                  )}
                  {wordTotal > 0 && (
                    <>
                      <span className="h-1 w-1 rounded-full bg-faint" />
                      <span>{wordTotal.toLocaleString()} words</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant={liked ? 'soft' : 'outline'}
                size="sm"
                onClick={handleLike}
                aria-pressed={liked}
                leftIcon={<Heart size={14} fill={liked ? 'currentColor' : 'none'} />}
              >
                {article.likesCount || 0}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth' })}
                leftIcon={<MessageSquare size={14} />}
              >
                {article.commentsCount || 0}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => navigate(`/creators/${article.authorUid}`)}
                aria-label="View author profile"
              >
                <ArrowUpRight size={16} />
              </Button>
            </div>
          </div>

          {isAuthor && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-y border-border py-2">
              <span className="mr-auto text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                {isPublished ? 'Published story' : 'This story is still a draft'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePublish}
                leftIcon={isPublished ? <Lock size={13} /> : <Globe size={13} />}
              >
                {isPublished ? 'Unpublish' : 'Publish'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Edit size={13} />}
                onClick={() => navigate(`/write/${article.id}`)}
              >
                Edit story
              </Button>
            </div>
          )}

          <div className="mt-6">
            <ArticleCover
              src={article.coverImage}
              title={article.title}
              categoryId={article.primaryCategoryId}
              seed={article.id}
              priority
              showStamp
              className="aspect-[16/9] w-full rounded-panel border border-border shadow-lift"
            />
          </div>
        </header>

        {/* Body + independent reading rail */}
        <div className="relative mx-auto mt-10 w-full max-w-[1200px]">
          <div className="mx-auto w-full max-w-[640px] min-[1400px]:max-w-[700px]">
            {toc.length > 0 && (
              <div className="mb-5 border-y border-border py-2 min-[1340px]:hidden">
                <button
                  type="button"
                  onClick={() => setTocOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-2 px-1 py-1.5 text-left"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <ListTree size={14} className="text-primary" />
                    On this page
                  </span>
                  <ChevronDown size={15} className={cn('text-faint transition-transform', tocOpen && 'rotate-180')} />
                </button>
                {tocOpen && (
                  <nav className="border-t border-border pt-2">
                    {toc.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => scrollToHeading(item.id)}
                        aria-current={activeHeading === item.id ? 'location' : undefined}
                        className={cn(
                          'block w-full border-l-2 py-1.5 pr-2 text-left text-[12px] leading-snug transition-colors',
                          item.level === 3 ? 'pl-5' : 'pl-3',
                          activeHeading === item.id
                            ? 'border-primary font-semibold text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {item.text}
                      </button>
                    ))}
                  </nav>
                )}
              </div>
            )}

            <article ref={articleRef}>
              <div
                className="article-body prose prose-lg max-w-none dark:prose-invert prose-headings:font-display prose-headings:font-semibold prose-headings:tracking-[-0.035em] prose-p:leading-[1.85] prose-p:text-foreground/90 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-blockquote:border-l-primary prose-blockquote:bg-primary/5 prose-blockquote:py-1 prose-blockquote:pr-4 prose-blockquote:not-italic prose-img:rounded-card prose-img:border prose-img:border-border prose-pre:bg-[#0d1117] prose-pre:border prose-pre:border-border"
                style={{ fontSize: `${fontScale}rem` }}
                dangerouslySetInnerHTML={{ __html: html }}
              />

              {(article.tags || []).length > 0 && (
                <div className="mt-8 flex flex-wrap items-center gap-1.5 border-t border-border pt-5">
                  <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.16em] text-faint">Filed under</span>
                  {article.tags.map((tag: string) => (
                    <Link
                      key={tag}
                      to="/articles"
                      className="rounded-full border border-border bg-surface px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}

              {/* Share */}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <div>
                  <p className="font-display text-sm font-semibold tracking-[-0.02em]">Pass it on</p>
                  <p className="text-[11px] text-muted-foreground">If this story helped, send it to someone who needs it.</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button variant="secondary" size="sm" onClick={copyLink} leftIcon={<Copy size={13} />}>
                    Copy link
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Share on X"
                    onClick={() =>
                      window.open(
                        `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`,
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    <Twitter size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Share on LinkedIn"
                    onClick={() =>
                      window.open(
                        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    <Linkedin size={15} />
                  </Button>
                </div>
              </div>

              {/* Author */}
              <div className="mt-6 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
                <Avatar src={article.authorPhoto} seed={authorSeed(article)} size={54} ring alt="" />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Written by</p>
                  <h2 className="mt-0.5 font-display text-lg font-semibold tracking-[-0.03em]">{authorName(article)}</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Writing from the Kith community. If you liked this, their other stories are close by.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!isAuthor && article.authorUid && (
                    <Button
                      variant={followingAuthor ? 'secondary' : 'soft'}
                      size="sm"
                      onClick={toggleFollow}
                      disabled={followBusy}
                    >
                      {followingAuthor ? 'Following' : 'Follow'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    rightIcon={<ArrowUpRight size={13} />}
                    onClick={() => navigate(`/creators/${article.authorUid}`)}
                  >
                    View profile
                  </Button>
                </div>
              </div>

              {/* Comments */}
              <section id="comments-section" className="mt-12 scroll-mt-24">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Discussion</p>
                    <h2 className="mt-0.5 font-display text-xl font-semibold tracking-[-0.04em]">
                      Join the conversation
                    </h2>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                    {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
                  </span>
                </div>

                {auth.currentUser ? (
                  <div className="mt-5 border-y border-border py-4">
                    <div className="flex gap-3">
                      <Avatar seed={auth.currentUser.uid} size={34} alt="" />
                      <div className="min-w-0 flex-1">
                        <Textarea
                          value={newComment}
                          onChange={(event) => setNewComment(event.target.value.slice(0, 600))}
                          maxLength={600}
                          placeholder="Add something useful, kind or curious…"
                          className="min-h-[72px] border-0 bg-transparent px-0 py-1 focus:ring-0"
                          disabled={postingComment}
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-[10px] font-semibold text-faint">{newComment.length}/600</span>
                          <Button
                            size="sm"
                            onClick={handlePostComment}
                            loading={postingComment}
                            disabled={!newComment.trim()}
                            leftIcon={<MessageCircle size={13} />}
                          >
                            Post reply
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-4">
                    <p className="text-sm text-muted-foreground">Sign in to add your perspective.</p>
                    <Button
                      size="sm"
                      onClick={() => navigate('/login', { state: { from: { pathname: `/article/${articleId}` } } })}
                    >
                      Sign in to reply
                    </Button>
                  </div>
                )}

                <div className="mt-2">
                  {comments.length > 0 ? (
                    comments.map((comment) => (
                      <div key={comment.id} className="border-b border-border py-5 last:border-b-0">
                        <div className="flex items-center gap-2.5">
                          <Avatar seed={comment.authorUid || comment.authorName || comment.id} size={30} alt="" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold">{comment.authorName || 'A Kith reader'}</p>
                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-faint">
                              {formatArticleDate(comment.createdAt)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                          {comment.content}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Be the first voice. A good question is as welcome as a good answer.
                    </p>
                  )}
                </div>
              </section>
            </article>
          </div>

          {/* Independent reading rail — outside the article column */}
          <aside className="absolute left-[calc(50%+336px)] top-0 bottom-0 hidden w-[160px] min-[1340px]:block min-[1400px]:left-[calc(50%+364px)] min-[1400px]:w-[180px]">
            <div className="sticky top-24 border-l border-border pl-5">
              {toc.length > 0 && (
                <section>
                  <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-faint">
                    <ListTree size={12} className="text-primary" />
                    On this page
                  </p>
                  <nav className="mt-3 max-h-[46vh] overflow-y-auto pr-1 custom-scrollbar">
                    {toc.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => scrollToHeading(item.id)}
                        aria-current={activeHeading === item.id ? 'location' : undefined}
                        className={cn(
                          'block w-full border-l-2 py-1.5 pr-2 text-left text-[11px] leading-snug transition-colors',
                          item.level === 3 ? 'pl-5' : 'pl-3',
                          activeHeading === item.id
                            ? 'border-primary font-semibold text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {item.text}
                      </button>
                    ))}
                  </nav>
                </section>
              )}

              <section className="mt-6 border-t border-border pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-faint">Reading</p>
                  <span className="font-display text-xs font-semibold tabular-nums">{Math.round(progress)}%</span>
                </div>
                <div className="mt-2 h-px overflow-hidden bg-border">
                  <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-3 flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Heart size={12} />
                    {article.likesCount || 0}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare size={12} />
                    {article.commentsCount || 0}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Eye size={12} />
                    {article.viewsCount || 0}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleLike}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-[11px] font-semibold transition-colors hover:text-primary',
                      liked ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
                    {liked ? 'Liked' : 'Like'}
                  </button>
                  <button
                    type="button"
                    onClick={handleBookmark}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-[11px] font-semibold transition-colors hover:text-primary',
                      bookmarked ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    <Bookmark size={13} fill={bookmarked ? 'currentColor' : 'none'} />
                    {bookmarked ? 'Saved' : 'Save'}
                  </button>
                </div>
              </section>

              <section className="mt-6 border-t border-border pt-5">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-faint">Filed under</p>
                <p className="mt-1 font-display text-sm font-semibold tracking-[-0.02em]">{category?.name || 'Journal'}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {article.subcategory || 'A story from the Kith community.'}
                </p>
                <Link
                  to="/articles"
                  className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  More like this
                  <ArrowUpRight size={12} />
                </Link>
              </section>

              <button
                type="button"
                onClick={() => getScrollParent(articleRef.current).scrollTo({ top: 0, behavior: 'smooth' })}
                className="mt-6 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowUp size={13} />
                Back to top
              </button>
            </div>
          </aside>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-16 border-t border-border pt-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Keep reading</p>
                <h2 className="mt-0.5 font-display text-xl font-semibold tracking-[-0.04em]">Stories nearby</h2>
              </div>
              <Link to="/articles" className="text-[11px] font-semibold text-primary hover:underline">
                All stories
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <ArticleCard key={item.id} article={item} variant="grid" />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Content helpers                                                            */
/* -------------------------------------------------------------------------- */

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function prepareArticleContent(raw: string): { html: string; toc: TocItem[] } {
  if (!raw || typeof window === 'undefined') return { html: raw || '', toc: [] };

  const parsed = new DOMParser().parseFromString(raw, 'text/html');
  const used = new Set<string>();
  const toc: TocItem[] = [];

  parsed.body.querySelectorAll('h2, h3').forEach((heading) => {
    const text = heading.textContent?.trim() || '';
    if (!text) return;
    const base = slugify(text) || 'section';
    let id = base;
    let index = 2;
    while (used.has(id)) id = `${base}-${index++}`;
    used.add(id);
    heading.setAttribute('id', id);
    toc.push({ id, text, level: heading.tagName === 'H2' ? 2 : 3 });
  });

  parsed.body.querySelectorAll('img').forEach((image) => {
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
    if (!image.getAttribute('alt')) image.setAttribute('alt', '');

    const caption = image.getAttribute('title')?.trim();
    if (caption && image.parentElement?.tagName !== 'FIGURE') {
      const figure = parsed.createElement('figure');
      const figcaption = parsed.createElement('figcaption');
      figcaption.textContent = caption;
      image.replaceWith(figure);
      figure.appendChild(image);
      figure.appendChild(figcaption);
      image.removeAttribute('title');
    }
  });

  parsed.body.querySelectorAll('a[href^="http"]').forEach((link) => {
    link.setAttribute('rel', 'noopener noreferrer');
  });

  return { html: parsed.body.innerHTML, toc };
}

function toIso(value: any): string | undefined {
  if (!value) return undefined;
  try {
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
  } catch {
    return undefined;
  }
}

function absoluteUrl(value: string, origin: string) {
  if (!value) return `${origin}/logo.jpg`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${origin}${value.startsWith('/') ? '' : '/'}${value}`;
}

function getScrollParent(node: HTMLElement | null): HTMLElement {
  let parent = node?.parentElement || null;
  while (parent) {
    const style = window.getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflowY)) return parent;
    parent = parent.parentElement;
  }
  return document.documentElement;
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

function useScrollProgress(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const target = getScrollParent(ref.current);

    const update = () => {
      const max = target.scrollHeight - target.clientHeight;
      const value = max > 0 ? (target.scrollTop / max) * 100 : 0;
      setProgress(Math.min(100, Math.max(0, value)));
    };

    update();
    target.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      target.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, enabled]);

  return progress;
}

function useScrollSpy(
  ref: React.RefObject<HTMLElement | null>,
  toc: TocItem[],
  enabled: boolean,
  setActive: (id: string) => void,
) {
  useEffect(() => {
    if (!enabled || toc.length === 0 || !ref.current) return;
    const target = getScrollParent(ref.current);
    const headings = toc
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => Boolean(node));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      {
        root: target === document.documentElement ? null : target,
        rootMargin: '-12% 0px -68% 0px',
        threshold: [0, 1],
      },
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [ref, toc, enabled, setActive]);
}

/* -------------------------------------------------------------------------- */

function ArticleSkeleton() {
  return (
    <div className="min-h-full bg-background px-4 pb-20 pt-8">
      <div className="mx-auto max-w-[640px] space-y-5 min-[1400px]:max-w-[700px]">
        <Skeleton className="h-5 w-32 rounded-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-4/5" />
        <Skeleton className="h-5 w-2/3" />
        <div className="flex items-center gap-3 py-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-48" />
          </div>
        </div>
        <Skeleton className="aspect-[16/9] w-full rounded-panel" />
        <div className="space-y-3 pt-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className={cn('h-3.5', index % 3 === 2 ? 'w-3/4' : 'w-full')} />
          ))}
        </div>
      </div>
    </div>
  );
}
