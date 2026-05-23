import { doc, updateDoc, increment, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export type XPGainType = 'session_attendance' | 'ask_question' | 'vote_poll' | 'post_create' | 'challenge_complete';

const XP_VALUES: Record<XPGainType, number> = {
  session_attendance: 50,
  ask_question: 10,
  vote_poll: 5,
  post_create: 20,
  challenge_complete: 100
};

export const gainXP = async (userId: string, type: XPGainType, relatedId?: string) => {
  const amount = XP_VALUES[type];
  
  try {
    // Update user XP
    await updateDoc(doc(db, 'users', userId), {
      xp: increment(amount)
    });

    // Create notification
    await addDoc(collection(db, 'notifications'), {
      recipientId: userId,
      type: 'xp_gift',
      category: 'earnings',
      priority: 'normal',
      content: `You gained ${amount} XP for ${type.replace('_', ' ')}!`,
      relatedId: relatedId || '',
      read: false,
      createdAt: serverTimestamp()
    });

    return amount;
  } catch (error) {
    console.error('Error gaining XP:', error);
    return 0;
  }
};
