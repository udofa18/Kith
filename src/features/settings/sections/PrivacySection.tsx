import { useState } from 'react';
import { Eye, EyeOff, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Input';
import ConfirmModal from '../../../components/ConfirmModal';
import {
  Segmented,
  SettingNote,
  SettingRow,
  SettingsSection,
  Subheading,
  Switch,
} from '../components/controls';
import type { SectionProps } from './types';

const interactionOptions = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'nobody', label: 'Nobody' },
] as const;

const inviteOptions = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'friends', label: 'People I follow' },
  { value: 'admins', label: 'Community admins' },
  { value: 'nobody', label: 'Nobody' },
] as const;

const viewerOptions = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'me', label: 'Only me' },
] as const;

export default function PrivacySection({ settings, update }: SectionProps) {
  const [quietOpen, setQuietOpen] = useState(false);

  const applyQuietProfile = () => {
    update((current) => ({
      ...current,
      profile: {
        ...current.profile,
        visibility: 'hidden',
        showFollowers: 'me',
        showFollowing: 'me',
        showCommunities: 'me',
      },
      privacy: {
        ...current.privacy,
        discoverable: false,
        searchIndex: false,
        suggestions: false,
        allowMentions: 'followers',
        allowTags: 'followers',
        allowCommunityInvites: 'admins',
        allowEventInvites: 'followers',
        allowGifts: 'nobody',
      },
      audience: {
        ...current.audience,
        allowForYou: false,
        allowSearchIndex: false,
        comments: 'followers',
        replies: 'followers',
        reposts: 'followers',
      },
      messaging: {
        ...current.messaging,
        whoCanDM: 'nobody',
        whoCanCall: 'nobody',
        showPresence: false,
      },
      activity: {
        ...current.activity,
        presence: 'nobody',
        lastActive: 'me',
        shareActivity: false,
        instantSessions: {
          ...current.activity.instantSessions,
          visibleTo: 'me',
          notifyFollowers: false,
          autoShareToStatus: false,
          appearInHappeningNow: false,
        },
      },
      communities: {
        ...current.communities,
        showMembership: 'me',
        showRole: false,
        allowAdminDMs: false,
        showInLeaderboard: false,
      },
      rewards: {
        ...current.rewards,
        showXp: 'me',
        showBadges: 'me',
        showStreak: 'me',
        showInLeaderboard: false,
        allowGifts: 'nobody',
      },
    }));
    setQuietOpen(false);
    toast.success('Quiet profile applied');
  };

  const visibility = settings.profile.visibility;

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Privacy checkup"
        description="A quick summary of what people can currently see."
        action={
          <Button variant="soft" size="sm" leftIcon={<Sparkles size={13} />} onClick={() => setQuietOpen(true)}>
            Quiet profile
          </Button>
        }
      >
        <div className="grid gap-3 py-5 sm:grid-cols-3">
          {[
            {
              label: 'Profile',
              value: visibility === 'public' ? 'Public' : visibility === 'followers' ? 'Followers' : 'Hidden',
              ok: visibility === 'public',
            },
            {
              label: 'Messages',
              value:
                settings.messaging.whoCanDM === 'nobody'
                  ? 'Closed'
                  : settings.messaging.whoCanDM === 'anyone'
                    ? 'Open'
                    : 'Limited',
              ok: settings.messaging.whoCanDM === 'anyone',
            },
            {
              label: 'Presence',
              value: settings.activity.presence === 'nobody' ? 'Off' : 'On',
              ok: settings.activity.presence !== 'nobody',
            },
          ].map((item) => (
            <div key={item.label} className="rounded-control border border-border bg-surface-raised p-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-faint">{item.label}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {item.ok ? <Eye size={14} className="text-success" /> : <EyeOff size={14} className="text-muted-foreground" />}
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <SettingNote tone="info">
          Quiet profile hides your profile, closes DMs, turns off presence and removes you from public
          leaderboards. You can undo any part of it below.
        </SettingNote>
      </SettingsSection>

      <SettingsSection
        title="Profile & discovery"
        description="Who can find you and open your profile."
      >
        <SettingRow
          title="Who can open your profile"
          description="Hidden profiles show a minimal card with your name and avatar."
          stacked
          badge={
            visibility === 'hidden' ? (
              <span className="rounded-pill bg-warning/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-warning">
                Hidden
              </span>
            ) : undefined
          }
        >
          <Segmented
            ariaLabel="Profile visibility"
            value={visibility}
            onChange={(value) =>
              update((current) => ({ ...current, profile: { ...current.profile, visibility: value } }))
            }
            options={[
              { value: 'public', label: 'Public' },
              { value: 'followers', label: 'Followers' },
              { value: 'hidden', label: 'Hidden' },
            ]}
            fullWidth
          />
        </SettingRow>

        <SettingRow
          title="Appear in Kith search"
          description="Your name and username can show up in search results."
        >
          <Switch
            checked={settings.privacy.discoverable}
            onChange={(value) =>
              update((current) => ({ ...current, privacy: { ...current.privacy, discoverable: value } }))
            }
            label="Appear in Kith search"
          />
        </SettingRow>

        <SettingRow
          title="Appear in search engines"
          description="Allow public pages to be indexed by Google and other crawlers."
        >
          <Switch
            checked={settings.privacy.searchIndex}
            onChange={(value) =>
              update((current) => ({ ...current, privacy: { ...current.privacy, searchIndex: value } }))
            }
            label="Appear in search engines"
          />
        </SettingRow>

        <SettingRow
          title="Suggest me to others"
          description="Show up in “people you may know” and community suggestions."
        >
          <Switch
            checked={settings.privacy.suggestions}
            onChange={(value) =>
              update((current) => ({ ...current, privacy: { ...current.privacy, suggestions: value } }))
            }
            label="Suggest me to others"
          />
        </SettingRow>

        <SettingRow
          title="Show my followers and following"
          description="Follower lists stay visible only to the audience you choose."
          stacked
        >
          <div className="grid gap-2">
            <Select
              aria-label="Show followers"
              value={settings.profile.showFollowers}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  profile: { ...current.profile, showFollowers: event.target.value as any },
                }))
              }
            >
              {viewerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  Followers: {option.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Show following"
              value={settings.profile.showFollowing}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  profile: { ...current.profile, showFollowing: event.target.value as any },
                }))
              }
            >
              {viewerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  Following: {option.label}
                </option>
              ))}
            </Select>
          </div>
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Interactions"
        description="Set the default audience for people reaching you. Individual posts can still override these."
      >
        <Subheading>Mentions and tags</Subheading>
        <SettingRow title="Who can mention me" description="Mentions appear in your notifications." stacked>
          <Select
            aria-label="Who can mention me"
            value={settings.privacy.allowMentions}
            onChange={(event) =>
              update((current) => ({
                ...current,
                privacy: { ...current.privacy, allowMentions: event.target.value as any },
              }))
            }
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow title="Who can tag me in posts" description="Tags link back to your profile." stacked>
          <Select
            aria-label="Who can tag me"
            value={settings.privacy.allowTags}
            onChange={(event) =>
              update((current) => ({
                ...current,
                privacy: { ...current.privacy, allowTags: event.target.value as any },
              }))
            }
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <Subheading>Invites and gifts</Subheading>
        <SettingRow title="Who can invite me to communities" stacked>
          <Select
            aria-label="Community invites"
            value={settings.privacy.allowCommunityInvites}
            onChange={(event) =>
              update((current) => ({
                ...current,
                privacy: { ...current.privacy, allowCommunityInvites: event.target.value as any },
              }))
            }
          >
            {inviteOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow title="Who can invite me to events" stacked>
          <Select
            aria-label="Event invites"
            value={settings.privacy.allowEventInvites}
            onChange={(event) =>
              update((current) => ({
                ...current,
                privacy: { ...current.privacy, allowEventInvites: event.target.value as any },
              }))
            }
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow title="Who can send me XP gifts" description="Gifts are shown in messages and on your profile." stacked>
          <Select
            aria-label="Who can send gifts"
            value={settings.privacy.allowGifts}
            onChange={(event) =>
              update((current) => ({
                ...current,
                privacy: { ...current.privacy, allowGifts: event.target.value as any },
              }))
            }
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingNote tone="success" title="Changes apply immediately">
          Existing content keeps the audience it was published with. New posts, mentions and invites use these
          defaults.
        </SettingNote>
      </SettingsSection>

      <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
        <p>
          Kith never shows your email, phone number or exact location to other members. Privacy changes are logged
          to your account so you can review them later.
        </p>
      </div>

      <ConfirmModal
        isOpen={quietOpen}
        onClose={() => setQuietOpen(false)}
        onConfirm={applyQuietProfile}
        title="Apply a quiet profile?"
        message="This hides your profile, closes DMs, turns off presence, removes you from leaderboards and stops profile suggestions. You can change any of it afterwards."
        confirmText="Apply quiet profile"
        variant="warning"
      />
    </div>
  );
}
