import { BellRing, ShieldCheck } from 'lucide-react';
import { Select } from '../../../components/ui/Input';
import {
  SettingRow,
  SettingsSection,
  Subheading,
  Switch,
} from '../components/controls';
import { NOTIFICATION_CATEGORY_HINTS, NOTIFICATION_CATEGORY_LABELS } from '../types';
import type { NotificationCategory, NotificationChannel } from '../types';
import { NOTIFICATION_CATEGORIES } from '../defaults';
import type { SectionProps } from './types';

const CHANNELS: Array<{ key: NotificationChannel; label: string }> = [
  { key: 'inApp', label: 'In-app' },
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
];

export default function NotificationsSection({ settings, update }: SectionProps) {
  const { notifications } = settings;

  const toggleChannel = (category: NotificationCategory, channel: NotificationChannel, value: boolean) =>
    update((current) => ({
      ...current,
      notifications: {
        ...current.notifications,
        matrix: {
          ...current.notifications.matrix,
          [category]: { ...current.notifications.matrix[category], [channel]: value },
        },
      },
    }));

  const setNotifications = (patch: Partial<typeof notifications>) =>
    update((current) => ({ ...current, notifications: { ...current.notifications, ...patch } }));

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Delivery matrix"
        description="Choose what reaches you and where. Changes save instantly."
        action={
          <span className="hidden items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:inline-flex">
            <BellRing size={12} /> Live
          </span>
        }
      >
        <div className="hidden grid-cols-[1fr_56px_56px_56px] gap-2 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-faint sm:grid">
          <span>Category</span>
          {CHANNELS.map((channel) => (
            <span key={channel.key} className="text-center">
              {channel.label}
            </span>
          ))}
        </div>

        {NOTIFICATION_CATEGORIES.map((category) => (
          <div
            key={category}
            className="grid gap-3 border-t border-border/70 py-4 first:border-t-0 sm:grid-cols-[1fr_56px_56px_56px] sm:items-center sm:gap-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{NOTIFICATION_CATEGORY_LABELS[category]}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {NOTIFICATION_CATEGORY_HINTS[category]}
              </p>
            </div>
            {CHANNELS.map((channel) => (
              <div key={channel.key} className="flex items-center justify-between sm:justify-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-faint sm:hidden">
                  {channel.label}
                </span>
                <Switch
                  size="sm"
                  checked={notifications.matrix[category][channel.key]}
                  onChange={(value) => toggleChannel(category, channel.key, value)}
                  label={`${NOTIFICATION_CATEGORY_LABELS[category]} ${channel.label}`}
                />
              </div>
            ))}
          </div>
        ))}

        <div className="flex items-start gap-2.5 rounded-control border border-success/25 bg-success/8 p-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
          <p>Security alerts are always delivered to your account email and cannot be turned off.</p>
        </div>
      </SettingsSection>

      <SettingsSection title="Timing" description="Quiet hours and digest frequency apply to push and email.">
        <SettingRow
          title="Quiet hours"
          description="Pause non-urgent notifications during a window you choose."
        >
          <Switch
            checked={notifications.quietHours.enabled}
            onChange={(value) =>
              setNotifications({ quietHours: { ...notifications.quietHours, enabled: value } })
            }
            label="Quiet hours"
          />
        </SettingRow>

        {notifications.quietHours.enabled && (
          <SettingRow title="Quiet window" description="Local time, using your account timezone." stacked>
            <div className="flex items-center gap-2">
              <input
                type="time"
                aria-label="Quiet hours start"
                value={notifications.quietHours.start}
                onChange={(event) =>
                  setNotifications({ quietHours: { ...notifications.quietHours, start: event.target.value } })
                }
                className="h-10 flex-1 rounded-control border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="time"
                aria-label="Quiet hours end"
                value={notifications.quietHours.end}
                onChange={(event) =>
                  setNotifications({ quietHours: { ...notifications.quietHours, end: event.target.value } })
                }
                className="h-10 flex-1 rounded-control border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </SettingRow>
        )}

        <SettingRow
          title="Email digest"
          description="Bundle social and community activity into one message instead of sending each event."
          stacked
        >
          <Select
            aria-label="Email digest"
            value={notifications.digest}
            onChange={(event) => setNotifications({ digest: event.target.value as any })}
          >
            <option value="realtime">As it happens</option>
            <option value="daily">Daily summary</option>
            <option value="weekly">Weekly summary</option>
            <option value="off">No digest</option>
          </Select>
        </SettingRow>

        <SettingRow
          title="Pause everything"
          description="A temporary break from all non-security notifications."
          stacked
        >
          <Select
            aria-label="Pause notifications"
            value={notifications.pauseUntil}
            onChange={(event) => setNotifications({ pauseUntil: event.target.value })}
          >
            <option value="">Not paused</option>
            <option value="1h">For 1 hour</option>
            <option value="8h">For 8 hours</option>
            <option value="24h">For 24 hours</option>
            <option value="monday">Until Monday</option>
          </Select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Presentation" description="How notifications feel when they arrive.">
        <Subheading>Sound and grouping</Subheading>
        <SettingRow title="Notification sound" description="A soft chime for messages, mentions and live invites.">
          <Switch
            checked={notifications.sound}
            onChange={(value) => setNotifications({ sound: value })}
            label="Notification sound"
          />
        </SettingRow>
        <SettingRow
          title="Smart bundling"
          description="Group likes, follows and similar activity instead of sending each one."
        >
          <Switch
            checked={notifications.bundling}
            onChange={(value) => setNotifications({ bundling: value })}
            label="Smart bundling"
          />
        </SettingRow>

        <Subheading>Per-community overrides</Subheading>
        <SettingRow
          title="Community notifications"
          description="Each community can have its own level. Set defaults under Communities."
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {settings.communities.defaultLevel}
          </span>
        </SettingRow>
      </SettingsSection>
    </div>
  );
}
