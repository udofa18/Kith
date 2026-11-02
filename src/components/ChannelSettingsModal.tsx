import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '../firebase';
import ConfirmModal from './ConfirmModal';
import { ChannelEditor } from './community/ChannelSettings';
import { clearChannelMessages, deleteChannelWithMessages } from '../lib/channelAdmin';
import { useMembership } from '../lib/communityRoles';

interface ChannelSettingsModalProps {
  communityId: string;
  channel: any;
  isOpen: boolean;
  onClose: () => void;
  roles?: any[];
  welcomeChannelId?: string;
}

/** The same channel editor as Settings → Channels, opened from the channel header. */
export default function ChannelSettingsModal({ communityId, channel, isOpen, onClose, roles = [], welcomeChannelId }: ChannelSettingsModalProps) {
  const me = useMembership(communityId);
  const [categories, setCategories] = useState<any[]>([]);
  const [pending, setPending] = useState<'delete' | 'clear' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen || !communityId) return;
    return onSnapshot(query(collection(db, 'communities', communityId, 'categories'), orderBy('order', 'asc')),
      snap => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [communityId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, pending, onClose]);

  if (!isOpen || !channel) return null;

  // Admins and the channel's own owners can edit it; moderators can look.
  const canEdit = me.isAdmin || (channel.owners || []).includes(auth.currentUser?.uid);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending === 'delete') { await deleteChannelWithMessages(communityId, channel); toast.success('Channel deleted'); setPending(null); onClose(); }
      else { await clearChannelMessages(communityId, channel); toast.success('Messages cleared'); setPending(null); }
    } catch (e) {
      console.error(e);
      toast.error("Couldn't do that");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex sm:items-center justify-center bg-black/50 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="channel-settings-title" className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-xl flex flex-col bg-background text-black dark:text-white sm:rounded-2xl sm:border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="shrink-0 px-5 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 id="channel-settings-title" className="font-semibold leading-tight">Channel settings</h2>
            <p className="text-xs text-black/50 dark:text-white/50">#{channel.name}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={18} /></button>
        </div>
        {!canEdit && <p className="shrink-0 px-5 py-2.5 text-sm bg-amber-500/10 text-amber-700 dark:text-amber-400">Only admins and this channel's owners can change these settings.</p>}
        <div className="flex-1 overflow-y-auto">
          <ChannelEditor
            communityId={communityId} channel={channel} categories={categories} roles={roles} canEdit={canEdit}
            isWelcomeChannel={channel.id === welcomeChannelId}
            onDelete={() => setPending('delete')} onClear={() => setPending('clear')}
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={!!pending} onClose={() => setPending(null)} onConfirm={confirm} loading={busy}
        title={pending === 'clear' ? `Clear #${channel.name}?` : `Delete #${channel.name}?`}
        message={pending === 'clear' ? "Every message is permanently deleted. The channel stays. This can't be undone." : "The channel and all of its messages are permanently deleted. This can't be undone."}
        confirmText={pending === 'clear' ? 'Clear messages' : 'Delete channel'}
      />
    </div>,
    document.body,
  );
}
