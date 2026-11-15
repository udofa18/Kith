import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { isDirectMessageType } from '../lib/notificationTaxonomy';

/**
 * Live counters and circles shown in both the desktop sidebar and mobile nav.
 * Kept in one place so the two navigations never disagree.
 */
export function useKithNavData(user: any) {
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [totalUnreadDMs, setTotalUnreadDMs] = useState(0);
  const [joinedCommunities, setJoinedCommunities] = useState<any[]>([]);
  const [communityUnreads, setCommunityUnreads] = useState<Record<string, number>>({});
  const [communityMentions, setCommunityMentions] = useState<Record<string, number>>({});
  const [channelUnreads, setChannelUnreads] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      setTotalUnreadDMs(0);
      setJoinedCommunities([]);
      setCommunityUnreads({});
      setCommunityMentions({});
      return;
    }

    // Circles the user belongs to.
    const qMembers = query(collectionGroup(db, 'members'), where('userId', '==', user.uid));
    const unsubscribeMembers = onSnapshot(
      qMembers,
      async (snapshot) => {
        const communityIds = snapshot.docs.map((d) => d.ref.parent.parent!.id);

        const communitiesData = await Promise.all(
          communityIds.map(async (id) => {
            const d = await getDoc(doc(db, 'communities', id));
            return d.exists() ? { id: d.id, ...d.data() } : null;
          }),
        );

        setJoinedCommunities(communitiesData.filter((c) => c !== null));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'members');
      },
    );

    // Unread notifications and message activity per circle.
    const qNotifs = query(
      collection(db, 'notifications'),
      where('recipientId', '==', user.uid),
      where('read', '==', false),
    );
    const unsubscribeNotifs = onSnapshot(
      qNotifs,
      (notifSnap) => {
        // DMs have their own badge; the bell only counts everything else.
        let bellCount = 0;
        const unreads: Record<string, number> = {};
        const mentions: Record<string, number> = {};
        notifSnap.docs.forEach((d) => {
          const data = d.data();
          if (!isDirectMessageType(data.type, data.content, data.channelId)) bellCount += 1;

          const communityId = data.communityId
            || (data.relatedId && (
              data.channelId
              || ['channel_mention', 'community', 'community_post'].includes(data.type)
            ) ? data.relatedId : null);
          if (communityId) {
            unreads[communityId] = (unreads[communityId] || 0) + 1;
            if (data.type === 'channel_mention') {
              mentions[communityId] = (mentions[communityId] || 0) + 1;
            }
          }
        });
        setUnreadNotifications(bellCount);
        setCommunityUnreads(unreads);
        setCommunityMentions(mentions);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'notifications');
      },
    );

    // Direct messages, including pending requests.
    const qConvs = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
    );
    const unsubscribeConvs = onSnapshot(
      qConvs,
      (snapshot) => {
        let dmCount = 0;
        let requestCount = 0;
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const incomingRequest = data.status === 'pending' && data.requestedBy !== user.uid;
          const hidden = data.status === 'declined' && data.requestedBy !== user.uid;
          if (incomingRequest) requestCount += 1;
          else if (!hidden && !data.mutedBy?.includes(user.uid))
            dmCount += data.unreadCount?.[user.uid] || 0;
        });
        setTotalUnreadDMs(dmCount + requestCount);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'conversations');
      },
    );

    return () => {
      unsubscribeMembers();
      unsubscribeNotifs();
      unsubscribeConvs();
    };
  }, [user]);

  // Unread chat per circle. The notification feed only produces mentions, so ordinary channel
  // messages never reach it; derive them from the same per-channel counters the channel sidebar
  // uses (messageCount minus the member's last read count).
  const communityIdsKey = useMemo(
    () => joinedCommunities.map((community) => String(community.id)).sort().join(','),
    [joinedCommunities],
  );

  useEffect(() => {
    if (!user || joinedCommunities.length === 0) {
      setChannelUnreads({});
      return;
    }

    type CommunityUnreadState = { channels: Record<string, number>; stats: Record<string, number> };
    const state = new Map<string, CommunityUnreadState>();
    const unsubscribes: Array<() => void> = [];

    const publish = () => {
      const next: Record<string, number> = {};
      state.forEach((entry, communityId) => {
        let total = 0;
        for (const [channelId, count] of Object.entries(entry.channels)) {
          total += Math.max(0, count - (entry.stats[channelId] || 0));
        }
        next[communityId] = total;
      });
      setChannelUnreads(next);
    };

    joinedCommunities.forEach((community) => {
      const communityId = String(community.id);
      state.set(communityId, { channels: {}, stats: {} });

      unsubscribes.push(
        onSnapshot(
          collection(db, 'communities', communityId, 'channels'),
          (snapshot) => {
            const channels: Record<string, number> = {};
            snapshot.docs.forEach((d) => {
              channels[d.id] = Number(d.data().messageCount || 0);
            });
            state.get(communityId)!.channels = channels;
            publish();
          },
          (error) => {
            // Paid members lose channel metadata access outside grace. Leave their badge empty
            // instead of breaking the whole sidebar.
            console.warn(`Unread channels unavailable for ${communityId}:`, error);
          },
        ),
      );

      unsubscribes.push(
        onSnapshot(
          collection(db, 'communities', communityId, 'members', user.uid, 'channelStats'),
          (snapshot) => {
            const stats: Record<string, number> = {};
            snapshot.docs.forEach((d) => {
              stats[d.id] = Number(d.data().lastReadCount || 0);
            });
            state.get(communityId)!.stats = stats;
            publish();
          },
          (error) => {
            console.warn(`Channel stats unavailable for ${communityId}:`, error);
          },
        ),
      );
    });

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [user, communityIdsKey]);

  // Mentions already arrive as notifications and as unread channel messages. Take the larger of
  // the two so a mention is not counted twice.
  const combinedCommunityUnreads = useMemo(() => {
    const merged: Record<string, number> = { ...communityUnreads };
    for (const [communityId, count] of Object.entries(channelUnreads)) {
      merged[communityId] = Math.max(merged[communityId] || 0, count);
    }
    return merged;
  }, [communityUnreads, channelUnreads]);

  return {
    unreadNotifications,
    totalUnreadDMs,
    joinedCommunities,
    communityUnreads: combinedCommunityUnreads,
    communityMentions,
  };
}
