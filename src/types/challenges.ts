export type ChallengeType = 'build' | 'design' | 'content' | 'problem-solving';
export type ChallengeStatus = 'draft' | 'active' | 'judging' | 'completed' | 'cancelled';
export type ChallengeSelectionMode = 'manual' | 'community' | 'hybrid';
export type DistributionType = 'top3' | 'winner-takes-all' | 'proportional';

export interface Challenge {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  type: ChallengeType;
  status: ChallengeStatus;
  
  // Entry
  entryFee?: {
    amount: number;
    currency: string;
  };
  
  // Rewards
  rewardPool: {
    cashAmount?: number;
    currency?: string;
    xpAmount?: number;
    distributionType: DistributionType | 'custom';
    breakdown?: { place: string; amount: string | number }[];
  };
  
  // Timeline
  deadlines: {
    registrationStart: number; // timestamp
    submissionEnd: number;
    votingEnd?: number; // optional, for community voting
    judgingEnd: number;
  };
  
  // Evaluation
  selectionMode: ChallengeSelectionMode;
  judges?: string[]; // array of user IDs who can judge (if manual/hybrid)
  
  // Stats
  participantCount: number;
  submissionCount: number;
  
  // Extended details based on new structural design
  creatorName?: string;
  image?: string;
  isVerified?: boolean;
  regionRestriction?: string; // e.g., 'Nigeria', 'Global'
  skillsNeeded?: string[]; // e.g., ['Content', 'Design']
  contactLink?: string; // e.g., 'mailto:hi@example.com' or discord link
  winnerAnnouncementDate?: number; // timestamp
  
  // Content breakdown (more structured than just 'description')
  overview?: string; // Used if structured data is provided, falls back to description
  objectives?: string[];
  requirements?: { title?: string; text: string }[];
  customQuestions?: string[];

  createdAt: number;
  updatedAt: number;
}

export interface ChallengeParticipant {
  id: string;
  challengeId: string;
  userId: string;
  joinedAt: number;
  status: 'joined' | 'submitted' | 'disqualified';
}

export interface ChallengeSubmission {
  id: string;
  challengeId: string;
  participantId: string;
  userId: string;
  title: string;
  description: string;
  assets: string[]; // array of URLs (Github, Figma, Vercel, Images)
  status: 'pending' | 'approved' | 'rejected'; // mostly for moderation
  
  // Scoring
  votesCount: number; // from community
  judgeScore: number; // out of 100
  finalScore: number; // aggregated based on selectionMode weighting
  
  submittedAt: number;
}

export interface ChallengeVote {
  id: string;
  challengeId: string;
  submissionId: string;
  userId: string;
  weight: number; // XP-based weight or reputation-based weight
  votedAt: number;
}

export interface EscrowTransaction {
  id: string;
  challengeId: string;
  userId: string; // sender or receiver depending on type
  amount: number;
  currency: string;
  type: 'deposit' | 'fee' | 'payout' | 'refund';
  status: 'pending' | 'completed' | 'failed';
  createdAt: number;
}
