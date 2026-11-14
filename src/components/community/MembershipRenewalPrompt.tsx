import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Bell, CalendarClock, CreditCard, X } from 'lucide-react';
import { memberAccess } from '../../lib/membershipAccess';

const DAY = 86_400_000;
const STORAGE_PREFIX = 'kith.membershipPrompt.';

type Stage = '7d' | '3d' | '1d' | 'expired' | 'grace_end';

function stageFor(expiresAt: string, state: string, now = Date.now()): Stage | null {
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  if (end > now) {
    const days = Math.ceil((end - now) / DAY);
    if (days <= 1) return '1d';
    if (days <= 3) return '3d';
    if (days <= 7) return '7d';
    return null;
  }
  return state === 'grace' ? 'expired' : 'grace_end';
}

function copyFor(stage: Stage, communityName: string, expiresAt: string, nonRenewing: boolean): {
  title: string;
  body: string;
  cta: string;
  tone: 'info' | 'warning';
} {
  const end = new Date(expiresAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  if (stage === 'expired' || stage === 'grace_end') {
    return {
      title: 'Your membership has ended',
      body:
        stage === 'grace_end'
          ? `Access to ${communityName} has been removed. Renew to rejoin the channels.`
          : `Your payment did not go through. Channels are locked — renew before your grace period ends to keep access to ${communityName}.`,
      cta: 'Renew membership',
      tone: 'warning',
    };
  }
  if (nonRenewing) {
    return {
      title: 'Your access is ending soon',
      body: `Your membership to ${communityName} ends on ${end}. Renew to keep your channels and history.`,
      cta: 'Renew membership',
      tone: stage === '1d' ? 'warning' : 'info',
    };
  }
  return {
    title: 'Membership renews soon',
    body: `Your monthly membership to ${communityName} renews on ${end}. Manage billing any time from your receipts page.`,
    cta: 'Manage billing',
    tone: 'info',
  };
}

/**
 * A reminder popup for an expiring or lapsed paid membership. It appears once per stage per billing
 * period; the notification centre keeps a permanent copy written by the nightly job.
 */
export default function MembershipRenewalPrompt({
  communityId,
  communityName,
  member,
  onRenew,
}: {
  communityId: string;
  communityName: string;
  member: any;
  onRenew: () => void;
}) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage | null>(null);

  useEffect(() => {
    const access = memberAccess(member);
    if (access.state === 'staff' || !access.expiresAt) return;

    const computed = stageFor(
      access.expiresAt,
      access.state,
      Date.now(),
    );
    const serverStage = member?.renewalReminder?.stage as Stage | undefined;
    const resolved = computed ?? serverStage ?? null;
    if (!resolved) return;
    if (resolved === 'grace_end' && access.state !== 'expired') return;

    // Once per stage per paid period. A renewal moves `expiresAt`, which opens a new cycle.
    const key = `${STORAGE_PREFIX}${communityId}.${access.expiresAt.slice(0, 10)}.${resolved}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      // Storage can be unavailable in private modes; still show the reminder.
    }
    setStage(resolved);
  }, [member, communityId]);

  const dismiss = () => {
    if (stage) {
      const access = memberAccess(member);
      const key = `${STORAGE_PREFIX}${communityId}.${access.expiresAt?.slice(0, 10) ?? 'unknown'}.${stage}`;
      try {
        localStorage.setItem(key, '1');
      } catch {
        /* ignore */
      }
    }
    setStage(null);
  };

  if (!stage) return null;
  const access = memberAccess(member);
  const copy = copyFor(stage, communityName, access.expiresAt ?? new Date().toISOString(), access.state === 'non-renewing');
  const warning = copy.tone === 'warning';

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[110] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={dismiss} />
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="membership-reminder-title"
          className="relative w-full max-w-sm rounded-2xl border border-foreground/10 bg-background p-6 shadow-2xl"
        >
          <button
            onClick={dismiss}
            aria-label="Dismiss reminder"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-foreground/40 hover:bg-foreground/10 hover:text-foreground"
          >
            <X size={16} />
          </button>

          <div
            className={`grid h-11 w-11 place-items-center rounded-xl ${
              warning ? 'bg-amber-500/12 text-amber-600' : 'bg-primary/12 text-primary'
            }`}
          >
            {warning ? <AlertTriangle size={20} /> : <Bell size={20} />}
          </div>

          <h2 id="membership-reminder-title" className="mt-4 text-lg font-bold">
            {copy.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground/65">{copy.body}</p>

          {access.expiresAt && (
            <p className="mt-3 flex items-center gap-2 text-xs text-foreground/50">
              <CalendarClock size={14} />
              Paid through {new Date(access.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => {
                dismiss();
                if (copy.cta === 'Renew membership') onRenew();
                else navigate('/billing');
              }}
              className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
            >
              {copy.cta}
            </button>
            <button
              onClick={() => {
                dismiss();
                navigate('/billing');
              }}
              className="rounded-full border border-foreground/15 px-4 py-2.5 text-sm font-semibold text-foreground/70 hover:bg-foreground/5"
            >
              <CreditCard size={15} className="mr-1.5 inline" />
              Billing
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
