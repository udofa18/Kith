import { Timestamp } from 'firebase/firestore';

export interface RankingWeights {
  relationship: number;
  interest: number;
  engagement: number;
  freshness: number;
  trust: number;
  behavior: number;
  monetization: number;
  diversity: number;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  relationship: 0.25,
  interest: 0.20,
  engagement: 0.15,
  freshness: 0.15,
  trust: 0.10,
  behavior: 0.10,
  monetization: 0.03,
  diversity: 0.02,
};

export interface RankingSignals {
  // Relationship (0 to 1)
  isFollowing: boolean;
  mutualConnections: number; // normalized
  sharedCommunities: number; // normalized
  pastInteractionsCount: number; // normalized
  hasDMHistory: boolean;
  viewedProfileRecently: boolean;

  // Interest (0 to 1)
  matchesInterests: boolean;
  matchesFollowedHashtags: boolean;
  matchesTechStack: boolean;
  topicRelevance: number; // 0 to 1

  // Engagement (0 to 1)
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  bookmarksCount: number;
  avgDwellTime: number; // normalized
  completionRate: number; // 0 to 1

  // Freshness (0 to 1)
  createdAt: Timestamp | Date;
  engagementVelocity: number; // normalized increase in engagement

  // Trust (0 to 1)
  creatorReputation: number; // 0 to 1
  isVerified: boolean;
  reportRate: number; // 0 to 1 (smaller is better)

  // Behavior (0 to 1)
  matchesPastLikes: boolean;
  matchesPurchases: boolean;
  matchesAttendedEvents: boolean;

  // Monetization (0 to 1)
  isPromoted: boolean;
  relevanceToPurchases: number; // 0 to 1

  // Negative signals
  isMuted: boolean;
  isHidden: boolean;
  isReported: boolean;
  alreadyViewedCount: number;
}

export function calculateFeedScore(
  signals: RankingSignals,
  weights: RankingWeights = DEFAULT_WEIGHTS
): { score: number; reason: string } {
  if (signals.isMuted || signals.isHidden || signals.isReported) {
    return { score: -1000, reason: "Negative Signal" };
  }

  // 1. Relationship Score
  let relationshipScore = 0;
  if (signals.isFollowing) relationshipScore += 0.5;
  if (signals.hasDMHistory) relationshipScore += 0.2;
  if (signals.viewedProfileRecently) relationshipScore += 0.1;
  relationshipScore += Math.min(0.2, (signals.mutualConnections + signals.sharedCommunities + signals.pastInteractionsCount) * 0.1);
  relationshipScore = Math.min(1, relationshipScore);

  // 2. Interest Score
  let interestScore = signals.topicRelevance || 0;
  if (signals.matchesInterests) interestScore += 0.3;
  if (signals.matchesFollowedHashtags) interestScore += 0.2;
  if (signals.matchesTechStack) interestScore += 0.2;
  interestScore = Math.min(1, interestScore);

  // 3. Engagement Score
  // Normalized metrics (assuming they are already 0-1 or we scale them)
  let engagementScore = (signals.likesCount * 0.1 + signals.commentsCount * 0.2 + signals.bookmarksCount * 0.3 + signals.repostsCount * 0.4);
  engagementScore = Math.min(1, engagementScore * signals.completionRate);

  // 4. Freshness Score
  const now = new Date().getTime();
  const created = signals.createdAt instanceof Timestamp ? signals.createdAt.toMillis() : new Date(signals.createdAt).getTime();
  const hoursOld = (now - created) / (1000 * 60 * 60);
  // Exponential decay
  let freshnessScore = Math.exp(-hoursOld / 24); // half life 24h
  freshnessScore = Math.min(1, freshnessScore + signals.engagementVelocity);

  // 5. Trust Score
  let trustScore = signals.creatorReputation;
  if (signals.isVerified) trustScore += 0.2;
  trustScore -= signals.reportRate;
  trustScore = Math.max(0, Math.min(1, trustScore));

  // 6. Behavior Score
  let behaviorScore = 0;
  if (signals.matchesPastLikes) behaviorScore += 0.4;
  if (signals.matchesPurchases) behaviorScore += 0.3;
  if (signals.matchesAttendedEvents) behaviorScore += 0.3;
  behaviorScore = Math.min(1, behaviorScore);

  // 7. Monetization Score
  let monetizationScore = signals.relevanceToPurchases;
  if (signals.isPromoted) monetizationScore += 0.2;
  monetizationScore = Math.min(1, monetizationScore);

  // Negative Penalty
  const negativePenalty = signals.alreadyViewedCount * 0.1;

  // Final Weighted sum
  const finalScore = 
    relationshipScore * weights.relationship +
    interestScore * weights.interest +
    engagementScore * weights.engagement +
    freshnessScore * weights.freshness +
    trustScore * weights.trust +
    behaviorScore * weights.behavior +
    monetizationScore * weights.monetization -
    negativePenalty;

  // Determine Reason
  let reason = "Recommended for you";
  if (signals.isFollowing) reason = "From creators you follow";
  else if (signals.sharedCommunities > 0) reason = "Popular in your communities";
  else if (signals.matchesInterests) reason = "Matches your interests";
  else if (freshnessScore > 0.8 && engagementScore > 0.5) reason = "Trending now";

  return { score: finalScore, reason };
}
