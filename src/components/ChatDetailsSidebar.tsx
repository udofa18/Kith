import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Users, MapPin, Globe, Clock, FileText, Image as ImageIcon, Link2,
  ExternalLink, Paperclip, ChevronRight
} from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import VerifiedBadge from './VerifiedBadge';
import {
  deriveCountryFromLocation,
  extractAttachmentsFromMessages,
  extractLinksFromMessages,
  formatTimezoneLabel,
} from '../lib/chatMedia';

interface ChatMessageLike {
  id: string;
  senderId: string;
  content?: string;
  createdAt?: any;
  type?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
}

interface ChatDetailsSidebarProps {
  userId: string;
  messages: ChatMessageLike[];
  onClose: () => void;
  className?: string;
}

type MediaTab = 'files' | 'images' | 'links';

export default function ChatDetailsSidebar({
  userId,
  messages,
  onClose,
  className = '',
}: ChatDetailsSidebarProps) {
  const [profile, setProfile] = useState<any>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [activeTab, setActiveTab] = useState<MediaTab>('images');

  useEffect(() => {
    if (!userId) return;

    const unsubUser = onSnapshot(doc(db, 'users', userId), snap => {
      setProfile(snap.exists() ? snap.data() : null);
    }, error => handleFirestoreError(error, OperationType.GET, `users/${userId}`));

    const unsubFollowers = onSnapshot(
      collection(db, 'users', userId, 'followers'),
      snap => setFollowersCount(snap.size),
      error => handleFirestoreError(error, OperationType.GET, `users/${userId}/followers`)
    );

    return () => {
      unsubUser();
      unsubFollowers();
    };
  }, [userId]);

  const attachments = useMemo(() => extractAttachmentsFromMessages(messages), [messages]);
  const images = useMemo(() => attachments.filter(a => a.isImage), [attachments]);
  const files = useMemo(() => attachments.filter(a => !a.isImage), [attachments]);
  const links = useMemo(() => extractLinksFromMessages(messages), [messages]);

  const country = profile?.country || deriveCountryFromLocation(profile?.location);
  const timezone = formatTimezoneLabel(profile?.timezone);
  const displayName = profile?.displayName || profile?.username || 'User';
  const username = profile?.username || 'unknown';

  const tabs: { id: MediaTab; label: string; icon: typeof FileText; count: number }[] = [
    { id: 'images', label: 'Images', icon: ImageIcon, count: images.length },
    { id: 'files', label: 'Files', icon: Paperclip, count: files.length },
    { id: 'links', label: 'Links', icon: Link2, count: links.length },
  ];

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      className={`flex flex-col h-full border-l border-black/5 dark:border-white/5 bg-gradient-to-b from-cyan-500/5 via-transparent to-blue-500/5 dark:from-cyan-500/10 dark:to-blue-500/10 overflow-hidden ${className}`}
    >
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0"
      >
        <h3 className="text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
          Chat details
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-black/40 dark:text-white/40 transition-colors"
          aria-label="Close chat details"
        >
          <X size={16} />
        </button>
      </motion.div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
        {/* Profile */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden ring-2 ring-cyan-500/20 shadow-lg shadow-cyan-500/10">
            <img
              src={(profile?.profileImage && profile.profileImage.trim() !== '') ? profile.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link to={`/creators/${userId}`} className="group inline-flex items-center gap-1">
              <h4 className="font-bold text-base group-hover:text-cyan-500 transition-colors">{displayName}</h4>
              <VerifiedBadge verified={profile?.verified} />
              <ChevronRight size={14} className="text-black/20 dark:text-white/20 group-hover:text-cyan-500" />
            </Link>
            <p className="text-xs text-black/40 dark:text-white/40">@{username}</p>
          </motion.div>
          {profile?.bio && (
            <p className="text-xs text-black/60 dark:text-white/60 leading-relaxed px-2 line-clamp-4">
              {profile.bio}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
            <div className="flex items-center gap-1.5 text-black/40 dark:text-white/40 mb-1">
              <Users size={12} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Followers</span>
            </div>
            <p className="text-lg font-black">{followersCount.toLocaleString()}</p>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5"
          >
            <motion.div
              className="flex items-center gap-1.5 text-black/40 dark:text-white/40 mb-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Clock size={12} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Timezone</span>
            </motion.div>
            <p className="text-xs font-bold truncate" title={timezone}>{timezone}</p>
          </motion.div>
        </div>

        {/* Location / Country */}
        <div className="space-y-2">
          {profile?.location && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5">
              <MapPin size={14} className="text-cyan-500 shrink-0 mt-0.5" />
              <motion.div
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">Location</p>
                <p className="text-xs font-medium">{profile.location}</p>
              </motion.div>
            </div>
          )}
          {country && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5">
              <Globe size={14} className="text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">Country</p>
                <p className="text-xs font-medium">{country}</p>
              </div>
            </div>
          )}
        </div>

        {/* Shared media tabs */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 dark:text-white/30 px-1">
            Shared in chat
          </p>
          <div className="flex gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-[10px] font-bold transition-all ${
                  activeTab === id
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md'
                    : 'text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60'
                }`}
              >
                <Icon size={12} />
                <span>{label}</span>
                {count > 0 && (
                  <span className={`min-w-[16px] h-4 px-1 rounded-full text-[9px] flex items-center justify-center ${
                    activeTab === id ? 'bg-white/25' : 'bg-black/10 dark:bg-white/10'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="min-h-[120px]"
            >
              {activeTab === 'images' && (
                images.length === 0 ? (
                  <EmptyMedia label="No images shared yet" />
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {images.map(img => (
                      <a
                        key={img.id}
                        href={img.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 hover:ring-2 hover:ring-cyan-500/50 transition-all"
                      >
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )
              )}

              {activeTab === 'files' && (
                files.length === 0 ? (
                  <EmptyMedia label="No files shared yet" />
                ) : (
                  <motion.div
                    className="space-y-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {files.map(file => (
                      <a
                        key={file.id}
                        href={file.url}
                        download={file.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20 transition-all group"
                      >
                        <motion.div
                          className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center shrink-0"
                          whileHover={{ scale: 1.05 }}
                        >
                          <FileText size={16} className="text-cyan-500" />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{file.name}</p>
                          <p className="text-[10px] text-black/30 dark:text-white/30">
                            {file.senderId === auth.currentUser?.uid ? 'You' : 'Them'}
                          </p>
                        </div>
                        <ExternalLink size={14} className="text-black/20 dark:text-white/20 group-hover:text-cyan-500 shrink-0" />
                      </a>
                    ))}
                  </motion.div>
                )
              )}

              {activeTab === 'links' && (
                links.length === 0 ? (
                  <EmptyMedia label="No links shared yet" />
                ) : (
                  <div className="space-y-2">
                    {links.map((link, i) => (
                      <a
                        key={`${link.url}-${i}`}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2.5 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20 transition-all group"
                      >
                        <Link2 size={14} className="text-blue-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate text-blue-600 dark:text-blue-400 group-hover:underline">
                            {link.url.replace(/^https?:\/\//, '')}
                          </p>
                          <p className="text-[10px] text-black/30 dark:text-white/30 mt-0.5">
                            {link.senderId === auth.currentUser?.uid ? 'Shared by you' : 'Shared by them'}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                )
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}

function EmptyMedia({ label }: { label: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-xs text-black/30 dark:text-white/30">{label}</p>
    </div>
  );
}
