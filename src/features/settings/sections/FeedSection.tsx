import { Compass, Leaf, SlidersHorizontal } from 'lucide-react';
import { Select } from '../../../components/ui/Input';
import { SettingNote, SettingRow, SettingsSection, Subheading, Switch } from '../components/controls';
import type { SectionProps } from './types';

export default function FeedSection({ settings, update }: SectionProps) {
  const { feed, data } = settings;

  const setFeed = (patch: Partial<typeof feed>) =>
    update((current) => ({ ...current, feed: { ...current.feed, ...patch } }));

  const setData = (patch: Partial<typeof data>) =>
    update((current) => ({ ...current, data: { ...current.data, ...patch } }));

  return (
    <div className="space-y-5">
      <SettingsSection title="Default feed" description="Where Kith opens when you tap the feed.">
        <SettingRow
          title="Start on"
          description="You can still switch tabs at any time. Kith remembers where you were for the session."
          stacked
        >
          <Select
            aria-label="Default feed tab"
            value={feed.defaultTab}
            onChange={(event) => setFeed({ defaultTab: event.target.value as any })}
          >
            <option value="for-you">For You</option>
            <option value="following">Following</option>
          </Select>
        </SettingRow>

        <SettingNote tone="info">
          Following shows posts from people you follow. For You mixes in recommendations from across Kith.
        </SettingNote>
      </SettingsSection>

      <SettingsSection title="Content" description="Choose which kinds of work appear in your feed.">
        <Subheading>Formats</Subheading>
        <SettingRow title="Reposts and quotes" description="Work reshared by people you follow.">
          <Switch
            checked={feed.showReposts}
            onChange={(value) => setFeed({ showReposts: value })}
            label="Show reposts"
          />
        </SettingRow>
        <SettingRow title="Polls" description="Quick questions from the community.">
          <Switch
            checked={feed.showPolls}
            onChange={(value) => setFeed({ showPolls: value })}
            label="Show polls"
          />
        </SettingRow>
        <SettingRow title="Journal articles" description="Long-form stories and tutorials.">
          <Switch
            checked={feed.showArticles}
            onChange={(value) => setFeed({ showArticles: value })}
            label="Show articles"
          />
        </SettingRow>
        <SettingRow title="Products and events" description="Marketplace drops and things happening soon.">
          <Switch
            checked={feed.showProductsEvents}
            onChange={(value) => setFeed({ showProductsEvents: value })}
            label="Show products and events"
          />
        </SettingRow>

        <Subheading>Sensitive content</Subheading>
        <SettingRow
          title="Show sensitive media"
          description="Media that may be graphic or upsetting. Blur keeps it hidden until you choose to view it."
          stacked
        >
          <Select
            aria-label="Sensitive content"
            value={feed.sensitiveContent}
            onChange={(event) => setFeed({ sensitiveContent: event.target.value as any })}
          >
            <option value="show">Show normally</option>
            <option value="blur">Blur until tapped</option>
            <option value="hide">Hide completely</option>
          </Select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Personalisation" description="How Kith learns what to show you.">
        <SettingRow
          title="Pause personalisation"
          description="Stops ranking based on your recent activity. Your feed becomes chronological until you turn this back on."
        >
          <Switch
            checked={feed.pausePersonalization}
            onChange={(value) => setFeed({ pausePersonalization: value })}
            label="Pause personalisation"
          />
        </SettingRow>
        <SettingRow
          title="Use my activity to personalise"
          description="Likes, saves and time spent help tune recommendations. Turning this off never hides your existing interests."
        >
          <Switch
            checked={data.personalization}
            onChange={(value) => setData({ personalization: value })}
            label="Use activity for personalisation"
          />
        </SettingRow>
        <SettingRow
          title="Save search history"
          description="Keeps recent searches on this account so you can return to them."
        >
          <Switch
            checked={data.searchHistory}
            onChange={(value) => setData({ searchHistory: value })}
            label="Save search history"
          />
        </SettingRow>
        <SettingRow
          title="Save watch history"
          description="Remembers where you left long videos and live replays."
        >
          <Switch
            checked={data.watchHistory}
            onChange={(value) => setData({ watchHistory: value })}
            label="Save watch history"
          />
        </SettingRow>

        <SettingNote tone="warning" title="Your interests stay yours">
          Kith never sells personalisation data. Turning off personalisation keeps your account working normally; it
          only stops new signals from being used for ranking.
        </SettingNote>
      </SettingsSection>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          {
            icon: Compass,
            title: 'Explore interests',
            body: 'Add or remove the topics that shape For You.',
          },
          {
            icon: Leaf,
            title: 'Reset recommendations',
            body: 'Clear hidden posts, muted creators and topic signals.',
          },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-card border border-border bg-surface p-4">
            <span className="mb-2 grid h-9 w-9 place-items-center rounded-control bg-primary/12 text-primary">
              <Icon size={17} />
            </span>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <SlidersHorizontal size={15} className="shrink-0 text-faint" />
        <p>Feed changes apply the next time you open the feed. Nothing is deleted.</p>
      </div>
    </div>
  );
}
