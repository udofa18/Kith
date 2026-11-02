import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Flag, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '../firebase';

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

const REASONS = [
  { id: 'spam', label: 'Spam', description: 'Irrelevant, repeated or commercial content' },
  { id: 'harassment', label: 'Harassment', description: 'Bullying, targeted attacks or unwanted contact' },
  { id: 'inappropriate', label: 'Inappropriate', description: 'Nudity, violence or other sensitive content' },
  { id: 'hate_speech', label: 'Hate speech', description: 'Attacks on a person or group for who they are' },
  { id: 'other', label: 'Something else', description: 'Breaks the community guidelines in another way' },
];
const MAX_DETAILS = 1000;

export default function ReportModal({ isOpen, onClose, communityId, channelId, targetId, targetType, contentSnippet, targetAuthorId }: ReportModalProps) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const me = auth.currentUser;
  const isSelf = !!me && (targetType === 'user' ? targetId === me.uid : targetAuthorId === me.uid);
  const reportedKey = `reported:${communityId || 'global'}:${targetType}:${targetId}`;
  const alreadyReported = isOpen && typeof sessionStorage !== 'undefined' && sessionStorage.getItem(reportedKey) === '1';

  // Start fresh every time it opens, and let Escape close it.
  useEffect(() => {
    if (!isOpen) return;
    setReason(null); setDetails('');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async () => {
    if (!reason || submitting) return;
    if (!me) return void toast.error('Sign in to report');
    setSubmitting(true);
    try {
      // For a member report the snippet is their name, so moderators see who it is rather than an ID.
      let snippet = (contentSnippet || '').trim();
      if (targetType === 'user' && (!snippet || snippet === targetId)) {
        const user = await getDoc(doc(db, 'users', targetId)).catch(() => null);
        snippet = user?.data()?.displayName || user?.data()?.username || 'Member';
      }
      const data = {
        communityId: communityId || 'global',
        channelId: channelId || null,
        reporterId: me.uid,
        reporterName: me.displayName || 'Anonymous',
        targetId,
        targetType,
        targetAuthorId: targetAuthorId || null,
        contentSnippet: snippet.slice(0, 500),
        reason,
        details: details.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      };
      await addDoc(communityId ? collection(db, 'communities', communityId, 'reports') : collection(db, 'reports'), data);
      sessionStorage.setItem(reportedKey, '1');
      toast.success(communityId ? 'Thanks. The moderators will take a look.' : 'Thanks. Our team will take a look.');
      onClose();
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error("Couldn't send your report. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex sm:items-center justify-center bg-black/50 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md flex flex-col bg-background text-black dark:text-white sm:rounded-2xl sm:border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="shrink-0 px-5 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center"><Flag size={17} /></span>
            <div>
              <h2 id="report-title" className="font-semibold leading-tight">Report {targetType === 'user' ? 'member' : 'message'}</h2>
              <p className="text-xs text-black/50 dark:text-white/50">{communityId ? "Sent to this community's moderators" : 'Sent to the platform team'}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={18} /></button>
        </div>

        {isSelf || alreadyReported ? (
          <div className="p-6 text-sm text-black/65 dark:text-white/65">
            <p>{isSelf ? "You can't report yourself." : "You've already reported this. The moderators have it."}</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 rounded-lg border border-black/15 dark:border-white/15 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10">Close</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {contentSnippet && targetType === 'message' && (
                <blockquote className="px-3 py-2 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-sm text-black/70 dark:text-white/70 line-clamp-3 break-words">{contentSnippet}</blockquote>
              )}
              <fieldset>
                <legend className="text-sm font-medium mb-2">Why are you reporting this?</legend>
                <div role="radiogroup" className="space-y-2">
                  {REASONS.map(r => {
                    const on = reason === r.id;
                    return (
                      <button key={r.id} type="button" role="radio" aria-checked={on} onClick={() => setReason(r.id)}
                        className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${on ? 'border-primary bg-primary/5' : 'border-black/10 dark:border-white/10 hover:border-black/25 dark:hover:border-white/25'}`}>
                        <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-primary' : 'border-black/30 dark:border-white/30'}`}>{on && <span className="w-2 h-2 rounded-full bg-primary" />}</span>
                        <span><span className="block text-sm font-medium">{r.label}</span><span className="block text-xs text-black/55 dark:text-white/55">{r.description}</span></span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <label className="block">
                <span className="text-sm font-medium">More detail <span className="font-normal text-black/50 dark:text-white/50">(optional)</span></span>
                <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={MAX_DETAILS} rows={3} placeholder="Anything that helps the moderators understand"
                  className="mt-1.5 w-full rounded-lg bg-background border border-black/15 dark:border-white/15 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none" />
                <span className="block text-xs text-right text-black/45 dark:text-white/45">{details.length}/{MAX_DETAILS}</span>
              </label>
            </div>
            <div className="shrink-0 px-5 py-4 border-t border-black/10 dark:border-white/10 flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white">Cancel</button>
              <button onClick={submit} disabled={!reason || submitting} className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-40">{submitting ? 'Sending…' : 'Send report'}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
