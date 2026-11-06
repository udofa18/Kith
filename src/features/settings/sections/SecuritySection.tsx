import { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../../../firebase';
import { Button } from '../../../components/ui/Button';
import { Field, Input } from '../../../components/ui/Input';
import { SettingNote, SettingRow, SettingsSection } from '../components/controls';
import type { SectionProps } from './types';

export default function SecuritySection(_props: SectionProps) {
  const user = auth.currentUser;
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const providers =
    user && user.providerData.length > 0
      ? user.providerData.map((provider) => ({ id: provider.providerId, email: provider.email }))
      : user
        ? [{ id: 'password', email: user.email }]
        : [];
  const hasPasswordProvider = providers.some((provider) => provider.id === 'password');

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwords.next.length < 8) return toast.error('Use at least 8 characters for the new password.');
    if (passwords.next !== passwords.confirm) return toast.error("New passwords don't match");

    setSaving(true);
    try {
      if (!user?.email) throw new Error('This account has no password email.');
      const credential = EmailAuthProvider.credential(user.email, passwords.current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwords.next);
      setPasswords({ current: '', next: '', confirm: '' });
      toast.success('Password changed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Password change failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Password"
        description={
          hasPasswordProvider
            ? 'Use a long, unique password you do not reuse elsewhere.'
            : 'You sign in with a provider, so there is no password to change.'
        }
      >
        {hasPasswordProvider ? (
          <form onSubmit={changePassword} className="max-w-md space-y-4 py-5">
            <Field label="Current password">
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={passwords.current}
                onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
              />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={passwords.next}
                onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={passwords.confirm}
                onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
              />
            </Field>
            <Button type="submit" loading={saving} leftIcon={<Lock size={14} />} fullWidth>
              Update password
            </Button>
          </form>
        ) : (
          <div className="py-5">
            <div className="rounded-control border border-border bg-surface-raised p-4 text-sm text-muted-foreground">
              Signed in with {providers.map((provider) => provider.id.replace('.com', '')).join(', ')}.
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Two-factor authentication"
        description="A second step protects your account even if a password leaks."
      >
        <div className="my-4 flex items-start gap-3 rounded-control border border-warning/35 bg-warning/10 p-4">
          <ShieldOff size={18} className="mt-0.5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">Not available yet</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Multi-factor sign-in is on the roadmap. Until then, protect your email account and use a password
              manager.
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Connected providers"
        description="Providers you can use to sign in. Removing one is handled by the provider."
      >
        <div className="space-y-2 py-5">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center gap-3 rounded-control border border-border bg-surface-raised p-3"
            >
              <ShieldCheck size={17} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold capitalize">{provider.id.replace('.com', '')}</p>
                <p className="truncate text-[11px] text-faint">{provider.email || 'Connected'}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-success">Active</span>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Sensitive actions" description="Kith asks you to re-enter your password before changing it.">
        <SettingRow
          title="Re-authentication"
          description="Password and payout changes require a fresh sign-in. This is on by default."
        >
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-success/35 bg-success/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-success">
            <KeyRound size={11} /> On
          </span>
        </SettingRow>
        <SettingNote tone="info">
          New device alerts are always delivered to your account email and cannot be turned off.
        </SettingNote>
      </SettingsSection>
    </div>
  );
}
