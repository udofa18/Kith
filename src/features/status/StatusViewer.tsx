import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { ChevronLeft, ChevronRight, Eye, MessageCircle, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import Avatar from '../../components/ui/Avatar';
import ConfirmModal from '../../components/ConfirmModal';
import { deleteStatus, fetchStatusViewers, isSeen, markSeen, recordStatusView, type StatusGroup } from './api';

const IMAGE_MS = 5000;

/** Full-screen status player: tap right/left to move, hold to pause, swipe through people. */
export default function StatusViewer({ groups, startIndex, onClose }: {
  groups: StatusGroup[];
  startIndex: number;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [groupIndex, setGroupIndex] = useState(startIndex);
  // Open at the first status not seen yet.
  const [itemIndex, setItemIndex] = useState(() => {
    const first = groups[startIndex]?.items.findIndex(s => !isSeen(s.id)) ?? -1;
    return first === -1 ? 0 : first;
  });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pressStart = useRef(0);

  const group = groups[groupIndex];
  const status = group?.items[itemIndex];
  const isMine = !!group?.isMine;

  const next = useCallback(() => {
    if (!group) return;
    if (itemIndex < group.items.length - 1) setItemIndex(i => i + 1);
    else if (groupIndex < groups.length - 1) { setGroupIndex(g => g + 1); setItemIndex(0); }
    else onClose();
  }, [group, itemIndex, groupIndex, groups.length, onClose]);

  const prev = useCallback(() => {
    if (itemIndex > 0) setItemIndex(i => i - 1);
    else if (groupIndex > 0) { setGroupIndex(g => g - 1); setItemIndex(groups[groupIndex - 1].items.length - 1); }
    else setProgress(0);
  }, [itemIndex, groupIndex, groups]);

  // Reset per status, and record the view.
  useEffect(() => {
    if (!status) return;
    setProgress(0);
    setMediaReady(status.type === 'text');
    setShowViewers(false);
    markSeen(status.id);
    if (!isMine && user?.uid) recordStatusView(status.id, user.uid);
  }, [status?.id]);

  // Timer for photos and text; videos report their own progress.
  const holding = paused || showViewers || confirmDelete || !mediaReady;
  useEffect(() => {
    if (!status || status.type === 'video' || holding) return;
    const duration = status.type === 'text' ? Math.min(10_000, IMAGE_MS + (status.text?.length ?? 0) * 25) : IMAGE_MS;
    const started = performance.now() - progress * duration;
    let frame = 0;
    const tick = (now: number) => {
      const p = (now - started) / duration;
      if (p >= 1) return next();
      setProgress(p);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status?.id, holding, next]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (holding && mediaReady) v.pause();
    else if (mediaReady) v.play().catch(() => undefined);
  }, [holding, mediaReady, status?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmDelete) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [next, prev, onClose, confirmDelete]);

  const { data: viewers } = useQuery({
    queryKey: ['status-viewers', status?.id],
    queryFn: () => fetchStatusViewers(status!.id),
    enabled: isMine && !!status,
    staleTime: 30_000,
  });

  if (!group || !status) return null;

  const remove = async () => {
    setConfirmDelete(false);
    try {
      await deleteStatus(status, group.items);
      toast.success('Status deleted');
      queryClient.invalidateQueries({ queryKey: ['status-tray'] });
      onClose();
    } catch {
      toast.error("Couldn't delete status");
    }
  };

  // Pointer handling: a short tap navigates, a press-and-hold pauses.
  const onPointerDown = () => { pressStart.current = Date.now(); setPaused(true); };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setPaused(false);
    if (Date.now() - pressStart.current > 250) return;
    const { left, width } = e.currentTarget.getBoundingClientRect();
    if (e.clientX - left < width / 3) prev();
    else next();
  };

  return createPortal(
    <div className="keep-dark fixed inset-0 z-[100] bg-black flex items-center justify-center select-none" role="dialog" aria-modal="true" aria-label={`${group.name}'s status`}>
      {groupIndex > 0 && (
        <button onClick={() => { setGroupIndex(g => g - 1); setItemIndex(0); }} aria-label="Previous person" className="hidden md:flex absolute left-[calc(50%-260px)] -translate-x-full mr-4 w-10 h-10 rounded-full bg-white/10 text-white items-center justify-center hover:bg-white/20">
          <ChevronLeft size={22} />
        </button>
      )}
      {groupIndex < groups.length - 1 && (
        <button onClick={() => { setGroupIndex(g => g + 1); setItemIndex(0); }} aria-label="Next person" className="hidden md:flex absolute right-[calc(50%-260px)] translate-x-full ml-4 w-10 h-10 rounded-full bg-white/10 text-white items-center justify-center hover:bg-white/20">
          <ChevronRight size={22} />
        </button>
      )}

      <div className="relative w-full h-full md:w-[420px] md:h-[min(92vh,780px)] md:rounded-2xl overflow-hidden bg-neutral-900">
        {/* Content */}
        <div className="absolute inset-0 flex items-center justify-center" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerLeave={() => setPaused(false)}>
          {status.type === 'text' ? (
            <div className="w-full h-full flex items-center justify-center p-8" style={{ background: status.background }}>
              <p className="text-white text-2xl sm:text-3xl font-semibold text-center leading-snug whitespace-pre-wrap break-words">{status.text}</p>
            </div>
          ) : status.type === 'video' ? (
            <video
              key={status.id}
              ref={videoRef}
              src={status.mediaUrl}
              playsInline
              className="w-full h-full object-contain"
              onLoadedData={() => setMediaReady(true)}
              onTimeUpdate={e => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }}
              onEnded={next}
              onError={() => setMediaReady(true)}
            />
          ) : (
            <img
              key={status.id}
              src={status.mediaUrl}
              alt=""
              draggable={false}
              className="w-full h-full object-contain"
              onLoad={() => setMediaReady(true)}
              onError={() => setMediaReady(true)}
            />
          )}
          {!mediaReady && <div className="absolute w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
        </div>

        {/* Caption */}
        {status.type !== 'text' && status.text && (
          <div className="absolute inset-x-0 bottom-20 px-5 pointer-events-none">
            <p className="mx-auto w-fit max-w-full px-3 py-2 rounded-xl bg-black/50 text-white text-[15px] text-center whitespace-pre-wrap">{status.text}</p>
          </div>
        )}

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 p-3 pt-[max(12px,env(safe-area-inset-top))] bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex gap-1">
            {group.items.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 rounded-full bg-white/30 overflow-hidden">
                <div className="h-full bg-white" style={{ width: `${i < itemIndex ? 100 : i === itemIndex ? progress * 100 : 0}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5 text-white">
            <button onClick={() => { onClose(); navigate(`/creators/${group.uid}`); }} className="flex items-center gap-2.5 min-w-0">
              <Avatar src={group.photo} seed={group.uid} size={36} />
              <span className="min-w-0 text-left">
                <span className="block text-sm font-semibold truncate">{isMine ? 'Your status' : group.name}</span>
                <span className="block text-xs text-white/70">{formatDistanceToNowStrict(status.createdAt, { addSuffix: true })}</span>
              </span>
            </button>
            <div className="ml-auto flex items-center gap-1">
              {isMine && (
                <button onClick={() => setConfirmDelete(true)} aria-label="Delete status" className="p-2 rounded-full hover:bg-white/15">
                  <Trash2 size={19} />
                </button>
              )}
              <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-white/15">
                <X size={22} />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="absolute inset-x-0 bottom-0 p-4 pb-[max(16px,env(safe-area-inset-bottom))] flex justify-center bg-gradient-to-t from-black/60 to-transparent">
          {isMine ? (
            <button onClick={() => setShowViewers(true)} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 text-white text-sm font-medium hover:bg-white/25">
              <Eye size={16} /> {viewers ? `Seen by ${viewers.length}` : 'Seen by …'}
            </button>
          ) : (
            <button
              onClick={() => { onClose(); navigate(`/feed?view=messages&userId=${group.uid}`); }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 text-white text-sm font-medium hover:bg-white/25"
            >
              <MessageCircle size={16} /> Reply to {group.name.split(' ')[0]}
            </button>
          )}
        </div>

        {/* Viewers sheet */}
        {showViewers && (
          <div className="absolute inset-0 bg-black/50 flex items-end" onClick={() => setShowViewers(false)}>
            <div className="w-full max-h-[60%] overflow-y-auto rounded-t-2xl bg-background text-black dark:text-white p-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold">Seen by {viewers?.length ?? 0}</p>
                <button onClick={() => setShowViewers(false)} aria-label="Close" className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={18} /></button>
              </div>
              {viewers?.length ? viewers.map(v => (
                <div key={v.uid} className="flex items-center gap-3 py-2">
                  <Avatar src={v.photo} seed={v.uid} size={36} />
                  <span className="flex-1 text-sm font-medium truncate">{v.name}</span>
                  <span className="text-xs text-black/50 dark:text-white/50">{formatDistanceToNowStrict(v.viewedAt, { addSuffix: true })}</span>
                </div>
              )) : <p className="text-sm text-black/50 dark:text-white/50 py-4 text-center">No views yet.</p>}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete status?"
        message="It will be removed for everyone."
        confirmText="Delete"
      />
    </div>,
    document.body,
  );
}
