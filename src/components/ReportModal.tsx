import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flag, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId?: string;
  channelId?: string;
  targetId: string; // Message ID or User ID
  targetType: 'message' | 'user';
  contentSnippet?: string;
  targetAuthorId?: string;
}

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam', description: 'Irrelevant, repeated, or commercial content' },
  { id: 'harassment', label: 'Harassment', description: 'Bullying, targeted attacks, or unwanted behavior' },
  { id: 'inappropriate', label: 'Inappropriate', description: 'Nudity, violence, or sensitive content' },
  { id: 'hate_speech', label: 'Hate Speech', description: 'Attacking protected groups or individuals' },
  { id: 'other', label: 'Other', description: 'Any other violation of community guidelines' }
];

export default function ReportModal({ isOpen, onClose, communityId, channelId, targetId, targetType, contentSnippet, targetAuthorId }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason || !auth.currentUser) return;

    setIsSubmitting(true);
    try {
      const reportData = {
        communityId: communityId || 'global',
        channelId: channelId || null,
        reporterId: auth.currentUser.uid,
        reporterName: auth.currentUser.displayName || 'Anonymous',
        targetId,
        targetType,
        targetAuthorId: targetAuthorId || null,
        contentSnippet: contentSnippet || '',
        reason: selectedReason,
        details,
        status: 'pending',
        createdAt: serverTimestamp()
      };

      if (communityId) {
        await addDoc(collection(db, 'communities', communityId, 'reports'), reportData);
      } else {
        await addDoc(collection(db, 'reports'), reportData);
      }

      toast.success(communityId ? 'Report submitted to community moderators' : 'Report submitted to platform moderators');
      onClose();
      // Reset state
      setSelectedReason(null);
      setDetails('');
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Failed to submit report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-red-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500">
                  <Flag size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">Report Content</h3>
                  <p className="text-xs text-foreground/40 font-bold uppercase tracking-widest">Submit for moderation</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              {/* Content Snippet Preview */}
              {contentSnippet && (
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                  <p className="text-[10px] font-black text-foreground/20 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <AlertTriangle size={10} className="text-yellow-500" /> Reported Content
                  </p>
                  <p className="text-sm text-foreground/60 italic line-clamp-2">"{contentSnippet}"</p>
                </div>
              )}

              {/* Reasons Grid */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest px-1">Select a reason</p>
                <div className="grid grid-cols-1 gap-2">
                  {REPORT_REASONS.map((reason) => (
                    <button
                      key={reason.id}
                      onClick={() => setSelectedReason(reason.id)}
                      className={`flex items-start gap-4 p-4 rounded-2xl border transition-all text-left ${
                        selectedReason === reason.id
                          ? 'bg-primary/10 border-primary shadow-lg scale-[1.02]'
                          : 'bg-white/5 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        selectedReason === reason.id ? 'border-primary' : 'border-foreground/20'
                      }`}>
                        {selectedReason === reason.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div>
                        <p className="text-sm font-black">{reason.label}</p>
                        <p className="text-[10px] text-foreground/40 font-medium leading-tight">{reason.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional Details */}
              <div className="space-y-2">
                <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest px-1">Additional Details (Optional)</p>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Provide more context for the moderators..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-primary/50 transition-colors min-h-[100px] resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-6 bg-white/5 border-t border-white/5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-foreground/40">
                <ShieldCheck size={14} className="text-green-500" />
                <span className="text-[9px] font-black uppercase tracking-widest">Confidential submission</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!selectedReason || isSubmitting}
                  className="px-8 py-3 rounded-2xl bg-red-500 text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-red-500/20 disabled:opacity-50 disabled:scale-100 hover:scale-105 transition-all flex items-center gap-2"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
