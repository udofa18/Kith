import { collection, doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { getSupabase } from '../supabase';
import { shouldWriteToFirestore, shouldWriteToSupabase } from './database-config';

/**
 * XP-only live gifts.
 *
 * A gift is a single debit for the sender: the recipient receives most of it
 * and, when the recipient is not the host, the host earns a 20% cut of the same
 * amount. The split lives in `live_gift_xp` on Supabase so it posts atomically;
 * the Firestore path mirrors it in one transaction.
 */

// Firestore's xpTransactions rule caps one ledger entry at 20 XP, so the
// catalog stays inside that limit even though live_gift_xp accepts up to 100.
export const MAX_GIFT_XP = 20;
export const HOST_SHARE_RATE = 0.2;
const MIN_HOST_SHARE_XP = 5;

export interface LiveGift {
  id: string;
  emoji: string;
  name: string;
  cost: number;
}

export const LIVE_GIFTS: LiveGift[] = [
  { id: 'rose', emoji: '🌹', name: 'Rose', cost: 5 },
  { id: 'heart', emoji: '💜', name: 'Heart', cost: 6 },
  { id: 'clap', emoji: '👏', name: 'Applause', cost: 8 },
  { id: 'fire', emoji: '🔥', name: 'On fire', cost: 10 },
  { id: 'star', emoji: '⭐', name: 'Star', cost: 12 },
  { id: 'coffee', emoji: '☕', name: 'Coffee', cost: 15 },
  { id: 'gift', emoji: '🎁', name: 'Gift box', cost: 18 },
  { id: 'trophy', emoji: '🏆', name: 'Trophy', cost: 20 },
];

/** The host's cut of a gift, or 0 when there is no separate host to pay. */
export function hostShareFor(amount: number, hostId?: string | null, senderId?: string, recipientId?: string) {
  if (!hostId || hostId === senderId || hostId === recipientId) return 0;
  if (amount < MIN_HOST_SHARE_XP) return 0;
  return Math.max(1, Math.floor(amount * HOST_SHARE_RATE));
}

export interface SendLiveGiftInput {
  senderId: string;
  recipientId: string;
  hostId?: string | null;
  amount: number;
  eventId?: string;
}

export interface SendLiveGiftResult {
  amount: number;
  recipientNet: number;
  hostShare: number;
}

/** Broadcast payload shared by the sender and everyone receiving the gift. */
export interface LiveGiftAnnouncement {
  emoji: string;
  giftName: string;
  amount: number;
  recipientName: string;
  recipientIdentity: string;
  senderName: string;
  senderPhoto: string;
}

function validate(input: SendLiveGiftInput) {
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > MAX_GIFT_XP) {
    throw new Error(`Gifts must be between 1 and ${MAX_GIFT_XP} XP`);
  }
  if (!input.senderId) throw new Error('You need to be signed in to send a gift');
  if (input.senderId === input.recipientId) throw new Error("You can't gift XP to yourself");
  if (!input.recipientId) throw new Error('Choose someone to gift');
}

async function giftViaFirestore(input: SendLiveGiftInput): Promise<SendLiveGiftResult> {
  return runTransaction(db, async (transaction) => {
    const senderRef = doc(db, 'users', input.senderId);
    const receiverRef = doc(db, 'users', input.recipientId);
    const hostRef =
      input.hostId && input.hostId !== input.recipientId ? doc(db, 'users', input.hostId) : null;

    const senderSnap = await transaction.get(senderRef);
    const receiverSnap = await transaction.get(receiverRef);
    const hostSnap = hostRef ? await transaction.get(hostRef) : null;

    if (!senderSnap.exists()) throw new Error('Your profile could not be loaded');
    if (!receiverSnap.exists()) throw new Error('Recipient not found');

    const sender = senderSnap.data();
    const now = new Date();
    const lastReset = sender.lastGiftingReset ? new Date(sender.lastGiftingReset) : now;
    let dailyRemaining = (sender.dailyGiftingRemaining as number | undefined) ?? 100;
    if (now.toDateString() !== lastReset.toDateString()) dailyRemaining = 100;

    if (dailyRemaining < input.amount) {
      throw new Error(`Daily limit reached. ${dailyRemaining} XP remaining`);
    }
    if (((sender.xp as number) || 0) < input.amount) {
      throw new Error('Insufficient XP balance');
    }

    // Only pay the host when their profile actually exists; otherwise the whole
    // gift goes to the recipient instead of vanishing into a missing document.
    const hostMissing = !!input.hostId && input.hostId !== input.recipientId && !hostSnap?.exists();
    const hostShare = hostMissing
      ? 0
      : hostShareFor(input.amount, input.hostId, input.senderId, input.recipientId);
    const recipientNet = input.amount - hostShare;

    transaction.update(senderRef, {
      xp: ((sender.xp as number) || 0) - input.amount,
      dailyGiftingRemaining: dailyRemaining - input.amount,
      lastGiftingReset: now.toISOString(),
    });

    transaction.update(receiverRef, {
      xp: ((receiverSnap.data().xp as number) || 0) + recipientNet,
    });

    const timestamp = now.toISOString();

    if (hostShare > 0 && hostRef) {
      transaction.update(hostRef, {
        xp: ((hostSnap?.data().xp as number) || 0) + hostShare,
      });
      transaction.set(doc(collection(db, 'xpTransactions')), {
        senderId: input.senderId,
        receiverId: input.hostId,
        amount: hostShare,
        kind: 'live_gift_host_bonus',
        eventId: input.eventId || null,
        timestamp,
      });
    }

    transaction.set(doc(collection(db, 'xpTransactions')), {
      senderId: input.senderId,
      receiverId: input.recipientId,
      amount: recipientNet,
      kind: 'live_gift',
      eventId: input.eventId || null,
      timestamp,
    });

    return { amount: input.amount, recipientNet, hostShare };
  });
}

function isMissingFunction(error: { code?: string; message?: string }) {
  return (
    error.code === 'PGRST202' ||
    /could not find the function|schema cache/i.test(error.message || '')
  );
}

async function giftViaSupabase(input: SendLiveGiftInput): Promise<SendLiveGiftResult> {
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('live_gift_xp', {
    p_receiver_id: input.recipientId,
    p_amount: input.amount,
    p_host_id: input.hostId ?? undefined,
  });

  if (!error) {
    const result = (data || {}) as { recipientNet?: number; hostShare?: number };
    return {
      amount: input.amount,
      recipientNet: result.recipientNet ?? input.amount,
      hostShare: result.hostShare ?? 0,
    };
  }

  // Older deployments may not have the atomic function yet. Fall back to two
  // validated `gift_xp` calls so gifting still works after a partial rollout.
  if (!isMissingFunction(error)) throw new Error(error.message);

  const hostShare = hostShareFor(input.amount, input.hostId, input.senderId, input.recipientId);
  const recipientNet = input.amount - hostShare;

  const primary = await supabase.rpc('gift_xp', {
    p_receiver_id: input.recipientId,
    p_amount: recipientNet,
  });
  if (primary.error) throw new Error(primary.error.message);

  if (hostShare > 0 && input.hostId) {
    const bonus = await supabase.rpc('gift_xp', {
      p_receiver_id: input.hostId,
      p_amount: hostShare,
    });
    if (bonus.error) {
      // The gift itself landed; do not fail the sender because the host bonus
      // could not post.
      console.warn('Live gift host bonus failed', bonus.error.message);
      return { amount: input.amount, recipientNet, hostShare: 0 };
    }
  }

  return { amount: input.amount, recipientNet, hostShare };
}

export async function sendLiveGift(input: SendLiveGiftInput): Promise<SendLiveGiftResult> {
  validate(input);

  const writeFs = shouldWriteToFirestore();
  const writeSb = shouldWriteToSupabase();

  if (writeFs && writeSb) {
    // Firestore is the source of truth during the migration, and the Supabase
    // function is independently validated. Run both and surface the first
    // failure rather than silently dropping one side.
    const [firestore] = await Promise.all([
      giftViaFirestore(input),
      giftViaSupabase(input),
    ]);
    // Firestore is the source of truth during the migration; Supabase is the
    // mirror that the server-side function validates independently.
    return firestore;
  }

  if (writeSb) return giftViaSupabase(input);
  return giftViaFirestore(input);
}
