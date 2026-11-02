/**
 * Topic catalogue shown during onboarding.
 *
 * `category` values match the community category ids used in
 * CreateCommunityModal / CommunityList so they can drive community
 * recommendations and feed ranking (FeedService.extractSignals).
 */
export interface TopicGroup {
  label: string;
  category: string;
  topics: string[];
}

export const TOPIC_GROUPS: TopicGroup[] = [
  { label: 'Creative', category: 'creative', topics: ['Photography', 'Video', 'Music', 'Writing', 'Art & Illustration', 'Fashion'] },
  { label: 'Life & wellbeing', category: 'lifestyle', topics: ['Fitness', 'Food', 'Travel', 'Wellness', 'Personal Finance', 'Gaming'] },
  { label: 'Engineering', category: 'technology', topics: ['React', 'Next.js', 'TypeScript', 'Node.js', 'Python', 'Go', 'PostgreSQL', 'Mobile'] },
  { label: 'AI & emerging tech', category: 'technology', topics: ['AI/ML', 'LLMs', 'Web3', 'AR/VR'] },
  { label: 'Design', category: 'build-projects', topics: ['UI Design', 'UX Research', 'Figma', 'Motion', '3D', 'Typography'] },
  { label: 'Building & shipping', category: 'build-projects', topics: ['Side Projects', 'Open Source', 'Indie Hacking', 'Startups'] },
  { label: 'Learning', category: 'education-learning', topics: ['Tutorials', 'System Design', 'Writing', 'Courses'] },
  { label: 'Career', category: 'career', topics: ['Freelancing', 'Job Hunting', 'Remote Work', 'Productivity'] },
  { label: 'Creator business', category: 'monetization-sales', topics: ['Digital Products', 'Content Creation', 'Marketing'] },
  { label: 'Challenges', category: 'challenges-competition', topics: ['Hackathons', 'Design Challenges', 'Coding Challenges'] },
];

export const RECOMMENDED_TOPIC_COUNT = 3;

export const topicSlug = (topic: string) => topic.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Shape stored in `userInterests/{uid}` / `user_interests`, read by FeedService. */
export interface UserInterestsInput {
  categories: string[];
  skills: string[];
  hashtags: string[];
  followedTopics: string[];
}

export function interestsFromTopics(topics: string[]): UserInterestsInput {
  const selected = new Set(topics);
  const categories = new Set<string>();
  for (const group of TOPIC_GROUPS) {
    if (group.topics.some(t => selected.has(t))) categories.add(group.category);
  }
  const slugs = topics.map(topicSlug);
  return {
    categories: [...categories],
    skills: topics,
    hashtags: slugs.map(s => `#${s}`),
    followedTopics: slugs,
  };
}
