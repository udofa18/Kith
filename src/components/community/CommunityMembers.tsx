import { useMemo, useRef, useState, useEffect } from 'react';
import { Gavel, MoreVertical, Search } from 'lucide-react';
import { doc, writeBatch } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { auth, db } from '../../firebase';
import { formatDate } from '../../lib/utils';
import { presenceLabel } from '../../features/messages/api';
import { queueAudit, useMembership } from '../../lib/communityRoles';
import Avatar from '../ui/Avatar';
import UserHoverCard from '../UserHoverCard';
import VerifiedBadge from '../VerifiedBadge';
import MemberActionModal from './MemberActionModal';

const PAGE = 50;
const RANK: Record<string, number> = { owner: 0, admin: 1, moderator: 2, member: 3 };
const ROLE_STYLE: Record<string, string> = {
  owner: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  admin: 'bg-red-500/10 text-red-600 dark:text-red-400',
  moderator: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
};
const SORTS = [{ id: 'role', label: 'Role' }, { id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }, { id: 'name', label: 'Name' }] as const;
const joinedMs = (m: any) => { const d = m.joinedAt?.toDate ? m.joinedAt.toDate() : m.joinedAt ? new Date(m.joinedAt) : null; return d && !isNaN(d.getTime()) ? d.getTime() : 0; };
const nameOf = (m: any) => m.user?.displayName || m.user?.username || 'Member';

interface Props { communityId: string; community: any; members: any[]; roles: any[]; now: number }

export default function CommunityMembers({ communityId, members, roles, now }: Props) {
  const me = useMembership(communityId);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('role');
  const [shown, setShown] = useState(PAGE);
  const [menu, setMenu] = useState<string | null>(null);
  const [moderating, setModerating] = useState<any>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const isOnline = (m: any) => presenceLabel(m.user?.lastActiveAt, now, m.user) === 'Active now';

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter(m => !q || `${m.user?.displayName || ''} ${m.user?.username || ''}`.toLowerCase().includes(q))
      .filter(m => filter === 'all' ? true : filter === 'online' ? isOnline(m) : filter === 'staff' ? RANK[m.role] < 3 : (m.customRoles || []).includes(filter))
      .sort((a, b) => {
        if (sort === 'newest') return joinedMs(b) - joinedMs(a);
        if (sort === 'oldest') return joinedMs(a) - joinedMs(b);
        if (sort === 'name') return nameOf(a).localeCompare(nameOf(b));
        return (RANK[a.role] ?? 3) - (RANK[b.role] ?? 3) || Number(isOnline(b)) - Number(isOnline(a)) || nameOf(a).localeCompare(nameOf(b));
      });
  }, [members, search, filter, sort, now]);

  useEffect(() => setShown(PAGE), [search, filter, sort]);

  const setRank = async (m: any, role: 'admin' | 'moderator' | 'member') => {
    setMenu(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'communities', communityId, 'members', m.id), { role });
      queueAudit(batch, communityId, { action: 'member.role', targetId: m.id, targetName: nameOf(m), details: `${m.role} → ${role}` });
      await batch.commit();
      toast.success(`${nameOf(m)} is now ${role === 'member' ? 'a regular member' : `a${role === 'admin' ? 'n' : ''} ${role}`}`);
    } catch {
      toast.error("Couldn't change their role");
    }
  };

  const onlineCount = members.filter(isOnline).length;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Members</h2>
        <p className="text-sm text-foreground/55">{members.length.toLocaleString()} member{members.length === 1 ? '' : 's'} · {onlineCount} online</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or username" aria-label="Search members"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-foreground/15 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter members" className="bg-background border border-foreground/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="all">Everyone</option><option value="online">Online now</option><option value="staff">Staff</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as any)} aria-label="Sort members" className="bg-background border border-foreground/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
          {SORTS.map(s => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
        </select>
      </div>

      <ul className="rounded-xl border border-foreground/10 divide-y divide-foreground/10">
        {list.slice(0, shown).map(m => {
          const custom = (m.customRoles || []).map((rid: string) => roles.find(r => r.id === rid)).filter(Boolean);
          const outranked = me.outranks(m);
          const canModerate = outranked && (me.can('moderate_chat') || me.can('manage_members'));
          const canChangeRank = me.isOwner && m.role !== 'owner' && m.id !== auth.currentUser?.uid;
          const timedOut = (m.timeoutUntil?.toMillis?.() ?? 0) > now;
          const presence = presenceLabel(m.user?.lastActiveAt, now, m.user);
          return (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <UserHoverCard userId={m.id}>
                <span className="relative block cursor-pointer">
                  <Avatar src={m.user?.profileImage || m.user?.photoURL} seed={m.id} size={40} />
                  {isOnline(m) && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 ring-2 ring-background" />}
                </span>
              </UserHoverCard>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-sm font-medium"><span className="truncate">{nameOf(m)}</span><VerifiedBadge verified={m.user?.verified} /></p>
                <p className="text-xs text-foreground/50 truncate">
                  {m.user?.username ? `@${m.user.username}` : ''}{m.user?.username && ' · '}Joined {formatDate(m.joinedAt, 'MMM d, yyyy')}{!isOnline(m) && presence ? ` · ${presence}` : ''}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {m.role !== 'member' && <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_STYLE[m.role] || ''}`}>{m.role}</span>}
                  {custom.map((r: any) => <span key={r.id} className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${r.color}20`, color: r.color }}>{r.name}</span>)}
                  {timedOut && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400">Timed out</span>}
                </div>
              </div>
              {(canModerate || canChangeRank) && (
                <div className="flex items-center gap-1 relative" ref={menu === m.id ? menuRef : undefined}>
                  {canModerate && <button onClick={() => setModerating(m)} aria-label={`Moderate ${nameOf(m)}`} title="Timeout, remove or ban" className="p-2 rounded-lg text-foreground/45 hover:text-primary hover:bg-foreground/5"><Gavel size={16} /></button>}
                  {canChangeRank && (
                    <>
                      <button onClick={() => setMenu(menu === m.id ? null : m.id)} aria-label={`Change role for ${nameOf(m)}`} aria-expanded={menu === m.id} className="p-2 rounded-lg text-foreground/45 hover:text-foreground hover:bg-foreground/5"><MoreVertical size={16} /></button>
                      {menu === m.id && (
                        <div role="menu" className="absolute right-0 top-full mt-1 w-44 bg-background border border-foreground/15 rounded-lg shadow-lg z-20 overflow-hidden">
                          {(['admin', 'moderator', 'member'] as const).filter(r => r !== m.role).map(r => (
                            <button key={r} role="menuitem" onClick={() => setRank(m, r)} className="w-full px-3 py-2 text-sm text-left hover:bg-foreground/5">
                              {r === 'member' ? 'Make regular member' : `Make ${r}`}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="px-4 py-12 text-sm text-center text-foreground/50">No members match.</li>}
      </ul>

      {list.length > shown && (
        <div className="flex justify-center"><button onClick={() => setShown(n => n + PAGE)} className="px-4 py-2 rounded-lg bg-foreground/5 text-sm font-medium hover:bg-foreground/10">Show {Math.min(PAGE, list.length - shown)} more</button></div>
      )}

      {moderating && <MemberActionModal communityId={communityId} member={{ ...moderating, name: nameOf(moderating), avatar: moderating.user?.profileImage || moderating.user?.photoURL }} me={me} onClose={() => setModerating(null)} />}
    </div>
  );
}
