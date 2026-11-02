/**
 * Community categories, shared by the create form, discovery filters and recommendations.
 * Ids match `TOPIC_GROUPS[].category` in onboarding-topics, so a member's interests map to them.
 */
import { TOPIC_GROUPS } from './onboarding-topics';

export interface CommunityCategory {
  id: string;
  label: string;
  /** Lowercase words that suggest this category in a name or description. */
  keywords: string[];
}

export const COMMUNITY_CATEGORIES: CommunityCategory[] = [
  { id: 'creative', label: 'Creative', keywords: ['photo', 'photography', 'camera', 'art', 'design', 'music', 'film', 'video', 'writing', 'writer', 'fashion', 'illustration', 'creative'] },
  { id: 'technology', label: 'Tech', keywords: ['dev', 'developer', 'code', 'coding', 'programming', 'react', 'javascript', 'python', 'ai', 'chatgpt', 'gpt', 'llm', 'web3', 'software', 'tech', 'engineering'] },
  { id: 'build-projects', label: 'Building', keywords: ['build', 'builders', 'startup', 'founder', 'indie', 'project', 'open source', 'hackers', 'maker'] },
  { id: 'monetization-sales', label: 'Business & money', keywords: ['money', 'hustle', 'hustlers', 'business', 'sales', 'marketing', 'income', 'finance', 'crypto', 'invest', 'ecommerce'] },
  { id: 'career', label: 'Career', keywords: ['career', 'job', 'jobs', 'hiring', 'remote', 'freelance', 'interview', 'resume'] },
  { id: 'education-learning', label: 'Learning', keywords: ['learn', 'learning', 'course', 'study', 'tutorial', 'school', 'students', 'education', 'mentor'] },
  { id: 'lifestyle', label: 'Life & wellbeing', keywords: ['fitness', 'gym', 'health', 'food', 'cooking', 'travel', 'wellness', 'gaming', 'gamers', 'faith', 'parents', 'books'] },
  { id: 'challenges-competition', label: 'Challenges', keywords: ['challenge', 'hackathon', 'competition', 'contest'] },
  { id: 'brand', label: 'Brands', keywords: ['brand', 'official', 'company'] },
];

const LABELS = new Map(COMMUNITY_CATEGORIES.map(c => [c.id, c.label]));
export const categoryLabel = (id?: string | null) => (id && LABELS.get(id)) || 'General';

/**
 * A community's category: the stored one if it's a real category, otherwise a best guess from
 * its name and description (older communities were all saved as "General").
 */
export function categoryOf(community: { category?: string; name?: string; description?: string; tags?: string[] }): string {
  if (community.category && LABELS.has(community.category)) return community.category;
  const text = ` ${[community.name, community.description, ...(community.tags ?? [])].join(' ').toLowerCase()} `;
  let best = { id: 'general', hits: 0 };
  for (const c of COMMUNITY_CATEGORIES) {
    const hits = c.keywords.filter(k => text.includes(k.includes(' ') ? k : ` ${k}`) || text.includes(`${k} `)).length;
    if (hits > best.hits) best = { id: c.id, hits };
  }
  return best.id;
}

/** Category ids a member cares about, from their saved interests. */
export function categoriesFromInterests(interests: { categories?: string[]; followedTopics?: string[] } | null | undefined): Set<string> {
  const ids = new Set(interests?.categories ?? []);
  for (const topic of interests?.followedTopics ?? []) {
    const group = TOPIC_GROUPS.find(g => g.topics.some(t => t.toLowerCase() === topic.toLowerCase()));
    if (group) ids.add(group.category);
  }
  return ids;
}
