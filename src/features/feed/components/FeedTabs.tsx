import { Globe, TrendingUp, Users } from 'lucide-react';
import type { FeedTab } from '../types';

const TABS: { id: Exclude<FeedTab, 'search'>; label: string; icon: typeof Globe }[] = [
  { id: 'foryou', label: 'For You', icon: Globe },
  { id: 'following', label: 'Following', icon: Users },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
];

export default function FeedTabs({ active, onChange }: { active: FeedTab; onChange: (tab: FeedTab) => void }) {
  return (
    <div
      role="tablist"
      className="flex px-2 border-b border-black/10 dark:border-white/10 bg-background sticky top-0 z-30"
    >
      {TABS.map(tab => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`flex-1 min-w-0 flex items-center justify-center gap-2 py-3.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              selected
                ? 'border-primary text-black dark:text-white font-semibold'
                : 'border-transparent text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white'
            }`}
          >
            <tab.icon size={15} className="hidden sm:block shrink-0" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
