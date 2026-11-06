import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { signOut } from 'firebase/auth';
import { auth } from '../../../firebase';
import { Button } from '../../../components/ui/Button';
import { Field, Select } from '../../../components/ui/Input';
import { SettingNote, SettingRow, SettingsSection, Switch } from '../components/controls';
import type { SectionProps } from './types';

const LANGUAGES = [
  { value: 'en', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'pt', label: 'Portuguese' },
];

export default function AccountSection({ settings, update, profile, updateProfile }: SectionProps) {
  const navigate = useNavigate();
  const [language, setLanguage] = useState(profile?.language || 'en');
  const [accountType, setAccountType] = useState(profile?.accountType || 'personal');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLanguage(profile?.language || 'en');
    setAccountType(profile?.accountType || 'personal');
  }, [profile?.language, profile?.accountType]);

  const user = auth.currentUser;
  const verified = Boolean(user?.emailVerified);

  const saveAccount = async () => {
    setSaving(true);
    const ok = await updateProfile({ language, accountType }, { message: 'Account updated' });
    setSaving(false);
    if (ok) toast.success('Account updated');
  };

  const chooseAccountType = async (value: string) => {
    if (value === accountType) return;
    const previous = accountType;
    setAccountType(value);
    const ok = await updateProfile({ accountType: value }, { silent: true });
    if (ok) toast.success(value === 'brand' ? 'Brand account enabled' : 'Personal account enabled');
    else setAccountType(previous);
  };

  const signOutNow = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <div className="space-y-5">
      <SettingsSection title="Sign-in details" description="The address and provider that identify this account.">
        <div className="flex flex-wrap items-center gap-4 py-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-primary/12 text-primary">
            <Mail size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Email address</p>
            <p className="truncate text-sm font-semibold text-foreground">{user?.email || 'Not set'}</p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
              verified
                ? 'border-success/40 bg-success/10 text-success'
                : 'border-warning/40 bg-warning/10 text-warning'
            }`}
          >
            <ShieldCheck size={12} />
            {verified ? 'Verified' : 'Unverified'}
          </span>
        </div>
        <SettingNote tone="info">
          Email changes are handled by your sign-in provider. Sign in with a different provider to use another address.
        </SettingNote>
      </SettingsSection>

      <SettingsSection
        title="Language and region"
        description="Kith uses this for dates, times and the language of product copy."
      >
        <div className="grid gap-4 py-5 sm:grid-cols-2">
          <Field label="Language">
            <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {LANGUAGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Timezone" hint="Detected from your location and updated automatically.">
            <div className="flex h-11 items-center rounded-control border border-border bg-muted/40 px-4 text-sm text-muted-foreground">
              {profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
            </div>
          </Field>
        </div>
        <div className="flex items-center justify-between border-t border-border py-4">
          <p className="text-[11px] text-faint">Saved to this account, not just this device.</p>
          <Button variant="secondary" onClick={saveAccount} loading={saving} leftIcon={<Check size={14} />}>
            Save changes
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Account type" description="Personal accounts and brands get different profile defaults.">
        <div className="grid gap-3 py-5 sm:grid-cols-2">
          {[
            {
              value: 'personal',
              title: 'Personal',
              body: 'You, your work and the communities you join.',
            },
            {
              value: 'brand',
              title: 'Brand',
              body: 'A studio, product or team. Storefront and announcements are surfaced first.',
            },
          ].map((option) => {
            const active = accountType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseAccountType(option.value)}
                className={`rounded-control border p-4 text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary/8'
                    : 'border-border bg-surface-raised hover:border-border-strong'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{option.title}</p>
                  {active && <Check size={15} className="text-primary" />}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{option.body}</p>
              </button>
            );
          })}
        </div>
        <SettingRow
          title="Discoverable by email"
          description="Let people who already know your email find your profile. Never shows your address."
        >
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings?tab=privacy')} rightIcon={<ArrowRight size={13} />}>
            In Privacy
          </Button>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Onboarding and setup" description="Review the interests and topics that shape your feed.">
        <SettingRow
          title="Profile setup"
          description={
            profile?.onboardingCompleted
              ? 'Your profile, interests and feed preferences are set up.'
              : 'Finish setup so the feed and marketplace fit you.'
          }
        >
          <Button
            variant={profile?.onboardingCompleted ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => navigate('/onboarding')}
            rightIcon={<ArrowRight size={13} />}
          >
            {profile?.onboardingCompleted ? 'Review setup' : 'Finish setup'}
          </Button>
        </SettingRow>
        <SettingRow
          title="Anonymous usage data"
          description="Share non-identifying product analytics. You can turn this off without losing features."
        >
          <Switch
            checked={settings.data.personalization}
            onChange={(value) =>
              update((current) => ({ ...current, data: { ...current.data, personalization: value } }))
            }
            label="Anonymous usage data"
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Session" description="Signing out keeps your settings and content safe.">
        <SettingRow title="Sign out of this device" description="You can sign back in at any time.">
          <Button variant="secondary" onClick={signOutNow} leftIcon={<LogOut size={14} />}>
            Sign out
          </Button>
        </SettingRow>
      </SettingsSection>
    </div>
  );
}
