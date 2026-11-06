import { useEffect, useMemo, type ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import SettingsShell from '../features/settings/components/SettingsShell';
import { getSection, type SectionId } from '../features/settings/navigation';
import { useSettings } from '../features/settings/useSettings';
import AccountSection from '../features/settings/sections/AccountSection';
import ActivitySection from '../features/settings/sections/ActivitySection';
import AppearanceSection from '../features/settings/sections/AppearanceSection';
import AudienceSection from '../features/settings/sections/AudienceSection';
import BillingSection from '../features/settings/sections/BillingSection';
import CommerceSection from '../features/settings/sections/CommerceSection';
import CommunitiesSection from '../features/settings/sections/CommunitiesSection';
import DangerSection from '../features/settings/sections/DangerSection';
import DataSection from '../features/settings/sections/DataSection';
import EventsSection from '../features/settings/sections/EventsSection';
import FeedSection from '../features/settings/sections/FeedSection';
import MessagingSection from '../features/settings/sections/MessagingSection';
import NotificationsSection from '../features/settings/sections/NotificationsSection';
import PrivacySection from '../features/settings/sections/PrivacySection';
import ProfileSection from '../features/settings/sections/ProfileSection';
import RestrictedSection from '../features/settings/sections/RestrictedSection';
import RewardsSection from '../features/settings/sections/RewardsSection';
import SecuritySection from '../features/settings/sections/SecuritySection';
import type { SectionProps } from '../features/settings/sections/types';

const SECTION_COMPONENTS: Record<SectionId, ComponentType<SectionProps>> = {
  profile: ProfileSection,
  account: AccountSection,
  security: SecuritySection,
  privacy: PrivacySection,
  audience: AudienceSection,
  messaging: MessagingSection,
  activity: ActivitySection,
  restricted: RestrictedSection,
  notifications: NotificationsSection,
  communities: CommunitiesSection,
  events: EventsSection,
  commerce: CommerceSection,
  rewards: RewardsSection,
  appearance: AppearanceSection,
  feed: FeedSection,
  billing: BillingSection,
  data: DataSection,
  danger: DangerSection,
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    profile,
    settings,
    loading,
    error,
    saveState,
    updateSettings,
    updateProfile,
  } = useSettings();

  const requestedTab = searchParams.get('tab');
  const current = useMemo<SectionId>(() => getSection(requestedTab || 'profile').id, [requestedTab]);

  useEffect(() => {
    if (!auth.currentUser) navigate('/login', { replace: true });
  }, [navigate]);

  const handleNavigate = (id: SectionId) => {
    if (id === 'profile') {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ tab: id }, { replace: true });
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  const Section = SECTION_COMPONENTS[current];
  const sectionProps: SectionProps = {
    settings,
    update: updateSettings,
    profile,
    updateProfile,
    onNavigate: (id) => handleNavigate(getSection(id).id),
  };

  return (
    <SettingsShell
      current={current}
      onNavigate={handleNavigate}
      profile={profile}
      saveState={saveState}
      onSignOut={handleSignOut}
    >
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-card border border-destructive/30 bg-destructive/8 p-4 text-xs leading-relaxed text-destructive"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading && !profile ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <Loader2 size={22} className="animate-spin text-primary" />
          Loading your settings…
        </div>
      ) : (
        <Section {...sectionProps} />
      )}
    </SettingsShell>
  );
}
