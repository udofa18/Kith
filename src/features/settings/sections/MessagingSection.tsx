import { MessageCircleOff, ShieldCheck } from 'lucide-react';
import { Select } from '../../../components/ui/Input';
import { SettingNote, SettingRow, SettingsSection, Subheading, Switch } from '../components/controls';
import type { SectionProps } from './types';

const interactionOptions = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'nobody', label: 'Nobody' },
] as const;

const retentionOptions = [
  { value: 'never', label: 'Never delete' },
  { value: '30d', label: 'After 30 days' },
  { value: '90d', label: 'After 90 days' },
] as const;

export default function MessagingSection({ settings, update, onNavigate }: SectionProps) {
  const { messaging } = settings;
  const dmsOpen = messaging.whoCanDM !== 'nobody';
  const callsOpen = messaging.whoCanCall !== 'nobody';

  const setMessaging = (patch: Partial<typeof messaging>) =>
    update((current) => ({ ...current, messaging: { ...current.messaging, ...patch } }));

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Direct messages"
        description="Control who can start a conversation with you. Existing chats stay readable unless you close messages entirely."
        action={
          <span
            className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
              dmsOpen
                ? 'border-success/35 bg-success/10 text-success'
                : 'border-warning/35 bg-warning/10 text-warning'
            }`}
          >
            <MessageCircleOff size={11} />
            {dmsOpen ? 'Open' : 'Closed'}
          </span>
        }
      >
        <SettingRow
          title="Allow direct messages"
          description="When off, new messages and calls are blocked. People can still see your profile unless it is hidden."
          badge={
            !dmsOpen ? (
              <span className="rounded-pill bg-destructive/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-destructive">
                No DMs
              </span>
            ) : undefined
          }
        >
          <Switch
            checked={dmsOpen}
            onChange={(value) => setMessaging({ whoCanDM: value ? 'anyone' : 'nobody' })}
            label="Allow direct messages"
          />
        </SettingRow>

        <SettingRow
          title="Who can message me"
          description="Message requests still apply unless you choose Nobody."
          stacked
          disabled={!dmsOpen}
        >
          <Select
            aria-label="Who can message me"
            value={messaging.whoCanDM}
            disabled={!dmsOpen}
            onChange={(event) => setMessaging({ whoCanDM: event.target.value as any })}
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Message requests"
          description="People you don't follow land in Requests instead of your inbox."
        >
          <Switch
            checked={messaging.requests}
            onChange={(value) => setMessaging({ requests: value })}
            label="Message requests"
            disabled={!dmsOpen}
          />
        </SettingRow>

        <SettingRow
          title="Auto-accept mutuals"
          description="Skip the request step when you and the other person follow each other."
        >
          <Switch
            checked={messaging.autoAcceptMutuals}
            onChange={(value) => setMessaging({ autoAcceptMutuals: value })}
            label="Auto-accept mutuals"
            disabled={!dmsOpen}
          />
        </SettingRow>

        <SettingRow
          title="Read receipts"
          description="Reciprocal: if you turn yours off, you stop seeing other people's too."
        >
          <Switch
            checked={messaging.readReceipts}
            onChange={(value) => setMessaging({ readReceipts: value })}
            label="Read receipts"
          />
        </SettingRow>

        <SettingRow
          title="Typing indicators"
          description="Show “typing…” while you write. Turning it off hides everyone else's too."
        >
          <Switch
            checked={messaging.typingIndicators}
            onChange={(value) => setMessaging({ typingIndicators: value })}
            label="Typing indicators"
          />
        </SettingRow>

        <SettingRow
          title="Show my activity in chat"
          description="Green dot and “Active now”. Full presence controls live under Activity & presence."
        >
          <div className="flex items-center gap-2">
            <Switch
              checked={messaging.showPresence}
              onChange={(value) => setMessaging({ showPresence: value })}
              label="Show activity in chat"
            />
            <button
              type="button"
              onClick={() => onNavigate('activity')}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              More
            </button>
          </div>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Calls" description="Voice and video calls are separate from text messages.">
        <SettingRow title="Allow calls" description="When off, nobody can ring you from Kith.">
          <Switch
            checked={callsOpen}
            onChange={(value) => setMessaging({ whoCanCall: value ? 'mutuals' : 'nobody' })}
            label="Allow calls"
          />
        </SettingRow>
        <SettingRow title="Who can call me" stacked disabled={!callsOpen}>
          <Select
            aria-label="Who can call me"
            value={messaging.whoCanCall}
            disabled={!callsOpen}
            onChange={(event) => setMessaging({ whoCanCall: event.target.value as any })}
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow
          title="Who can add me to group calls"
          description="Being added to a group call notifies you but never turns your camera or mic on."
          stacked
        >
          <Select
            aria-label="Who can add me to group calls"
            value={messaging.whoCanAddToGroupCalls}
            onChange={(event) => setMessaging({ whoCanAddToGroupCalls: event.target.value as any })}
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Attachments and gifts" description="Extra things people can send in a conversation.">
        <Subheading>Media</Subheading>
        <SettingRow title="Who can send attachments" stacked>
          <Select
            aria-label="Who can send attachments"
            value={messaging.attachments}
            onChange={(event) => setMessaging({ attachments: event.target.value as any })}
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow
          title="Auto-delete message media"
          description="Photos, videos and voice notes older than this are removed from storage. Text stays."
          stacked
        >
          <Select
            aria-label="Auto-delete message media"
            value={messaging.autoDeleteMedia}
            onChange={(event) => setMessaging({ autoDeleteMedia: event.target.value as any })}
          >
            {retentionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <Subheading>XP gifts</Subheading>
        <SettingRow title="Who can send me XP gifts" stacked>
          <Select
            aria-label="Who can send XP gifts"
            value={messaging.gifts}
            onChange={(event) => setMessaging({ gifts: event.target.value as any })}
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
      </SettingsSection>

      <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
        <p>
          Closing DMs does not delete conversations. Existing chats become read-only, and the other person sees
          “This person isn't accepting messages” instead of a failed send.
        </p>
      </div>

      {!dmsOpen && (
        <SettingNote tone="warning" title="Instant session invitations are affected">
          When DMs are closed, hosts can still share a live link publicly, but they cannot DM you an invite. This is
          enforced on the server, not just hidden in the interface.
        </SettingNote>
      )}
    </div>
  );
}
