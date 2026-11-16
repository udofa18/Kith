import { Lock, Users, Zap } from 'lucide-react';
import { CommunityIcon, communityHue } from '../CommunityCard';
import { categoryLabel, categoryOf } from '../../lib/communityCategories';
import { feeOf, formatFee } from '../../lib/communityPricing';

const hasImage = (url?: string) => !!url && url.trim() !== '' && !url.includes('picsum.photos');

/**
 * Community card for public discovery surfaces. It follows the landing
 * vocabulary (warm ink, cream, coral) rather than the signed-in product
 * surfaces, so the page reads as one designed place.
 */
export default function PublicCommunityCard({
  community,
  isMember,
  onClick,
}: {
  community: any;
  isMember?: boolean;
  onClick: () => void;
}) {
  const hue = communityHue(community.id || community.name || 'x');
  const isPrivate = community.isPrivate || (community.membershipControl?.accessType && community.membershipControl.accessType !== 'public');
  const members = community.memberCount || 0;
  const category = categoryOf(community);
  const fee = feeOf(community);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-[#ffffff0f] bg-[#141019] text-left transition-all hover:-translate-y-0.5 hover:border-[#ffb65c]/30 hover:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]"
    >
      <div
        className="relative h-24 overflow-hidden"
        style={hasImage(community.backdrop) ? undefined : { background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 45) % 360} 65% 48%))` }}
      >
        {hasImage(community.backdrop) && (
          <img
            src={community.backdrop}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
        {isMember && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-[#0e0b13]/70 px-2 py-0.5 text-[10px] font-semibold text-[#f7f2e8] backdrop-blur">
            Joined
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4">
        <CommunityIcon
          community={community}
          size={52}
          className="relative z-10 -mt-7 ring-4 ring-[#141019]"
        />

        <h3 className="mt-2 truncate font-display text-[17px] font-semibold leading-snug tracking-[-0.02em] text-[#f7f2e8] transition-colors group-hover:text-[#ffb65c]">
          {community.name}
        </h3>

        {community.description && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-[#f7f2e8]/50">
            {community.description}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 text-[11px]">
          <span className="flex items-center gap-1 text-[#f7f2e8]/50">
            <Users size={12} /> {members.toLocaleString('en-NG')} {members === 1 ? 'member' : 'members'}
          </span>
          {category !== 'general' && (
            <span className="rounded-full bg-[#ffffff0a] px-2 py-0.5 text-[#f7f2e8]/55">
              {categoryLabel(category)}
            </span>
          )}
          {fee && (
            <span className="flex items-center gap-0.5 rounded-full bg-[#ffb65c]/10 px-2 py-0.5 font-medium text-[#ffb65c]">
              {fee.currency === 'xp' && <Zap size={10} />} {formatFee(fee)}
            </span>
          )}
          {isPrivate && (
            <span className="flex items-center gap-1 rounded-full bg-[#ffffff0a] px-2 py-0.5 text-[#f7f2e8]/55">
              <Lock size={10} /> Private
            </span>
          )}
          <span
            className={`ml-auto rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              isMember
                ? 'border border-[#ffffff1a] text-[#f7f2e8]/75 group-hover:bg-[#ffffff0a]'
                : 'bg-[#f7f2e8] text-[#171120] group-hover:bg-[#ffb65c]'
            }`}
          >
            {isMember ? 'Open' : 'View'}
          </span>
        </div>
      </div>
    </button>
  );
}
