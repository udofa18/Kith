import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, Compass } from 'lucide-react';
import { feedService } from '../../services/feedService';
import { queryKeys, STALE } from '../../lib/queryClient';
import { feeOf } from '../../lib/communityPricing';
import CommunityDetailsModal from '../CommunityDetailsModal';
import PublicCommunityCard from './PublicCommunityCard';

/**
 * Real communities on the landing page, not a mock.
 *
 * Cards open the same details pop-up as /communities, so the landing page is a
 * door into discovery rather than a description of it. Signed-out visitors are
 * never dropped into a channel.
 */
export default function CommunityDiscoveryStrip() {
  const navigate = useNavigate();
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const { data: communities = [] } = useQuery({
    queryKey: queryKeys.communities(),
    queryFn: () => feedService.getCommunities(),
    staleTime: STALE.communities,
  });

  const featured = useMemo(
    () =>
      (communities as any[])
        .filter(
          (community) =>
            !community.isPrivate &&
            !(community.membershipControl?.accessType && community.membershipControl.accessType !== 'public'),
        )
        .sort((a, b) => {
          const feeA = feeOf(a) ? 1 : 0;
          const feeB = feeOf(b) ? 1 : 0;
          return feeB - feeA || (b.memberCount || 0) - (a.memberCount || 0);
        })
        .slice(0, 6),
    [communities],
  );

  if (featured.length === 0) return null;

  return (
    <section className="relative mx-auto max-w-[1240px] px-5 py-16 md:px-8 md:py-20">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ffb65c]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6b4a]" />
            Already gathering
          </p>
          <h2 className="mt-4 max-w-[20ch] font-display text-4xl font-semibold leading-[0.98] tracking-[-0.06em] text-[#f7f2e8] sm:text-5xl">
            Find your <span className="landing-serif text-[#f7f2e8]/45">corner.</span>
          </h2>
        </motion.div>

        <Link
          to="/communities"
          className="group inline-flex w-fit items-center gap-2 rounded-full border border-[#ffffff16] px-5 py-2.5 text-sm font-medium text-[#f7f2e8]/70 transition-colors hover:border-[#ffffff36] hover:text-[#f7f2e8]"
        >
          <Compass size={15} />
          See all communities
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((community: any, index) => (
          <motion.div
            key={community.id}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
          >
            <PublicCommunityCard community={community} onClick={() => setDetailsId(community.id)} />
          </motion.div>
        ))}
      </div>

      <CommunityDetailsModal
        isOpen={!!detailsId}
        onClose={() => setDetailsId(null)}
        communityId={detailsId || ''}
        onJoinSuccess={() => {
          if (!detailsId) return;
          navigate(`/feed?view=community&id=${detailsId}`);
          setDetailsId(null);
        }}
      />
    </section>
  );
}
