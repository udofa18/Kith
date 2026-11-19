import { format, isSameYear } from 'date-fns';
import VerifiedBadge from '../VerifiedBadge';
import PostMedia from './PostMedia';
import type { FeedPostMedia } from '../../lib/media/types';

/** The subset of a post needed to render a quoted preview. */
export interface QuotedPostData {
  id?: string;
  authorUid?: string;
  authorName?: string;
  authorUsername?: string;
  authorPhoto?: string;
  createdAt?: unknown;
  content?: string;
  description?: string;
  media?: FeedPostMedia[];
}

function quotedDate(value: unknown): string {
  if (!value) return '';
  const date =
    typeof value === 'object' && value && 'toDate' in value
      ? (value as { toDate: () => Date }).toDate()
      : new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return '';

  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return format(date, isSameYear(date, new Date()) ? 'MMM d' : 'MMM d, yyyy');
}

/**
 * X-style quoted post.
 *
 * The quoted author, handle, timestamp and text sit in a bordered card, and the quoted
 * post's images or videos render below the text at the card's width. Clicking the card
 * opens the original post; when no opener is supplied (composer preview), clicking media
 * opens the full file in a new tab.
 */
export default function QuotedPost({
  post,
  active = false,
  onOpenPost,
  className = '',
}: {
  post: QuotedPostData;
  /** Let videos in the quoted post play when the surrounding feed card is visible. */
  active?: boolean;
  onOpenPost?: () => void;
  className?: string;
}) {
  const body = post.content || post.description || '';
  const media = Array.isArray(post.media) ? post.media : [];
  const name = post.authorName || 'Unknown';
  const fallbackPhoto = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(post.authorUid || name)}`;
  const date = quotedDate(post.createdAt);

  const openMedia = (url: string) => {
    if (onOpenPost) {
      onOpenPost();
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      onClick={
        onOpenPost
          ? (event) => {
              event.stopPropagation();
              onOpenPost();
            }
          : undefined
      }
      onKeyDown={
        onOpenPost
          ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              onOpenPost();
            }
          : undefined
      }
      role={onOpenPost ? 'link' : undefined}
      tabIndex={onOpenPost ? 0 : undefined}
      className={`overflow-hidden rounded-2xl border border-black/15 bg-black/[0.02] transition-colors dark:border-white/15 dark:bg-white/[0.03] ${
        onOpenPost ? 'cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.06]' : ''
      } ${className}`}
    >
      <div className="p-3.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <img
            src={post.authorPhoto || fallbackPhoto}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
            onError={(event) => {
              event.currentTarget.src = fallbackPhoto;
            }}
          />
          <span className="min-w-0 truncate text-[15px] font-bold text-black dark:text-white">
            {name}
          </span>
          {post.authorUid && <VerifiedBadge userId={post.authorUid} />}
          {post.authorUsername && (
            <span className="truncate text-[14px] text-black/45 dark:text-white/45">
              @{post.authorUsername}
            </span>
          )}
          {date && (
            <span className="shrink-0 text-[13px] text-black/40 dark:text-white/40">
              · {date}
            </span>
          )}
        </div>

        {body && (
          <p className="mt-2 line-clamp-5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-black/85 dark:text-white/85">
            {body}
          </p>
        )}
      </div>

      {media.length > 0 && (
        <div className="px-3.5 pb-3.5">
          <PostMedia media={media} active={active} onOpenImage={openMedia} embedded />
        </div>
      )}
    </div>
  );
}
