import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, increment, getDocs, writeBatch, setDoc, where, deleteDoc, limit, startAfter, endBefore, limitToLast, getDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import CreatePollModal from './CreatePollModal';
import { ArrowDown, MoreHorizontal, Send, Image as ImageIcon, Code as CodeIcon, Paperclip, Smile, MessageSquare, Settings, Snowflake, Megaphone, Hash, MoreVertical, Edit2, Trash2, X, Check, Reply, ExternalLink, Plus, ChevronUp, Zap, Heart, ThumbsUp, PartyPopper, FileText, Video, Music, Download, Play, Film, Sparkles, Lock, Flag, Cpu, Pin, BarChart2, Copy, Globe, Twitter, Github, Linkedin, Info, Gift } from 'lucide-react';
import PostCard from './PostCard';
import PostEditor from './PostEditor';
import XPGiftModal from './XPGiftModal';
import ReportModal from './ReportModal';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmModal from './ConfirmModal';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { formatDistanceToNow, isToday, isYesterday, isSameDay } from 'date-fns';
import { formatDate } from '../lib/utils';
import { analyzeContent } from '../services/moderationService';
import { checkAndAwardBadges } from '../lib/badges';
import { toast } from 'react-hot-toast';
import ThreadSidebar from './ThreadSidebar';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import AnimatedEmojiPicker from './AnimatedEmojiPicker';
import AnimatedEmojiRenderer, { isSoloEmoji } from './AnimatedEmojiRenderer';
import SafeAnimatedEmoji from './SafeAnimatedEmoji';
import { playNotificationSound } from '../lib/sounds';
import { createNotification } from '../lib/notifications';

import { updateDailyStats } from '../lib/stats';

import Avatar from './ui/Avatar';
import { channelTypeInfo } from '../lib/channelTypes';
import LinkPreview, { firstUrl } from './post/LinkPreview';
import UserHoverCard from './UserHoverCard';
import VerifiedBadge from './VerifiedBadge';

interface ChannelViewProps {
  communityId: string;
  channel: any;
  isMember: boolean;
  isAdmin: boolean;
  onOpenSettings: () => void;
  communityMembers?: any[];
  roles?: any[];
  myPermissions?: string[];
  myCustomRoles?: string[];
  /** Millis until which the member is timed out, if they are. */
  timeoutUntil?: number | null;
}

const MESSAGES_PER_PAGE = 30;

const REACTION_EMOJIS = [
  { emoji: '👍', icon: <ThumbsUp size={18} />, label: 'Like' },
  { emoji: '❤️', icon: <Heart size={18} />, label: 'Love' },
  { emoji: '🔥', icon: <Zap size={18} />, label: 'Fire' },
  { emoji: '🎉', icon: <PartyPopper size={18} />, label: 'Celebrate' },
];

export default function ChannelView({ 
  communityId, 
  channel, 
  isMember, 
  isAdmin, 
  onOpenSettings, 
  communityMembers, 
  roles = [],
  myPermissions = [],
  myCustomRoles = [],
  timeoutUntil = null
}: ChannelViewProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messageToDeleteId, setMessageToDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftTarget, setGiftTarget] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAnimatedPicker, setShowAnimatedPicker] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTargetId, setReportTargetId] = useState('');
  const [reportContentSnippet, setReportContentSnippet] = useState('');
  const [reportTargetAuthorId, setReportTargetAuthorId] = useState('');
  const [reportTargetType, setReportTargetType] = useState<'message' | 'user'>('message');

  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const MAX_UPLOAD_MB = 25;
  const uploadFiles = async (files: File[]) => {
    if (!files.length || !auth.currentUser) return;
    const tooBig = files.find(f => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    if (tooBig) return toast.error(`${tooBig.name} is over ${MAX_UPLOAD_MB} MB`);
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(async file => {
        const storageRef = ref(storage, `channels/${communityId}/${channel.id}/${auth.currentUser!.uid}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`);
        const snapshot = await uploadBytes(storageRef, file, { contentType: file.type });
        return { name: file.name, url: await getDownloadURL(snapshot.ref), type: file.type, size: file.size };
      }));
      setAttachments(prev => [...prev, ...uploaded]);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error("Couldn't upload. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    uploadFiles(files);
  };



  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const onComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart || 0;
    setNewMessage(value);
    autosize(e.target);

    // @person / #channel suggestions for the word being typed
    const lastAt = value.lastIndexOf('@', cursor - 1);
    const lastHash = value.lastIndexOf('#', cursor - 1);
    const trigger = (pos: number) => (pos === 0 || /\s/.test(value[pos - 1])) && !/\s/.test(value.slice(pos + 1, cursor));
    if (lastAt !== -1 && lastAt > lastHash && trigger(lastAt)) {
      setMentionFilter(value.slice(lastAt + 1, cursor));
      setMentionCursorPos(lastAt);
      setShowMentionSuggestions(true);
      setShowChannelSuggestions(false);
      return;
    }
    if (lastHash !== -1 && lastHash > lastAt && trigger(lastHash)) {
      setMentionFilter(value.slice(lastHash + 1, cursor));
      setMentionCursorPos(lastHash);
      setShowChannelSuggestions(true);
      setShowMentionSuggestions(false);
      return;
    }
    setShowMentionSuggestions(false);
    setShowChannelSuggestions(false);
  };

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (showMentionSuggestions || showChannelSuggestions) { setShowMentionSuggestions(false); setShowChannelSuggestions(false); }
      else if (replyTo) setReplyTo(null);
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    if (showMentionSuggestions && filteredMentions.length > 0) {
      e.preventDefault();
      insertMention(filteredMentions[0].user?.username || 'user');
    } else if (showChannelSuggestions && filteredChannels.length > 0) {
      e.preventDefault();
      insertChannelMention(filteredChannels[0].name);
    } else if (!window.matchMedia('(pointer: coarse)').matches) {
      // Enter sends on desktop; on phones it adds a new line.
      e.preventDefault();
      handleSendMessage();
      requestAnimationFrame(() => autosize(inputRef.current));
    }
  };

  const onComposerPaste = (e: React.ClipboardEvent) => {
    const images = [...e.clipboardData.files].filter(f => f.type.startsWith('image/'));
    if (images.length) {
      e.preventDefault();
      uploadFiles(images);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };
  const [showReactionMenu, setShowReactionMenu] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [communityData, setCommunityData] = useState<any>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(false);
  const atBottomRef = useRef(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isThreadViewOpen, setIsThreadViewOpen] = useState(false);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [showChannelSuggestions, setShowChannelSuggestions] = useState(false);
  const [channelsList, setChannelsList] = useState<any[]>([]);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionCursorPos, setMentionCursorPos] = useState(0);

  useEffect(() => {
    if (!communityId) return;
    const q = query(collection(db, 'communities', communityId, 'channels'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setChannelsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [communityId]);

  const filteredMentions = useMemo(() => {
    const specialMentions = [
      { id: 'everyone', user: { username: 'everyone', displayName: 'All Members', profileImage: '' } },
      { id: 'admin', user: { username: 'admin', displayName: 'Administrators', profileImage: '' } }
    ];
    
    const filter = mentionFilter.toLowerCase();
    const filteredSpecial = specialMentions.filter(m => 
      m.user.username.includes(filter) || m.user.displayName.toLowerCase().includes(filter)
    );

    if (!communityMembers) return filteredSpecial;
    const filteredMembers = communityMembers
      .filter(m => {
        const username = m.user?.username?.toLowerCase() || '';
        const displayName = m.user?.displayName?.toLowerCase() || '';
        return username.includes(filter) || 
               displayName.includes(filter);
      })
      .slice(0, 5);
    
    return [...filteredSpecial, ...filteredMembers].slice(0, 5);
  }, [communityMembers, mentionFilter]);

  const filteredChannels = useMemo(() => {
    const filter = mentionFilter.toLowerCase();
    return channelsList
      .filter(c => c.name.toLowerCase().includes(filter))
      .slice(0, 5);
  }, [channelsList, mentionFilter]);

  const insertMention = (username: string) => {
    const before = newMessage.slice(0, mentionCursorPos);
    const after = newMessage.slice(inputRef.current?.selectionStart || mentionCursorPos);
    
    // Find where the mention part ends (next space or end of string)
    const spaceIndex = newMessage.indexOf(' ', mentionCursorPos);
    const sliceEnd = spaceIndex === -1 ? newMessage.length : spaceIndex;
    const finalAfter = newMessage.slice(sliceEnd);

    const insertedText = `@${username} `;
    const updatedMessage = `${before}${insertedText}${finalAfter}`;
    setNewMessage(updatedMessage);
    setShowMentionSuggestions(false);
    
    // Focus back and set cursor position
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const cursorPosition = before.length + insertedText.length;
        inputRef.current.setSelectionRange(cursorPosition, cursorPosition);
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
      }
    }, 0);
  };

  const insertChannelMention = (channelName: string) => {
    const before = newMessage.slice(0, mentionCursorPos);
    const after = newMessage.slice(inputRef.current?.selectionStart || mentionCursorPos);
    
    // Find where the mention part ends (next space or end of string)
    const spaceIndex = newMessage.indexOf(' ', mentionCursorPos);
    const sliceEnd = spaceIndex === -1 ? newMessage.length : spaceIndex;
    const finalAfter = newMessage.slice(sliceEnd);

    const insertedText = `#${channelName} `;
    const updatedMessage = `${before}${insertedText}${finalAfter}`;
    setNewMessage(updatedMessage);
    setShowChannelSuggestions(false);
    
    // Focus back and set cursor position
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const cursorPosition = before.length + insertedText.length;
        inputRef.current.setSelectionRange(cursorPosition, cursorPosition);
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
      }
    }, 0);
  };

  const renderMessageContent = (content: string) => {
    if (!content) return null;
    
    // Check for solo emoji first
    const solo = isSoloEmoji(content);
    if (solo) {
      if (solo.type === 'animated') {
        return (
          <div className="py-2">
            <SafeAnimatedEmoji emoji={solo.value as any} size={120} />
          </div>
        );
      }
      return <span className="text-4xl leading-relaxed py-2 block">{solo.value}</span>;
    }

    const parts = content.split(/(@[a-zA-Z0-9_-]+|#[a-zA-Z0-9_-]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const username = part.slice(1);
        const lowerUsername = username.toLowerCase();

        if (lowerUsername === 'everyone' || lowerUsername === 'admin') {
          return (
            <span key={index} className="text-primary font-bold bg-primary/10 px-1 rounded-md transition-all hover:bg-primary/20 cursor-default">
              @{username}
            </span>
          );
        }

        const member = communityMembers?.find(m => m.user?.username?.toLowerCase() === lowerUsername);
        
        if (member) {
          return (
            <UserHoverCard key={index} userId={member?.id || ''}>
              <span className="text-primary font-bold hover:underline cursor-pointer">
                @{member.user?.username || username}
              </span>
            </UserHoverCard>
          );
        }
      }

      if (part.startsWith('#')) {
        const channelName = part.slice(1).toLowerCase();
        const linkedChannel = channelsList.find(c => c.name.toLowerCase() === channelName);
        
        return (
          <span 
            key={index} 
            onClick={() => {
              if (linkedChannel) {
                navigate(`/feed?view=community&id=${communityId}&channelId=${linkedChannel.id}`);
              }
            }}
            className="text-primary font-bold hover:underline cursor-pointer inline-flex items-center gap-0.5 bg-primary/5 px-1 rounded transition-all"
          >
            <Hash size={12} className="inline mb-0.5" />{part.slice(1)}
          </span>
        );
      }

      // Detect and style links within the text part
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const subParts = part.split(urlRegex);
      
      const contentWithLinks = subParts.map((subPart, subIndex) => {
        if (subPart.match(urlRegex)) {
          return (
            <a 
              key={`link-${index}-${subIndex}`} 
              href={subPart} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-violet-600 dark:text-violet-400 hover:underline transition-colors font-medium underline decoration-violet-500/30 underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {subPart}
            </a>
          );
        }
        return <AnimatedEmojiRenderer key={`text-${index}-${subIndex}`} content={subPart} />;
      });

      return <span key={index}>{contentWithLinks}</span>;
    });
  };

  // Helper to scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setCurrentUserProfile(doc.data());
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!communityId) return;
    const unsubscribe = onSnapshot(doc(db, 'communities', communityId), (snap) => {
      if (snap.exists()) {
        setCommunityData(snap.data());
      }
    });
    return () => unsubscribe();
  }, [communityId]);

  const ensureDate = (val: any): Date => {
    if (val instanceof Date) return val;
    if (val && typeof val.toDate === 'function') return val.toDate();
    if (val && typeof val.seconds === 'number') return new Date(val.seconds * 1000);
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    return new Date();
  };

  const isInitialLoad = useRef(true);
  const accessType = communityData?.membershipControl?.accessType || 'public';

  useEffect(() => {
    if (!communityId || !channel) return;

    setNewMessage('');
    setReplyTo(null);
    setEditingMessageId(null);
    setActiveMessageMenu(null);
    setMessages([]);
    setHasMore(true);
    setNewBelow(false);
    atBottomRef.current = true;
    setShouldScrollToBottom(true);

    setLoading(true);
    const messagesRef = collection(db, 'communities', communityId, 'channels', channel.id, 'messages');
    
    // Guard: If not a member and community isn't public, don't subscribe to avoid permission errors
    // unless the channel itself is public (though the rules handle this, the UI should be proactive)
    if (!isMember && accessType !== 'public' && !isAdmin) {
      setLoading(false);
      return;
    }

    // We use a limited real-time query for the most recent messages
    const q = query(
      messagesRef, 
      orderBy('createdAt', 'desc'), 
      limit(MESSAGES_PER_PAGE)
    );

    isInitialLoad.current = true;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Play sound for new messages from others
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !isInitialLoad.current) {
          const msg = change.doc.data();
          if (msg.authorUid !== auth.currentUser?.uid) {
            playNotificationSound();
            if (!atBottomRef.current) setNewBelow(true);
          }
        }
      });
      if (isInitialLoad.current && snapshot.size < MESSAGES_PER_PAGE) setHasMore(false);
      isInitialLoad.current = false;

      setMessages(prev => {
        let updated = [...prev];
        snapshot.docChanges().forEach(change => {
          const id = change.doc.id;
          if (change.type === 'removed') {
            updated = updated.filter(m => m.id !== id);
          } else {
            const data = change.doc.data({ serverTimestamps: 'estimate' });
            const createdAt = ensureDate(data.createdAt);
            const msg = { id, ...data, createdAt, _doc: change.doc };
            
            const index = updated.findIndex(m => m.id === id);
            if (index !== -1) {
              updated[index] = msg;
            } else {
              updated.push(msg);
            }
          }
        });

        // Ensure uniqueness and sort
        const unique = Array.from(new Map(updated.map(m => [m.id, m])).values())
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        
        return unique;
      });

      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `communities/${communityId}/channels/${channel.id}/messages`);
      setLoading(false);
    });

    return () => unsubscribe();
    // Depends on the access type only: the community doc changes with every message (stats),
    // and re-subscribing would wipe the loaded history and jump the scroll position.
  }, [communityId, channel.id, accessType, isMember, isAdmin]);

  // Focus input on channel change
  useEffect(() => {
    if (!loading) {
      setTimeout(() => inputRef.current?.focus(), 500);
      scrollToBottom('smooth'); // Scroll to bottom on initial load
    }
  }, [channel.id]);

  // Scroll to bottom on new messages (length changes)
  useEffect(() => {
    if (shouldScrollToBottom && !loading && messages.length > 0) {
      scrollToBottom('auto');
    }
  }, [messages.length, loading]);

  const loadMoreMessages = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    
    setLoadingMore(true);
    try {
      const oldestMessage = messages[0];
      const messagesRef = collection(db, 'communities', communityId, 'channels', channel.id, 'messages');
      
      // Fetch messages older than the oldest one currently in state
      const q = query(
        messagesRef,
        orderBy('createdAt', 'desc'),
        startAfter(oldestMessage._doc),
        limit(MESSAGES_PER_PAGE)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setHasMore(false);
      } else {
        const olderMessages = snapshot.docs.map(d => {
          const data = d.data();
          let createdAt = ensureDate(data.createdAt);
          return { id: d.id, ...data, createdAt, _doc: d };
        }).reverse();

        // Capture current scroll height before updating state to maintain scroll position
        const scrollHeight = scrollRef.current?.scrollHeight || 0;
        const scrollTop = scrollRef.current?.scrollTop || 0;

        setMessages(prev => {
          const combined = [...olderMessages, ...prev];
          const unique = Array.from(new Map(combined.map(m => [m.id, m])).values())
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          return unique;
        });
        setShouldScrollToBottom(false);

        // After state update, adjust scroll to maintain position
        setTimeout(() => {
          if (scrollRef.current) {
            const newScrollHeight = scrollRef.current.scrollHeight;
            scrollRef.current.scrollTop = scrollTop + (newScrollHeight - scrollHeight);
          }
        }, 0);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    
    // If user is near top, load more
    if (scrollTop < 50 && !loadingMore && hasMore) {
      loadMoreMessages();
    }

    // Check if user is scrolled to bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    atBottomRef.current = isAtBottom;
    if (isAtBottom) setNewBelow(false);
    setShouldScrollToBottom(isAtBottom);
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups: any[], msg, i) => {
    const date = msg.createdAt;
    const prevMsg = messages[i - 1];
    
    const showHeader = !prevMsg || 
                      prevMsg.authorUid !== msg.authorUid || 
                      (date.getTime() - prevMsg.createdAt.getTime() > 300000) ||
                      msg.replyTo;

    const isNewDay = !prevMsg || !isSameDay(prevMsg.createdAt, date);

    if (isNewDay) {
      groups.push({ _kind: 'date', date });
    }

    // `_kind` (not `type`) so welcome/system messages keep their own type.
    groups.push({ ...msg, _kind: 'message', showHeader });
    return groups;
  }, []);

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return formatDate(date, 'MMMM d, yyyy');
  };

  const handleAddReaction = async (messageId: string, emoji: string) => {
    if (!auth.currentUser) return;
    try {
      const messageRef = doc(db, 'communities', communityId, 'channels', channel.id, 'messages', messageId);
      const msg = messages.find(m => m.id === messageId);
      const reactions = msg?.reactions || {};
      const emojiData = reactions[emoji] || { count: 0, uids: [] };
      
      const hasReacted = emojiData.uids.includes(auth.currentUser.uid);
      
      if (hasReacted) {
        emojiData.count = Math.max(0, emojiData.count - 1);
        emojiData.uids = emojiData.uids.filter((id: string) => id !== auth.currentUser?.uid);
      } else {
        emojiData.count += 1;
        emojiData.uids.push(auth.currentUser.uid);
      }
      // Reward XP for engaging with someone else's message (not your own).
      if (!hasReacted && msg?.authorUid !== auth.currentUser.uid) {
        const memberRef = doc(db, 'communities', communityId, 'members', auth.currentUser.uid);
        const communityRef = doc(db, 'communities', communityId);
        await updateDoc(memberRef, { xp: increment(1) });
        await updateDoc(communityRef, { 'stats.totalXp': increment(1) });
        
        // Update daily stats for XP
        updateDailyStats(communityId, 'xpAwarded', 1).catch(console.error);
      }

      await updateDoc(messageRef, {
        [`reactions.${emoji}`]: emojiData
      });
      setShowReactionMenu(null);
    } catch (error) {
      console.error("Reaction error:", error);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, directContent?: string, pollData?: any) => {
    e?.preventDefault();
    const contentToSend = directContent !== undefined ? directContent : newMessage;
    if ((!contentToSend.trim() && attachments.length === 0 && !pollData) || !auth.currentUser) return;

    const messageContent = contentToSend;
    const messageAttachments = [...attachments];
    const currentReplyTo = replyTo;
    
    // Optimistic UI: Clear input immediately
    setNewMessage('');
    setAttachments([]);
    setReplyTo(null);
    setShouldScrollToBottom(true);

    const messageRef = doc(collection(db, 'communities', communityId, 'channels', channel.id, 'messages'));
    const messageId = messageRef.id;

    // Optimistic Update: Add message to local state immediately
    const optimisticMessage: any = {
      id: messageId,
      authorUid: auth.currentUser.uid,
      authorName: currentUserProfile?.displayName || auth.currentUser.displayName || 'Anonymous',
      authorPhoto: currentUserProfile?.profileImage || auth.currentUser.photoURL,
      content: messageContent,
      attachments: messageAttachments,
      createdAt: new Date(),
      updatedAt: new Date(),
      replyTo: currentReplyTo ? {
        id: currentReplyTo.id,
        authorName: currentReplyTo.authorName,
        content: currentReplyTo.content
      } : null,
      isOptimistic: true // Flag to identify it locally
    };

    if (pollData) {
      optimisticMessage.poll = {
        ...pollData,
        options: pollData.options.map((opt: string) => ({ text: opt, votes: 0 })),
        voters: []
      };
    }

    setMessages(prev => [...prev, optimisticMessage]);
    // Scroll instantly for local actions for better responsiveness
    scrollToBottom('auto'); 

    try {
      // Run AI Moderation in background
      const sendAction = async () => {
        if (messageContent.trim()) {
          const modResult = await analyzeContent(messageContent);
          if (modResult.suggestedAction === 'block') {
            toast.error("Message blocked: " + modResult.flaggedReasons.join(", "));
            // Remove optimistic message if blocked
            setMessages(prev => prev.filter(m => m.id !== messageId));
            return;
          }
        }

        const batch = writeBatch(db);
        const channelRef = doc(db, 'communities', communityId, 'channels', channel.id);
        const communityRef = doc(db, 'communities', communityId);
        const senderStatsRef = doc(db, 'communities', communityId, 'members', auth.currentUser!.uid, 'channelStats', channel.id);

        const messageData: any = {
          authorUid: auth.currentUser!.uid,
          authorName: optimisticMessage.authorName,
          authorPhoto: optimisticMessage.authorPhoto,
          content: messageContent,
          attachments: messageAttachments,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          replyTo: optimisticMessage.replyTo
        };

        if (pollData) {
          messageData.poll = optimisticMessage.poll;
        }

        batch.set(messageRef, messageData);
        batch.update(channelRef, { messageCount: increment(1) });
        batch.update(communityRef, { 'stats.messagesCount': increment(1) });
        batch.set(senderStatsRef, { lastReadCount: increment(1) }, { merge: true });

        await batch.commit();

        // Update daily stats
        updateDailyStats(communityId, 'newMessage').catch(console.error);

        // Process notifications in background - don't await this
        const processNotifications = async () => {
          if (!/@[a-zA-Z0-9_-]+/.test(messageContent)) return;
          const membersSnap = await getDocs(collection(db, 'communities', communityId, 'members'));
          const senderId = auth.currentUser!.uid;
          const canMentionEveryone = isAdmin || myPermissions.includes('mention_everyone');
          const notificationBatch = writeBatch(db);
          let count = 0;
          
          // Only mentions notify. Everyday messages show up as unread counts on the channel,
          // rather than a notification per member per message.
          // Check for mentions in current message
          const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
          const mentions = [...messageContent.matchAll(mentionRegex)].map(m => m[1]);
          const mentionedMemberIds = new Set<string>();
          let mentionEveryone = false;
          let mentionAdmin = false;

          if (mentions.length > 0) {
            mentions.forEach(username => {
              const lower = username.toLowerCase();
              if (lower === 'everyone') {
                mentionEveryone = canMentionEveryone;
              } else if (lower === 'admin') {
                mentionAdmin = true;
              } else if (communityMembers) {
                const member = communityMembers.find(m => 
                  m.user?.username?.toLowerCase() === lower
                );
                if (member && member.id !== senderId) {
                  mentionedMemberIds.add(member.id);
                }
              }
            });
          }

          // Create mention notifications first
          mentionedMemberIds.forEach(recipientId => {
            const notifRef = doc(collection(db, 'notifications'));
            notificationBatch.set(notifRef, {
              recipientId,
              senderId: senderId,
              senderName: currentUserProfile?.displayName || auth.currentUser?.displayName || 'Anonymous',
              senderPhoto: communityData?.image || currentUserProfile?.profileImage || auth.currentUser?.photoURL,
              senderUsername: currentUserProfile?.username || '',
              type: 'channel_mention',
              content: `mentioned you in #${channel.name} of ${communityData?.name || 'their'} community`,
              relatedId: communityId,
              channelId: channel.id,
              read: false,
              createdAt: serverTimestamp()
            });
            count++;
          });

          // Handle special mentions (@everyone / @admin)
          if (mentionEveryone || mentionAdmin) {
            membersSnap.docs.forEach(mDoc => {
              const mData = mDoc.data();
              const isRecipientAdmin = mData.role === 'owner' || mData.role === 'admin';
              const isEligible = (mentionEveryone && mDoc.id !== senderId) || (mentionAdmin && isRecipientAdmin && mDoc.id !== senderId);

              if (isEligible && !mentionedMemberIds.has(mDoc.id) && count < 450) {
                const notifRef = doc(collection(db, 'notifications'));
                notificationBatch.set(notifRef, {
                  recipientId: mDoc.id,
                  senderId: senderId,
                  senderName: currentUserProfile?.displayName || auth.currentUser?.displayName || 'Anonymous',
                  senderPhoto: communityData?.image || currentUserProfile?.profileImage || auth.currentUser?.photoURL,
                  senderUsername: currentUserProfile?.username || '',
                  type: 'channel_mention',
                  content: mentionEveryone ? `mentioned @everyone in #${channel.name} of ${communityData?.name || 'their'} community` : `mentioned @admin in #${channel.name} of ${communityData?.name || 'their'} community`,
                  relatedId: communityId,
                  channelId: channel.id,
                  read: false,
                  createdAt: serverTimestamp()
                });
                count++;
                mentionedMemberIds.add(mDoc.id); // Also mark as mentioned to avoid double notifs
              }
            });
          }

          if (count > 0) await notificationBatch.commit();
        };
        processNotifications().catch(console.error);

        // Check for badges in background
        checkAndAwardBadges(auth.currentUser!.uid).then(newBadges => {
          if (newBadges.length > 0) {
            toast.success(`New Achievement: ${newBadges.join(', ')}!`, {
              icon: '🏆',
              duration: 5000,
            });
          }
        }).catch(console.error);
      };

      // Execute sending logic
      sendAction().catch(error => {
        console.error("Send error:", error);
        setMessages(prev => prev.filter(m => m.id !== messageId));
        setNewMessage(messageContent);
        setAttachments(messageAttachments);
        toast.error("Message didn't send. Your text is back in the box.");
      });

    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `communities/${communityId}/channels/${channel.id}/messages`);
    }
  };

  const handlePinMessage = async (messageId: string) => {
    if (!isAdmin && !myPermissions.includes('moderate_chat')) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    try {
      const messageRef = doc(db, 'communities', communityId, 'channels', channel.id, 'messages', messageId);
      const newPinnedState = !msg.isPinned;
      await updateDoc(messageRef, {
        isPinned: newPinnedState,
        pinnedAt: newPinnedState ? serverTimestamp() : null
      });
      toast.success(newPinnedState ? "Message pinned!" : "Message unpinned!");
      setActiveMessageMenu(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}/channels/${channel.id}/messages/${messageId}`);
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!editContent.trim() || !auth.currentUser) return;
    try {
      const messageRef = doc(db, 'communities', communityId, 'channels', channel.id, 'messages', messageId);
      await updateDoc(messageRef, {
        content: editContent,
        updatedAt: serverTimestamp(),
        isEdited: true
      });
      setEditingMessageId(null);
      setEditContent('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}/channels/${channel.id}/messages/${messageId}`);
    }
  };

  const handleVote = async (messageId: string, optionIndex: number) => {
    if (!auth.currentUser) {
      toast.error('Sign in to vote in polls');
      return;
    }
    const msg = messages.find(m => m.id === messageId);
    if (!msg || !msg.poll) return;

    const uid = auth.currentUser.uid;
    const voterEntry = msg.poll.voters?.find((v: string) => typeof v === 'string' && v.startsWith(uid + ':'));
    const hasVoted = !!voterEntry;
    const previousIndex = voterEntry ? parseInt(voterEntry.split(':')[1]) : -1;

    try {
      const messageRef = doc(db, 'communities', communityId, 'channels', channel.id, 'messages', messageId);
      const newOptions = [...msg.poll.options];
      let newVoters = [...(msg.poll.voters || [])];

      if (hasVoted) {
        if (previousIndex === optionIndex) {
          // Unvote
          newOptions[optionIndex].votes = Math.max(0, (newOptions[optionIndex].votes || 0) - 1);
          newVoters = newVoters.filter((v: string) => v !== voterEntry);
        } else {
          // Switch vote
          newOptions[previousIndex].votes = Math.max(0, (newOptions[previousIndex].votes || 0) - 1);
          newOptions[optionIndex].votes = (newOptions[optionIndex].votes || 0) + 1;
          newVoters = newVoters.filter((v: string) => v !== voterEntry);
          newVoters.push(`${uid}:${optionIndex}`);
        }
      } else {
        // New vote
        // Support legacy format where voters were just UIDs
        if (msg.poll.voters?.includes(uid)) {
           // This shouldn't really happen with new logic but let's be safe
           toast.error("You've already voted (legacy poll)");
           return;
        }
        newOptions[optionIndex].votes = (newOptions[optionIndex].votes || 0) + 1;
        newVoters.push(`${uid}:${optionIndex}`);
      }

      await updateDoc(messageRef, {
        'poll.options': newOptions,
        'poll.voters': newVoters
      });
      
      if (!hasVoted) {
        // Reward XP only for the first vote
        const memberRef = doc(db, 'communities', communityId, 'members', uid);
        await updateDoc(memberRef, { xp: increment(1) });
      }
    } catch (error) {
      console.error("Error voting:", error);
      toast.error("Failed to update vote");
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessageToDeleteId(messageId);
    setShowDeleteConfirm(true);
    setActiveMessageMenu(null);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDeleteId || !auth.currentUser) return;
    const originalId = messageToDeleteId;
    setDeleting(true);
    
    // Optimistic removal
    setMessages(prev => prev.filter(m => m.id !== originalId));
    setShowDeleteConfirm(false);

    try {
      const messageRef = doc(db, 'communities', communityId, 'channels', channel.id, 'messages', originalId);
      await deleteDoc(messageRef);
      setMessageToDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `communities/${communityId}/channels/${channel.id}/messages/${originalId}`);
      toast.error("Failed to delete message");
      // Re-fetch or rely on snapshot to restore if needed, but usually snapshot will handle it
    } finally {
      setDeleting(false);
    }
  };

  const canPost = isAdmin || isMember || myPermissions.includes('post_messages');
  const canModerate = isAdmin || myPermissions.includes('moderate_chat');
  const canUpload = isAdmin || isMember || myPermissions.includes('upload_files');
  const canThread = isAdmin || myPermissions.includes('create_threads');
  const postRoles: string[] = channel.postRoles || [];
  const timedOut = !!timeoutUntil && timeoutUntil > Date.now();
  const lockedReason = isAdmin ? null
    : timedOut ? `You're timed out until ${new Date(timeoutUntil!).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`
    : postRoles.length > 0 && !postRoles.some(r => myCustomRoles.includes(r)) ? 'Only certain roles can post in this channel.'
    : channel.type === 'announcements' ? 'Only admins can post in announcements.'
      : channel.isFrozen || channel.isLocked ? 'This channel is locked. Only admins can post.'
        : !canPost ? "You don't have permission to post here."
          : null;

  if (channel.type === 'feed') {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 space-y-4">
          {isMember && !lockedReason && <PostEditor communityId={communityId} channelId={channel.id} />}
          {lockedReason && <LockedNotice text={lockedReason} />}
          <FeedContent communityId={communityId} channelId={channel.id} />
        </div>
      </div>
    );
  }

  const startEdit = (msg: any) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
    setActiveMessageMenu(null);
    setShowReactionMenu(null);
  };

  const startReply = (msg: any) => {
    setReplyTo(msg);
    setActiveMessageMenu(null);
    setShowReactionMenu(null);
    inputRef.current?.focus();
  };

  const jumpTo = (id: string) => {
    const el = document.getElementById(`message-${id}`);
    if (!el) return toast('That message is further back in the channel');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate([{ backgroundColor: 'rgba(124,58,237,0.14)' }, { backgroundColor: 'transparent' }], { duration: 1600 });
  };

  const roleStyle = (authorUid: string) => {
    const member = communityMembers?.find(m => m.id === authorUid);
    const memberRoles = (member?.customRoles || []).map((rid: string) => roles.find(r => r.id === rid)).filter(Boolean);
    return { member, memberRoles };
  };

  const renderMessage = (msg: any) => {
    if (msg.type === 'system') {
      return (
        <div key={msg.id} className="flex justify-center py-2">
          <span className="text-xs text-foreground/50 bg-foreground/5 px-3 py-1 rounded-full">{msg.content}</span>
        </div>
      );
    }

    if (msg.type === 'welcome') {
      return (
        <div key={msg.id} id={`message-${msg.id}`} className="mx-2 sm:mx-3 my-3 flex items-start gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/15">
          <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/15 text-primary flex items-center justify-center"><Sparkles size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary">Welcome</p>
            <p className="text-[15px] font-medium leading-snug">{msg.content}</p>
            {msg.buttons?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {msg.buttons.map((btn: any, idx: number) => (
                  <a key={idx} href={btn.url} target="_blank" rel="noopener noreferrer nofollow" className="px-3.5 py-1.5 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90">
                    {btn.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    const isAuthor = msg.authorUid === auth.currentUser?.uid;
    const canDelete = isAuthor || isAdmin || canModerate;
    const isEditing = editingMessageId === msg.id;
    const showHeader = msg.showHeader;
    const { memberRoles } = roleStyle(msg.authorUid);
    const nameColor = memberRoles[0]?.color;
    const photo = isAuthor ? (currentUserProfile?.profileImage || msg.authorPhoto) : msg.authorPhoto;
    const actionsOpen = activeMessageMenu === msg.id || showReactionMenu === msg.id;
    const time = msg.createdAt instanceof Date ? msg.createdAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    const url = !msg.attachments?.length && !msg.poll ? firstUrl(msg.content || '') : null;
    const reactions = Object.entries(msg.reactions || {}).filter(([, d]: [string, any]) => d?.count > 0) as [string, any][];

    return (
      <div
        key={msg.id}
        id={`message-${msg.id}`}
        onContextMenu={e => { if (!isEditing) { e.preventDefault(); setShowReactionMenu(null); setActiveMessageMenu(msg.id); } }}
        className={`group relative flex gap-3 px-2 sm:px-3 py-0.5 rounded-xl transition-colors ${showHeader ? 'mt-3 pt-1.5' : ''} ${actionsOpen ? 'bg-foreground/[0.04] z-20' : 'hover:bg-foreground/[0.025]'} ${msg.isOptimistic ? 'opacity-60' : ''}`}
      >
        {showHeader ? (
          <UserHoverCard userId={msg.authorUid} communityId={communityId}>
            <span className="block mt-0.5 cursor-pointer"><Avatar src={photo} seed={msg.authorUid} size={36} /></span>
          </UserHoverCard>
        ) : (
          <span className="w-9 shrink-0 pt-1 text-right text-[10px] text-transparent group-hover:text-foreground/35 select-none">{time}</span>
        )}

        <div className="min-w-0 flex-1">
          {showHeader && (
            <div className="flex items-center gap-1.5 flex-wrap leading-tight">
              <UserHoverCard userId={msg.authorUid} communityId={communityId}>
                <span className="text-[15px] font-semibold hover:underline cursor-pointer" style={nameColor ? { color: nameColor } : undefined}>{msg.authorName}</span>
              </UserHoverCard>
              <VerifiedBadge userId={msg.authorUid} />
              {msg.isBot && <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-semibold">Bot</span>}
              {memberRoles.slice(0, 2).map((r: any) => (
                <span key={r.id} className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: `${r.color}1f`, color: r.color }}>{r.name}</span>
              ))}
              <span className="text-xs text-foreground/40">{msg.isOptimistic ? 'Sending…' : time}</span>
              {msg.isPinned && <Pin size={12} className="text-primary fill-current" />}
            </div>
          )}

          {msg.replyTo && (
            <button onClick={() => jumpTo(msg.replyTo.id)} className="mt-1 mb-0.5 flex items-center gap-1.5 max-w-full text-xs text-foreground/55 hover:text-foreground/80 text-left">
              <Reply size={12} className="shrink-0 -scale-x-100" />
              <span className="font-semibold shrink-0">{msg.replyTo.authorName}</span>
              <span className="truncate">{msg.replyTo.content || 'Attachment'}</span>
            </button>
          )}

          {isEditing ? (
            <div className="mt-1">
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditMessage(msg.id); }
                  else if (e.key === 'Escape') setEditingMessageId(null);
                }}
                rows={2}
                autoFocus
                className="w-full px-3 py-2 rounded-xl bg-foreground/5 border border-foreground/15 focus:border-primary outline-none text-[15px] resize-none"
              />
              <p className="mt-1 text-xs text-foreground/45">
                Enter to <button onClick={() => handleEditMessage(msg.id)} className="text-primary hover:underline">save</button> · Esc to <button onClick={() => setEditingMessageId(null)} className="text-primary hover:underline">cancel</button>
              </p>
            </div>
          ) : (
            <>
              {msg.content && (
                <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                  {renderMessageContent(msg.content)}
                  {msg.isEdited && <span className="ml-1 text-[11px] text-foreground/40">(edited)</span>}
                </div>
              )}

              {msg.buttons?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.buttons.map((btn: any, idx: number) => (
                    <a key={idx} href={btn.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-foreground/15 text-sm font-medium hover:bg-foreground/5">
                      {btn.label} <ExternalLink size={12} className="opacity-50" />
                    </a>
                  ))}
                </div>
              )}

              {msg.attachments?.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {msg.attachments.map((att: any, idx: number) => <AttachmentDisplay key={idx} attachment={att} />)}
                </div>
              )}

              {msg.poll && <PollCard msg={msg} onVote={i => handleVote(msg.id, i)} />}

              {url && <div className="max-w-md"><LinkPreview url={url} enabled compact /></div>}

              {reactions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {reactions.map(([emoji, data]) => {
                    const mine = data.uids?.includes(auth.currentUser?.uid);
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleAddReaction(msg.id, emoji)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${mine ? 'bg-primary/10 border-primary/40 text-primary' : 'border-foreground/15 text-foreground/65 hover:border-foreground/30'}`}
                      >
                        <span className="text-sm">{emoji}</span><span className="font-medium">{data.count}</span>
                      </button>
                    );
                  })}
                  <button onClick={() => setShowReactionMenu(msg.id)} aria-label="Add reaction" className="px-1.5 py-0.5 rounded-full border border-dashed border-foreground/20 text-foreground/45 hover:text-foreground"><Smile size={13} /></button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions: hover on desktop, right-click / long-press anywhere */}
        {!isEditing && !msg.isOptimistic && (
          <div className={`absolute -top-3.5 right-2 flex items-center gap-0.5 p-0.5 rounded-full bg-background border border-foreground/10 shadow-md transition-opacity ${actionsOpen ? 'opacity-100' : 'opacity-0 pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto'}`}>
            {QUICK_REACTIONS.slice(0, 3).map(e => (
              <button key={e} onClick={() => handleAddReaction(msg.id, e)} className="w-8 h-8 rounded-full text-base hover:bg-foreground/5" title={`React ${e}`}>{e}</button>
            ))}
            <ActionIcon label="More reactions" onClick={() => { setActiveMessageMenu(null); setShowReactionMenu(showReactionMenu === msg.id ? null : msg.id); }}><Smile size={16} /></ActionIcon>
            <ActionIcon label="Reply" onClick={() => startReply(msg)}><Reply size={16} /></ActionIcon>
            <ActionIcon label="More" onClick={() => { setShowReactionMenu(null); setActiveMessageMenu(activeMessageMenu === msg.id ? null : msg.id); }}><MoreHorizontal size={16} /></ActionIcon>
          </div>
        )}

        {showReactionMenu === msg.id && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowReactionMenu(null)} />
            <div className="absolute right-2 top-6 z-40 flex items-center gap-0.5 p-1 rounded-full bg-background border border-foreground/10 shadow-xl">
              {QUICK_REACTIONS.map(e => (
                <button key={e} onClick={() => { handleAddReaction(msg.id, e); setShowReactionMenu(null); }} className="w-9 h-9 rounded-full text-xl hover:bg-foreground/5 hover:scale-110 transition-transform">{e}</button>
              ))}
            </div>
          </>
        )}

        {activeMessageMenu === msg.id && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setActiveMessageMenu(null)} />
            <div className="absolute right-2 top-6 z-40 w-52 py-1.5 rounded-2xl bg-background border border-foreground/10 shadow-xl text-sm">
              <MenuItem icon={Reply} label="Reply" onClick={() => startReply(msg)} />
              {canThread && <MenuItem icon={MessageSquare} label="Reply in thread" onClick={() => { setActiveThreadId(msg.id); setIsThreadViewOpen(true); setActiveMessageMenu(null); }} />}
              {msg.content && <MenuItem icon={Copy} label="Copy text" onClick={() => { navigator.clipboard.writeText(msg.content); toast.success('Copied'); setActiveMessageMenu(null); }} />}
              {isAuthor && <MenuItem icon={Edit2} label="Edit" onClick={() => startEdit(msg)} />}
              {canModerate && <MenuItem icon={Pin} label={msg.isPinned ? 'Unpin' : 'Pin to channel'} onClick={() => handlePinMessage(msg.id)} />}
              {!isAuthor && !msg.isBot && <MenuItem icon={Gift} label="Gift XP" onClick={() => { setGiftTarget({ id: msg.authorUid, name: msg.authorName }); setShowGiftModal(true); setActiveMessageMenu(null); }} />}
              {!isAuthor && !msg.isBot && <MenuItem icon={Flag} label="Report" onClick={() => {
                setReportTargetId(msg.id);
                setReportContentSnippet(msg.content);
                setReportTargetAuthorId(msg.authorUid);
                setIsReportModalOpen(true);
                setActiveMessageMenu(null);
              }} />}
              {canDelete && <MenuItem icon={Trash2} label="Delete" danger onClick={() => handleDeleteMessage(msg.id)} />}
            </div>
          </>
        )}
      </div>
    );
  };

  const suggestions = showMentionSuggestions && filteredMentions.length > 0 ? 'people' : showChannelSuggestions && filteredChannels.length > 0 ? 'channels' : null;

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden px-1 sm:px-3 pb-3" style={{ overflowAnchor: 'auto' }}>
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {!hasMore && <ChannelIntro channel={channel} communityName={communityData?.name} isAdmin={isAdmin} onOpenSettings={onOpenSettings} empty={messages.length === 0} />}
            {loadingMore && (
              <div className="flex justify-center py-3"><span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
            )}
            {groupedMessages.map((item: any) =>
              item._kind === 'date' ? (
                <div key={`date-${item.date.getTime()}`} className="flex items-center gap-3 px-3 py-4">
                  <span className="flex-1 h-px bg-foreground/10" />
                  <span className="text-xs font-medium text-foreground/50">{getDateLabel(item.date)}</span>
                  <span className="flex-1 h-px bg-foreground/10" />
                </div>
              ) : renderMessage(item),
            )}
          </>
        )}
      </div>

      {newBelow && (
        <button
          onClick={() => { scrollToBottom('smooth'); setNewBelow(false); }}
          className="absolute left-1/2 -translate-x-1/2 bottom-24 z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-white text-sm font-medium shadow-lg"
        >
          <ArrowDown size={14} /> New messages
        </button>
      )}

      {isMember && (
        <div className="shrink-0 px-2 sm:px-4 pt-1 pb-[max(10px,env(safe-area-inset-bottom))]">
          {lockedReason ? (
            <LockedNotice text={lockedReason} />
          ) : (
            <form onSubmit={handleSendMessage} className="relative rounded-3xl bg-black/[0.04] dark:bg-white/[0.06] border border-transparent focus-within:border-primary/40 transition-colors">
              {/* @people and #channel suggestions */}
              {suggestions && (
                <div className="absolute bottom-full left-0 mb-2 w-72 max-w-full py-1.5 rounded-2xl bg-background border border-foreground/10 shadow-xl z-40">
                  <p className="px-3 pb-1 text-xs font-semibold text-foreground/45">{suggestions === 'people' ? 'People' : 'Channels'}</p>
                  {suggestions === 'people'
                    ? filteredMentions.map((m: any) => (
                      <button key={m.id} type="button" onClick={() => insertMention(m.user?.username || 'user')} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-foreground/5">
                        {m.id === 'everyone' || m.id === 'admin'
                          ? <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Megaphone size={14} /></span>
                          : <Avatar src={m.user?.profileImage} seed={m.id} size={28} />}
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 text-sm font-medium truncate">{m.user?.displayName || m.user?.username}<VerifiedBadge verified={m.user?.verified} /></span>
                          <span className="block text-xs text-foreground/50 truncate">@{m.user?.username}</span>
                        </span>
                      </button>
                    ))
                    : filteredChannels.map((c: any) => (
                      <button key={c.id} type="button" onClick={() => insertChannelMention(c.name)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-foreground/5">
                        <Hash size={16} className="text-foreground/50" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate">{c.name}</span>
                          {c.description && <span className="block text-xs text-foreground/50 truncate">{c.description}</span>}
                        </span>
                      </button>
                    ))}
                </div>
              )}

              {replyTo && (
                <div className="flex items-center gap-2 mx-2 mt-2 pl-3 pr-1 py-1.5 rounded-xl bg-background/60 border-l-2 border-primary">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block text-xs font-semibold text-primary">Replying to {replyTo.authorName}</span>
                    <span className="block truncate text-foreground/60">{replyTo.content || 'Attachment'}</span>
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="p-1.5 rounded-full hover:bg-foreground/10"><X size={15} /></button>
                </div>
              )}

              {(attachments.length > 0 || uploading) && (
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="relative">
                      {att.type?.startsWith('image/')
                        ? <img src={att.url} alt="" className="w-16 h-16 rounded-xl object-cover" />
                        : <span className="w-16 h-16 rounded-xl bg-foreground/10 flex flex-col items-center justify-center gap-1 px-1 text-foreground/60"><FileText size={18} /><span className="text-[9px] truncate max-w-full">{att.name}</span></span>}
                      <button type="button" onClick={() => removeAttachment(idx)} aria-label="Remove" className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center"><X size={11} /></button>
                    </div>
                  ))}
                  {uploading && <span className="w-16 h-16 rounded-xl bg-foreground/10 flex items-center justify-center"><span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></span>}
                </div>
              )}

              <div className="flex items-end gap-1 p-1.5">
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple className="hidden" />
                <div className="relative" ref={actionsMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowActionsMenu(!showActionsMenu)}
                    disabled={uploading || !canUpload}
                    aria-label="More"
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${showActionsMenu ? 'bg-primary text-white' : 'text-foreground/55 hover:bg-foreground/10'}`}
                  >
                    <Plus size={20} className={`transition-transform ${showActionsMenu ? 'rotate-45' : ''}`} />
                  </button>
                  {showActionsMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-52 py-1.5 rounded-2xl bg-background border border-foreground/10 shadow-xl z-40 text-sm">
                      <MenuItem icon={ImageIcon} label="Photo, video or file" onClick={() => { fileInputRef.current?.click(); setShowActionsMenu(false); }} />
                      <MenuItem icon={BarChart2} label="Poll" onClick={() => { setShowPollModal(true); setShowActionsMenu(false); }} />
                      <MenuItem icon={Sparkles} label="Animated sticker" onClick={() => { setShowAnimatedPicker(true); setShowActionsMenu(false); }} />
                    </div>
                  )}
                </div>

                <textarea
                  value={newMessage}
                  ref={inputRef}
                  onChange={onComposerChange}
                  onKeyDown={onComposerKeyDown}
                  onPaste={onComposerPaste}
                  placeholder={`Message #${channel.name}`}
                  aria-label={`Message #${channel.name}`}
                  rows={1}
                  className="flex-1 min-w-0 bg-transparent py-2 text-[15px] leading-snug outline-none resize-none max-h-40 placeholder:text-foreground/40"
                />

                <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} aria-label="Emoji" className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${showEmojiPicker ? 'text-primary' : 'text-foreground/55 hover:bg-foreground/10'}`}>
                  <Smile size={20} />
                </button>
                <button type="submit" disabled={!newMessage.trim() && attachments.length === 0} aria-label="Send" className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-30 hover:bg-primary/90 active:scale-95 transition">
                  <Send size={17} className="-ml-0.5" />
                </button>
              </div>

              {showEmojiPicker && (
                <div ref={emojiPickerRef} className="absolute bottom-full right-0 mb-2 z-40">
                  <EmojiPicker
                    theme={document.documentElement.classList.contains('light') ? Theme.LIGHT : Theme.DARK}
                    onEmojiClick={d => { setNewMessage(prev => prev + d.emoji); inputRef.current?.focus(); }}
                    lazyLoadEmojis
                    width={320}
                    height={380}
                  />
                </div>
              )}
              {showAnimatedPicker && (
                <div className="absolute bottom-full left-0 mb-2 z-40">
                  <AnimatedEmojiPicker onSelect={emoji => { handleSendMessage(undefined, `:animated-${emoji}:`); setShowAnimatedPicker(false); }} onClose={() => setShowAnimatedPicker(false)} />
                </div>
              )}
            </form>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteMessage}
        title="Delete message?"
        message="It will be removed for everyone in the channel."
        confirmText="Delete"
        loading={deleting}
      />

      <AnimatePresence>
        {isThreadViewOpen && activeThreadId && (
          <ThreadSidebar
            communityId={communityId}
            channelId={channel.id}
            parentMessageId={activeThreadId}
            onClose={() => setIsThreadViewOpen(false)}
            currentUserProfile={currentUserProfile}
          />
        )}
      </AnimatePresence>

      {showGiftModal && giftTarget && (
        <XPGiftModal
          isOpen={showGiftModal}
          onClose={() => { setShowGiftModal(false); setGiftTarget(null); }}
          receiverId={giftTarget.id}
          receiverName={giftTarget.name}
          communityId={communityId}
        />
      )}

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        communityId={communityId}
        channelId={channel.id}
        targetId={reportTargetId}
        targetType={reportTargetType}
        targetAuthorId={reportTargetAuthorId}
        contentSnippet={reportContentSnippet}
      />

      <CreatePollModal
        isOpen={showPollModal}
        onClose={() => setShowPollModal(false)}
        onSubmit={pollData => { handleSendMessage(undefined, '', pollData); setShowPollModal(false); }}
      />
    </div>
  );
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '🎉', '👀'];

function ActionIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="w-8 h-8 rounded-full flex items-center justify-center text-foreground/55 hover:text-foreground hover:bg-foreground/5">
      {children}
    </button>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Reply; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-foreground/5 ${danger ? 'text-red-500' : ''}`}>
      <Icon size={16} className={danger ? '' : 'text-foreground/55'} /> {label}
    </button>
  );
}

function LockedNotice({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-foreground/5 text-sm text-foreground/60">
      <Lock size={16} className="shrink-0" /> {text}
    </div>
  );
}

/** Shown at the very top of a channel's history. */
function ChannelIntro({ channel, communityName, isAdmin, onOpenSettings, empty }: { channel: any; communityName?: string; isAdmin: boolean; onOpenSettings: () => void; empty: boolean }) {
  const Icon = channelTypeInfo(channel.type).icon;
  return (
    <div className="px-3 pt-8 pb-4">
      <span className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Icon size={26} /></span>
      <h2 className="mt-3 text-2xl font-bold">Welcome to #{channel.name}</h2>
      <p className="mt-1 text-foreground/60">
        {channel.description || `This is the start of #${channel.name}${communityName ? ` in ${communityName}` : ''}.`}
      </p>
      {empty && <p className="mt-3 text-sm text-foreground/50">No messages yet. Say hello 👋</p>}
      {isAdmin && (
        <button onClick={onOpenSettings} className="mt-4 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-foreground/15 text-sm font-medium hover:bg-foreground/5">
          <Settings size={14} /> Edit channel
        </button>
      )}
    </div>
  );
}

function PollCard({ msg, onVote }: { msg: any; onVote: (i: number) => void }) {
  const uid = auth.currentUser?.uid;
  const options: any[] = msg.poll.options || [];
  const total = options.reduce((acc, o) => acc + (o.votes || 0), 0);
  const voted = msg.poll.voters?.some((v: string) => typeof v === 'string' && (v === uid || v.startsWith(`${uid}:`)));
  const expires = (() => {
    const v = msg.poll.expiresAt;
    if (!v) return '';
    const d = v.toDate ? v.toDate() : new Date(v);
    return isNaN(d.getTime()) ? '' : d.getTime() < Date.now() ? 'Poll closed' : `Ends ${formatDistanceToNow(d, { addSuffix: true })}`;
  })();
  return (
    <div className="mt-2 max-w-sm p-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02]">
      <p className="font-semibold leading-snug">{msg.poll.question}</p>
      <div className="mt-3 space-y-2">
        {options.map((o, i) => {
          const pct = total ? Math.round(((o.votes || 0) / total) * 100) : 0;
          const mine = msg.poll.voters?.includes(`${uid}:${i}`);
          return (
            <button key={i} onClick={() => onVote(i)} className={`relative w-full h-11 rounded-xl overflow-hidden border text-left transition-colors ${mine ? 'border-primary' : 'border-foreground/15 hover:border-primary/50'}`}>
              <span className={`absolute inset-y-0 left-0 transition-all duration-500 ${mine ? 'bg-primary/20' : 'bg-foreground/[0.06]'}`} style={{ width: voted ? `${pct}%` : 0 }} />
              <span className="relative flex items-center justify-between px-3.5 text-sm">
                <span className={`flex items-center gap-1.5 font-medium ${mine ? 'text-primary' : ''}`}>{o.text}{mine && <Check size={14} />}</span>
                {voted && <span className="text-foreground/55 font-medium">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-xs text-foreground/50">{total} {total === 1 ? 'vote' : 'votes'}{expires && ` · ${expires}`}{!voted && ' · Tap to vote'}</p>
    </div>
  );
}

function AttachmentDisplay({ attachment }: { attachment: any }) {
  const type = attachment.type || '';
  const hasUrl = !!attachment.url?.trim();
  if (type.startsWith('image/') && hasUrl) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-foreground/10 max-w-sm">
        <img src={attachment.url} alt={attachment.name} loading="lazy" className="max-h-80 w-auto object-cover" />
      </a>
    );
  }
  if (type.startsWith('video/') && hasUrl) {
    return <video src={attachment.url} controls preload="metadata" className="rounded-xl max-h-80 max-w-sm bg-black" />;
  }
  return (
    <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2.5 pr-4 rounded-xl border border-foreground/10 hover:bg-foreground/5 max-w-sm">
      <span className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{type.startsWith('audio/') ? <Music size={18} /> : <FileText size={18} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{attachment.name}</span>
        <span className="block text-xs text-foreground/50">{attachment.size ? `${(attachment.size / 1024 / 1024).toFixed(1)} MB` : 'File'}</span>
      </span>
      <Download size={16} className="text-foreground/40 shrink-0" />
    </a>
  );
}

function FeedContent({ communityId, channelId }: { communityId: string, channelId: string }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'posts'),
      where('communityId', '==', communityId),
      where('channelId', '==', channelId),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPosts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `posts (community: ${communityId}, channel: ${channelId})`);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [communityId, channelId]);

  if (loading) return <div className="flex justify-center py-12"><span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="rounded-2xl border border-foreground/10 overflow-hidden">
      {posts.map(post => <PostCard key={post.id} post={post} />)}
      {posts.length === 0 && <p className="py-16 text-center text-sm text-foreground/50">No posts yet. Share the first one.</p>}
    </div>
  );
}
