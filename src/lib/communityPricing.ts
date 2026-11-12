/**
 * Community joining fees.
 *
 * A fee is `{ amount, currency, interval }`, stored on the community as `fee`.
 * - XP one-time fees move XP from the member to the owner in the same Firestore batch that creates
 *   the membership.
 * - USD fees are real money. One-time fees and monthly subscriptions are charged through the shared
 *   payment engine (`community_membership` order kind), and the server grants the membership after
 *   Paystack confirms payment.
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

export const AVAILABLE_CURRENCIES: FeeCurrency[] = ['xp', 'usd'];
export const AVAILABLE_INTERVALS: FeeInterval[] = ['once', 'month'];

export const FEE_LIMITS: Record<FeeCurrency, { min: number; max: number; presets: number[] }> = {
  xp: { min: 5, max: 10_000, presets: [25, 50, 100, 250] },
  usd: { min: 1, max: 999, presets: [5, 10, 20, 50] },
};

/** The community's fee, or null if it's free. */
export function feeOf(community: any): CommunityFee | null {
  const f = community?.fee;
  if (f && Number(f.amount) > 0) {
    return {
      amount: Number(f.amount),
      currency: f.currency === 'usd' ? 'usd' : 'xp',
      interval: f.currency === 'usd' && f.interval === 'month' ? 'month' : 'once',
    };
  }
  if (community?.isPaid && Number(community.price) > 0) {
    return { amount: Number(community.price), currency: 'xp', interval: 'once' };
  }
  return null;
}

/** "50 XP", "$10", "$10/month". */
export function formatFee(fee: CommunityFee): string {
  const amount =
    fee.currency === 'usd'
      ? `$${fee.amount % 1 ? fee.amount.toFixed(2) : fee.amount}`
      : `${fee.amount.toLocaleString()} XP`;
  return fee.interval === 'month' ? `${amount}/month` : amount;
}

/** Fields to write on the community; keeps the legacy `isPaid` / `price` in step for older clients. */
export function feeFields(fee: CommunityFee | null) {
  return fee ? { fee, isPaid: true, price: fee.amount } : { fee: null, isPaid: false, price: 0 };
}

export function feeIsRealMoney(fee: CommunityFee | null | undefined): fee is CommunityFee & { currency: 'usd' } {
  return fee?.currency === 'usd';
}

export function feeIsRecurring(fee: CommunityFee | null | undefined): boolean {
  return fee?.currency === 'usd' && fee.interval === 'month';
}

export function validateFee(fee: CommunityFee): string | null {
  const limits = FEE_LIMITS[fee.currency];
  if (!AVAILABLE_CURRENCIES.includes(fee.currency)) return 'Choose XP or real money.';
  if (!AVAILABLE_INTERVALS.includes(fee.interval)) return 'Choose one-time or monthly billing.';
  if (fee.currency === 'xp' && fee.interval === 'month') return 'XP fees can only be charged once.';
  if (!Number.isFinite(fee.amount) || fee.amount < limits.min) {
    return `The fee must be at least ${formatFee({ ...fee, amount: limits.min })}.`;
  }
  if (fee.amount > limits.max) {
    return `The fee can be at most ${formatFee({ ...fee, amount: limits.max })}.`;
  }
  if (fee.currency === 'xp' && !Number.isInteger(fee.amount)) return 'XP fees must be a whole number.';
  if (fee.currency === 'usd' && !/^\d+(\.\d{1,2})?$/.test(String(fee.amount))) {
    return 'Real-money fees can have at most two decimal places.';
  }
  return null;
}

/** Whether `uid` can cover an XP fee right now. Card fees are paid at checkout instead. */
export async function canAfford(uid: string, fee: CommunityFee): Promise<boolean> {
  if (fee.currency !== 'xp') return false;
  const snap = await getDoc(doc(db, 'users', uid));
  return (Number(snap.data()?.xp) || 0) >= fee.amount;
}

/**
 * Adds an XP fee transfer to a batch that also creates the membership, so paying and joining
 * succeed or fail together. Real-money fees must go through `startCheckout` instead: the server
 * grants membership only after Paystack confirms the payment.
 */
export function addFeePayment(batch: WriteBatch, fee: CommunityFee, payerUid: string, ownerUid: string | undefined) {
  if (fee.currency !== 'xp') {
    throw new Error('Real-money joining fees are paid at checkout, not in this Firestore batch.');
  }
  batch.update(doc(db, 'users', payerUid), { xp: increment(-fee.amount) });
  if (ownerUid && ownerUid !== payerUid) batch.update(doc(db, 'users', ownerUid), { xp: increment(fee.amount) });
}
