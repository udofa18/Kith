import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export default function FeedEmpty({ icon: Icon, title, body, action }: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-20 px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
        <Icon size={22} />
      </div>
      <p className="font-semibold mb-1">{title}</p>
      <p className="text-sm text-black/50 dark:text-white/50 max-w-xs mx-auto">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
