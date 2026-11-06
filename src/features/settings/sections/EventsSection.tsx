import { CalendarDays, Clock3, Radio, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Input';
import { SettingNote, SettingRow, SettingsSection, Subheading, Switch } from '../components/controls';
import type { SectionProps } from './types';

const visibilityOptions = [
  { value: 'public', label: 'Public' },
  { value: 'followers', label: 'Followers' },
  { value: 'community', label: 'Community' },
  { value: 'unlisted', label: 'Unlisted' },
] as const;

const viewerOptions = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'me', label: 'Only me' },
] as const;

const reminderOptions = [
  { value: '10m', label: '10 minutes before' },
  { value: '1h', label: '1 hour before' },
  { value: '1d', label: '1 day before' },
  { value: 'none', label: 'No reminder' },
] as const;

export default function EventsSection({ settings, update, onNavigate }: SectionProps) {
  const navigate = useNavigate();
  const { events } = settings;

  const setEvents = (patch: Partial<typeof events>) =>
    update((current) => ({ ...current, events: { ...current.events, ...patch } }));

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Event defaults"
        description="What new events look like before you change anything in the event builder."
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/events')}>
            Browse events
          </Button>
        }
      >
        <SettingRow
          title="Default visibility"
          description="Public events appear in search and Happening now. Unlisted events are link-only."
          stacked
        >
          <Select
            aria-label="Default event visibility"
            value={events.defaultVisibility}
            onChange={(event) => setEvents({ defaultVisibility: event.target.value as any })}
          >
            {visibilityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Show events I'm attending"
          description="Appears on your profile and in the events rail."
          stacked
        >
          <Select
            aria-label="Who can see events I attend"
            value={events.showAttending}
            onChange={(event) => setEvents({ showAttending: event.target.value as any })}
          >
            {viewerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Show events I'm hosting"
          description="Hosted events are always visible to registrants. This controls the profile showcase."
          stacked
        >
          <Select
            aria-label="Who can see events I host"
            value={events.showHosting}
            onChange={(event) => setEvents({ showHosting: event.target.value as any })}
          >
            {viewerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Event reminder"
          description="One reminder before an event you register for. Hosts send updates separately."
          stacked
        >
          <Select
            aria-label="Event reminder timing"
            value={events.reminders}
            onChange={(event) => setEvents({ reminders: event.target.value as any })}
          >
            {reminderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Live rooms"
        description="Defaults for events with a live room and quick instant sessions."
      >
        <Subheading>Access</Subheading>
        <SettingRow title="Who can join live chat" stacked>
          <Select
            aria-label="Who can join live chat"
            value={events.liveChat}
            onChange={(event) => setEvents({ liveChat: event.target.value as any })}
          >
            <option value="everyone">Anyone in the room</option>
            <option value="registered">Registered attendees only</option>
            <option value="nobody">Chat disabled</option>
          </Select>
        </SettingRow>
        <SettingRow
          title="Allow requests to speak"
          description="Attendees can raise a hand. You still approve each person before their mic opens."
        >
          <Switch
            checked={events.requestToSpeak}
            onChange={(value) => setEvents({ requestToSpeak: value })}
            label="Allow requests to speak"
          />
        </SettingRow>

        <Subheading>Recordings</Subheading>
        <SettingRow
          title="Record live sessions"
          description="A local and cloud copy is kept for 30 days. Everyone in the room sees a recording indicator."
        >
          <Switch
            checked={events.recordSessions}
            onChange={(value) => setEvents({ recordSessions: value })}
            label="Record live sessions"
          />
        </SettingRow>
        <SettingRow
          title="Live captions"
          description="Automatic captions in the live room. Captions are never used to train models."
        >
          <Switch
            checked={events.captions}
            onChange={(value) => setEvents({ captions: value })}
            label="Live captions"
          />
        </SettingRow>
        <SettingRow
          title="Publish a replay"
          description="After the session, a cleaned-up recording becomes available to registered attendees."
        >
          <Switch
            checked={events.replay}
            onChange={(value) => setEvents({ replay: value })}
            label="Publish a replay"
          />
        </SettingRow>

        <SettingNote tone="info">
          Instant session visibility is controlled separately under Activity &amp; presence so you can go live
          without changing event defaults.
        </SettingNote>

        <div className="flex flex-wrap gap-2 py-4">
          <Button variant="ghost" size="sm" leftIcon={<Radio size={13} />} onClick={() => onNavigate('activity')}>
            Instant sessions
          </Button>
          <Button variant="ghost" size="sm" leftIcon={<Clock3 size={13} />} onClick={() => onNavigate('notifications')}>
            Reminder delivery
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Hosting tools" description="Shortcuts for the things you do around an event.">
        <div className="grid gap-3 py-5 sm:grid-cols-2">
          {[
            {
              icon: CalendarDays,
              title: 'Create an event',
              body: 'Start from a blank event or duplicate a past one.',
              action: () => navigate('/events/create'),
            },
            {
              icon: Video,
              title: 'Test your setup',
              body: 'Check camera, mic and screen share before going live.',
              action: () => navigate('/events'),
            },
          ].map(({ icon: Icon, title, body, action }) => (
            <button
              key={title}
              type="button"
              onClick={action}
              className="rounded-control border border-border bg-surface-raised p-4 text-left transition-colors hover:border-primary/40"
            >
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-control bg-primary/12 text-primary">
                <Icon size={17} />
              </span>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
            </button>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
