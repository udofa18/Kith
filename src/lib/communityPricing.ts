/**
 * Community joining fees.
 *
 * A fee is `{ amount, currency, interval }`, stored on the community as `fee`. Today only XP
 * one-time fees are enabled: the member's XP moves to the community owner when they join (or when
 * their request is approved). Real money is modelled already (`currency: 'usd'`, monthly
 * intervals) so turning it on means: add 'usd' / 'month' to the AVAILABLE_* lists, widen the
 * `fee` check in firestore.rules, and add a `community_membership` kind to api/_lib/payments.ts
 * (price from the community's fee, grant membership in `grantOrder`). The card branch of
 * `addFeePayment` then calls startCheckout('community_membership', communityId).
 *
 * Legacy communities only have `isPaid` + `price`; those prices were always charged in XP.
 */
import { doc, getDoc, increment, type WriteBatch } from 'firebase/firestore';
import { db } from '../firebase';

export type FeeCurrency = 'xp' | 'usd';
export type FeeInterval = 'once' | 'month';

export interface CommunityFee {
  amount: number;
  currency: FeeCurrency;
  interval: FeeInterval;
}

export const AVAILABLE_CURRENCIES: FeeCurrency[] = ['xp'];
export const AVAILABLE_INTERVALS: FeeInterval[] = ['once'];

export const FEE_LIMITS: Record<FeeCurrency, { min: number; max: number; presets: number[] }> = {
  xp: { min: 5, max: 10_000, presets: [25, 50, 100, 250] },
  usd: { min: 1, max: 999, presets: [5, 10, 20, 50] },
};

/** The community's fee, or null if it's free. */
export function feeOf(community: any): CommunityFee | null {
  const f = community?.fee;
  if (f && Number(f.amount) > 0) {
    return { amount: Number(f.amount), currency: f.currency === 'usd' ? 'usd' : 'xp', interval: f.interval === 'month' ? 'month' : 'once' };
  }
  if (community?.isPaid && Number(community.price) > 0) return { amount: Number(community.price), currency: 'xp', interval: 'once' };
  return null;
}

/** "50 XP", "$10", "$10/month". */
export function formatFee(fee: CommunityFee): string {
  const amount = fee.currency === 'usd' ? `$${fee.amount % 1 ? fee.amount.toFixed(2) : fee.amount}` : `${fee.amount.toLocaleString()} XP`;
  return fee.interval === 'month' ? `${amount}/month` : amount;
}

/** Fields to write on the community; keeps the legacy `isPaid` / `price` in step for older clients. */
export function feeFields(fee: CommunityFee | null) {
  return fee ? { fee, isPaid: true, price: fee.amount } : { fee: null, isPaid: false, price: 0 };
}

export function validateFee(fee: CommunityFee): string | null {
  const { min, max } = FEE_LIMITS[fee.currency];
  if (!AVAILABLE_CURRENCIES.includes(fee.currency)) return 'Card payments are coming soon.';
  if (!Number.isFinite(fee.amount) || fee.amount < min) return `The fee must be at least ${formatFee({ ...fee, amount: min })}.`;
  if (fee.amount > max) return `The fee can be at most ${formatFee({ ...fee, amount: max })}.`;
  return null;
}

/** Whether `uid` can cover the fee right now. */
export async function canAfford(uid: string, fee: CommunityFee): Promise<boolean> {
  if (fee.currency !== 'xp') return false;
  const snap = await getDoc(doc(db, 'users', uid));
  return (Number(snap.data()?.xp) || 0) >= fee.amount;
}

/**
 * Adds the fee transfer to a batch that also creates the membership, so paying and joining
 * succeed or fail together.
 */
export function addFeePayment(batch: WriteBatch, fee: CommunityFee, payerUid: string, ownerUid: string | undefined) {
  if (fee.currency !== 'xp') throw new Error('Card payments are coming soon.');
  batch.update(doc(db, 'users', payerUid), { xp: increment(-fee.amount) });
  if (ownerUid && ownerUid !== payerUid) batch.update(doc(db, 'users', ownerUid), { xp: increment(fee.amount) });
}
