import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Check, Gift, Loader2, X } from 'lucide-react';
import { useParticipants } from '@livekit/components-react';
import { auth } from '../../firebase';
import { usersRepository } from '../../services/db/usersRepository';
import { createNotification } from '../../lib/notifications';
import {
  LIVE_GIFTS,
  hostShareFor,
  sendLiveGift,
  type LiveGift,
  type LiveGiftAnnouncement,
} from '../../lib/liveGifts';

interface Recipient {
  identity: string;
  name: string;
  photo: string;
  isHost: boolean;
}

interface LiveGiftSheetProps {
  isOpen: boolean;
  onClose: () => void;
  hostId?: string;
  eventId?: string;
  onSent: (announcement: LiveGiftAnnouncement) => void;
}

function metadataOf(metadata?: string): Record<string, any> {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

/**
 * XP-only gift picker for live rooms.
 *
 * The sender pays the gift's cost once. The selected recipient receives the
 * gift minus the host's 20% cut; when the recipient is the host they receive the
 * full amount. Guests without an account are not listed because they cannot
 * receive XP.
 */
export default function LiveGiftSheet({ isOpen, onClose, hostId, eventId, onSent }: LiveGiftSheetProps) {
  const participants = useParticipants();
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const [selectedGift, setSelectedGift] = useState<LiveGift>(LIVE_GIFTS[0]);
  const [balance, setBalance] = useState<number | null>(null);
  const [dailyRemaining, setDailyRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const sentTimer = useRef<number | null>(null);

  const recipients = useMemo<Recipient[]>(() => {
    const uid = auth.currentUser?.uid;
    return participants
      .filter(participant => participant.identity !== uid)
      // Guest viewers use a `guest_` identity and have no users row, so a gift
      // to them could never be credited.
      .filter(participant => !participant.identity.startsWith('guest_'))
      .map(participant => {
        const metadata = metadataOf(participant.metadata);
        return {
          identity: participant.identity,
          name: participant.name || metadata.displayName || 'Someone',
          photo: metadata.photoURL || metadata.avatar || '',
          isHost: participant.identity === hostId,
        };
      })
      .sort((a, b) => Number(b.isHost) - Number(a.isHost));
  }, [participants, hostId]);

  const selected = recipients.find(item => item.identity === selectedIdentity) || recipients[0];

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSentMessage('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setBalance(0);
      return;
    }
    let cancelled = false;
    usersRepository
      .getById(uid)
      .then(data => {
        if (cancelled || !data) return;
        setBalance((data.xp as number) ?? 0);
        setDailyRemaining((data.dailyGiftingRemaining as number) ?? 100);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(
    () => () => {
      if (sentTimer.current) window.clearTimeout(sentTimer.current);
    },
    [],
  );

  const hostShare = selected
    ? hostShareFor(selectedGift.cost, hostId, auth.currentUser?.uid, selected.identity)
    : 0;
  const recipientNet = selectedGift.cost - hostShare;
  const insufficient = balance !== null && balance < selectedGift.cost;
  const capped = dailyRemaining !== null && dailyRemaining < selectedGift.cost;
  const canSend = !!selected && !loading && !insufficient && !capped;

  const sender = useMemo(() => {
    const local = participants.find(participant => participant.identity === auth.currentUser?.uid);
    const metadata = metadataOf(local?.metadata);
    return {
      name: local?.name || auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Someone',
      photo: metadata.photoURL || metadata.avatar || auth.currentUser?.photoURL || '',
    };
  }, [participants]);

  const handleSend = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !selected) {
      setError('Choose someone to gift');
      return;
    }
    if (insufficient) {
      setError('You do not have enough XP for this gift');
      return;
    }
    if (capped) {
      setError('You have reached your daily gifting limit');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await sendLiveGift({
        senderId: uid,
        recipientId: selected.identity,
        hostId,
        amount: selectedGift.cost,
        eventId,
      });

      setBalance(prev => (prev === null ? prev : prev - result.amount));
      setDailyRemaining(prev => (prev === null ? prev : prev - result.amount));

      onSent({
        emoji: selectedGift.emoji,
        giftName: selectedGift.name,
        amount: result.amount,
        recipientName: selected.name,
        recipientIdentity: selected.identity,
        senderName: sender.name,
        senderPhoto: sender.photo,
      });

      createNotification({
        recipientId: selected.identity,
        senderId: uid,
        senderName: sender.name,
        senderPhoto: sender.photo,
        type: 'xp_gift',
        content: `sent you a ${selectedGift.emoji} ${selectedGift.name} in the live room (+${result.recipientNet} XP)`,
        relatedId: eventId,
      }).catch(() => undefined);

      setSentMessage(`Sent ${selectedGift.emoji} to ${selected.name}`);
      if (sentTimer.current) window.clearTimeout(sentTimer.current);
      sentTimer.current = window.setTimeout(() => setSentMessage(''), 2600);
    } catch (err: any) {
      setError(err?.message || 'Could not send this gift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#0c0a10] shadow-2xl sm:max-w-lg sm:rounded-[28px]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 pb-4 pt-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
                  <Gift size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Send XP</h2>
                  <p className="text-[11px] text-white/40">
                    {balance === null ? 'Loading balance…' : `${balance} XP available`}
                    {dailyRemaining !== null ? ` · ${dailyRemaining} XP daily limit left` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-xl p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Close gifts"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                Send to
              </p>
              {recipients.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/45">
                  No one to gift yet. Guests without an account cannot receive XP.
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {recipients.map(recipient => {
                    const active = selected?.identity === recipient.identity;
                    return (
                      <button
                        key={recipient.identity}
                        onClick={() => {
                          setSelectedIdentity(recipient.identity);
                          setError('');
                        }}
                        className={`flex w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-2 py-2.5 transition-all ${
                          active
                            ? 'border-amber-400/60 bg-amber-400/10'
                            : 'border-white/[0.07] bg-white/[0.03] hover:border-white/20'
                        }`}
                      >
                        <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-white/10 text-xs font-bold text-white/70">
                          {recipient.photo ? (
                            <img
                              src={recipient.photo}
                              alt=""
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            recipient.name.slice(0, 1).toUpperCase()
                          )}
                          {recipient.isHost && (
                            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-amber-400 px-1 py-px text-[8px] font-black uppercase text-black">
                              Host
                            </span>
                          )}
                        </span>
                        <span className={`w-full truncate text-center text-[11px] font-semibold ${active ? 'text-amber-200' : 'text-white/65'}`}>
                          {recipient.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                Gift
              </p>
              <div className="grid grid-cols-3 gap-2">
                {LIVE_GIFTS.map(gift => {
                  const active = selectedGift.id === gift.id;
                  return (
                    <button
                      key={gift.id}
                      onClick={() => {
                        setSelectedGift(gift);
                        setError('');
                      }}
                      className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 transition-all ${
                        active
                          ? 'border-amber-400/60 bg-amber-400/10 shadow-[0_0_20px_-8px_rgba(251,191,36,0.6)]'
                          : 'border-white/[0.07] bg-white/[0.03] hover:border-white/20'
                      }`}
                    >
                      <span className="text-2xl leading-none">{gift.emoji}</span>
                      <span className={`text-[11px] font-semibold ${active ? 'text-amber-200' : 'text-white/60'}`}>
                        {gift.name}
                      </span>
                      <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-white/45">
                        {gift.cost} XP
                      </span>
                    </button>
                  );
                })}
              </div>

              {selected && (
                <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/45">You pay</span>
                    <span className="font-bold text-white">{selectedGift.cost} XP</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-white/45">{selected.name} receives</span>
                    <span className="font-bold text-emerald-300">{recipientNet} XP</span>
                  </div>
                  {hostShare > 0 && (
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-white/45">Host earns</span>
                      <span className="font-bold text-amber-300">+{hostShare} XP</span>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-300">
                  <AlertCircle size={15} className="mt-px shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {sentMessage && !error && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-200">
                  <Check size={15} className="shrink-0" />
                  <span>{sentMessage}</span>
                </div>
              )}
            </div>

            <div className="border-t border-white/[0.06] bg-black/25 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition-all hover:from-amber-300 hover:to-orange-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    Send {selectedGift.emoji} {selectedGift.name} · {selectedGift.cost} XP
                  </>
                )}
              </button>
              {insufficient && (
                <p className="mt-2 text-center text-[11px] text-red-300/80">
                  You need {selectedGift.cost - (balance || 0)} more XP for this gift.
                </p>
              )}
              {!insufficient && capped && (
                <p className="mt-2 text-center text-[11px] text-amber-300/80">
                  Daily gifting limit reached. Try again tomorrow.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
