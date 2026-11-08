import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      setTotalUnreadDMs(0);
      setJoinedCommunities([]);
      setCommunityUnreads({});
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
        notifSnap.docs.forEach((d) => {
          const data = d.data();
          if (!isDirectMessageType(data.type, data.content, data.channelId)) bellCount += 1;
          if (data.type === 'message' && data.relatedId) {
            unreads[data.relatedId] = (unreads[data.relatedId] || 0) + 1;
          }
        });
        setUnreadNotifications(bellCount);
        setCommunityUnreads(unreads);
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

  return {
    unreadNotifications,
    totalUnreadDMs,
    joinedCommunities,
    communityUnreads,
  };
}
