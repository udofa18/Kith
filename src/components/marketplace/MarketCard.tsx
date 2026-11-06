import { Link } from 'react-router-dom';
import { BookOpen, Box, GraduationCap, Globe, Layers, Music, Package, Star, Video } from 'lucide-react';
import { Badge } from '../ui';
import { cn } from '../../lib/cn';
import { formatPrice } from '../../lib/payments';
import { MarketProduct, PRODUCT_TYPES, ratingOf } from '../../lib/marketplace';

const TYPE_ICONS: Record<string, typeof BookOpen> = {
  course: GraduationCap,
  ebook: BookOpen,
  template: Layers,
  asset: Box,
  app: Globe,
  music: Music,
  video: Video,
  other: Package,
};

export function typeLabel(type: string | null): string {
  return PRODUCT_TYPES.find(t => t.id === type)?.label ?? 'Digital product';
}

export function initialsOf(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'K';
  return parts
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('');
}

export default function MarketCard({ product, className }: { product: MarketProduct; className?: string }) {
  const Icon = TYPE_ICONS[product.product_type ?? 'other'] ?? Package;
  const rating = ratingOf(product);
  const isFree = product.price_cents === 0;

  return (
    <Link
      to={`/products/${product.id}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-soft transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {product.cover_url ? (
          <img
            src={product.cover_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,var(--ds-brand-coral),var(--ds-brand-lilac))] opacity-90">
            <Icon size={36} className="text-white/90" />
          </div>
        )}
        <span className="absolute left-3 top-3">
          <Badge variant="neutral">{typeLabel(product.product_type)}</Badge>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{product.title}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
              {initialsOf(product.creator_name)}
            </span>
            <span className="truncate">{product.creator_name || 'Creator'}</span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {rating !== null ? (
              <span className="flex items-center gap-1">
                <Star size={13} className="fill-accent text-accent" />
                <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
                <span>({product.rating_count})</span>
              </span>
            ) : (
              <span>New</span>
            )}
            {product.sales_count > 0 && <span>{product.sales_count} sold</span>}
          </div>
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-sm font-bold',
              isFree ? 'bg-success/15 text-success' : 'bg-accent/15 text-accent',
            )}
          >
            {isFree ? 'Free' : formatPrice(product.price_cents, product.currency)}
          </span>
        </div>
      </div>
    </Link>
  );
}
