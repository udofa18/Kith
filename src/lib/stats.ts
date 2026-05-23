import { db } from '../firebase';
import { doc, getDoc, setDoc, increment, serverTimestamp } from 'firebase/firestore';

/**
 * Updates the daily stats for a community.
 * This tracks active members, new messages, and new posts for a specific day.
 */
export async function updateDailyStats(communityId: string, type: 'activeMember' | 'newMessage' | 'newPost' | 'xpAwarded', amount: number = 1) {
  if (!communityId) return;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const statsRef = doc(db, 'communities', communityId, 'dailyStats', today);

  try {
    const updateData: any = {
      date: today,
      updatedAt: serverTimestamp()
    };

    if (type === 'activeMember') {
      updateData.activeMembers = increment(1);
    } else if (type === 'newMessage') {
      updateData.newMessages = increment(1);
      updateData.active = increment(1); 
    } else if (type === 'newPost') {
      updateData.newPosts = increment(1);
      updateData.active = increment(1);
    } else if (type === 'xpAwarded') {
      updateData.newXp = increment(amount);
    }

    await setDoc(statsRef, updateData, { merge: true });
    
    // Also update the global community stats if they are out of sync or as a redundant count
    if (type === 'newMessage') {
        const communityRef = doc(db, 'communities', communityId);
        await setDoc(communityRef, {
            stats: {
                messagesCount: increment(1)
            }
        }, { merge: true });
    }
  } catch (error) {
    console.error('Error updating daily stats:', error);
  }
}
