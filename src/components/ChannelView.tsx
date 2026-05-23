import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, increment, getDocs, writeBatch, setDoc, where, deleteDoc, limit, startAfter, endBefore, limitToLast, getDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import CreatePollModal from './CreatePollModal';
import { Send, Image as ImageIcon, Code as CodeIcon, Paperclip, Smile, MessageSquare, Settings, Snowflake, Megaphone, Hash, MoreVertical, Edit2, Trash2, X, Check, Reply, ExternalLink, Plus, ChevronUp, Zap, Heart, ThumbsUp, PartyPopper, FileText, Video, Music, Download, Play, Film, Sparkles, Lock, Flag, Cpu, Pin, BarChart2, Copy, Globe, Twitter, Github, Linkedin, Info, Gift } from 'lucide-react';
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

import KithLogo from './KithLogo';
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
  myPermissions = []
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !auth.currentUser) return;

    setUploading(true);
    try {
      const newAttachments = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const storageRef = ref(storage, `channels/${communityId}/${channel.id}/${auth.currentUser.uid}/${Date.now()}-${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);

        newAttachments.push({
          name: file.name,
          url,
          type: file.type,
          size: file.size
        });
      }

      setAttachments(prev => [...prev, ...newAttachments]);
      toast.success(`${files.length} file(s) uploaded!`);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.error || 'Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  useEffect(() => {
    if (!communityId || !channel) return;

    setNewMessage('');
    setReplyTo(null);
    setEditingMessageId(null);
    setActiveMessageMenu(null);
    setMessages([]);
    setHasMore(true);
    setShouldScrollToBottom(true);

    setLoading(true);
    const messagesRef = collection(db, 'communities', communityId, 'channels', channel.id, 'messages');
    
    // Guard: If not a member and community isn't public, don't subscribe to avoid permission errors
    // unless the channel itself is public (though the rules handle this, the UI should be proactive)
    const accessType = communityData?.membershipControl?.accessType || 'public';
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
          }
        }
      });
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
  }, [communityId, channel.id, communityData, isMember, isAdmin]);

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
      groups.push({ type: 'date', date });
    }

    groups.push({ ...msg, type: 'message', showHeader });
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
        
        // Reward XP for engagement
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
          const membersSnap = await getDocs(collection(db, 'communities', communityId, 'members'));
          const senderId = auth.currentUser!.uid;
          const notificationBatch = writeBatch(db);
          let count = 0;
          
          // Regular channel notifications (limited to avoid massive batch sizes in huge communities)
          // Ideally this should be handled by a Cloud Function for scalability
          const regularMembers = membersSnap.docs.filter(m => m.id !== senderId).slice(0, 100);
          
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
                mentionEveryone = true;
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

          // Create regular notifications for others who weren't mentioned
          regularMembers.forEach(memberDoc => {
            if (!mentionedMemberIds.has(memberDoc.id) && count < 480) {
              const notifRef = doc(collection(db, 'notifications'));
              notificationBatch.set(notifRef, {
                recipientId: memberDoc.id,
                senderId: senderId,
                senderName: currentUserProfile?.displayName || auth.currentUser?.displayName || 'Anonymous',
                senderPhoto: communityData?.image || currentUserProfile?.profileImage || auth.currentUser?.photoURL,
                type: 'message',
                content: `sent a message in #${channel.name} of ${communityData?.name || 'their'} community`,
                relatedId: communityId,
                channelId: channel.id,
                read: false,
                createdAt: serverTimestamp()
              });
              count++;
            }
          });
          
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
        handleFirestoreError(error, OperationType.CREATE, `communities/${communityId}/channels/${channel.id}/messages`);
        // Optionally restore the message if it failed
        setNewMessage(messageContent);
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

  if (channel.type === 'feed') {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
          {/* Header removed - redundant with CommunityView top bar */}
          {isMember && (!channel.isFrozen && !channel.isLocked || isAdmin) && <PostEditor communityId={communityId} channelId={channel.id} />}
          {(channel.isFrozen || channel.isLocked) && !isAdmin && (
            <div className="glass rounded-3xl p-4 flex items-center gap-3 text-blue-400 bg-blue-500/5 border border-blue-500/20">
              <Lock size={18} />
              <p className="text-sm font-medium">This channel is locked. Only admins can post.</p>
            </div>
          )}
          <FeedContent communityId={communityId} channelId={channel.id} />
        </div>
      </div>
    );
  }

  if (channel.type === 'chat' || channel.type === 'code' || channel.type === 'announcements') {
    const canPost = isAdmin || isMember || myPermissions.includes('post_messages');
  const canModerate = isAdmin || myPermissions.includes('moderate_chat');
  const canUpload = isAdmin || isMember || myPermissions.includes('upload_files');

  const isReadOnly = (channel.type === 'announcements' || channel.isFrozen || channel.isLocked || !canPost) && !isAdmin;

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Channel Header removed - redundant with CommunityView top bar */}

        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar"
          style={{ overflowAnchor: 'auto' }}
        >
          {(loading && messages.length === 0) ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-start justify-end min-h-[60vh] max-w-2xl p-8 space-y-6">
              <div className="space-y-4">
                <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/10">
                  <Hash size={40} className="text-primary animate-pulse" />
                </div>
                <div>
                  <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">Welcome to #{channel.name}!</h1>
                  <p className="text-lg text-foreground/40 font-medium">This is the beginning of the <span className="text-foreground/60 font-bold">#{channel.name}</span> channel in <span className="text-primary font-bold">{communityData?.name}</span>.</p>
                </div>
              </div>

              {communityData && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full glass rounded-[2.5rem] p-8 border border-foreground/5 space-y-8 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Info size={120} />
                  </div>

                  <div className="space-y-2 relative">
                    <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Community Mission</h3>
                    <p className="text-base text-foreground/70 leading-relaxed font-medium">
                      {communityData.description || 'Welcome to our space for sharing, learning, and growing together.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-foreground/5">
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black text-foreground/30 uppercase tracking-widest">General Community Link</h3>
                      <div className="relative group">
                        <div className="flex items-center gap-2 bg-foreground/5 border border-foreground/5 rounded-2xl p-1.5 pl-4 overflow-hidden">
                           <input 
                              readOnly
                              value={`${window.location.origin}/community/${communityId}`}
                              className="bg-transparent text-[11px] flex-1 outline-none text-foreground/40 font-mono truncate"
                           />
                           <button 
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/community/${communityId}`);
                                toast.success("Permanent link copied!");
                              }}
                              className="p-2.5 hover:bg-primary hover:text-white rounded-xl transition-all text-primary"
                           >
                              <Copy size={14} />
                           </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black text-foreground/30 uppercase tracking-widest">Connect With Us</h3>
                      <div className="flex flex-wrap gap-2">
                        {communityData.website && (
                          <a href={communityData.website} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl bg-foreground/5 hover:bg-primary/20 text-foreground/40 hover:text-primary transition-all">
                            <Globe size={18} />
                          </a>
                        )}
                        {communityData.socials?.twitter && (
                          <a href={`https://twitter.com/${communityData.socials.twitter}`} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl bg-foreground/5 hover:bg-sky-500/20 text-foreground/40 hover:text-sky-500 transition-all">
                            <Twitter size={18} />
                          </a>
                        )}
                        {communityData.socials?.github && (
                          <a href={`https://github.com/${communityData.socials.github}`} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl bg-foreground/5 hover:bg-white/20 text-foreground/40 hover:text-foreground transition-all">
                            <Github size={18} />
                          </a>
                        )}
                        {communityData.socials?.linkedin && (
                          <a href={`https://linkedin.com/in/${communityData.socials.linkedin}`} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl bg-foreground/5 hover:bg-blue-600/20 text-foreground/40 hover:text-blue-600 transition-all">
                            <Linkedin size={18} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-foreground/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-foreground/10">
                        <img src={(communityData.image && communityData.image.trim() !== '') ? communityData.image : `https://picsum.photos/seed/${communityId}/200/200`} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">Established {formatDate(communityData.createdAt, 'MMMM yyyy')}</p>
                        <p className="text-[10px] text-foreground/40 font-medium uppercase tracking-widest">Community Hub</p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={onOpenSettings}
                      className="px-5 py-2.5 bg-foreground/5 hover:bg-foreground/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-foreground/60 transition-all border border-foreground/5"
                    >
                      Channel Settings
                    </button>
                  </div>
                </motion.div>
              )}

              {isAdmin && (
                <div className="flex gap-4">
                  <button onClick={onOpenSettings} className="px-6 py-3 bg-primary/10 text-primary rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center gap-2">
                    <Settings size={16} /> Edit Channel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {loading && (
                <div className="flex justify-center py-2 opacity-50">
                   <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {loadingMore && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {groupedMessages.map((item, i) => {
                if (item.type === 'date') {
                  return (
                    <div key={`date-${item.date.getTime()}`} className="flex items-center gap-4 py-4">
                      <div className="flex-1 h-[1px] bg-black/10 dark:bg-white/10" />
                      <span className="text-[10px] font-bold text-black/50 dark:text-white/30 uppercase tracking-widest">{getDateLabel(item.date)}</span>
                      <div className="flex-1 h-[1px] bg-black/10 dark:bg-white/10" />
                    </div>
                  );
                }

                const msg = item;
                const isSystem = msg.type === 'system';
                const isAuthor = msg.authorUid === auth.currentUser?.uid;
                const canDelete = (isAuthor || isAdmin || canModerate) && !isSystem;
                const canThread = isAdmin || myPermissions.includes('create_threads');
                const isEditing = editingMessageId === msg.id;
                const showHeader = item.showHeader && !isSystem;

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center py-2">
                       <span className="text-[10px] font-bold text-black/40 dark:text-foreground/30 bg-black/5 dark:bg-foreground/5 px-3 py-1 rounded-full uppercase tracking-widest border border-black/5 dark:border-foreground/5">
                         {msg.content}
                       </span>
                    </div>
                  );
                }

                if (msg.type === 'welcome') {
                  return (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mx-4 my-6 p-6 rounded-[2rem] bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20 relative overflow-hidden group"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
                      <div className="relative z-10 flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                          <Sparkles className="text-primary" size={24} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-black uppercase tracking-widest text-primary">System Protocol</span>
                            <div className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[8px] font-black uppercase flex items-center gap-1">
                              <Cpu size={8} /> Bot
                            </div>
                          </div>
                          <p className="text-lg font-bold text-foreground leading-tight">{msg.content}</p>
                          
                          {msg.buttons && msg.buttons.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                              {msg.buttons.map((btn: any, idx: number) => (
                                <a 
                                  key={idx}
                                  href={btn.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-6 py-2.5 bg-white text-black rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20"
                                >
                                  {btn.label}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div 
                    key={msg.id} 
                    id={`message-${msg.id}`}
                    initial={msg.type === 'welcome' ? { opacity: 0, x: -20 } : false}
                    animate={msg.type === 'welcome' ? { opacity: 1, x: 0 } : false}
                    className={`group relative flex gap-4 px-4 py-1 hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors ${showHeader ? 'mt-4' : ''} ${activeMessageMenu === msg.id || showReactionMenu === msg.id ? 'z-50' : 'z-0'} ${msg.type === 'welcome' ? 'bg-primary/5 border-l-2 border-primary my-2 py-3 shadow-[0_0_20px_rgba(139,92,246,0.05)]' : ''}`}
                  >
                    {showHeader ? (
                      <UserHoverCard userId={msg.authorUid} communityId={communityId}>
                        <div className="w-10 h-10 rounded-full bg-foreground/10 overflow-hidden flex-shrink-0 mt-1 cursor-pointer">
                          <img 
                            src={((msg.authorUid === auth.currentUser?.uid ? currentUserProfile?.profileImage : null) && (msg.authorUid === auth.currentUser?.uid ? currentUserProfile?.profileImage : null).trim() !== '') 
                              ? (msg.authorUid === auth.currentUser?.uid ? currentUserProfile?.profileImage : null) 
                              : (msg.authorPhoto && msg.authorPhoto.trim() !== '' ? msg.authorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.authorUid}`)} 
                            alt="Avatar" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </UserHoverCard>
                    ) : (
                      <div className="w-10 flex-shrink-0 flex justify-center">
                        <span className="text-[8px] text-foreground/0 group-hover:text-foreground/20 mt-1 transition-colors">
                          {msg.createdAt instanceof Date ? msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      {showHeader && (
                        <div className="flex items-center gap-2 mb-0.5">
                          <UserHoverCard userId={msg.authorUid} communityId={communityId}>
                            <div className="flex items-center gap-2 group/author">
                            <span className="text-sm font-bold text-black dark:text-white hover:text-primary transition-colors cursor-pointer" style={(() => {
                                 const member = communityMembers?.find(m => m.id === msg.authorUid);
                                 const memberRoles = (member?.customRoles || []).map((rid: string) => roles.find(r => r.id === rid)).filter(Boolean);
                                 if (memberRoles.length > 0) {
                                   return { color: memberRoles[0].color };
                                 }
                                 return {};
                              })()}>{msg.authorName}</span>
                              <VerifiedBadge userId={msg.authorUid} />
                              {msg.isPinned && <Pin size={12} className="text-primary fill-current" />}
                              {msg.isBot && (
                                <div className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[8px] font-black uppercase flex items-center gap-1">
                                  <Cpu size={8} /> Bot
                                </div>
                              )}
                              <div className="flex gap-1">
                                {(() => {
                                   const member = communityMembers?.find(m => m.id === msg.authorUid);
                                   return (member?.customRoles || []).map((rid: string) => {
                                      const r = roles.find(role => role.id === rid);
                                      if (!r) return null;
                                      return (
                                        <div key={rid} className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase" style={{ backgroundColor: `${r.color}20`, color: r.color }}>{r.name}</div>
                                      );
                                   });
                                })()}
                              </div>
                            </div>
                          </UserHoverCard>
                          <span className="text-[10px] text-black/50 dark:text-white/40">
                            {msg.createdAt instanceof Date ? msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                          </span>
                        </div>
                      )}

                      {msg.replyTo && (
                        <div 
                          onClick={() => {
                            const el = document.getElementById(`message-${msg.replyTo.id}`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.classList.add('bg-primary/10');
                              setTimeout(() => el.classList.remove('bg-primary/10'), 2000);
                            }
                          }}
                          className="flex items-center gap-2 mb-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer group/reply"
                        >
                          <div className="w-4 h-4 border-l-2 border-t-2 border-black/20 dark:border-white/20 rounded-tl-lg ml-2" />
                          <div className="w-4 h-4 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden flex-shrink-0">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.replyTo.authorName}`} alt="" className="w-full h-full" />
                          </div>
                          <span className="text-[10px] font-bold text-black/60 dark:text-white/60">{msg.replyTo.authorName}</span>
                          <p className="text-[10px] text-black/50 dark:text-white/40 truncate italic">"{msg.replyTo.content}"</p>
                        </div>
                      )}

                      {isEditing ? (
                        <div className="flex flex-col gap-2 mt-1">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleEditMessage(msg.id);
                              } else if (e.key === 'Escape') {
                                setEditingMessageId(null);
                              }
                            }}
                            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-black dark:text-white outline-none focus:border-primary min-w-[200px] resize-none"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex justify-start gap-2 text-[10px]">
                            <span className="text-black/40 dark:text-white/40">escape to <button onClick={() => setEditingMessageId(null)} className="text-primary hover:underline">cancel</button> • enter to <button onClick={() => handleEditMessage(msg.id)} className="text-primary hover:underline">save</button></span>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="text-[16px] font-medium text-black/90 dark:text-white/90 break-words leading-relaxed whitespace-pre-wrap">
                            {(() => {
                              const solo = isSoloEmoji(msg.content);
                              if (solo?.type === 'animated') {
                                return (
                                  <div className="w-40 h-40 my-2">
                                    <SafeAnimatedEmoji emoji={solo.value as any} />
                                  </div>
                                );
                              }
                              if (solo?.type === 'standard') {
                                return (
                                  <div className="text-6xl my-4 leading-none">
                                    {solo.value}
                                  </div>
                                );
                              }
                              return renderMessageContent(msg.content);
                            })()}
                            {msg.isEdited && <span className="text-[10px] text-foreground/40 ml-1">(edited)</span>}
                            <MessageLinkPreview content={msg.content} />
                          </div>

                          {/* Render Buttons if any */}
                          {msg.buttons && msg.buttons.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3 mb-1">
                              {msg.buttons.map((btn: any, idx: number) => (
                                <a 
                                  key={idx}
                                  href={btn.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 hover:border-primary/50 transition-all flex items-center gap-2"
                                >
                                  {btn.label}
                                  <ExternalLink size={12} className="opacity-40" />
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Render Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-col gap-2 mt-2">
                              {msg.attachments.map((att: any, idx: number) => (
                                <AttachmentDisplay key={idx} attachment={att} />
                              ))}
                            </div>
                          )}

                          {/* Poll Rendering */}
                          {msg.poll && (
                            <div className="bg-foreground/5 dark:bg-white/5 border border-foreground/10 dark:border-white/10 rounded-2xl p-5 mt-2 space-y-5 max-w-sm">
                              <h4 className="font-bold text-base text-foreground mb-1 leading-tight">{msg.poll.question}</h4>
                              <div className="space-y-3">
                                {msg.poll.options.map((option: any, i: number) => {
                                  const currentUid = auth.currentUser?.uid;
                                  const totalVotes = msg.poll.options.reduce((acc: number, curr: any) => acc + curr.votes, 0);
                                  const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
                                  const voterEntry = msg.poll.voters?.find((v: string) => typeof v === 'string' && v.startsWith(currentUid + ':'));
                                  const hasVoted = !!voterEntry || msg.poll.voters?.includes(currentUid);
                                  const isSelected = msg.poll.voters?.includes(`${currentUid}:${i}`);
                                  
                                  return (
                                    <button
                                      key={i}
                                      onClick={() => handleVote(msg.id, i)}
                                      className={`w-full relative h-12 rounded-xl overflow-hidden border transition-all group ${
                                        isSelected 
                                          ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]' 
                                          : 'border-foreground/10 dark:border-white/10 hover:border-primary/50'
                                      }`}
                                    >
                                      <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: hasVoted ? `${percentage}%` : '0%' }}
                                        className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                                          isSelected ? 'bg-primary/25' : 'bg-primary/10'
                                        }`} 
                                      />
                                      <div className="absolute inset-0 flex items-center justify-between px-4">
                                        <div className="flex items-center gap-3">
                                          <span className={`font-bold text-sm transition-colors ${isSelected ? 'text-primary' : 'text-foreground/90'}`}>
                                            {option.text}
                                          </span>
                                          {isSelected && <Check size={16} className="text-primary animate-in zoom-in duration-300" />}
                                        </div>
                                        {hasVoted && (
                                          <span className={`text-sm font-black transition-colors ${isSelected ? 'text-primary' : 'text-foreground/40'}`}>
                                            {percentage}%
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="text-[10px] text-foreground/40 flex justify-between">
                                <span>{msg.poll.options.reduce((acc: number, curr: any) => acc + curr.votes, 0)} votes</span>
                                <span>
                                  {(() => {
                                    if (!msg.poll.expiresAt) return '';
                                    try {
                                      const d = msg.poll.expiresAt.toDate ? msg.poll.expiresAt.toDate() : new Date(msg.poll.expiresAt);
                                      if (!(d instanceof Date) || isNaN(d.getTime())) return '';
                                      return formatDistanceToNow(d, { addSuffix: true });
                                    } catch (e) {
                                      return '';
                                    }
                                  })()}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Reactions Display */}
                          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {Object.entries(msg.reactions).map(([emoji, data]: [string, any]) => {
                                if (data.count === 0) return null;
                                const hasReacted = data.uids.includes(auth.currentUser?.uid);
                                return (
                                  <motion.button
                                    key={emoji}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => handleAddReaction(msg.id, emoji)}
                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                                      hasReacted 
                                        ? 'bg-primary/20 border-primary/50 text-primary' 
                                        : 'bg-foreground/10 border-foreground/20 text-foreground/60 dark:text-foreground/40 dark:bg-foreground/5 dark:border-foreground/10 hover:border-foreground/30'
                                    }`}
                                  >
                                    <span className="text-xl">{emoji}</span>
                                    <span>{data.count}</span>
                                  </motion.button>
                                );
                              })}
                            </div>
                          )}

                          {/* Message Actions */}
                          <div className="absolute -top-8 right-0 opacity-0 group-hover:opacity-100 transition-all flex items-center bg-background border border-foreground/10 rounded-lg shadow-xl z-10">
                            <div className="relative">
                              <button 
                                onClick={() => setShowReactionMenu(showReactionMenu === msg.id ? null : msg.id)}
                                className="p-2 hover:bg-foreground/5 text-foreground/40 hover:text-foreground transition-all"
                                title="Add Reaction"
                              >
                                <Smile size={16} />
                              </button>
                              
                              <AnimatePresence>
                                {showReactionMenu === msg.id && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background border border-foreground/10 p-1 rounded-full shadow-2xl z-50 whitespace-nowrap"
                                  >
                                      {REACTION_EMOJIS.map((r) => (
                                        <button
                                          key={r.emoji}
                                          onClick={() => handleAddReaction(msg.id, r.emoji)}
                                          className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-foreground/5 transition-all hover:scale-125 text-2xl"
                                          title={r.label}
                                        >
                                          {r.emoji}
                                        </button>
                                      ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>

                            <button 
                              onClick={() => {
                                setReplyTo(msg);
                                setActiveMessageMenu(null);
                                setShowReactionMenu(null);
                                // Ensure input is focused when replying
                                inputRef.current?.focus();
                              }}
                              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-all"
                              title="Reply"
                            >
                              <Reply size={16} />
                            </button>

                            {msg.authorUid !== auth.currentUser?.uid && (
                              <button 
                                onClick={() => {
                                  setGiftTarget({ id: msg.authorUid, name: msg.authorName });
                                  setShowGiftModal(true);
                                  setActiveMessageMenu(null);
                                  setShowReactionMenu(null);
                                }}
                                className="p-2 hover:bg-amber-500/10 text-amber-500 transition-all rounded-lg"
                                title="Gift XP"
                              >
                                <Gift size={16} fill="currentColor" />
                              </button>
                            )}

                            {isAuthor && (
                              <button 
                                onClick={() => {
                                  setEditingMessageId(msg.id);
                                  setEditContent(msg.content);
                                  setActiveMessageMenu(null);
                                  setShowReactionMenu(null);
                                }}
                                className="p-2 hover:bg-black/5 dark:hover:bg-white/5 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-all"
                                title="Edit"
                              >
                                <Edit2 size={16} />
                              </button>
                            )}

                            {(isAdmin || myPermissions.includes('moderate_chat')) && (
                              <button 
                                onClick={() => handlePinMessage(msg.id)}
                                className={`p-2 hover:bg-black/5 dark:hover:bg-white/5 transition-all ${msg.isPinned ? 'text-primary' : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'}`}
                                title={msg.isPinned ? "Unpin Message" : "Pin Message"}
                              >
                                <Pin size={16} className={msg.isPinned ? 'fill-current' : ''} />
                              </button>
                            )}

                              <div className="relative">
                                <button 
                                  onClick={() => setActiveMessageMenu(activeMessageMenu === msg.id ? null : msg.id)}
                                  className="p-2 hover:bg-black/5 dark:hover:bg-white/5 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-all"
                                >
                                  <MoreVertical size={16} />
                                </button>

                                <AnimatePresence>
                                  {activeMessageMenu === msg.id && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                      className="absolute right-0 top-full mt-1 w-40 bg-background border border-black/10 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
                                    >
                                      {canThread && (
                                        <button 
                                          onClick={() => {
                                            setActiveThreadId(msg.id);
                                            setIsThreadViewOpen(true);
                                            setActiveMessageMenu(null);
                                          }}
                                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                        >
                                          <MessageSquare size={14} /> Open Thread
                                        </button>
                                      )}
                                      {(isAdmin || myPermissions.includes('moderate_chat')) && (
                                        <button 
                                          onClick={() => handlePinMessage(msg.id)}
                                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                        >
                                          <Pin size={14} /> {msg.isPinned ? 'Unpin Message' : 'Pin Message'}
                                        </button>
                                      )}
                                      {canDelete && (
                                      <button 
                                        onClick={() => handleDeleteMessage(msg.id)}
                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-red-400/10 transition-colors"
                                      >
                                        <Trash2 size={14} /> Delete Message
                                      </button>
                                    )}
                                    {msg.authorUid !== auth.currentUser?.uid && (
                                      <button 
                                        onClick={() => {
                                          setReportTargetId(msg.id);
                                          setReportContentSnippet(msg.content);
                                          setReportTargetAuthorId(msg.authorUid);
                                          setIsReportModalOpen(true);
                                          setActiveMessageMenu(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-foreground/60 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                                      >
                                        <Flag size={14} /> Report Message
                                      </button>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </>
          )}
        </div>

        {isMember && (
          <div className="px-4 pb-6 pt-2">
            <div className="relative">
              <AnimatePresence>
                {showAnimatedPicker && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.9 }}
                    className="absolute bottom-full right-0 mb-4 z-50 shadow-2xl"
                  >
                    <AnimatedEmojiPicker 
                      onSelect={(emoji) => {
                        handleSendMessage(undefined, `:animated-${emoji}:`);
                        setShowAnimatedPicker(false);
                      }}
                      onClose={() => setShowAnimatedPicker(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showEmojiPicker && (
                  <motion.div 
                    ref={emojiPickerRef}
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.9 }}
                    className="absolute bottom-full right-0 mb-4 z-50 shadow-2xl"
                  >
                    <EmojiPicker 
                      theme={Theme.AUTO}
                      onEmojiClick={(emojiData) => {
                        setNewMessage(prev => prev + emojiData.emoji);
                        // Optional: close picker after selection on mobile
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSendMessage} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl focus-within:border-primary/50 transition-all relative">
                {/* Channel Mention Suggestions */}
                <AnimatePresence>
                  {showChannelSuggestions && filteredChannels.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full left-0 mb-2 w-64 bg-background border border-foreground/10 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
                    >
                      <div className="p-2 border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5">
                        <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest px-2">Mention Channel</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {filteredChannels.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => insertChannelMention(c.name)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 text-left transition-all group"
                          >
                            <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                              <Hash size={14} className="text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-black dark:text-white group-hover:text-primary transition-colors truncate">
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

                {/* Mention Suggestions */}
                <AnimatePresence>
                  {showMentionSuggestions && filteredMentions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full left-0 mb-2 w-64 bg-background border border-foreground/10 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
                    >
                      <div className="p-2 border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5">
                        <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest px-2">Mention User</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1 text-black dark:text-white">
                        {filteredMentions.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => insertMention(member.user?.username || 'user')}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 text-left transition-all group"
                          >
                            <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                              {member.user?.profileImage && member.user.profileImage.trim() !== '' ? (
                                <img 
                                  src={member.user.profileImage} 
                                  className="w-full h-full object-cover" 
                                  alt="" 
                                />
                              ) : (
                                <Megaphone size={14} className="text-primary" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-black dark:text-white group-hover:text-primary transition-colors truncate flex items-center gap-1">
                                <span>{member.user?.displayName || member.user?.username || 'Anonymous'}</span>
                                <VerifiedBadge verified={member.user?.verified} />
                              </p>
                              <p className="text-[10px] text-primary/60 truncate font-bold">@{member.user?.username}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Reply info */}
                <AnimatePresence>
                  {replyTo && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-4 py-2 bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5 flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-black/40 dark:text-white/40">Replying to <span className="font-bold text-black/60 dark:text-white/60">{replyTo.authorName}</span></p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setReplyTo(null)}
                        className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-all"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Upload Previews */}
                {attachments.length > 0 && (
                  <div className="px-4 py-3 flex flex-wrap gap-3 bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5">
                    {attachments.map((att, idx) => (
                      <div key={idx} className="relative group">
                        <div className="w-16 h-16 rounded-xl bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 overflow-hidden">
                          {att.type.startsWith('image/') && att.url && att.url.trim() !== '' ? (
                            <img src={att.url} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-black/40 dark:text-white/40">
                              <FileText size={20} />
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={() => removeAttachment(idx)}
                          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    {uploading && (
                      <div className="w-16 h-16 rounded-xl bg-foreground/10 border border-foreground/10 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-end gap-2 px-4 py-3">
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    multiple
                    className="hidden"
                  />
                  <div className="relative" ref={actionsMenuRef}>
                    <AnimatePresence>
                      {showActionsMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute bottom-full left-0 mb-4 w-56 bg-background border border-foreground/20 rounded-2xl shadow-[0_10px_50px_rgba(0,0,0,0.5)] p-2 z-[9999] overflow-hidden backdrop-blur-xl"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              fileInputRef.current?.click();
                              setShowActionsMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-foreground/5 text-left transition-all group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                              <ImageIcon size={18} />
                            </div>
                            <span className="text-xs font-bold text-foreground">Upload File</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowPollModal(true);
                              setShowActionsMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-foreground/5 text-left transition-all group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                              <BarChart2 size={18} />
                            </div>
                            <span className="text-xs font-bold text-foreground">Create Poll</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button 
                      type="button" 
                      onClick={() => setShowActionsMenu(!showActionsMenu)}
                      disabled={uploading || isReadOnly || !canUpload}
                      className={`p-2 transition-all rounded-xl ${showActionsMenu ? 'bg-primary text-white shadow-neon' : 'text-foreground/40 hover:text-primary hover:bg-foreground/5'} disabled:opacity-50`}
                    >
                      <Plus size={20} className={`transition-transform duration-300 ${showActionsMenu ? 'rotate-45' : ''}`} />
                    </button>
                  </div>
                     <textarea 
                      value={newMessage}
                      ref={inputRef}
                      onChange={(e) => {
                        const value = e.target.value;
                        const cursor = e.target.selectionStart || 0;
                        setNewMessage(value);
                        
                        // Auto height
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;

                        // Mention detection
                        const lastAt = value.lastIndexOf('@', cursor - 1);
                        const lastHash = value.lastIndexOf('#', cursor - 1);

                        if (lastAt !== -1 && (lastHash === -1 || lastAt > lastHash)) {
                          const textAfterAt = value.slice(lastAt + 1, cursor);
                          const charBeforeAt = lastAt === 0 ? '' : value[lastAt - 1];
                          const isValidTrigger = !charBeforeAt || /\s/.test(charBeforeAt);
                          
                          if (isValidTrigger && !/\s/.test(textAfterAt)) {
                            setMentionFilter(textAfterAt);
                            setMentionCursorPos(lastAt);
                            setShowMentionSuggestions(true);
                            setShowChannelSuggestions(false);
                            return;
                          }
                        }
                        
                        if (lastHash !== -1 && (lastAt === -1 || lastHash > lastAt)) {
                          const textAfterHash = value.slice(lastHash + 1, cursor);
                          const charBeforeHash = lastHash === 0 ? '' : value[lastHash - 1];
                          const isValidTrigger = !charBeforeHash || /\s/.test(charBeforeHash);

                          if (isValidTrigger && !/\s/.test(textAfterHash)) {
                            setMentionFilter(textAfterHash);
                            setMentionCursorPos(lastHash);
                            setShowChannelSuggestions(true);
                            setShowMentionSuggestions(false);
                            return;
                          }
                        }

                        setShowMentionSuggestions(false);
                        setShowChannelSuggestions(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          if (showMentionSuggestions && filteredMentions.length > 0) {
                            e.preventDefault();
                            insertMention(filteredMentions[0].user?.username || 'user');
                          } else if (showChannelSuggestions && filteredChannels.length > 0) {
                            e.preventDefault();
                            insertChannelMention(filteredChannels[0].name);
                          } else {
                            e.preventDefault();
                            handleSendMessage();
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = '38px';
                          }
                        } else if (e.key === 'Escape' && (showMentionSuggestions || showChannelSuggestions)) {
                          setShowMentionSuggestions(false);
                          setShowChannelSuggestions(false);
                        }
                      }}
                      placeholder={isReadOnly ? (canPost ? "This channel is locked." : "You don't have permission to post.") : `Message #${channel.name}`}
                      disabled={isReadOnly}
                      rows={1}
                      className="flex-1 bg-transparent py-2 text-sm text-black dark:text-white outline-none placeholder:text-black/30 dark:placeholder:text-white/20 disabled:opacity-50 resize-none max-h-40"
                      style={{ height: 'auto', minHeight: '38px' }}
                    />

                  <div className="flex items-center gap-2 pb-1">
                    <button 
                      type="button" 
                      onClick={() => setShowAnimatedPicker(!showAnimatedPicker)}
                      className={`hover:scale-110 transition-transform ${showAnimatedPicker ? 'grayscale-0' : 'grayscale opacity-50 hover:opacity-100 hover:grayscale-0'}`}
                      title="Animated Emojis"
                    >
                      <div className="w-6 h-6">
                        <SafeAnimatedEmoji emoji="sparkles" size="24px" />
                      </div>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`p-2 transition-colors ${showEmojiPicker ? 'text-primary' : 'text-foreground/40 hover:text-primary'}`}
                    >
                      <Smile size={20} />
                    </button>
                    <button 
                      type="submit" 
                      disabled={(!newMessage.trim() && attachments.length === 0) || isReadOnly} 
                      className="p-2 bg-primary text-white rounded-xl shadow-lg hover:scale-105 active:scale-95 disabled:opacity-20 disabled:scale-100 transition-all"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        <ConfirmModal 
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={confirmDeleteMessage}
          title="Delete Message"
          message="Are you sure you want to delete this message? This action cannot be undone."
          confirmText="Delete"
          loading={deleting}
        />

        {/* --- THREAD SIDEBAR --- */}
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
            onClose={() => {
              setShowGiftModal(false);
              setGiftTarget(null);
            }}
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
          onSubmit={(pollData) => {
            handleSendMessage(undefined, '', pollData);
            setShowPollModal(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl p-20 text-center text-white/20">
      <p>Channel type "{channel.type}" coming soon!</p>
    </div>
  );
}

function AttachmentDisplay({ attachment }: { attachment: any }) {
  const isImage = attachment.type.startsWith('image/');
  const isVideo = attachment.type.startsWith('video/');
  const isAudio = attachment.type.startsWith('audio/');

  if (isImage && attachment.url && attachment.url.trim() !== '') {
    return (
      <div className="mt-2 rounded-xl overflow-hidden border border-foreground/10 bg-black max-w-lg">
        <img src={attachment.url} alt={attachment.name} className="w-full h-auto max-h-[400px] object-contain" />
      </div>
    );
  }

  if (isVideo && attachment.url && attachment.url.trim() !== '') {
    return (
      <div className="mt-2 rounded-xl overflow-hidden border border-foreground/10 bg-black max-w-lg">
        <video src={attachment.url} controls className="w-full h-auto max-h-[400px]" />
      </div>
    );
  }

  return (
    <a 
      href={attachment.url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-3 p-3 rounded-xl bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 transition-all group max-w-sm"
    >
                  <div className="w-10 h-10 rounded-lg bg-black/10 dark:bg-foreground/10 flex items-center justify-center text-black/50 dark:text-foreground/40 group-hover:text-primary transition-colors">
        {isAudio ? <Music size={20} /> : <FileText size={20} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{attachment.name}</p>
        <p className="text-[10px] text-black/50 dark:text-foreground/40">{(attachment.size / 1024 / 1024).toFixed(2)} MB</p>
      </div>
      <Download size={16} className="text-foreground/20 group-hover:text-foreground" />
    </a>
  );
}

function MessageLinkPreview({ content }: { content: string }) {
  const [preview, setPreview] = useState<any>(null);

  useEffect(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex);
    if (urls && urls.length > 0) {
      const fetchMetadata = async () => {
        try {
          const res = await fetch(`/api/unfurl?url=${encodeURIComponent(urls[0])}`);
          if (res.ok) {
            const data = await res.json();
            setPreview(data);
          }
        } catch (e) {
          console.error('Link preview error:', e);
        }
      };
      fetchMetadata();
    }
  }, [content]);

  if (!preview) return null;

  return (
    <a 
      href={preview.url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="mt-2 block bg-foreground/5 rounded-xl border border-foreground/10 hover:border-foreground/20 overflow-hidden transition-all group max-w-md"
    >
      {preview.image && preview.image.trim() !== '' && (
        <div className="w-full aspect-video overflow-hidden border-b border-foreground/10">
          <img 
            src={preview.image} 
            alt={preview.title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <ExternalLink size={10} className="text-foreground/20" />
          <span className="text-[8px] text-black/50 dark:text-foreground/40 uppercase tracking-widest font-bold font-mono">{preview.siteName || 'Link Preview'}</span>
        </div>
        <h4 className="text-xs font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">{preview.title}</h4>
        {preview.description && <p className="text-[10px] text-black/50 dark:text-foreground/40 mt-1 line-clamp-2 leading-relaxed">{preview.description}</p>}
      </div>
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
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const communityPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPosts(communityPosts);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `posts (community: ${communityId}, channel: ${channelId})`);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [communityId, channelId]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
      {posts.length === 0 && (
        <div className="text-center py-20 glass rounded-3xl">
          <p className="text-black/40 dark:text-foreground/40">No posts yet.</p>
        </div>
      )}
    </div>
  );
}
