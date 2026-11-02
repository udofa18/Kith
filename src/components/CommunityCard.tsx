import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { Lock, Users, Zap } from 'lucide-react';
import { db } from '../firebase';
import { categoryLabel, categoryOf } from '../lib/communityCategories';
import { feeOf, formatFee } from '../lib/communityPricing';
import VerifiedBadge from './VerifiedBadge';

/** Stable colour for communities without a cover or icon. */
export function communityHue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const hasImage = (url?: string) => !!url && url.trim() !== '' && !url.includes('picsum.photos');

/** Square community icon: its image, or its initial on its colour. */
export function CommunityIcon({ community, size = 48, className = '' }: { community: any; size?: number; className?: string }) {
  const hue = communityHue(community.id || community.name || 'x');
  return hasImage(community.image) ? (
    <img src={community.image} alt="" referrerPolicy="no-referrer" className={`shrink-0 rounded-xl object-cover bg-black/5 ${className}`} style={{ width: size, height: size }} />
  ) : (
    <span
      className={`shrink-0 rounded-xl flex items-center justify-center font-bold ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 65% 55%)`, color: '#fff' }}
      aria-hidden
    >
      {(community.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default function CommunityCard({ community, isMember, onClick }: { community: any; isMember?: boolean; onClick: () => void }) {
  const { data: creator } = useQuery({
    queryKey: ['user-lite', community.creatorId],
    queryFn: async () => (await getDoc(doc(db, 'users', community.creatorId))).data() ?? null,
    enabled: !!community.creatorId,
    staleTime: 10 * 60_000,
  });

  const hue = communityHue(community.id || community.name || 'x');
  const isPrivate = community.isPrivate || (community.membershipControl?.accessType && community.membershipControl.accessType !== 'public');
  const members = community.memberCount || 0;
  const category = categoryOf(community);
  const fee = feeOf(community);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter') onClick(); }}
      className="group h-full flex flex-col rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-background hover:border-black/20 dark:hover:border-white/20 hover:shadow-lg hover:shadow-black/5 transition-all cursor-pointer text-left"
    >
      <div
        className="h-24 relative overflow-hidden"
        style={hasImage(community.backdrop) ? undefined : { background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 45) % 360} 65% 48%))` }}
      >
        {hasImage(community.backdrop) && (
          <img src={community.backdrop} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
        )}
        {isMember && (
          <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm text-xs font-medium" style={{ color: '#fff' }}>Joined</span>
        )}
      </div>

      <div className="flex-1 flex flex-col px-4 pb-4">
        <CommunityIcon community={community} size={52} className="relative z-10 -mt-7 ring-4 ring-background" />

        <h3 className="mt-2 font-bold text-[17px] leading-snug truncate group-hover:text-primary transition-colors">{community.name}</h3>
        {creator && (
          <p className="text-sm text-black/50 dark:text-white/50 truncate flex items-center gap-1">
            by <span className="text-black/75 dark:text-white/75 font-medium truncate">{creator.displayName || creator.username}</span>
            <VerifiedBadge verified={!!creator.verified} size={13} />
          </p>
        )}
        {community.description && (
          <p className="mt-2 text-sm text-black/65 dark:text-white/65 line-clamp-2 leading-relaxed">{community.description}</p>
        )}

        <div className="mt-auto pt-4 flex items-center gap-2 flex-wrap text-xs">
          <span className="flex items-center gap-1 text-black/55 dark:text-white/55">
            <Users size={13} /> {members.toLocaleString()} {members === 1 ? 'member' : 'members'}
          </span>
          {category !== 'general' && (
            <span className="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60">{categoryLabel(category)}</span>
          )}
          {fee && (
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium" title="Joining fee">
              {fee.currency === 'xp' && <Zap size={11} />} {formatFee(fee)}
            </span>
          )}
          {isPrivate && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60"><Lock size={11} /> Private</span>
          )}
          <span className={`ml-auto px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
            isMember ? 'border border-black/15 dark:border-white/20 group-hover:bg-black/5 dark:group-hover:bg-white/10' : 'bg-primary text-white group-hover:bg-primary/90'
          }`}>
            {isMember ? 'Open' : 'View'}
          </span>
        </div>
      </div>
    </div>
  );
}
