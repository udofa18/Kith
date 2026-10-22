import { useCallback } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { queryKeys } from '../../../lib/queryClient';
import { EMPTY_PREFERENCES, type FeedItem, type FeedPage, type FeedPreferences, type ViewerContext } from '../types';
import { itemTags, normalizeTag } from '../ranking/score';
import { addInterestTopics, savePreferences } from '../signals/store';
import { trackEngagement } from '../signals/tracker';

const targetOf = (item: FeedItem) => ({
  id: item.id, authorUid: item.data.authorUid, hashtags: item.data.hashtags, tags: item.data.tags,
});

/**
 * Handlers behind the feed card menu. Each updates the UI immediately,
 * persists in the background, and offers Undo where it removes content.
 */
export function useFeedActions(uid: string | null) {
  const client = useQueryClient();
  const viewerKey = queryKeys.feedViewer(uid);

  const removeFromFeeds = useCallback((drop: (item: FeedItem) => boolean) => {
    client.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ['feed'] }, data => data && {
      ...data,
      pages: data.pages.map(page => ({ ...page, items: page.items.filter(item => !drop(item)) })),
    });
  }, [client]);

  const updatePreferences = useCallback(async (change: (prefs: FeedPreferences) => FeedPreferences) => {
    if (!uid) return;
    const viewer = client.getQueryData<ViewerContext>(viewerKey);
    const saved = await savePreferences(uid, change(viewer?.preferences ?? EMPTY_PREFERENCES));
    const latest = client.getQueryData<ViewerContext>(viewerKey);
    if (latest) client.setQueryData(viewerKey, { ...latest, preferences: saved });
  }, [client, uid, viewerKey]);

  const undoable = (message: string, undo: () => Promise<void>) => {
    toast(t => (
      <span className="flex items-center gap-3 text-sm">
        {message}
        <button
          className="font-semibold text-primary hover:underline"
          onClick={async () => {
            toast.dismiss(t.id);
            await undo();
            client.invalidateQueries({ queryKey: ['feed'] });
          }}
        >
          Undo
        </button>
      </span>
    ), { duration: 5000 });
  };

  const fail = (err: unknown) => {
    console.error(err);
    toast.error("Couldn't save that. Try again.");
    client.invalidateQueries({ queryKey: ['feed'] });
  };

  /**
   * Hide the item and down-rank its creator. Its tags also go to "show less",
   * but only tags the viewer never picked as interests, so one tap can't bury a topic they chose.
   */
  const notInterested = useCallback((item: FeedItem) => {
    if (!uid) return;
    const viewer = client.getQueryData<ViewerContext>(viewerKey);
    const chosen = new Set([...(viewer?.interests?.followedTopics || []), ...(viewer?.interests?.hashtags || [])].map(normalizeTag));
    const lessTags = itemTags(item.data).map(normalizeTag).filter(t => t && !chosen.has(t));

    removeFromFeeds(i => i.id === item.id);
    trackEngagement(uid, 'not_interested', targetOf(item));
    updatePreferences(p => ({
      ...p,
      hiddenItemIds: [...p.hiddenItemIds, item.id],
      lessTopics: [...new Set([...p.lessTopics, ...lessTags])],
    })).catch(fail);

    undoable("Got it. You'll see less like this.", () => updatePreferences(p => ({
      ...p,
      hiddenItemIds: p.hiddenItemIds.filter(id => id !== item.id),
      lessTopics: p.lessTopics.filter(t => !lessTags.includes(t)),
    })));
  }, [uid, client, viewerKey, removeFromFeeds, updatePreferences]);

  const muteCreator = useCallback((item: FeedItem) => {
    const author = item.data.authorUid;
    if (!uid || !author) return;
    removeFromFeeds(i => i.data.authorUid === author);
    updatePreferences(p => ({ ...p, mutedCreatorIds: [...new Set([...p.mutedCreatorIds, author])] })).catch(fail);
    undoable(`Muted ${item.data.authorName}.`, () => updatePreferences(p => ({
      ...p,
      mutedCreatorIds: p.mutedCreatorIds.filter(id => id !== author),
    })));
  }, [uid, removeFromFeeds, updatePreferences]);

  /** Positive signal on the creator, plus the item's tags become interests. */
  const showMore = useCallback(async (item: FeedItem) => {
    if (!uid) return;
    trackEngagement(uid, 'show_more', targetOf(item));
    const tags = itemTags(item.data);
    if (tags.length === 0) {
      toast.success(`You'll see more from ${item.data.authorName}.`);
      return;
    }
    try {
      const viewer = client.getQueryData<ViewerContext>(viewerKey);
      const interests = await addInterestTopics(uid, viewer?.interests ?? null, tags);
      const latest = client.getQueryData<ViewerContext>(viewerKey);
      if (latest) client.setQueryData(viewerKey, { ...latest, interests });
      toast.success(`You'll see more about ${tags.slice(0, 3).map(t => `#${t.replace(/^#/, '')}`).join(', ')}.`);
    } catch (err) {
      fail(err);
    }
  }, [uid, client, viewerKey]);

  return { notInterested, muteCreator, showMore };
}
