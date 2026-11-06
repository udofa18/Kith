import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, LogOut, Mail, Trash2 } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import { auth } from '../../../firebase';
import { Button } from '../../../components/ui/Button';
import ConfirmModal from '../../../components/ConfirmModal';
import { SettingNote, SettingRow, SettingsSection } from '../components/controls';
import type { SectionProps } from './types';

export default function DangerSection({ profile }: SectionProps) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const requestDeletion = () => {
    const email = profile?.email || auth.currentUser?.email || '';
    const uid = auth.currentUser?.uid || '';
    const subject = encodeURIComponent('Kith account deletion request');
    const body = encodeURIComponent(
      `Please delete the Kith account${email ? ` associated with ${email}` : ''}.\n\nAccount ID: ${uid}\n\nI understand this removes my profile, products and memberships and cannot be undone. I have withdrawn any creator balance.`,
    );
    window.location.href = `mailto:support@kith.app?subject=${subject}&body=${body}`;
    setConfirming(false);
    toast.success('Your email app should open with the request');
  };

  const signOutNow = async () => {
    setSigningOut(true);
    try {
      await signOut(auth);
      navigate('/');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Account deletion"
        description="Deleting removes your profile, products, posts and community memberships. This cannot be undone."
        className="border-destructive/35"
      >
        <div className="my-4 flex items-start gap-3 rounded-control border border-destructive/30 bg-destructive/8 p-4">
          <Trash2 size={18} className="mt-0.5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">Requests are reviewed by a person</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Automated deletion is not available yet because earnings, refunds and open orders need to be settled
              first. Send a request and the privacy team will confirm within a few business days.
            </p>
          </div>
        </div>

        <SettingRow
          title="Withdraw your balance first"
          description="Deleting an account does not refund past purchases or pay out an unsettled creator balance."
        >
          <Button variant="secondary" size="sm" onClick={() => navigate('/payouts')}>
            Payout settings
          </Button>
        </SettingRow>
        <SettingRow
          title="Download your data"
          description="Keep a copy of your profile and settings before deleting."
        >
          <Button variant="ghost" size="sm" leftIcon={<Download size={13} />} onClick={() => navigate('/settings?tab=data')}>
            Data & archive
          </Button>
        </SettingRow>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4">
          <p className="text-[11px] text-faint">
            Signed in as {profile?.email || auth.currentUser?.email || 'this account'}.
          </p>
          <Button
            variant="danger"
            leftIcon={<Mail size={14} />}
            onClick={() => setConfirming(true)}
          >
            Request deletion
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Session" description="Signing out ends this browser session. Other devices stay signed in.">
        <SettingRow
          title="Sign out of this device"
          description="You will need to sign in again here. To end other sessions, change your password under Security."
        >
          <Button
            variant="outline"
            size="sm"
            leftIcon={<LogOut size={13} />}
            loading={signingOut}
            onClick={signOutNow}
          >
            Sign out
          </Button>
        </SettingRow>
        <SettingNote tone="warning">
          If you think someone else has access to your account, change your password first, then sign out here.
        </SettingNote>
      </SettingsSection>

      <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
        <p>
          Deactivating instead of deleting? Close your DMs and hide your profile from Privacy &amp; visibility. You
          keep your content and can come back at any time.
        </p>
      </div>

      <ConfirmModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={requestDeletion}
        title="Request account deletion?"
        message="This opens an email to the Kith privacy team with your account ID. Nothing is deleted until they confirm the request with you."
        confirmText="Open email request"
        variant="danger"
      />
    </div>
  );
}
