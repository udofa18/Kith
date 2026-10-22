import { AnimatePresence, motion } from 'motion/react';
import { EyeOff, ThumbsUp, X } from 'lucide-react';
import { explainReason } from '../ranking/score';
import type { FeedItem } from '../types';

interface WhySheetProps {
  item: FeedItem | null;
  onClose: () => void;
  onShowMore: (item: FeedItem) => void;
  onNotInterested: (item: FeedItem) => void;
}

/** Plain-language explanation of why an item is in the viewer's feed, with quick ways to tune it. */
export default function WhySheet({ item, onClose, onShowMore, onNotInterested }: WhySheetProps) {
  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="why-title"
            className="w-full sm:max-w-sm bg-white dark:bg-[#0B0F1A] border border-black/10 dark:border-white/10 rounded-t-2xl sm:rounded-2xl p-6 text-black dark:text-white"
            initial={{ y: 24 }}
            animate={{ y: 0 }}
            exit={{ y: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 id="why-title" className="font-bold text-lg">Why you're seeing this</h2>
              <button onClick={onClose} aria-label="Close" className="p-1 -m-1 rounded-lg text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white">
                <X size={18} />
              </button>
            </div>

            <ul className="space-y-2 mb-6">
              {item.reasons.map(reason => (
                <li key={reason.kind} className="flex gap-2 text-sm text-black/70 dark:text-white/70">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  {explainReason(reason, item.data.authorName)}
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { onShowMore(item); onClose(); }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <ThumbsUp size={14} /> Show more
              </button>
              <button
                onClick={() => { onNotInterested(item); onClose(); }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-black/5 dark:bg-white/10 text-sm font-semibold hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
              >
                <EyeOff size={14} /> Not interested
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
