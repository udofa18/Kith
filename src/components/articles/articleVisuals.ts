import {
  Briefcase,
  Coffee,
  Globe,
  LineChart,
  Palette,
  PieChart,
  Target,
  Terminal,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { ARTICLE_CATEGORIES } from '../../types/articles';

/** Category icon names in `ARTICLE_CATEGORIES` are strings so the data stays serialisable. */
export const ARTICLE_ICONS: Record<string, LucideIcon> = {
  Terminal,
  Palette,
  Briefcase,
  PieChart,
  Users,
  Target,
  Zap,
  Video,
  LineChart,
  Coffee,
  Globe,
};

export interface CategoryTone {
  /** Badge/chip classes. */
  badge: string;
  /** Icon tile classes. */
  icon: string;
  /** Small dot / accent fill. */
  dot: string;
  /** Gradient used by the generated editorial cover art. */
  gradient: string;
}

/**
 * Category colours are deliberately mapped onto the design-system accents rather than
 * raw category hex values. Photos and gradients carry the colour; UI stays warm and quiet.
 */
const TONES: Record<string, CategoryTone> = {
  blue: {
    badge: 'border-info/30 bg-info/12 text-info',
    icon: 'bg-info/12 text-info ring-info/20',
    dot: 'bg-info',
    gradient: 'linear-gradient(135deg,#0f2a3d 0%,#1f6f9e 55%,#9ad8ff 100%)',
  },
  pink: {
    badge: 'border-primary/30 bg-primary/12 text-primary',
    icon: 'bg-primary/12 text-primary ring-primary/20',
    dot: 'bg-primary',
    gradient: 'linear-gradient(135deg,#3d1f2c 0%,#a8466d 55%,#f3a6c9 100%)',
  },
  orange: {
    badge: 'border-warning/30 bg-warning/12 text-warning',
    icon: 'bg-warning/12 text-warning ring-warning/20',
    dot: 'bg-warning',
    gradient: 'linear-gradient(135deg,#3d2a12 0%,#a86a1f 55%,#ffb65c 100%)',
  },
  emerald: {
    badge: 'border-success/30 bg-success/12 text-success',
    icon: 'bg-success/12 text-success ring-success/20',
    dot: 'bg-success',
    gradient: 'linear-gradient(135deg,#123026 0%,#1f7a5c 55%,#82e6c8 100%)',
  },
  purple: {
    badge: 'border-info/30 bg-info/12 text-info',
    icon: 'bg-info/12 text-info ring-info/20',
    dot: 'bg-info',
    gradient: 'linear-gradient(135deg,#2c2142 0%,#6b4fa0 55%,#b69cff 100%)',
  },
  indigo: {
    badge: 'border-info/30 bg-info/12 text-info',
    icon: 'bg-info/12 text-info ring-info/20',
    dot: 'bg-info',
    gradient: 'linear-gradient(135deg,#202044 0%,#4f4fa8 55%,#9ad8ff 100%)',
  },
  yellow: {
    badge: 'border-warning/30 bg-warning/12 text-warning',
    icon: 'bg-warning/12 text-warning ring-warning/20',
    dot: 'bg-warning',
    gradient: 'linear-gradient(135deg,#3d2c0e 0%,#9a5c12 55%,#ffb65c 100%)',
  },
  rose: {
    badge: 'border-primary/30 bg-primary/12 text-primary',
    icon: 'bg-primary/12 text-primary ring-primary/20',
    dot: 'bg-primary',
    gradient: 'linear-gradient(135deg,#3d1715 0%,#b23a24 55%,#ff9d8a 100%)',
  },
  cyan: {
    badge: 'border-info/30 bg-info/12 text-info',
    icon: 'bg-info/12 text-info ring-info/20',
    dot: 'bg-info',
    gradient: 'linear-gradient(135deg,#0f3038 0%,#1f6f9e 55%,#82e6c8 100%)',
  },
  amber: {
    badge: 'border-warning/30 bg-warning/12 text-warning',
    icon: 'bg-warning/12 text-warning ring-warning/20',
    dot: 'bg-warning',
    gradient: 'linear-gradient(135deg,#3a2a14 0%,#8a5a24 55%,#ffb65c 100%)',
  },
  slate: {
    badge: 'border-border-strong bg-muted text-muted-foreground',
    icon: 'bg-muted text-muted-foreground ring-border',
    dot: 'bg-faint',
    gradient: 'linear-gradient(135deg,#191621 0%,#3d3548 55%,#c7c0d0 100%)',
  },
};

const DEFAULT_TONE = TONES.slate;

export function categoryMeta(categoryId?: string) {
  return ARTICLE_CATEGORIES.find((category) => category.id === categoryId);
}

export function categoryToneFor(categoryId?: string): CategoryTone {
  const category = categoryMeta(categoryId);
  return (category && TONES[category.color]) || DEFAULT_TONE;
}

export function categoryIconFor(categoryId?: string): LucideIcon {
  const category = categoryMeta(categoryId);
  return (category && ARTICLE_ICONS[category.icon]) || Globe;
}

/** A photo is only shown when it is a real, authored image rather than a demo placeholder. */
export function isPlaceholderCover(url?: string | null) {
  if (!url || !url.trim()) return true;
  const value = url.toLowerCase();
  return (
    value.includes('picsum.photos') ||
    value.includes('placehold.co') ||
    value.includes('placeholder.com') ||
    value.includes('dummyimage.com')
  );
}

export function plainText(html?: string | null) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(html?: string | null) {
  const text = plainText(html);
  return text ? text.split(/\s+/).length : 0;
}

export function readMinutes(article: any) {
  const explicit = Number(article?.readingTime ?? article?.readingTimeMinutes);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.round(explicit));
  return Math.max(1, Math.ceil(wordCount(article?.content) / 220));
}

export function articleDateValue(article: any): Date | null {
  const raw = article?.publishedAt || article?.createdAt || article?.updatedAt;
  if (!raw) return null;
  try {
    const date = typeof raw?.toDate === 'function' ? raw.toDate() : new Date(raw);
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

export function articleTimestamp(article: any) {
  return articleDateValue(article)?.getTime() ?? 0;
}

export function formatArticleDate(value: any, long = true) {
  const raw = value?.publishedAt || value?.createdAt || value;
  if (!raw) return 'Recently';
  try {
    const date = typeof raw?.toDate === 'function' ? raw.toDate() : new Date(raw);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Recently';
    return date.toLocaleDateString(undefined, long
      ? { month: 'long', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Recently';
  }
}

export function authorName(article: any) {
  return article?.authorName || article?.author?.name || 'A Kith writer';
}

export function authorSeed(article: any) {
  return article?.authorUid || authorName(article);
}

export function initials(name?: string | null) {
  return (name || 'K')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'K';
}

/** Stable gradient for a story that has no cover photo. */
export function coverGradient(categoryId?: string) {
  return categoryToneFor(categoryId).gradient;
}
