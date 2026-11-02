import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PenLine, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import PostEditor from './PostEditor';
import ConfirmModal from './ConfirmModal';

/**
 * Floating "create post" button plus the dialog it opens.
 * Full-screen sheet on phones, centered dialog on larger screens.
 */
export default function ComposeFab({ hidden = false }: { hidden?: boolean }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Views with their own composer or a full-screen layout don't need the floating button.
  const view = new URLSearchParams(location.search).get('view');
  const suppressed = hidden || view === 'messages' || view === 'community';

  return (
    <>
      <AnimatePresence>
        {!suppressed && !open && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setOpen(true)}
            aria-label="Create post"
            title="Create post"
            className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30 flex items-center justify-center hover:bg-primary/90 active:scale-95 transition"
          >
            <PenLine size={22} />
          </motion.button>
        )}
      </AnimatePresence>
      <ComposeDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ComposeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    // Keep the page behind from scrolling while the dialog is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, dirty]);

  const onPosted = () => {
    setDirty(false);
    onClose();
    queryClient.invalidateQueries({ queryKey: ['feed'] });
    toast.success('Posted');
  };

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[90] flex sm:items-start justify-center bg-black/50 backdrop-blur-sm sm:pt-[10vh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Create post"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full h-full sm:h-auto sm:max-w-xl sm:max-h-[80vh] overflow-y-auto bg-background text-black dark:text-white sm:rounded-2xl sm:border border-black/10 dark:border-white/10 shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 bg-background/90 backdrop-blur-md">
                <button onClick={requestClose} aria-label="Close" className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                  <X size={20} />
                </button>
                <span className="text-sm font-semibold">Create post</span>
                <span className="w-9" />
              </div>
              <PostEditor variant="dialog" autoFocus onDirtyChange={setDirty} onPostCreated={onPosted} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmModal
        isOpen={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); setDirty(false); onClose(); }}
        title="Discard post?"
        message="What you've written will be lost."
        confirmText="Discard"
      />
    </>,
    document.body,
  );
}
