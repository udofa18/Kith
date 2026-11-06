import { Award, Flame, Sparkles, Trophy, Zap } from 'lucide-react';
import { Select } from '../../../components/ui/Input';
import { SettingNote, SettingRow, SettingsSection, Subheading, Switch } from '../components/controls';
import type { SectionProps } from './types';

const viewerOptions = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'me', label: 'Only me' },
] as const;

const interactionOptions = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'nobody', label: 'Nobody' },
] as const;

export default function RewardsSection({ settings, update, profile }: SectionProps) {
  const xp = Number(profile?.xp) || 0;
  const level = Math.floor(xp / 100) + 1;
  const progress = xp % 100;
  const badges: string[] = Array.isArray(profile?.badges) ? profile.badges : [];

  const setRewards = (patch: Partial<typeof settings.rewards>) =>
    update((current) => ({ ...current, rewards: { ...current.rewards, ...patch } }));

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Your level"
        description="XP is earned by finishing setup, publishing work and helping other builders."
      >
        <div className="py-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-card border border-accent/40 bg-accent/10 text-accent">
              <Zap size={28} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Level {level}
              </p>
              <p className="font-display text-2xl font-semibold tracking-[-0.04em]">{xp} XP</p>
            </div>
            <span className="rounded-pill bg-accent/12 px-3 py-1 text-[11px] font-semibold text-accent">
              {100 - progress} XP to level {level + 1}
            </span>
          </div>
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-faint">
              <span>{progress} / 100 XP</span>
              <span>Level {level + 1}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 pb-5 sm:grid-cols-3">
          {[
            { icon: Flame, label: 'Streak', value: `${profile?.streak || 0} days` },
            { icon: Award, label: 'Badges', value: `${badges.length}` },
            { icon: Sparkles, label: 'Reputation', value: profile?.reputation || 'Member' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-control border border-border bg-surface-raised p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                <Icon size={11} /> {label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Badges" description="Badges you have earned across the community.">
        {badges.length === 0 ? (
          <p className="py-6 text-sm leading-relaxed text-muted-foreground">
            No badges yet. Publish a product, host an event or help someone in a community to earn your first one.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 py-5">
            {badges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1.5 rounded-pill border border-accent/35 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent"
              >
                <Award size={13} /> {badge}
              </span>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Visibility" description="What other people see about your progress.">
        <Subheading>On your profile</Subheading>
        <SettingRow title="Show my level and XP" stacked>
          <Select
            aria-label="Who can see XP"
            value={settings.rewards.showXp}
            onChange={(event) => setRewards({ showXp: event.target.value as any })}
          >
            {viewerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow title="Show my badges" stacked>
          <Select
            aria-label="Who can see badges"
            value={settings.rewards.showBadges}
            onChange={(event) => setRewards({ showBadges: event.target.value as any })}
          >
            {viewerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow title="Show my streak" stacked>
          <Select
            aria-label="Who can see streak"
            value={settings.rewards.showStreak}
            onChange={(event) => setRewards({ showStreak: event.target.value as any })}
          >
            {viewerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow
          title="Appear in leaderboards"
          description="Community and global XP leaderboards. Turning this off never removes badges you already earned."
        >
          <Switch
            checked={settings.rewards.showInLeaderboard}
            onChange={(value) => setRewards({ showInLeaderboard: value })}
            label="Appear in leaderboards"
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Gifts and milestones" description="How XP can move between members.">
        <SettingRow title="Who can send me XP gifts" stacked>
          <Select
            aria-label="Who can send XP gifts"
            value={settings.rewards.allowGifts}
            onChange={(event) => setRewards({ allowGifts: event.target.value as any })}
          >
            {interactionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow
          title="Notify me when I level up"
          description="A quiet in-app celebration. Never sent by email."
        >
          <Switch
            checked={settings.rewards.notifyLevelUp}
            onChange={(value) => setRewards({ notifyLevelUp: value })}
            label="Notify me when I level up"
          />
        </SettingRow>
        <SettingNote tone="info">
          Gifts do not transfer XP away from you. They add a separate gift balance to the recipient.
        </SettingNote>
      </SettingsSection>

      <div className="flex items-center gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <Trophy size={15} className="shrink-0 text-accent" />
        <p>
          Leaderboards reset every Monday at 00:00 UTC. Your total XP and badges are never reset.
        </p>
      </div>
    </div>
  );
}
