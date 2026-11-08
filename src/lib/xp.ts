import { doc, updateDoc, increment } from 'firebase/firestore';
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
    // Update user XP. Routine XP gains are deliberately silent: the bell is for
    // activity from other people, not a log of your own actions.
    await updateDoc(doc(db, 'users', userId), {
      xp: increment(amount)
    });

    return amount;
  } catch (error) {
    console.error('Error gaining XP:', error);
    return 0;
  }
};
