import { Link } from 'react-router-dom';
import { Check, Copy, ExternalLink, Github, Globe, Linkedin, Lock, Pencil, Twitter, Users } from 'lucide-react';
import { CommunityIcon, communityHue } from '../CommunityCard';
import Avatar from '../ui/Avatar';
import VerifiedBadge from '../VerifiedBadge';
import { categoryLabel, categoryOf } from '../../lib/communityCategories';
import { feeOf, formatFee } from '../../lib/communityPricing';
import { formatDate } from '../../lib/utils';

interface Props {
  community: any;
  communityId: string;
  members: any[];
  needsApproval: boolean;
  onlineCount: number;
  copied: boolean;
  onCopy: () => void;
  /** Set for admins: opens the profile settings. */
  onEdit?: () => void;
}

const LINKS = (c: any) => [
  c.website && { label: 'Website', href: c.website, icon: Globe },
  c.socials?.twitter && { label: 'X / Twitter', href: `https://twitter.com/${c.socials.twitter}`, icon: Twitter },
  c.socials?.github && { label: 'GitHub', href: `https://github.com/${c.socials.github}`, icon: Github },
  c.socials?.linkedin && { label: 'LinkedIn', href: `https://linkedin.com/in/${c.socials.linkedin}`, icon: Linkedin },
  c.socials?.discord && { label: 'Discord', href: c.socials.discord, icon: Users },
].filter(Boolean) as { label: string; href: string; icon: any }[];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-foreground/10">
      <h3 className="px-5 py-3 text-sm font-semibold border-b border-foreground/10">{title}</h3>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function CommunityAbout({ community, communityId, members, needsApproval, onlineCount, copied, onCopy, onEdit }: Props) {
  const fee = feeOf(community);
  const hue = communityHue(community.id);
  const hasBackdrop = community.backdrop?.trim() && !community.backdrop.includes('picsum.photos');
  const links = LINKS(community);
  const team = members
    .filter(m => ['owner', 'admin', 'moderator'].includes(m.role))
    .sort((a, b) => ['owner', 'admin', 'moderator'].indexOf(a.role) - ['owner', 'admin', 'moderator'].indexOf(b.role));
  const facts = [
    { label: 'Members', value: (members.length || community.memberCount || 0).toLocaleString() },
    { label: 'Online now', value: onlineCount.toLocaleString() },
    { label: 'Created', value: formatDate(community.createdAt, 'MMM yyyy') },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="rounded-xl overflow-hidden border border-foreground/10">
        <div className="h-36 sm:h-48" style={hasBackdrop ? undefined : { background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 45) % 360} 65% 48%))` }}>
          {hasBackdrop && <img src={community.backdrop} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="px-5 pb-5 -mt-9 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-4 min-w-0">
            <CommunityIcon community={community} size={80} className="relative ring-4 ring-background shadow-lg shrink-0" />
            <div className="min-w-0 pb-1">
              <h1 className="text-2xl font-semibold leading-tight truncate">{community.name}</h1>
              <p className="text-sm text-foreground/55 flex flex-wrap items-center gap-x-2">
                {categoryOf(community) !== 'general' && <span>{categoryLabel(categoryOf(community))}</span>}
                <span className="flex items-center gap-1">{needsApproval ? <Lock size={13} /> : <Globe size={13} />}{needsApproval ? 'Private' : 'Public'}</span>
              </p>
            </div>
          </div>
          {onEdit && <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-foreground/15 text-sm hover:bg-foreground/5"><Pencil size={14} />Edit profile</button>}
        </div>
        <dl className="grid grid-cols-3 divide-x divide-foreground/10 border-t border-foreground/10 text-center">
          {facts.map(f => <div key={f.label} className="py-3"><dd className="text-lg font-semibold">{f.value}</dd><dt className="text-xs text-foreground/50">{f.label}</dt></div>)}
        </dl>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Section title="About">
            <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">{community.description || 'No description yet.'}</p>
            <dl className="mt-4 pt-4 border-t border-foreground/10 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-foreground/55">How to join</dt><dd className="text-right font-medium">{needsApproval ? 'Request, reviewed by admins' : 'Open to everyone'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-foreground/55">Joining fee</dt><dd className="text-right font-medium">{fee ? formatFee(fee) : 'Free'}</dd></div>
            </dl>
          </Section>

          {community.rules?.length > 0 && (
            <Section title="Community rules">
              <ol className="space-y-3">
                {community.rules.map((rule: string, i: number) => (
                  <li key={i} className="flex gap-3 text-sm"><span className="w-6 h-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">{i + 1}</span><span className="pt-0.5 text-foreground/80">{rule}</span></li>
                ))}
              </ol>
            </Section>
          )}

          {team.length > 0 && (
            <Section title="Team">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 -m-2">
                {team.map(m => (
                  <li key={m.id}>
                    <Link to={`/creators/${m.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-foreground/5">
                      <Avatar src={m.user?.profileImage || m.user?.photoURL} seed={m.id} size={36} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 text-sm font-medium"><span className="truncate">{m.user?.displayName || m.user?.username || 'Member'}</span><VerifiedBadge verified={m.user?.verified} /></span>
                        <span className="block text-xs text-foreground/50 capitalize">{m.role}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-5">
          <Section title="Share">
            <p className="text-sm text-foreground/55 mb-3">Anyone with this link can open the community.</p>
            <div className="flex gap-2">
              <input readOnly value={`${window.location.origin}/community/${communityId}`} aria-label="Community link" onFocus={e => e.currentTarget.select()}
                className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-foreground/5 text-xs font-mono outline-none" />
              <button onClick={onCopy} aria-label="Copy link" className={`px-3 rounded-lg border text-sm transition-colors ${copied ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-foreground/15 hover:bg-foreground/5'}`}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
            </div>
          </Section>

          <Section title="Links">
            {links.length > 0 ? (
              <ul className="space-y-1 -m-2">
                {links.map(l => (
                  <li key={l.label}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 rounded-lg text-sm hover:bg-foreground/5">
                      <l.icon size={16} className="text-foreground/55" /><span className="flex-1">{l.label}</span><ExternalLink size={13} className="text-foreground/35" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-foreground/50">No links added.</p>}
          </Section>
        </div>
      </div>
    </div>
  );
}
