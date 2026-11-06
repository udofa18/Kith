import { Globe2, Lock, UserCheck, Users } from 'lucide-react';
import { Select } from '../../../components/ui/Input';
import { SettingNote, SettingRow, SettingsSection, Subheading, Switch } from '../components/controls';
import type { SectionProps } from './types';

const contentOptions = [
  { value: 'public', label: 'Public' },
  { value: 'followers', label: 'Followers' },
  { value: 'community', label: 'Community' },
  { value: 'only-me', label: 'Only me' },
] as const;

const interactionOptions = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'nobody', label: 'Nobody' },
] as const;

type ContentKey = 'posts' | 'articles' | 'statuses' | 'products' | 'events' | 'live' | 'challenges';
type InteractionKey = 'comments' | 'replies' | 'reposts' | 'pollVotes';

const CONTENT_ROWS: Array<{ key: ContentKey; title: string; description: string; icon: any }> = [
  { key: 'posts', title: 'Posts', description: 'Shiplogs, feedback requests and regular posts.', icon: Globe2 },
  { key: 'articles', title: 'Journal articles', description: 'Stories you publish to the Kith Journal.', icon: Globe2 },
  { key: 'statuses', title: 'Statuses', description: '24-hour photo, video and text updates.', icon: Lock },
  { key: 'products', title: 'Products', description: 'Your marketplace storefront and listings.', icon: Users },
  { key: 'events', title: 'Events', description: 'New events you host.', icon: Users },
  { key: 'live', title: 'Instant sessions', description: 'Quick live rooms you start from the feed.', icon: UserCheck },
  { key: 'challenges', title: 'Challenges', description: 'Challenges you create for the community.', icon: Globe2 },
];

const INTERACTION_ROWS: Array<{ key: InteractionKey; title: string; description: string }> = [
  { key: 'comments', title: 'Who can comment', description: 'Comments on your posts and articles.' },
  { key: 'replies', title: 'Who can reply', description: 'Replies to your comments and statuses.' },
  { key: 'reposts', title: 'Who can quote or repost', description: 'Reposts, quotes and shares of your work.' },
  { key: 'pollVotes', title: 'Who can vote on polls', description: 'Votes on polls you publish.' },
];

export default function AudienceSection({ settings, update }: SectionProps) {
  const setContent = (key: ContentKey, value: string) =>
    update((current) => ({
      ...current,
      audience: { ...current.audience, [key]: value as any },
    }));

  const setInteraction = (key: InteractionKey, value: string) =>
    update((current) => ({
      ...current,
      audience: { ...current.audience, [key]: value as any },
    }));

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Default audience"
        description="Every new piece of content starts with this audience. You can change it per post in the composer."
      >
        {CONTENT_ROWS.map((row) => {
          const Icon = row.icon;
          return (
            <SettingRow
              key={row.key}
              title={
                <span className="flex items-center gap-2">
                  <Icon size={14} className="text-muted-foreground" />
                  {row.title}
                </span>
              }
              description={row.description}
              stacked
            >
              <Select
                aria-label={`Default audience for ${row.title}`}
                value={settings.audience[row.key]}
                onChange={(event) => setContent(row.key, event.target.value)}
              >
                {contentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </SettingRow>
          );
        })}
        <SettingNote tone="warning" title="Followers-only is private, not secret">
          Followers-only posts don't appear in For You or public search. Anyone can still screenshot or share
          what they can see.
        </SettingNote>
      </SettingsSection>

      <SettingsSection
        title="Interaction defaults"
        description="Who can respond to your work. These can be tightened on individual posts."
      >
        {INTERACTION_ROWS.map((row) => (
          <SettingRow key={row.key} title={row.title} description={row.description} stacked>
            <Select
              aria-label={row.title}
              value={settings.audience[row.key]}
              onChange={(event) => setInteraction(row.key, event.target.value)}
            >
              {interactionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </SettingRow>
        ))}
      </SettingsSection>

      <SettingsSection
        title="Distribution"
        description="Where your public work can travel."
      >
        <Subheading>Recommendations</Subheading>
        <SettingRow
          title="Include my public posts in For You"
          description="Turning this off keeps public work out of recommendation surfaces. People can still find it on your profile and in search."
        >
          <Switch
            checked={settings.audience.allowForYou}
            onChange={(value) =>
              update((current) => ({ ...current, audience: { ...current.audience, allowForYou: value } }))
            }
            label="Include in For You"
          />
        </SettingRow>
        <SettingRow
          title="Allow search engines to index my work"
          description="Applies to public posts and articles. Profile indexing is controlled under Privacy."
        >
          <Switch
            checked={settings.audience.allowSearchIndex}
            onChange={(value) =>
              update((current) => ({ ...current, audience: { ...current.audience, allowSearchIndex: value } }))
            }
            label="Allow search engine indexing"
          />
        </SettingRow>

        <Subheading>Presentation</Subheading>
        <SettingRow
          title="Show engagement counts"
          description="Likes, replies and view counts on your posts. Turning this off hides them only on your content."
        >
          <Switch
            checked={settings.audience.showEngagement}
            onChange={(value) =>
              update((current) => ({ ...current, audience: { ...current.audience, showEngagement: value } }))
            }
            label="Show engagement counts"
          />
        </SettingRow>
      </SettingsSection>

      <div className="rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">How per-post overrides work</p>
        <p>
          The composer remembers the last audience you chose. A small badge on the post shows whether it is public,
          followers-only or community-only, so there is never a guess.
        </p>
      </div>
    </div>
  );
}
