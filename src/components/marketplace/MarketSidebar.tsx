import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Star, Trophy } from 'lucide-react';
import { Badge, Card, Skeleton } from '../ui';
import { initialsOf, typeLabel } from './MarketCard';
import { fetchPromoted, fetchTopSellers, MarketProduct, TopSeller } from '../../lib/marketplace';
import { formatPrice } from '../../lib/payments';

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={11} className={n <= Math.round(value) ? 'fill-accent text-accent' : 'text-faint'} />
      ))}
    </span>
  );
}

export function TopSellers() {
  const [sellers, setSellers] = useState<TopSeller[] | null>(null);

  useEffect(() => {
    fetchTopSellers(5).then(setSellers);
  }, []);

  return (
    <Card variant="elevated" className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-accent" />
        <h2 className="text-sm font-bold">Top sellers</h2>
      </div>

      {sellers === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : sellers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sellers appear here after their first sale.</p>
      ) : (
        <ol className="space-y-3">
          {sellers.map((s, i) => {
            const rating = s.rating === null ? null : Number(s.rating);
            return (
              <li key={s.creator_uid}>
                <Link to={`/creators/${s.creator_uid}`} className="flex items-center gap-3 rounded-control p-1.5 -m-1.5 transition-colors hover:bg-muted">
                  <span className="w-4 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {initialsOf(s.creator_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.creator_name || 'Creator'}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {rating !== null && Number.isFinite(rating) ? (
                        <>
                          <Stars value={rating} />
                          <span>{rating.toFixed(1)}</span>
                        </>
                      ) : (
                        <span>New</span>
                      )}
                      <span>· {s.total_sales} sold</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export function PromotedProducts() {
  const [products, setProducts] = useState<MarketProduct[] | null>(null);

  useEffect(() => {
    fetchPromoted(3).then(setProducts);
  }, []);

  if (products !== null && products.length === 0) return null;

  return (
    <Card variant="elevated" className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Megaphone size={16} className="text-primary" />
        <h2 className="text-sm font-bold">Promoted</h2>
      </div>

      {products === null ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <ul className="space-y-3">
          {products.map(p => (
            <li key={p.id}>
              <Link to={`/products/${p.id}`} className="group flex items-center gap-3 rounded-control p-1.5 -m-1.5 transition-colors hover:bg-muted">
                <span className="h-12 w-16 shrink-0 overflow-hidden rounded-control bg-muted">
                  {p.cover_url ? (
                    <img src={p.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,var(--ds-brand-coral),var(--ds-brand-lilac))] text-[10px] font-bold text-white">
                      {typeLabel(p.product_type).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold group-hover:text-primary">{p.title}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="primary">Promoted</Badge>
                    <span>{p.price_cents === 0 ? 'Free' : formatPrice(p.price_cents, p.currency)}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
