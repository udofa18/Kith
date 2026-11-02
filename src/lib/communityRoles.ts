import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, type WriteBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';

/**
 * Role hierarchy. Lower number = higher rank. Owners and admins sit above every custom role;
 * custom roles rank by their position in the roles list (`order`). The same maths lives in
 * firestore.rules (`rankOf`), which is what actually enforces it.
 */
export const RANK_OWNER = -2;
export const RANK_ADMIN = -1;
export const RANK_NONE = 9999;

export type RoleLike = { id: string; order?: number; permissions?: string[] };
export type MemberLike = { id?: string; role?: string; customRoles?: string[]; permissions?: string[]; rank?: number };

export function rankOfMember(m?: MemberLike | null): number {
  if (!m) return RANK_NONE;
  if (m.role === 'owner') return RANK_OWNER;
  if (m.role === 'admin') return RANK_ADMIN;
  return typeof m.rank === 'number' ? m.rank : RANK_NONE;
}

/** The denormalised role fields stored on a member doc, derived from the roles they hold. */
export function memberAccess(customRoles: string[] = [], roles: RoleLike[]) {
  const held = roles.filter(r => customRoles.includes(r.id));
  const permissions = Array.from(new Set(held.flatMap(r => r.permissions || [])));
  const rank = held.length ? Math.min(...held.map(r => r.order ?? RANK_NONE)) : RANK_NONE;
  return { customRoles, permissions, rank };
}

/** True when member docs need rewriting to match what their roles now say. */
export function accessDiffers(m: MemberLike, next: ReturnType<typeof memberAccess>) {
  const same = (a: string[] = [], b: string[] = []) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return !same(m.permissions, next.permissions) || !same(m.customRoles, next.customRoles) || rankOfMember({ ...m, role: 'member' }) !== next.rank;
}

export interface Membership {
  loading: boolean;
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  rank: number;
  permissions: string[];
  can: (permission: string) => boolean;
  outranks: (target?: MemberLike | null) => boolean;
  /** Admins and owners may manage any role; others only roles ranked below them. */
  canManageRole: (role: { order?: number }) => boolean;
}

/** The signed-in user's standing in a community, for deciding which controls to show. */
export function useMembership(communityId: string): Membership {
  const uid = auth.currentUser?.uid;
  const [member, setMember] = useState<MemberLike | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !communityId) { setLoading(false); return; }
    return onSnapshot(doc(db, 'communities', communityId, 'members', uid), snap => {
      setMember(snap.exists() ? (snap.data() as MemberLike) : null);
      setLoading(false);
    }, () => setLoading(false));
  }, [communityId, uid]);

  return useMemo(() => {
    const isOwner = member?.role === 'owner';
    const isAdmin = isOwner || member?.role === 'admin';
    const rank = rankOfMember(member);
    const permissions = member?.permissions || [];
    return {
      loading,
      isMember: !!member,
      isOwner,
      isAdmin,
      rank,
      permissions,
      can: p => isAdmin || permissions.includes(p),
      outranks: target => !!target && !!member && target.id !== uid && rank < rankOfMember(target),
      canManageRole: role => isAdmin || (permissions.includes('manage_roles') && (role.order ?? RANK_NONE) > rank),
    };
  }, [member, loading, uid]);
}

export type AuditEntry = {
  action: string;
  targetId?: string;
  targetName?: string;
  details?: string;
};

/** Queue an audit entry on a batch so it commits atomically with the action it records. */
export function queueAudit(batch: WriteBatch, communityId: string, entry: AuditEntry) {
  const user = auth.currentUser;
  const data: Record<string, unknown> = {
    action: entry.action,
    actorId: user?.uid,
    actorName: user?.displayName || 'Someone',
    createdAt: serverTimestamp(),
  };
  if (entry.targetId) data.targetId = entry.targetId;
  if (entry.targetName) data.targetName = entry.targetName;
  if (entry.details) data.details = entry.details.slice(0, 500);
  batch.set(doc(collection(db, 'communities', communityId, 'auditLog')), data);
}

export const AUDIT_LABELS: Record<string, { label: string; group: 'roles' | 'members' | 'channels' | 'community' }> = {
  'role.create': { label: 'Created role', group: 'roles' },
  'role.update': { label: 'Edited role', group: 'roles' },
  'role.delete': { label: 'Deleted role', group: 'roles' },
  'role.reorder': { label: 'Reordered roles', group: 'roles' },
  'member.roles': { label: 'Changed member roles', group: 'members' },
  'member.role': { label: 'Changed member rank', group: 'members' },
  'member.timeout': { label: 'Timed out member', group: 'members' },
  'member.timeout_clear': { label: 'Cleared timeout', group: 'members' },
  'member.kick': { label: 'Removed member', group: 'members' },
  'member.ban': { label: 'Banned member', group: 'members' },
  'member.unban': { label: 'Unbanned member', group: 'members' },
  'channel.create': { label: 'Created channel', group: 'channels' },
  'channel.update': { label: 'Edited channel', group: 'channels' },
  'channel.delete': { label: 'Deleted channel', group: 'channels' },
  'channel.clear': { label: 'Cleared channel messages', group: 'channels' },
  'channel.access': { label: 'Changed channel access', group: 'channels' },
  'category.create': { label: 'Created category', group: 'channels' },
  'category.update': { label: 'Renamed category', group: 'channels' },
  'category.delete': { label: 'Deleted category', group: 'channels' },
  'community.profile': { label: 'Edited community profile', group: 'community' },
  'community.fee': { label: 'Changed joining fee', group: 'community' },
  'invite.create': { label: 'Created invite link', group: 'community' },
  'invite.revoke': { label: 'Revoked invite link', group: 'community' },
  'report.resolve': { label: 'Resolved report', group: 'members' },
  'report.dismiss': { label: 'Dismissed report', group: 'members' },
  'community.transfer': { label: 'Transferred ownership', group: 'community' },
};
