import { Activity, Radio, ShieldCheck } from 'lucide-react';
import { Select } from '../../../components/ui/Input';
import { SettingNote, SettingRow, SettingsSection, Subheading, Switch } from '../components/controls';
import type { SectionProps } from './types';

const viewerOptions = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'nobody', label: 'Nobody' },
] as const;

const interactionOptions = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'nobody', label: 'Nobody' },
] as const;

export default function ActivitySection({ settings, update }: SectionProps) {
  const { activity } = settings;

  const setActivity = (patch: Partial<typeof activity>) =>
    update((current) => ({ ...current, activity: { ...current.activity, ...patch } }));

  const setInstant = (patch: Partial<typeof activity.instantSessions>) =>
    update((current) => ({
      ...current,
      activity: {
        ...current.activity,
        instantSessions: { ...current.activity.instantSessions, ...patch },
      },
    }));

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Presence"
        description="Kith uses a lightweight heartbeat to show when people are around. You decide who sees it."
      >
        <SettingRow
          title="Show me as active"
          description="The green dot and “Active now” label in messages, communities and profiles."
          stacked
        >
          <Select
            aria-label="Who can see me as active"
            value={activity.presence}
            onChange={(event) => setActivity({ presence: event.target.value as any })}
          >
            {viewerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Show my last active time"
          description="“Active 2h ago”. Choose Only me to stop showing any timestamp."
          stacked
        >
          <Select
            aria-label="Who can see my last active time"
            value={activity.lastActive}
            onChange={(event) => setActivity({ lastActive: event.target.value as any })}
          >
            {viewerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Share what I'm doing"
          description="Show the current live session or community room on your profile. Nothing is shared when this is off."
        >
          <Switch
            checked={activity.shareActivity}
            onChange={(value) => setActivity({ shareActivity: value })}
            label="Share what I'm doing"
          />
        </SettingRow>

        {activity.presence === 'nobody' && (
          <SettingNote tone="info">
            With presence off, Kith stops writing your heartbeat entirely. Other members see no dot or timestamp.
          </SettingNote>
        )}
      </SettingsSection>

      <SettingsSection
        title="Instant sessions"
        description="Quick live rooms you start from the feed. These are the settings people see when you go live."
      >
        <SettingRow
          title="Who can see sessions I'm in"
          description="Applies to sessions you host and sessions you join. Hosts can still invite you directly if their event is invite-only."
          stacked
          badge={
            <span className="inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <Radio size={9} /> Live
            </span>
          }
        >
          <Select
            aria-label="Who can see instant sessions"
            value={activity.instantSessions.visibleTo}
            onChange={(event) => setInstant({ visibleTo: event.target.value as any })}
          >
            {viewerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Notify followers when I go live"
          description="Sends one notification when a session starts. No reminder if you start and stop within a minute."
        >
          <Switch
            checked={activity.instantSessions.notifyFollowers}
            onChange={(value) => setInstant({ notifyFollowers: value })}
            label="Notify followers when I go live"
          />
        </SettingRow>

        <SettingRow
          title="Share to my status"
          description="Adds a tappable “Live now” bubble to your status for 24 hours."
        >
          <Switch
            checked={activity.instantSessions.autoShareToStatus}
            onChange={(value) => setInstant({ autoShareToStatus: value })}
            label="Share instant sessions to status"
          />
        </SettingRow>

        <SettingRow
          title="Appear in Happening now"
          description="The live rail on the events page. Turn off to stay unlisted even while live."
        >
          <Switch
            checked={activity.instantSessions.appearInHappeningNow}
            onChange={(value) => setInstant({ appearInHappeningNow: value })}
            label="Appear in Happening now"
          />
        </SettingRow>

        <SettingRow
          title="Allow guests to bring others"
          description="Guests can invite one more person into your session."
        >
          <Switch
            checked={activity.instantSessions.allowGuests}
            onChange={(value) => setInstant({ allowGuests: value })}
            label="Allow guests to bring others"
          />
        </SettingRow>

        <div className="my-4 flex items-start gap-3 rounded-control border border-primary/25 bg-primary/6 p-3.5">
          <Activity size={16} className="mt-0.5 shrink-0 text-primary" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">What followers see</p>
            <p className="mt-0.5">
              {activity.instantSessions.visibleTo === 'everyone'
                ? 'Anyone can see the session in the live rail and on your profile.'
                : activity.instantSessions.visibleTo === 'followers'
                  ? 'Followers see the session on your profile and in their Following feed. It stays out of public search.'
                  : activity.instantSessions.visibleTo === 'mutuals'
                    ? 'Only people you follow back see it. Everyone else gets a private link if you share one.'
                    : 'Only you see it. People with the link can still join unless the room itself is locked.'}
            </p>
            {activity.instantSessions.notifyFollowers && activity.instantSessions.visibleTo === 'followers' && (
              <p className="mt-1.5 text-primary">Followers will also receive one notification when you start.</p>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Statuses" description="Photo, video and text updates that disappear after 24 hours.">
        <SettingRow title="Who can see my statuses" stacked>
          <Select
            aria-label="Status audience"
            value={activity.statusAudience}
            onChange={(event) => setActivity({ statusAudience: event.target.value as any })}
          >
            <option value="followers">Followers</option>
            <option value="only-me">Only me</option>
          </Select>
        </SettingRow>
        <SettingRow title="Who can reply to statuses" stacked>
          <Select
            aria-label="Who can reply to statuses"
            value={activity.allowStatusReplies}
            onChange={(event) => setActivity({ allowStatusReplies: event.target.value as any })}
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingNote tone="info">
          Statuses are always removed after 24 hours. Turning on Only me keeps a private diary rather than a public
          story.
        </SettingNote>
      </SettingsSection>

      <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
        <p>
          Presence is computed from a heartbeat. When you turn it off, Kith stops writing it and never falls back
          to showing a stale timestamp.
        </p>
      </div>
    </div>
  );
}
