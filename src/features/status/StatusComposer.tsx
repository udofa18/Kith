import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Type, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { createStatus, STATUS_BACKGROUNDS, STATUS_TEXT_MAX } from './api';

const MAX_VIDEO_SECONDS = 60;
const MAX_FILE_MB = 50;

/** Create a status: a photo/video with an optional caption, or text on a colour. */
export default function StatusComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'text' | 'media'>('text');
  const [text, setText] = useState('');
  const [background, setBackground] = useState(STATUS_BACKGROUNDS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !posting) close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, posting]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (!open || !user) return null;

  const reset = () => {
    setText('');
    setFile(null);
    setPreview(null);
    setMode('text');
  };
  const close = () => { reset(); onClose(); };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) return toast.error('Choose a photo or video');
    if (f.size > MAX_FILE_MB * 1024 * 1024) return toast.error(`Files must be under ${MAX_FILE_MB} MB`);
    const url = URL.createObjectURL(f);
    if (f.type.startsWith('video/')) {
      const seconds = await videoDuration(url);
      if (seconds > MAX_VIDEO_SECONDS + 1) {
        URL.revokeObjectURL(url);
        return toast.error(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds`);
      }
    }
    setFile(f);
    setPreview(url);
    setMode('media');
  };

  const canPost = mode === 'text' ? text.trim().length > 0 : !!file;

  const post = async () => {
    if (!canPost || posting) return;
    setPosting(true);
    const audience = user.settings?.activity?.statusAudience === 'only-me' ? 'only-me' : 'followers';
    try {
      await createStatus(
        {
          uid: user.uid,
          name: user.displayName || user.username || 'Member',
          username: user.username || '',
          photo: user.profileImage || user.photoURL || '',
        },
        mode === 'text' ? { text, background, audience } : { file: file!, text, audience },
      );
      toast.success(audience === 'only-me' ? 'Saved to your private statuses' : 'Status shared with your followers');
      queryClient.invalidateQueries({ queryKey: ['status-tray'] });
      close();
    } catch (err) {
      console.error('Status upload failed', err);
      toast.error("Couldn't share your status");
    } finally {
      setPosting(false);
    }
  };

  return createPortal(
    <div
      className="keep-dark fixed inset-0 z-[95] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget && !posting) close(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="New status" className="relative w-full h-full sm:w-[400px] sm:h-[min(88vh,720px)] sm:rounded-2xl overflow-hidden bg-neutral-900 text-white flex flex-col">
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={close} disabled={posting} aria-label="Close" className="p-2 rounded-full hover:bg-white/15"><X size={22} /></button>
          <span className="text-sm font-semibold">New status</span>
          <span className="w-10" />
        </div>

        {/* Canvas */}
        <div className="flex-1 relative flex items-center justify-center" style={mode === 'text' ? { background } : undefined}>
          {mode === 'text' ? (
            <textarea
              autoFocus
              value={text}
              onChange={e => setText(e.target.value.slice(0, STATUS_TEXT_MAX))}
              placeholder="Type a status"
              rows={4}
              className="w-full px-8 bg-transparent text-center text-2xl sm:text-3xl font-semibold leading-snug placeholder:text-white/60 outline-none resize-none"
            />
          ) : preview && file?.type.startsWith('video/') ? (
            <video src={preview} className="w-full h-full object-contain" autoPlay muted loop playsInline />
          ) : preview ? (
            <img src={preview} alt="" className="w-full h-full object-contain" />
          ) : null}
        </div>

        {/* Controls */}
        <div className="p-3 pb-[max(12px,env(safe-area-inset-bottom))] space-y-3 bg-black/40">
          {mode === 'text' ? (
            <div className="flex items-center justify-center gap-2">
              {STATUS_BACKGROUNDS.map(color => (
                <button
                  key={color}
                  onClick={() => setBackground(color)}
                  aria-label="Background colour"
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${background === color ? 'border-white scale-110' : 'border-white/30'}`}
                  style={{ background: color }}
                />
              ))}
            </div>
          ) : (
            <input
              value={text}
              onChange={e => setText(e.target.value.slice(0, STATUS_TEXT_MAX))}
              placeholder="Add a caption"
              className="w-full px-4 py-2.5 rounded-full bg-white/10 text-sm placeholder:text-white/50 outline-none focus:bg-white/15"
            />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setMode('text'); setFile(null); setPreview(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm ${mode === 'text' ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <Type size={16} /> Text
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm ${mode === 'media' ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <ImageIcon size={16} /> Photo or video
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
            <button
              onClick={post}
              disabled={!canPost || posting}
              className="ml-auto px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
              {posting ? 'Sharing…' : 'Share'}
            </button>
          </div>
          <p className="text-[11px] text-white/50 text-center">Visible to your followers for 24 hours.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function videoDuration(url: string): Promise<number> {
  return new Promise(resolve => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve(v.duration || 0);
    v.onerror = () => resolve(0);
    v.src = url;
  });
}
