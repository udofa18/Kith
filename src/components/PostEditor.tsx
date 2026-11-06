import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, getDocs, writeBatch, setDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from '../lib/storage';
import { motion, AnimatePresence } from 'motion/react';
import { Code, Globe, Image as ImageIcon, Link as LinkIcon, Lock, Send, Sparkles, X, BarChart2, Film, Plus, Smile, Hash, Repeat, TrendingUp, MessageCircleQuestion, PenLine } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { suggestHashtags, detectLanguage } from '../services/geminiService';
import EmojiPicker, { Theme } from 'emoji-picker-react';

import { updateDailyStats } from '../lib/stats';
import { createNotification } from '../lib/notifications';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { advanceStreak, recordShipLog } from '../features/shiplog/streak';
import { buildSearchTokens, extractHashtags, mergeTags, normalizeTag } from '../features/search/tokens';

export type PostKind = 'post' | 'shiplog' | 'feedback';

const KINDS: { id: PostKind; label: string; icon: typeof PenLine; placeholder: string }[] = [
  { id: 'post', label: 'Post', icon: PenLine, placeholder: "What's on your mind?" },
  // Stored as 'shiplog' for compatibility; shown as a daily progress update.
  { id: 'shiplog', label: 'Progress update', icon: TrendingUp, placeholder: 'What did you move forward today? Big or small, it counts.' },
  { id: 'feedback', label: 'Ask for feedback', icon: MessageCircleQuestion, placeholder: 'What would you like feedback on? Add a photo or link.' },
];

export default function PostEditor({ onPostCreated, communityId, channelId, quotedPostId, onCancelQuote, initialKind, variant = 'inline', autoFocus = false, onDirtyChange }: {
  onPostCreated?: () => void,
  communityId?: string,
  channelId?: string,
  quotedPostId?: string | null,
  onCancelQuote?: () => void,
  initialKind?: PostKind,
  /** 'dialog' drops the feed row chrome (border, hover) for use inside ComposeDialog. */
  variant?: 'inline' | 'dialog',
  autoFocus?: boolean,
  /** Reports whether there's unsaved content, so a dialog can confirm before discarding it. */
  onDirtyChange?: (dirty: boolean) => void,
}) {
  const currentUserProfile = useCurrentUser();
  // Progress updates and feedback requests are feed features; community channels only post plain messages.
  const canChooseKind = !communityId && !quotedPostId;
  const preferredVisibility = currentUserProfile?.settings?.audience?.posts === 'followers' ? 'followers' : 'public';
  const [visibility, setVisibility] = useState<'public' | 'followers'>(preferredVisibility);
  useEffect(() => {
    if (!communityId) setVisibility(preferredVisibility);
  }, [preferredVisibility, communityId]);
  const [kind, setKind] = useState<PostKind>(initialKind ?? 'post');
  const [project, setProject] = useState('');
  useEffect(() => { if (initialKind) setKind(initialKind); }, [initialKind]);
  const activeKind = KINDS.find(k => k.id === (canChooseKind ? kind : 'post'))!;
  const [content, setContent] = useState('');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [showCode, setShowCode] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [quotedPost, setQuotedPost] = useState<any>(null);
  const [loadingQuoted, setLoadingQuoted] = useState(false);

  useEffect(() => {
    if (quotedPostId) {
      setLoadingQuoted(true);
      getDoc(doc(db, 'posts', quotedPostId)).then(docSnap => {
        if (docSnap.exists()) {
          setQuotedPost({ id: docSnap.id, ...docSnap.data() });
        }
        setLoadingQuoted(false);
      }).catch(err => {
        console.error("Error fetching quoted post:", err);
        setLoadingQuoted(false);
      });
    } else {
      setQuotedPost(null);
    }
  }, [quotedPostId]);

  
  // Media states
  const [mediaFiles, setMediaFiles] = useState<{ file: File, preview: string, type: 'image' | 'video' }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Poll states
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onEmojiClick = (emojiData: any) => {
    setContent(prev => prev + emojiData.emoji);
  };

  const handleSuggestHashtags = async () => {
    if (!content && !code) return;
    setSuggesting(true);
    const suggested = await suggestHashtags(content, code);
    setHashtags(suggested);
    
    if (code) {
      const detected = await detectLanguage(code);
      setLanguage(detected);
    }
    setSuggesting(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newMedia = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' as const : 'image' as const
    }));
    setMediaFiles(prev => [...prev, ...newMedia]);
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  const addPollOption = () => {
    if (pollOptions.length < 5) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    if (!auth.currentUser || (!content.trim() && mediaFiles.length === 0 && !pollQuestion)) return;
    setLoading(true);
    try {
      // Get user profile for the post metadata
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userData = userDoc.exists() ? userDoc.data() : null;
      const userXp = userData?.xp || 0;
      const username = userData?.username || auth.currentUser.email?.split('@')[0] || 'user';
      const displayName = userData?.displayName || auth.currentUser.displayName || 'Anonymous';

      // Upload media
      const uploadedMedia = [];
      for (const media of mediaFiles) {
        const storageRef = ref(null, `posts/${auth.currentUser.uid}/${Date.now()}_${media.file.name}`);
        const uploadTask = await uploadBytesResumable(storageRef, media.file);
        const url = await getDownloadURL(uploadTask.ref);
        uploadedMedia.push({ type: media.type, url });
      }

      // Tags typed in the text count too, not just the suggested ones.
      const allTags = mergeTags(hashtags, extractHashtags(content));
      const postData: any = {
        authorUid: auth.currentUser.uid,
        authorName: displayName,
        authorUsername: username,
        authorPhoto: auth.currentUser.photoURL,
        authorXp: userXp,
        content,
        codeSnippet: code,
        language,
        hashtags: allTags,
        searchTokens: buildSearchTokens([content, project, displayName, username, ...allTags.map(t => `#${normalizeTag(t)}`)]),
        media: uploadedMedia,
        likesCount: 0,
        commentsCount: 0,
        repostsCount: 0,
        xpValue: 10,
        communityId: communityId || null,
        channelId: channelId || null,
        visibility: communityId ? 'community' : visibility,
        createdAt: serverTimestamp(),
        type: quotedPostId ? 'quote' : (showPoll ? 'poll' : 'post'),
        originalPostId: quotedPostId || null
      };

      const postKind = canChooseKind ? kind : 'post';
      if (postKind !== 'post') postData.kind = postKind;
      if (postKind === 'shiplog') {
        postData.shipDay = advanceStreak(currentUserProfile?.streak).current;
        if (project.trim()) postData.project = project.trim().slice(0, 80);
      }

      if (showPoll && pollQuestion && pollOptions.every(o => o.trim())) {
        postData.poll = {
          question: pollQuestion,
          options: pollOptions.map(text => ({ text, votes: 0 })),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          voters: []
        };
      }

      try {
        const postRef = await addDoc(collection(db, 'posts'), postData);
        
        // Notify subscribers
        if (auth.currentUser) {
          const subscribersSnap = await getDocs(collection(db, 'users', auth.currentUser.uid, 'subscribers'));
          subscribersSnap.docs.forEach(subDoc => {
            createNotification({
              recipientId: subDoc.id,
              senderId: auth.currentUser!.uid,
              senderName: displayName,
              senderPhoto: auth.currentUser!.photoURL || '',
              type: quotedPostId ? 'quote' : 'new_post',
              content: quotedPostId ? `quoted a post` : `shared a new post`,
              relatedId: postRef.id
            }).catch(console.error);
          });
        }

        // Notify quoted author
        if (quotedPostId && quotedPost && quotedPost.authorUid !== auth.currentUser.uid) {
           await createNotification({
              recipientId: quotedPost.authorUid,
              senderId: auth.currentUser.uid,
              senderName: displayName,
              senderPhoto: auth.currentUser.photoURL || '',
              type: 'quote',
              content: `quoted your post`,
              relatedId: postRef.id
            });
        }

        // Update trending hashtags tracker
        if (allTags.length > 0) {
          try {
            const batch = writeBatch(db);
            allTags.forEach(tag => {
              const tagId = tag.toLowerCase().replace('#', '').trim();
              if (tagId) {
                const tagRef = doc(db, 'hashtags', tagId);
                batch.set(tagRef, {
                  name: tag.toLowerCase(),
                  count: increment(1),
                  lastUsed: serverTimestamp()
                }, { merge: true });
              }
            });
            await batch.commit();
          } catch (err) {
            console.error("Error updating hashtag trends:", err);
          }
        }
        
        // If it's a community post, increment counters and send notifications
        if (communityId && channelId) {
          const batch = writeBatch(db);
          const communityRef = doc(db, 'communities', communityId);
          const channelRef = doc(db, 'communities', communityId, 'channels', channelId);
          const senderStatsRef = doc(db, 'communities', communityId, 'members', auth.currentUser.uid, 'channelStats', channelId);
          const senderId = auth.currentUser.uid;

          batch.update(communityRef, { 'stats.messagesCount': increment(1), 'stats.totalXp': increment(2) });
          batch.update(channelRef, { messageCount: increment(1) });
          batch.set(senderStatsRef, { lastReadCount: increment(1) }, { merge: true });
          
          // Also increment member's community-specific XP
          const memberRef = doc(db, 'communities', communityId, 'members', senderId);
          batch.update(memberRef, { xp: increment(2) });

          // Send notifications
          let membersSnap;
          try {
            membersSnap = await getDocs(collection(db, 'communities', communityId, 'members'));
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, `communities/${communityId}/members`);
            return; // Stop if we can't get members
          }
          
          membersSnap.docs.forEach(memberDoc => {
            if (memberDoc.id !== senderId) {
              const notifRef = doc(collection(db, 'notifications'));
              batch.set(notifRef, {
                recipientId: memberDoc.id,
                senderId: senderId,
                senderName: auth.currentUser?.displayName || 'Anonymous',
                senderPhoto: auth.currentUser?.photoURL,
                type: 'message',
                content: `posted in community feed`,
                relatedId: communityId,
                channelId: channelId,
                read: false,
                createdAt: serverTimestamp()
              });
            }
          });
          
          await batch.commit();
          
          // Update daily stats
          updateDailyStats(communityId, 'newPost').catch(console.error);
          updateDailyStats(communityId, 'xpAwarded', 2).catch(console.error);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'posts');
      }
      
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          xp: increment(2)
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
      }

      if (postData.kind === 'shiplog') {
        try {
          const streak = await recordShipLog(auth.currentUser.uid, currentUserProfile?.streak);
          toast.success(streak.current > 1 ? `Day ${streak.current} streak. Keep it going!` : 'Progress shared. Day 1 of your streak!');
        } catch (error) {
          console.error('Failed to update streak:', error);
        }
      }

      // Reset
      setContent('');
      setCode('');
      setHashtags([]);
      setShowCode(false);
      setMediaFiles([]);
      setShowPoll(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setKind('post');
      setProject('');
      if (onPostCreated) onPostCreated();
    } catch (error) {
      console.error("Error creating post:", error);
    } finally {
      setLoading(false);
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const dirty = !!content.trim() || !!code.trim() || mediaFiles.length > 0 || !!pollQuestion.trim();
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  const [isFocused, setIsFocused] = useState(false);
  const [showChannelSuggestions, setShowChannelSuggestions] = useState(false);
  const [channels, setChannels] = useState<any[]>([]);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionCursorPos, setMentionCursorPos] = useState(0);

  useEffect(() => {
    if (!communityId) return;
    const q = query(collection(db, 'communities', communityId, 'channels'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [communityId]);

  const filteredChannels = useMemo(() => {
    const filter = mentionFilter.toLowerCase();
    return channels
      .filter(c => c.name.toLowerCase().includes(filter))
      .slice(0, 5);
  }, [channels, mentionFilter]);

  const insertChannelMention = (channelName: string) => {
    const before = content.slice(0, mentionCursorPos);
    const after = content.slice(textareaRef.current?.selectionStart || mentionCursorPos);
    
    const spaceIndex = content.indexOf(' ', mentionCursorPos);
    const sliceEnd = spaceIndex === -1 ? content.length : spaceIndex;
    const finalAfter = content.slice(sliceEnd);

    const insertedText = `#${channelName} `;
    const updatedContent = `${before}${insertedText}${finalAfter}`;
    setContent(updatedContent);
    setShowChannelSuggestions(false);
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const cursorPosition = before.length + insertedText.length;
        textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
      }
    }, 0);
  };

  return (
    <div 
      className={`relative transition-colors ${variant === 'dialog' ? 'px-4 pt-2 pb-3' : `px-5 py-4 border-b border-black/10 dark:border-white/10 ${isFocused ? 'bg-black/[0.02] dark:bg-white/[0.02]' : ''}`} ${showEmojiPicker ? 'z-50' : 'z-10'}`}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        // Only blur if clicking completely outside the editor
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsFocused(false);
        }
      }}
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-black/5 dark:bg-white/10">
          <img 
            src={(currentUserProfile?.profileImage && currentUserProfile.profileImage.trim() !== '') ? currentUserProfile.profileImage : (auth.currentUser?.photoURL && auth.currentUser.photoURL.trim() !== '') ? auth.currentUser.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.uid}`} 
            alt="Avatar" 
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          {canChooseKind && (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Post type">
              {KINDS.map(k => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  onClick={() => setKind(k.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium border transition-colors ${
                    kind === k.id
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <k.icon size={13} /> {k.label}
                </button>
              ))}
            </div>
          )}
          {!communityId && (
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Post audience">
              {[
                { value: 'public' as const, label: 'Public', hint: 'Anyone can see this post', icon: Globe },
                { value: 'followers' as const, label: 'Followers', hint: 'Only people who follow you', icon: Lock },
              ].map(({ value, label, hint, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={visibility === value}
                  title={hint}
                  onClick={() => setVisibility(value)}
                  className={`flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    visibility === value
                      ? 'border-primary/35 bg-primary/10 text-primary'
                      : 'border-black/10 text-black/50 hover:text-black dark:border-white/10 dark:text-white/50 dark:hover:text-white'
                  }`}
                >
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
          )}
          {canChooseKind && kind === 'shiplog' && (
            <input
              value={project}
              onChange={e => setProject(e.target.value)}
              maxLength={80}
              placeholder="What are you working on? (optional)"
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            />
          )}
          <div className="relative">
            <AnimatePresence>
              {showChannelSuggestions && filteredChannels.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full left-0 mb-2 w-64 bg-background border border-black/10 dark:border-white/10 rounded-lg shadow-none z-50 overflow-hidden backdrop-blur-xl"
                >
                  <div className="p-2 border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5">
                    <p className="text-xs font-medium text-black/50 dark:text-white/50 px-2">Mention a channel</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {filteredChannels.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => insertChannelMention(c.name)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 text-left transition-all group"
                      >
                        <Hash size={14} className="text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-black dark:text-white group-hover:text-primary transition-colors truncate">
                            #{c.name}
                          </p>
                          {c.description && <p className="text-[10px] text-black/40 dark:text-white/40 truncate">{c.description}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                const value = e.target.value;
                const cursor = e.target.selectionStart || 0;
                setContent(value);

                // Channel mention detection
                const lastHash = value.lastIndexOf('#', cursor - 1);
                if (lastHash !== -1) {
                  const textAfterHash = value.slice(lastHash + 1, cursor);
                  const charBeforeHash = lastHash === 0 ? '' : value[lastHash - 1];
                  const isValidTrigger = !charBeforeHash || /\s/.test(charBeforeHash);

                  if (isValidTrigger && !/\s/.test(textAfterHash)) {
                    setMentionFilter(textAfterHash);
                    setMentionCursorPos(lastHash);
                    setShowChannelSuggestions(true);
                    return;
                  }
                }
                setShowChannelSuggestions(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && showChannelSuggestions && filteredChannels.length > 0) {
                  e.preventDefault();
                  insertChannelMention(filteredChannels[0].name);
                } else if (e.key === 'Escape' && showChannelSuggestions) {
                  setShowChannelSuggestions(false);
                }
              }}
              placeholder={activeKind.placeholder}
              className="w-full bg-transparent border-none outline-none text-[17px] leading-relaxed resize-none min-h-[72px] text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 overflow-hidden pt-1"
            />

            {/* Quoted Post Preview */}
            {quotedPostId && (
              <div className="mt-4 mb-4 relative">
                {loadingQuoted ? (
                  <div className="h-32 bg-black/5 dark:bg-white/5 rounded-2xl animate-pulse border border-black/10 dark:border-white/10" />
                ) : quotedPost ? (
                  <div className="border border-black/20 dark:border-white/10 rounded-2xl p-4 bg-black/5 dark:bg-white/5 group relative">
                    <button 
                      onClick={onCancelQuote}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform shadow-lg z-10"
                    >
                      <X size={14} />
                    </button>
                    <div className="flex items-center gap-2 mb-2">
                       <img 
                        src={quotedPost.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${quotedPost.authorUid}`} 
                        alt="Author" 
                        className="w-5 h-5 rounded-full object-cover" 
                      />
                      <span className="text-xs font-bold text-black dark:text-white">{quotedPost.authorName}</span>
                    </div>
                    <p className="text-sm text-black/60 dark:text-white/60 line-clamp-3 italic">
                      {quotedPost.content || quotedPost.description || 'View original post'}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs italic text-black/30">Original post not found or deleted.</p>
                )}
              </div>
            )}
          </div>

          {/* Media Previews */}
          {mediaFiles.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {mediaFiles.map((media, i) => (
                <div key={i} className="relative rounded-lg overflow-hidden aspect-video bg-black/40 border border-black/10 dark:border-white/10">
                  {media.type === 'image' ? (
                    <img src={media.preview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <video src={media.preview} className="w-full h-full object-cover" />
                  )}
                  <button 
                    onClick={() => removeMedia(i)}
                    className="absolute top-2 right-2 p-1 bg-black/60 rounded-lg border border-white/20 text-white hover:bg-black"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Poll Editor */}
          <AnimatePresence>
            {showPoll && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-lg p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Poll</span>
                  <button onClick={() => setShowPoll(false)} className="text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white">
                    <X size={16} />
                  </button>
                </div>
                <input 
                  type="text"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Ask a question..."
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-black dark:text-white"
                />
                <div className="space-y-2">
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input 
                        type="text"
                        value={opt}
                        onChange={(e) => updatePollOption(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary text-black dark:text-white"
                      />
                      {pollOptions.length > 2 && (
                        <button onClick={() => removePollOption(i)} className="text-black/20 dark:text-white/20 hover:text-red-400">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 5 && (
                    <button 
                      onClick={addPollOption}
                      className="text-sm text-primary font-medium flex items-center gap-1 hover:underline"
                    >
                      <Plus size={14} /> Add Option
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showCode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between bg-black/40 px-4 py-2 rounded-lg border-x border-t border-white/10">
                  <select 
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="bg-transparent text-xs text-white/50 outline-none"
                  >
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                    <option value="json">JSON</option>
                  </select>
                  <button onClick={() => setShowCode(false)} className="text-white/30 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste your code here..."
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-4 font-mono text-sm text-primary outline-none min-h-[200px]"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {hashtags.map((tag, i) => (
                <span key={i} className="text-[13px] text-primary font-medium bg-primary/10 px-2.5 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-black/5 dark:border-white/5">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setShowCode(!showCode)}
                className={`p-2 rounded-full transition-colors ${showCode ? 'bg-primary/10 text-primary' : 'hover:bg-primary/10 text-black/50 dark:text-white/50 hover:text-primary'}`}
                title="Add Code Snippet"
              >
                <Code size={18} />
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-full hover:bg-primary/10 text-black/50 dark:text-white/50 hover:text-primary transition-colors"
                title="Add Media"
              >
                <ImageIcon size={18} />
              </button>
              <button 
                onClick={() => setShowPoll(!showPoll)}
                className={`p-2 rounded-full transition-colors ${showPoll ? 'bg-primary/10 text-primary' : 'hover:bg-primary/10 text-black/50 dark:text-white/50 hover:text-primary'}`}
                title="Add Poll"
              >
                <BarChart2 size={18} />
              </button>
              <button 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`p-2 rounded-full transition-colors ${showEmojiPicker ? 'bg-primary/10 text-primary' : 'hover:bg-primary/10 text-black/50 dark:text-white/50 hover:text-primary'}`}
                title="Add Emoji"
              >
                <Smile size={18} />
              </button>
              {showEmojiPicker && (
                <div ref={emojiPickerRef} className="absolute top-full left-0 mt-2 z-[100] origin-top-left scale-75 shadow-none border border-black/10 dark:border-white/10">
                  <EmojiPicker 
                    theme={document.documentElement.classList.contains('light') ? Theme.LIGHT : Theme.DARK} 
                    onEmojiClick={onEmojiClick}
                    width={320}
                    height={400}
                    skinTonesDisabled
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
              <button 
                onClick={handleSuggestHashtags}
                disabled={suggesting || (!content && !code)}
                className="p-2 rounded-full hover:bg-primary/10 text-black/50 dark:text-white/50 hover:text-primary transition-colors disabled:opacity-30"
                title="Suggest Hashtags"
              >
                <Sparkles size={18} className={suggesting ? 'animate-pulse text-primary' : ''} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                multiple 
                accept="image/*,video/*" 
                className="hidden" 
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || (!content.trim() && mediaFiles.length === 0 && !pollQuestion)}
              className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-full font-semibold text-sm flex items-center gap-2 disabled:opacity-40 transition-colors"
            >
              {loading ? 'Posting…' : kind === 'shiplog' && canChooseKind ? 'Share' : kind === 'feedback' && canChooseKind ? 'Ask' : 'Post'} <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
