import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, where, collectionGroup, getDocs } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import MessagesView from '../components/MessagesView';
import NotificationsView from '../components/NotificationsView';
import CommunityList from '../components/CommunityList';
import CommunityView from '../components/CommunityView';
import CommunityDetailsModal from '../components/CommunityDetailsModal';
import SocialLeftSidebar from '../components/SocialLeftSidebar';
import SocialRightSidebar from '../components/SocialRightSidebar';
import FeedPage from '../features/feed/components/FeedPage';

/**
 * /feed hosts several views selected by `?view=`: the feed itself (For You, Following,
 * Trending, search) plus messages, notifications, and communities. It also resolves
 * community invite links (`?invite=`).
 */
export default function SocialFeed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const view = searchParams.get('view');
  const communityId = searchParams.get('id');

  const [joinedCommunityIds, setJoinedCommunityIds] = useState<Set<string>>(new Set());
  const [isJoinedLoaded, setIsJoinedLoaded] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [activeInviteCode, setActiveInviteCode] = useState<string | null>(null);

  useEffect(() => {
    // Fetch joined community IDs - Real-time is still good for membership
    let unsubscribeMembers = () => { };
    if (auth.currentUser) {
      setIsJoinedLoaded(false);
      setJoinedCommunityIds(new Set());
      const qMembers = query(
        collectionGroup(db, 'members'),
        where('userId', '==', auth.currentUser.uid)
      );
      unsubscribeMembers = onSnapshot(qMembers, (snapshot) => {
        const ids = new Set(snapshot.docs.map(d => d.ref.parent.parent!.id));
        setJoinedCommunityIds(ids);
        setIsJoinedLoaded(true);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'members');
        setIsJoinedLoaded(true);
      });
    } else {
      setIsJoinedLoaded(true);
    }

    return () => {
      unsubscribeMembers();
    };
  }, [auth.currentUser]);

  useEffect(() => {
    const inviteCode = searchParams.get('invite');
    if (inviteCode && isJoinedLoaded) {
      const handleInvite = async () => {
        setCheckingInvite(true);
        setActiveInviteCode(inviteCode);
        try {
          const q = query(collection(db, 'communityInvites'), where('code', '==', inviteCode));
          const snap = await getDocs(q);

          if (!snap.empty) {
            const inviteData = snap.docs[0].data();
            const cid = inviteData.communityId;

            // Check if user is already a member
            if (auth.currentUser && joinedCommunityIds.has(cid)) {
              // Direct to community
              setSearchParams(prev => {
                const p = new URLSearchParams(prev);
                p.set('view', 'community');
                p.set('id', cid);
                p.delete('invite');
                return p;
              }, { replace: true });
            } else {
              // Show details modal
              setSelectedCommunityId(cid);
              // Clean up the invite from URL to prevent re-triggering if they close modal
              setSearchParams(prev => {
                const p = new URLSearchParams(prev);
                p.delete('invite');
                return p;
              }, { replace: true });
            }
          } else {
            toast.error("Invalid or expired invite link");
            setSearchParams(prev => {
              const p = new URLSearchParams(prev);
              p.delete('invite');
              return p;
            }, { replace: true });
          }
        } catch (err) {
          console.error("Invite check failed:", err);
        } finally {
          setCheckingInvite(false);
        }
      };

      handleInvite();
    }
  }, [searchParams, joinedCommunityIds, auth.currentUser, isJoinedLoaded]);

  if (view === 'communities') {
    return <CommunityList />;
  }

  const fullBleed = view === 'messages' || (view === 'community' && !!communityId);
  const showSidebars = !fullBleed && view !== 'notifications';

  return (
    <div className={`w-full mx-auto text-black dark:text-white relative ${fullBleed ? 'max-w-full h-full overflow-hidden' : 'max-w-[1200px] px-4 pb-8'}`}>
      <div className={`flex flex-col lg:flex-row justify-center ${fullBleed ? 'h-full items-stretch overflow-hidden' : 'gap-4 items-start'}`}>
        {showSidebars && <SocialLeftSidebar />}

        <main className={`w-full order-2 flex-1 ${fullBleed ? 'h-full overflow-hidden' : 'pt-4'} ${showSidebars ? 'max-w-[640px]' : 'max-w-full'}`}>
          {view === 'messages' ? (
            <div className="w-full h-full"><MessagesView /></div>
          ) : view === 'notifications' ? (
            <NotificationsView />
          ) : view === 'community' && communityId ? (
            <CommunityView communityId={communityId} />
          ) : (
            <FeedPage />
          )}
        </main>

        {showSidebars && <SocialRightSidebar />}
      </div>
      <CommunityDetailsModal
        isOpen={!!selectedCommunityId}
        onClose={() => {
          setSelectedCommunityId(null);
          setActiveInviteCode(null);
        }}
        communityId={selectedCommunityId || ''}
        inviteCode={activeInviteCode || undefined}
        onJoinSuccess={() => {
          if (selectedCommunityId) {
            setSearchParams({ view: 'community', id: selectedCommunityId });
            setSelectedCommunityId(null);
            setActiveInviteCode(null);
          }
        }}
      />
    </div>
  );
}
