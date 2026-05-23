import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  criteria: (userData: any, communityData?: any) => boolean;
}

export const BADGES: BadgeDefinition[] = [
  {
    id: 'early_adopter',
    name: 'Early Adopter',
    description: 'One of the first members of the community',
    criteria: () => false, // Manually assigned or based on join date in future
  },
  {
    id: 'xp_hunter',
    name: 'XP Hunter',
    description: 'Earned more than 1000 XP total',
    criteria: (user) => (user.xp || 0) >= 1000,
  },
  {
    id: 'chatty_member',
    name: 'Chatty Member',
    description: 'Sent over 100 messages',
    criteria: (user) => (user.stats?.messagesCount || 0) >= 100,
  },
  {
    id: 'top_contributor',
    name: 'Top Contributor',
    description: 'Highly active and helpful community member',
    criteria: (user) => (user.xp || 0) >= 5000,
  }
];

export const checkAndAwardBadges = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return [];

    const userData = userDoc.data();
    const currentBadges = userData.badges || [];
    const newlyAwarded: string[] = [];

    for (const badge of BADGES) {
      if (!currentBadges.includes(badge.name) && badge.criteria(userData)) {
        newlyAwarded.push(badge.name);
      }
    }

    if (newlyAwarded.length > 0) {
      await updateDoc(userRef, {
        badges: arrayUnion(...newlyAwarded)
      });
    }

    return newlyAwarded;
  } catch (error) {
    console.error("Error checking badges:", error);
    return [];
  }
};
