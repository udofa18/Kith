import { useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowUpRight,
  Bookmark,
  Clock,
  Eye,
  Globe,
  Heart,
  Lock,
  MessageSquare,
  PenLine,
  Sparkles,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '../firebase';
import { cn } from '../lib/cn';
import Avatar from './ui/Avatar';
import ArticleCover from './articles/ArticleCover';
import {
  articleDateValue,
  authorName,
  authorSeed,
  categoryIconFor,
  categoryMeta,
  readMinutes,
} from './articles/articleVisuals';

export type ArticleCardVariant = 'default' | 'grid' | 'featured' | 'compact' | 'flat';

interface ArticleCardProps {
  article: any;
  isOwner?: boolean;
  variant?: ArticleCardVariant;
  className?: string;
}

export default function ArticleCard({
  article,
  isOwner = false,
  variant = 'default',
  className,
}: ArticleCardProps) {
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<'published' | 'draft'>(article.status === 'draft' ? 'draft' : 'published');

  const category = categoryMeta(article.primaryCategoryId);
  const Icon = categoryIconFor(article.primaryCategoryId);
  const date = articleDateValue(article);
  const dateLabel = date ? formatDistanceToNow(date, { addSuffix: true }) : 'Recently';
  const minutes = readMinutes(article);
  const title = article.title || 'Untitled story';
  const excerpt = article.subtitle || article.excerpt || '';
  const href = `/article/${article.id}`;
  const isFeatured = Boolean(article.isFeatured);
  const isGrid = variant === 'grid';
  const isCompact = variant === 'compact';
  const isBig = variant === 'featured';
  const isFlat = variant === 'flat';

  const toggleBookmark = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!auth.currentUser) {
      toast.error('Sign in to save stories');
      return;
    }
    if (bookmarking) return;

    setBookmarking(true);
    try {
      const bookmarkRef = doc(db, 'users', auth.currentUser.uid, 'bookmarkedArticles', article.id);
      const existing = bookmarked ? true : (await getDoc(bookmarkRef)).exists();
      if (existing) {
        await deleteDoc(bookmarkRef);
        setBookmarked(false);
        toast.success('Removed from your reading list');
      } else {
        await setDoc(bookmarkRef, {
          articleId: article.id,
          bookmarkedAt: new Date().toISOString(),
          title,
          subtitle: excerpt,
          coverImage: article.coverImage || '',
          authorName: authorName(article),
          readingTime: minutes,
          primaryCategoryId: article.primaryCategoryId || '',
        });
        setBookmarked(true);
        toast.success('Saved to your reading list');
      }
    } catch (error) {
      console.error(error);
      toast.error('Could not update your reading list');
    } finally {
      setBookmarking(false);
    }
  };

  const togglePublish = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isOwner || publishing) return;

    setPublishing(true);
    try {
      const next = status === 'published' ? 'draft' : 'published';
      await updateDoc(doc(db, 'articles', article.id), {
        status: next,
        updatedAt: new Date().toISOString(),
        ...(next === 'published' ? { publishedAt: new Date().toISOString() } : {}),
      });
      setStatus(next);
      toast.success(next === 'published' ? 'Story published' : 'Moved back to drafts');
    } catch (error) {
      console.error(error);
      toast.error('Could not update the story');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <article
      className={cn(
        'group relative flex text-foreground transition-[transform,border-color,box-shadow] duration-300 ease-out',
        isFlat
          ? 'border-b border-border bg-transparent pb-6 sm:flex-row'
          : 'overflow-hidden rounded-card border border-border bg-surface shadow-soft hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift',
        isGrid || isCompact ? 'flex-col' : isBig ? 'flex-col lg:flex-row' : 'flex-col sm:flex-row',
        isCompact && 'gap-3 p-2.5',
        status === 'draft' && 'opacity-90',
        className,
      )}
    >
      {/* Cover */}
      <div
        className={cn(
          'relative shrink-0 overflow-hidden',
          isCompact
            ? 'h-16 w-16 rounded-xl'
            : isGrid
              ? 'aspect-[16/10] w-full'
              : isBig
                ? 'aspect-[16/10] w-full lg:aspect-auto lg:w-[54%] lg:min-h-[380px]'
                : isFlat
                  ? 'aspect-[16/10] w-full rounded-[1.1rem] sm:aspect-auto sm:w-[250px] sm:min-h-[176px]'
                  : 'aspect-[16/10] w-full sm:aspect-auto sm:w-[270px] sm:min-h-[196px]',
        )}
      >
        <ArticleCover
          src={article.coverImage}
          title={title}
          categoryId={article.primaryCategoryId}
          seed={article.id}
          priority={isBig}
          showStamp={isBig}
          hideWordmark
          className="h-full w-full"
        />

        <Link
          to={href}
          aria-label={`Read ${title}`}
          className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        />

        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
          {article.primaryCategoryId && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#ffffff]/15 bg-black/55 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#ffffff] backdrop-blur-md">
              <Icon size={11} className="text-[#ffffff]/80" />
              {category?.name || article.primaryCategoryId}
            </span>
          )}
          {isFeatured && !isCompact && !isFlat && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#ffffff]/15 bg-black/55 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#ffffff] backdrop-blur-md">
              <Sparkles size={11} className="text-amber-300" />
              Featured
            </span>
          )}
          {status === 'draft' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#ffffff]/15 bg-black/55 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#ffffff] backdrop-blur-md">
              <Lock size={11} className="text-amber-300" />
              Draft
            </span>
          )}
        </div>

        {!isCompact && (
          <div className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-background/75 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-foreground backdrop-blur-md">
            <Clock size={11} />
            {minutes} min
          </div>
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          'relative flex min-w-0 flex-1 flex-col',
          isCompact
            ? 'justify-center py-0.5'
            : isBig
              ? 'p-6 sm:p-8 lg:justify-center'
              : isFlat
                ? 'p-0 pt-4 sm:pl-5 sm:pt-0'
                : 'p-4 sm:p-5',
        )}
      >
        {!isCompact && (
          <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="flex items-center gap-2">
              <Avatar src={article.authorPhoto} seed={authorSeed(article)} size={24} alt="" />
              <span className="text-xs font-semibold text-foreground/85">{authorName(article)}</span>
            </span>
            <span className="h-1 w-1 rounded-full bg-faint" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{dateLabel}</span>
            {article.subcategory && (
              <>
                <span className="h-1 w-1 rounded-full bg-faint" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                  {article.subcategory}
                </span>
              </>
            )}
          </div>
        )}

        <h3
          className={cn(
            'font-display font-semibold leading-[1.12] tracking-[-0.045em] text-foreground',
            isCompact ? 'text-sm' : isBig ? 'text-2xl sm:text-3xl lg:text-[2.1rem]' : 'text-lg sm:text-xl',
          )}
        >
          <Link
            to={href}
            className="line-clamp-2 outline-none transition-colors hover:text-primary focus-visible:text-primary"
          >
            {title}
          </Link>
        </h3>

        {!isCompact && excerpt && (
          <p
            className={cn(
              'mt-2 leading-relaxed text-muted-foreground',
              isBig ? 'line-clamp-3 max-w-[54ch] text-sm sm:text-base' : 'line-clamp-2 text-xs sm:text-[13px]',
            )}
          >
            {excerpt}
          </p>
        )}

        {isCompact ? (
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
            {minutes} min · {dateLabel}
          </p>
        ) : (
          <div className="mt-auto flex items-end justify-between gap-3 pt-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              {!isBig &&
                article.tags?.slice(0, isGrid ? 1 : 2).map((tag: string) => (
                  <span
                    key={tag}
                    className="max-w-[120px] truncate text-[9px] font-bold uppercase tracking-[0.1em] text-faint"
                  >
                    #{tag}
                  </span>
                ))}
            </div>

            <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
              <span className="inline-flex items-center gap-1 px-1.5 text-[11px] font-semibold" title="Likes">
                <Heart size={13} />
                {article.likesCount || 0}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 text-[11px] font-semibold" title="Comments">
                <MessageSquare size={13} />
                {article.commentsCount || 0}
              </span>
              {!isGrid && (
                <span className="inline-flex items-center gap-1 px-1.5 text-[11px] font-semibold" title="Views">
                  <Eye size={13} />
                  {article.viewsCount || 0}
                </span>
              )}

              {isOwner ? (
                <span className="relative z-20 ml-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={togglePublish}
                    disabled={publishing}
                    title={status === 'published' ? 'Move to drafts' : 'Publish story'}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {status === 'published' ? <Lock size={15} /> : <Globe size={15} />}
                  </button>
                  <Link
                    to={`/write/${article.id}`}
                    title="Edit story"
                    className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <PenLine size={15} />
                  </Link>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={toggleBookmark}
                  disabled={bookmarking}
                  aria-pressed={bookmarked}
                  aria-label={bookmarked ? 'Remove from reading list' : 'Save to reading list'}
                  className={cn(
                    'relative z-20 ml-1 grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50',
                    bookmarked ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {isBig && (
        <span className="pointer-events-none absolute bottom-5 right-5 z-10 hidden h-10 w-10 place-items-center rounded-full border border-border bg-background/70 text-foreground backdrop-blur-md lg:grid">
          <ArrowUpRight size={18} />
        </span>
      )}
    </article>
  );
}
