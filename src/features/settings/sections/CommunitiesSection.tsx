import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, Users } from 'lucide-react';
import { auth } from '../../../firebase';
import { fetchSection } from '../../profile/api';
import { Select } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { SettingNote, SettingRow, SettingsSection, Subheading, Switch } from '../components/controls';
import type { SectionProps } from './types';

const communityAudienceOptions = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'members', label: 'Members only' },
  { value: 'me', label: 'Only me' },
] as const;

const inviteOptions = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'friends', label: 'People I follow' },
  { value: 'admins', label: 'Community admins' },
  { value: 'nobody', label: 'Nobody' },
] as const;

const notificationLevels = [
  { value: 'all', label: 'Everything' },
  { value: 'mentions', label: 'Mentions and replies' },
  { value: 'announcements', label: 'Announcements only' },
  { value: 'none', label: 'Nothing' },
] as const;

export default function CommunitiesSection({ settings, update, onNavigate }: SectionProps) {
  const navigate = useNavigate();
  const [communityList, setCommunityList] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setError(null);
    fetchSection('communities', uid, true)
      .then((rows) => {
        if (!cancelled) setCommunityList(rows);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message || 'Could not load communities');
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const setCommunitySettings = (patch: Partial<typeof settings.communities>) =>
    update((current) => ({ ...current, communities: { ...current.communities, ...patch } }));

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Membership privacy"
        description="Communities are semi-public by design. These settings control what appears on your profile."
      >
        <SettingRow
          title="Show communities on my profile"
          description="Your role and community cards follow this audience."
          stacked
        >
          <Select
            aria-label="Show communities"
            value={settings.communities.showMembership}
            onChange={(event) => setCommunitySettings({ showMembership: event.target.value as any })}
          >
            {communityAudienceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Show my role badge"
          description="Owner, admin and moderator badges on your profile and community posts."
        >
          <Switch
            checked={settings.communities.showRole}
            onChange={(value) => setCommunitySettings({ showRole: value })}
            label="Show role badge"
          />
        </SettingRow>

        <SettingRow
          title="Community leaderboards"
          description="Include my activity in community XP leaderboards."
        >
          <Switch
            checked={settings.communities.showInLeaderboard}
            onChange={(value) => setCommunitySettings({ showInLeaderboard: value })}
            label="Community leaderboards"
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Invites and messages" description="How community admins and members can reach you.">
        <SettingRow title="Who can invite me" stacked>
          <Select
            aria-label="Who can invite me to communities"
            value={settings.communities.invitePolicy}
            onChange={(event) => setCommunitySettings({ invitePolicy: event.target.value as any })}
          >
            {inviteOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow
          title="Allow community admins to DM me"
          description="Admins can always send one official notice. This controls regular messages."
        >
          <Switch
            checked={settings.communities.allowAdminDMs}
            onChange={(value) => setCommunitySettings({ allowAdminDMs: value })}
            label="Allow community admin DMs"
          />
        </SettingRow>
        <SettingRow
          title="Suggest communities"
          description="Show recommendations based on your interests and activity."
        >
          <Switch
            checked={settings.communities.suggestCommunities}
            onChange={(value) => setCommunitySettings({ suggestCommunities: value })}
            label="Suggest communities"
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Notification defaults" description="Applies to communities you join from now on.">
        <Subheading>Default level</Subheading>
        <SettingRow
          title="When I join a community"
          description="You can change the level for each community in its settings."
          stacked
        >
          <Select
            aria-label="Default community notification level"
            value={settings.communities.defaultLevel}
            onChange={(event) => setCommunitySettings({ defaultLevel: event.target.value as any })}
          >
            {notificationLevels.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingNote tone="info">
          Mentions and direct replies always reach you even when a community is set to announcements only.
        </SettingNote>
      </SettingsSection>

      <SettingsSection
        title="Your communities"
        description="Roles and quick links. Community-specific settings stay with the community."
        action={
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ArrowRight size={13} />}
            onClick={() => navigate('/communities')}
          >
            Discover
          </Button>
        }
      >
        {error ? (
          <p className="py-6 text-sm text-destructive">{error}</p>
        ) : communityList === null ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 size={15} className="animate-spin" /> Loading communities…
          </div>
        ) : communityList.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">
            You have not joined a community yet. Communities are where creators share work in progress and run
            events.
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {communityList.map((community) => (
              <button
                key={community.id}
                type="button"
                onClick={() => navigate(`/community/${community.id}`)}
                className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface-raised/40"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-control bg-muted">
                  {community.imageUrl || community.coverImage ? (
                    <img
                      src={community.imageUrl || community.coverImage}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-muted-foreground">
                      <Users size={17} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{community.name || community.id}</p>
                  <p className="text-[11px] capitalize text-muted-foreground">
                    {community.userRole || 'Member'}
                  </p>
                </div>
                <ArrowRight size={15} className="shrink-0 text-faint" />
              </button>
            ))}
          </div>
        )}
      </SettingsSection>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => onNavigate('notifications')}>
          Notification delivery
        </Button>
      </div>
    </div>
  );
}
