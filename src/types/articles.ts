
export type ArticleDifficulty = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';

export interface ArticleCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  subcategories: string[];
}

export const ARTICLE_CATEGORIES: ArticleCategory[] = [
  {
    id: 'tech',
    name: 'Technology',
    slug: 'technology',
    icon: 'Terminal',
    color: 'blue',
    subcategories: ['Software Development', 'Artificial Intelligence', 'Cybersecurity', 'Cloud Computing', 'Web3', 'Hardware', 'Data Science']
  },
  {
    id: 'design',
    name: 'Design',
    slug: 'design',
    icon: 'Palette',
    color: 'pink',
    subcategories: ['UI/UX Design', 'Product Design', 'Visual Identity', 'Motion Design', 'Architecture', 'Typography']
  },
  {
    id: 'business',
    name: 'Business',
    slug: 'business',
    icon: 'Briefcase',
    color: 'orange',
    subcategories: ['Entrepreneurship', 'Startups', 'Marketing', 'Sales', 'Management', 'Strategy']
  },
  {
    id: 'finance',
    name: 'Finance',
    slug: 'finance',
    icon: 'PieChart',
    color: 'emerald',
    subcategories: ['Personal Finance', 'Investing', 'Crypto', 'Economics', 'Venture Capital', 'FinTech']
  },
  {
    id: 'community',
    name: 'Community',
    slug: 'community',
    icon: 'Users',
    color: 'purple',
    subcategories: ['DAO', 'Events', 'Social Impact', 'Governance', 'Mental Health', 'Shared Spaces']
  },
  {
    id: 'career',
    name: 'Career',
    slug: 'career',
    icon: 'Target',
    color: 'indigo',
    subcategories: ['Networking', 'Personal Branding', 'Job Hunting', 'Leadership', 'Remote Work', 'Soft Skills']
  },
  {
    id: 'productivity',
    name: 'Productivity',
    slug: 'productivity',
    icon: 'Zap',
    color: 'yellow',
    subcategories: ['Time Management', 'Workflow', 'Tooling', 'Habits', 'Focus', 'No-Code']
  },
  {
    id: 'creator',
    name: 'Creator Economy',
    slug: 'creator-economy',
    icon: 'Video',
    color: 'rose',
    subcategories: ['Content Creation', 'Monetization', 'E-commerce', 'Audience Growth', 'Platforms', 'Digital Products']
  },
  {
    id: 'industry',
    name: 'Industry Insights',
    slug: 'industry-insights',
    icon: 'LineChart',
    color: 'cyan',
    subcategories: ['Market Reports', 'Future Trends', 'Case Studies', 'Regulation', 'Supply Chain', 'Automation']
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle',
    slug: 'lifestyle',
    icon: 'Coffee',
    color: 'amber',
    subcategories: ['Travel', 'Wellness', 'Culture', 'Philosophy', 'Sustainability', 'Digital Nomad']
  },
  {
    id: 'news',
    name: 'News',
    slug: 'news',
    icon: 'Globe',
    color: 'slate',
    subcategories: ['Global News', 'Tech News', 'Policy', 'Politics', 'Announcements']
  }
];

export interface SEOProperties {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  canonicalUrl?: string;
  ogType?: 'article' | 'website' | 'profile';
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  slug?: string;
}

export interface ArticleMetadata {
  primaryCategoryId: string;
  subcategory?: string;
  tags: string[];
  readingTimeMinutes: number;
  difficulty: ArticleDifficulty;
  isFeatured: boolean;
  publishedAt: any;
  featuredCollectionId?: string;
  seo?: SEOProperties;
}

export interface FeaturedCollection {
  id: string;
  name: string;
  description: string;
  thumbnailUrl?: string;
  categoryId?: string;
  articleIds: string[];
}
