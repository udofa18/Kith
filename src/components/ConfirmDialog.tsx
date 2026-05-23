import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export default function ConfirmDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel', 
  isLoading = false 
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => !isLoading && onClose()}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md bg-[#0B0F19] border border-white/10 rounded-2xl shadow-2xl p-6"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex flex-shrink-0 items-center justify-center border border-red-500/30">
                <AlertTriangle className="text-red-400" size={20} />
              </div>
              <div className="flex-1 pt-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-white">{title}</h3>
                  <button 
                    onClick={onClose}
                    disabled={isLoading}
                    className="text-white/40 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="text-sm text-white/60 leading-relaxed mb-6">
                  {message}
                </p>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={onClose}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl border border-white/10 text-white/70 hover:bg-white/5 transition-colors text-sm font-bold disabled:opacity-50"
                  >
                    {cancelText}
                  </button>
                  <button 
                    onClick={onConfirm}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/30 transition-all text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoading && <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />}
                    {confirmText}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
