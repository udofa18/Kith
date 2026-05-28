import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, setDoc, limit, increment, writeBatch, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Search, MoreVertical, Phone, Video, Info, Check, CheckCheck, Smile, Zap, Reply, Gift, Paperclip, ArrowUpRight, ArrowDownLeft, PhoneOff, MessageSquare, Mail, Star, UserPlus, X, CheckCircle2, Trash2, Edit2, ExternalLink } from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, format, isSameDay } from 'date-fns';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { createNotification } from '../lib/notifications';
import { playNotificationSound } from '../lib/sounds';
import { useCall } from '../contexts/CallContext';
import AnimatedEmojiPicker from './AnimatedEmojiPicker';
import AnimatedEmojiRenderer, { isSoloEmoji } from './AnimatedEmojiRenderer';
import SafeAnimatedEmoji from './SafeAnimatedEmoji';
import VerifiedBadge from './VerifiedBadge';
import ChatDetailsSidebar from './ChatDetailsSidebar';
import {
  type MessageCategory,
  type ConversationData,
  filterConversations,
  getCategoryCounts,
  isConversationAccepted,
  isIncomingRequest,
  isOutgoingRequest,
  isFavourited,
} from '../lib/messaging';

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: any;
  read: boolean;
  type?: 'text' | 'gift' | 'attachment' | 'call_history';
  giftAmount?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  metadata?: {
    media: 'voice' | 'video';
    status: 'missed' | 'ended';
    duration?: number;
  };
  replyTo?: {
    id: string;
    senderId: string;
    content: string;
  };
  reactions?: Record<string, { count: number; uids: string[] }>;
  isEdited?: boolean;
}

interface Conversation extends ConversationData { }

const MESSAGE_CATEGORIES: {
  id: MessageCategory;
  label: string;
  icon: typeof MessageSquare;
  gradient: string;
}[] = [
    { id: 'all', label: 'All', icon: MessageSquare, gradient: 'from-cyan-400 to-blue-500' },
    { id: 'unread', label: 'Unread', icon: Mail, gradient: 'from-violet-400 to-purple-500' },
    { id: 'favourites', label: 'Favourites', icon: Star, gradient: 'from-amber-400 to-orange-500' },
    { id: 'requests', label: 'Requests', icon: UserPlus, gradient: 'from-pink-400 to-rose-500' },
  ];

const REACTION_EMOJIS = [
  { emoji: '👍', label: 'Like' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '🎉', label: 'Celebrate' },
];

export default function MessagesView() {
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAnimatedPicker, setShowAnimatedPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGiftOptions, setShowGiftOptions] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [activeCategory, setActiveCategory] = useState<MessageCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [convExistsInFirestore, setConvExistsInFirestore] = useState(false);
  const [showChatDetails, setShowChatDetails] = useState(false);
  const [showReactionMenu, setShowReactionMenu] = useState<string | null>(null);
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const { initiateCall } = useCall();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
      if (snap.exists()) {
        setCurrentUserProfile(snap.data());
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
    });
    return () => unsub();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`message-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-primary/10');
      setTimeout(() => el.classList.remove('bg-primary/10'), 2000);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (selectedConv) {
      setShowChatDetails(window.matchMedia('(min-width: 1024px)').matches);
    } else {
      setShowChatDetails(false);
    }
  }, [selectedConv?.id]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', auth.currentUser.uid),
      orderBy('lastMessageAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const convs = await Promise.all(snapshot.docs.map(async (d) => {
        const data = d.data() as Conversation;
        const otherUserId = data.participants.find(p => p !== auth.currentUser?.uid);
        let otherUser = null;
        if (otherUserId) {
          const userDoc = await getDoc(doc(db, 'users', otherUserId));
          otherUser = userDoc.exists() ? userDoc.data() : null;
        }
        return { id: d.id, ...data, otherUser };
      }));
      setConversations(convs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'conversations (my conversations)');
    });

    return () => unsubscribe();
  }, []);

  const categoryCounts = useMemo(() => {
    if (!auth.currentUser) return { all: 0, unread: 0, favourites: 0, requests: 0 };
    return getCategoryCounts(conversations, auth.currentUser.uid);
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    if (!auth.currentUser) return [];
    return filterConversations(conversations, activeCategory, auth.currentUser.uid, searchQuery);
  }, [conversations, activeCategory, searchQuery]);

  useEffect(() => {
    if (!auth.currentUser || loading) return;

    const initialUserId = searchParams.get('userId');
    if (initialUserId && initialUserId !== auth.currentUser.uid) {
      const myId = auth.currentUser.uid;
      const conversationId = [myId, initialUserId].sort().join('_');

      const existingConv = conversations.find(c => c.id === conversationId);
      if (existingConv) {
        setSelectedConv(existingConv);
      } else {
        // Try to fetch the user to verify they exist and create a temporary "pending" conversation object
        getDoc(doc(db, 'users', initialUserId)).then(userDoc => {
          if (userDoc.exists()) {
            setSelectedConv({
              id: conversationId,
              participants: [myId, initialUserId],
              lastMessage: '',
              lastMessageAt: null,
              otherUser: userDoc.data()
            });
          }
        });
      }
    }
  }, [searchParams, loading, conversations.length]);

  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (!selectedConv || !auth.currentUser) return;
    if (isIncomingRequest(selectedConv, auth.currentUser.uid)) {
      setActiveCategory('requests');
    }
  }, [selectedConv?.id, selectedConv?.status, selectedConv?.requestedBy]);

  useEffect(() => {
    if (!selectedConv || !auth.currentUser) return;

    const convRef = doc(db, 'conversations', selectedConv.id);
    getDoc(convRef).then(snap => {
      setConvExistsInFirestore(snap.exists());
      if (snap.exists()) {
        updateDoc(convRef, {
          [`unreadCount.${auth.currentUser!.uid}`]: 0
        }).catch(err => console.error("Error clearing unread count:", err));
      }
    });

    const q = query(
      collection(db, 'conversations', selectedConv.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );

    isInitialLoad.current = true;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !isInitialLoad.current) {
          const msg = change.doc.data();
          if (msg.senderId !== auth.currentUser?.uid) {
            playNotificationSound();
          }
        }
      });
      isInitialLoad.current = false;
      setMessages(prev => {
        const newMsgs = snapshot.docs.map(d => {
          const data = d.data();
          const createdAt = data.createdAt;
          const date = createdAt && typeof createdAt.toDate === 'function' ? createdAt.toDate() :
            (createdAt && typeof createdAt.seconds === 'number' ? new Date(createdAt.seconds * 1000) :
              (typeof createdAt === 'string' || typeof createdAt === 'number' ? new Date(createdAt) : new Date()));
          return { id: d.id, ...data, createdAt: date } as Message;
        });

        // Ensure uniqueness and sort
        const combined = [...newMsgs];
        const unique = Array.from(new Map(combined.map(m => [m.id, m])).values())
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        return unique;
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `conversations/${selectedConv.id}/messages`);
    });

    // Auto-focus input when conversation changes
    inputRef.current?.focus();

    return () => unsubscribe();
  }, [selectedConv]);

  const handleGiftXP = async (amount: number) => {
    if (!selectedConv || !auth.currentUser || !isConversationAccepted(selectedConv)) return;

    try {
      const otherUserId = selectedConv.participants.find(p => p !== auth.currentUser?.uid);
      const giftMessage = {
        senderId: auth.currentUser.uid,
        receiverId: otherUserId,
        content: `sent you ${amount} XP!`,
        type: 'gift',
        giftAmount: amount,
        createdAt: serverTimestamp(),
        read: false,
        conversationId: selectedConv.id
      };

      const batch = writeBatch(db);

      // Update receiver's XP
      const receiverRef = doc(db, 'users', otherUserId!);
      batch.update(receiverRef, {
        xp: increment(amount)
      });

      // Add message to conversation
      const messageRef = doc(collection(db, 'conversations', selectedConv.id, 'messages'));
      batch.set(messageRef, giftMessage);

      // Update conversation preview
      const convRef = doc(db, 'conversations', selectedConv.id);
      batch.update(convRef, {
        lastMessage: `🎁 Sent ${amount} XP`,
        lastMessageAt: serverTimestamp(),
        [`unreadCount.${otherUserId}`]: increment(1)
      });

      await batch.commit();
      setShowGiftOptions(false);
      scrollToBottom();
    } catch (error) {
      console.error("Error gifting XP:", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv || !auth.currentUser || !isConversationAccepted(selectedConv)) return;

    setIsUploading(true);
    try {
      // Simulate upload to get a URL
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result as string;

        const otherUserId = selectedConv.participants.find(p => p !== auth.currentUser?.uid);
        const fileMessage = {
          senderId: auth.currentUser!.uid,
          receiverId: otherUserId,
          content: `sent an attachment: ${file.name}`,
          type: 'attachment',
          attachmentUrl: base64data, // In a real app, this would be a Storage URL
          attachmentName: file.name,
          attachmentType: file.type,
          createdAt: serverTimestamp(),
          read: false,
          conversationId: selectedConv.id
        };

        const batch = writeBatch(db);
        const messageRef = doc(collection(db, 'conversations', selectedConv.id, 'messages'));
        batch.set(messageRef, fileMessage);

        const convRef = doc(db, 'conversations', selectedConv.id);
        batch.update(convRef, {
          lastMessage: `📎 ${file.name}`,
          lastMessageAt: serverTimestamp(),
          [`unreadCount.${otherUserId}`]: increment(1)
        });

        await batch.commit();
        setIsUploading(false);
        scrollToBottom();
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading file:", error);
      setIsUploading(false);
    }
  };

  const sendMessage = async (content: string, replyMsg: Message | null = null) => {
    if (!content.trim() || !selectedConv || !auth.currentUser) return;

    const text = content.trim();
    const otherUserId = selectedConv.participants.find(p => p !== auth.currentUser?.uid);
    if (!otherUserId) return;

    try {
      const convRef = doc(db, 'conversations', selectedConv.id);
      const convDoc = await getDoc(convRef);
      const existingData = convDoc.exists() ? convDoc.data() : null;
      const status = existingData?.status || (convDoc.exists() ? 'accepted' : null);

      if (status === 'pending' && existingData?.requestedBy === auth.currentUser.uid && messages.length >= 1) {
        return;
      }
      if (status === 'pending' && existingData?.requestedBy !== auth.currentUser.uid) {
        return;
      }

      const messageData = {
        senderId: auth.currentUser.uid,
        receiverId: otherUserId,
        content: text,
        createdAt: serverTimestamp(),
        read: false,
        conversationId: selectedConv.id,
        ...(replyMsg ? {
          replyTo: {
            id: replyMsg.id,
            senderId: replyMsg.senderId,
            content: replyMsg.content
          }
        } : {}),
      };

      const isNewRequest = !convDoc.exists() || status === 'declined';

      if (isNewRequest) {
        await setDoc(convRef, {
          participants: selectedConv.participants,
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          status: 'pending',
          requestedBy: auth.currentUser.uid,
          favouritedBy: existingData?.favouritedBy || [],
          unreadCount: { [otherUserId]: 1, [auth.currentUser.uid]: 0 }
        }, { merge: true });
      } else {
        await updateDoc(convRef, {
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          [`unreadCount.${otherUserId}`]: increment(1)
        });
      }

      const messageRef = doc(collection(db, 'conversations', selectedConv.id, 'messages'));
      await setDoc(messageRef, messageData);

      setConvExistsInFirestore(true);

      createNotification({
        recipientId: otherUserId,
        senderId: auth.currentUser.uid,
        senderName: currentUserProfile?.displayName || auth.currentUser.displayName || 'Someone',
        senderPhoto: currentUserProfile?.profileImage || auth.currentUser.photoURL || '',
        type: isNewRequest ? 'message_request' : 'message',
        content: isNewRequest ? 'sent you a message request' : 'sent you a message',
        relatedId: selectedConv.id
      }).catch(console.error);

      scrollToBottom();
    } catch (error) {
      console.error("Error sending message:", error);
      handleFirestoreError(error, OperationType.CREATE, `conversations/${selectedConv.id}/messages`);
    }
  };

  const handleAcceptRequest = async () => {
    if (!selectedConv || !auth.currentUser) return;

    try {
      const convRef = doc(db, 'conversations', selectedConv.id);
      await updateDoc(convRef, { status: 'accepted' });

      const requesterId = selectedConv.requestedBy || selectedConv.participants.find(p => p !== auth.currentUser.uid);
      if (requesterId) {
        createNotification({
          recipientId: requesterId,
          senderId: auth.currentUser.uid,
          senderName: currentUserProfile?.displayName || auth.currentUser.displayName || 'Someone',
          senderPhoto: currentUserProfile?.profileImage || auth.currentUser.photoURL || '',
          type: 'message',
          content: 'accepted your message request',
          relatedId: selectedConv.id
        }).catch(console.error);
      }

      setSelectedConv(prev => prev ? { ...prev, status: 'accepted' } : null);
    } catch (error) {
      console.error('Error accepting request:', error);
    }
  };

  const handleDeclineRequest = async () => {
    if (!selectedConv || !auth.currentUser) return;

    try {
      const convRef = doc(db, 'conversations', selectedConv.id);
      await updateDoc(convRef, { status: 'declined' });
      setSelectedConv(null);
    } catch (error) {
      console.error('Error declining request:', error);
    }
  };

  const handleToggleFavourite = async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.currentUser) return;

    const convRef = doc(db, 'conversations', conv.id);
    const favourited = isFavourited(conv, auth.currentUser.uid);

    try {
      await updateDoc(convRef, {
        favouritedBy: favourited
          ? arrayRemove(auth.currentUser.uid)
          : arrayUnion(auth.currentUser.uid)
      });
    } catch (error) {
      console.error('Error toggling favourite:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const text = newMessage;
    const currentReplyTo = replyTo;

    // Clear input immediately
    setNewMessage('');
    setReplyTo(null);

    await sendMessage(text, currentReplyTo);
  };

  const handleStartCall = async (media: 'voice' | 'video') => {
    if (!selectedConv || !auth.currentUser || !isConversationAccepted(selectedConv)) return;

    const otherUserId = selectedConv.participants.find(p => p !== auth.currentUser?.uid);
    if (!otherUserId) return;

    try {
      await initiateCall(
        selectedConv.id,
        [otherUserId],
        'one-to-one',
        media,
        {
          name: currentUserProfile?.displayName || auth.currentUser.displayName || 'Unknown',
          photo: currentUserProfile?.profileImage || auth.currentUser.photoURL || ''
        },
        {
          [otherUserId]: {
            displayName: selectedConv.otherUser?.username || 'User',
            photoURL: selectedConv.otherUser?.profileImage || ''
          }
        }
      );
    } catch (err) {
      console.error('Failed to start call:', err);
    }
  };

  const handleAddReaction = async (messageId: string, emoji: string) => {
    if (!auth.currentUser || !selectedConv) return;
    try {
      const messageRef = doc(db, 'conversations', selectedConv.id, 'messages', messageId);
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

      await updateDoc(messageRef, {
        [`reactions.${emoji}`]: emojiData
      });
      setShowReactionMenu(null);
    } catch (error) {
      console.error("Reaction error:", error);
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!auth.currentUser || !selectedConv || !editContent.trim()) return;
    try {
      const messageRef = doc(db, 'conversations', selectedConv.id, 'messages', messageId);
      await updateDoc(messageRef, {
        content: editContent.trim(),
        isEdited: true
      });
      setEditingMessageId(null);
    } catch (error) {
      console.error("Error editing message:", error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!auth.currentUser || !selectedConv) return;
    try {
      const messageRef = doc(db, 'conversations', selectedConv.id, 'messages', messageId);
      await deleteDoc(messageRef);
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const getDateLabel = (date: any) => {
    const d = date?.toDate ? date.toDate() : new Date(date);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "MMMM d, yyyy");
  };

  const isNewDay = (msg: Message, prevMsg: Message | null) => {
    if (!prevMsg) return true;
    const d1 = msg.createdAt?.toDate
      ? msg.createdAt.toDate()
      : new Date(msg.createdAt);
    const d2 = prevMsg.createdAt?.toDate
      ? prevMsg.createdAt.toDate()
      : new Date(prevMsg.createdAt);
    return !isSameDay(d1, d2);
  };

  const isNewRequestChat = selectedConv && !convExistsInFirestore;
  const isIncomingRequestChat = selectedConv && auth.currentUser && isIncomingRequest(selectedConv, auth.currentUser.uid);
  const isWaitingForAcceptance = selectedConv && auth.currentUser && (
    isOutgoingRequest(selectedConv, auth.currentUser.uid) && messages.length >= 1
  );
  const canSendMessages = selectedConv && auth.currentUser && (
    isConversationAccepted(selectedConv) ||
    isNewRequestChat ||
    (isOutgoingRequest(selectedConv, auth.currentUser.uid) && messages.length === 0)
  );

  const otherUserId = selectedConv?.participants.find(p => p !== auth.currentUser?.uid);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 h-full bg-white dark:bg-[#0B0F1A] rounded-none md:rounded-3xl overflow-hidden border-x md:border border-black/5 dark:border-white/5 relative text-black dark:text-white">
      {/* Conversations List */}
      <div className="md:col-span-4 lg:col-span-3 border-r border-black/5 dark:border-white/5 flex flex-col h-full overflow-hidden text-black dark:text-white">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 border-b border-black/5 dark:border-white/5 shrink-0 bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-transparent dark:from-cyan-500/15 dark:via-blue-500/10 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 mb-4"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <MessageSquare size={20} className="text-white" />
            </div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">Messages</h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2 overflow-x-auto pb-3 custom-scrollbar -mx-1 px-1"
          >
            {MESSAGE_CATEGORIES.map(({ id, label, icon: Icon, gradient }) => {
              const count = categoryCounts[id];
              const isActive = activeCategory === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveCategory(id)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${isActive
                      ? `bg-gradient-to-r ${gradient} text-white shadow-lg`
                      : 'bg-black/5 dark:bg-white/5 text-black/50 dark:text-white/50 hover:bg-black/10 dark:hover:bg-white/10'
                    }`}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                  {count > 0 && (
                    <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${isActive ? 'bg-white/25 text-white' : 'bg-primary text-white'
                      }`}>
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>

          <div className="relative text-black dark:text-white mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages"
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:border-cyan-500 outline-none transition-all text-black dark:text-white"
            />
          </div>
        </motion.div>
        <div className="flex-1 overflow-y-auto custom-scrollbar text-black dark:text-white">
          {filteredConversations.map(conv => {
            const isRequest = auth.currentUser && isIncomingRequest(conv, auth.currentUser.uid);
            const isPending = auth.currentUser && isOutgoingRequest(conv, auth.currentUser.uid);
            const favourited = auth.currentUser && isFavourited(conv, auth.currentUser.uid);
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv)}
                className={`w-full p-4 flex gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-all text-left ${selectedConv?.id === conv.id
                    ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/5 border-l-4 border-cyan-500'
                    : ''
                  } text-black dark:text-white`}
              >
                <motion.div
                  className="relative w-12 h-12 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden flex-shrink-0"
                  whileHover={{ scale: 1.05 }}
                >
                  <img
                    src={(conv.otherUser?.profileImage && conv.otherUser.profileImage.trim() !== '') ? conv.otherUser.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${conv.id}`}
                    alt="Avatar"
                    referrerPolicy="no-referrer"
                  />
                  {isRequest && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-gradient-to-br from-pink-400 to-rose-500 rounded-full flex items-center justify-center">
                      <UserPlus size={10} className="text-white" />
                    </span>
                  )}
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="font-bold text-[15px] truncate text-black dark:text-white flex items-center gap-1">
                      <span>{conv.otherUser?.username || 'Unknown User'}</span>
                      <VerifiedBadge verified={conv.otherUser?.verified} />
                      {isPending && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">Pending</span>
                      )}
                    </h3>
                    <span className="text-[10px] text-black/30 dark:text-white/30">
                      {(() => {
                        if (!conv.lastMessageAt) return '';
                        try {
                          const d = conv.lastMessageAt.toDate ? conv.lastMessageAt.toDate() : new Date(conv.lastMessageAt);
                          if (!(d instanceof Date) || isNaN(d.getTime())) return '';
                          return formatDistanceToNow(d, { addSuffix: false });
                        } catch (e) {
                          return '';
                        }
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <p className="text-xs text-black/50 dark:text-white/50 truncate flex-1">
                      {isRequest ? `Request: ${conv.lastMessage}` : conv.lastMessage}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleToggleFavourite(conv, e)}
                        className={`p-1 rounded-lg transition-colors ${favourited ? 'text-amber-400' : 'text-black/20 dark:text-white/20 hover:text-amber-400'}`}
                      >
                        <Star size={14} className={favourited ? 'fill-amber-400' : ''} />
                      </button>
                      {auth.currentUser && conv.unreadCount?.[auth.currentUser.uid] ? (
                        <span className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {conv.unreadCount[auth.currentUser.uid]}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {filteredConversations.length === 0 && (
            <motion.div
              className="p-8 text-center"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                <MessageSquare className="text-cyan-500" size={28} />
              </div>
              <p className="text-sm text-black/30 dark:text-white/30">
                {activeCategory === 'requests' ? 'No message requests.' :
                  activeCategory === 'favourites' ? 'No favourite conversations yet.' :
                    activeCategory === 'unread' ? 'All caught up — no unread messages.' :
                      searchQuery ? 'No conversations match your search.' :
                        'No conversations yet.'}
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div className={`md:col-span-8 flex flex-col bg-gray-50 dark:bg-black/20 h-full overflow-hidden text-black dark:text-white relative ${showChatDetails && selectedConv ? 'lg:col-span-6' : 'lg:col-span-9'
        }`}>
        {selectedConv ? (
          <>
            {/* Chat Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 border-b border-black/5  dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-black/50 backdrop-blur-md text-black dark:text-white">
              <div className="flex items-center gap-3">
                <motion.div
                  className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden ring-2 ring-cyan-500/20"
                  whileHover={{ scale: 1.05 }}
                >
                  <img
                    src={(selectedConv.otherUser?.profileImage && selectedConv.otherUser.profileImage.trim() !== '') ? selectedConv.otherUser.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedConv.id}`}
                    alt="Avatar"
                    referrerPolicy="no-referrer"
                  />
                </motion.div>
                <div>
                  <h3 className="font-bold text-sm text-black dark:text-white flex items-center gap-1">
                    <span>{selectedConv.otherUser?.username || 'Unknown User'}</span>
                    <VerifiedBadge verified={selectedConv.otherUser?.verified} />
                  </h3>
                  <p className={`text-[10px] font-medium ${isIncomingRequestChat ? 'text-pink-500' :
                      isWaitingForAcceptance || isNewRequestChat ? 'text-amber-500' :
                        'text-green-500'
                    }`}>
                    {isIncomingRequestChat ? 'Message request' :
                      isWaitingForAcceptance ? 'Awaiting acceptance' :
                        isNewRequestChat ? 'Send a message request' :
                          'Online'}
                  </p>
                </div>
              </div>
              <motion.div
                className="flex items-center gap-4 text-black/50 dark:text-white/50"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
              >
                {isConversationAccepted(selectedConv) && (
                  <>
                    <button
                      onClick={() => handleStartCall('voice')}
                      className="hover:text-primary transition-colors"
                    >
                      <Phone size={18} />
                    </button>
                    <button
                      onClick={() => handleStartCall('video')}
                      className="hover:text-primary transition-colors"
                    >
                      <Video size={18} />
                    </button>
                  </>
                )}
                {auth.currentUser && (
                  <button
                    onClick={(e) => handleToggleFavourite(selectedConv, e)}
                    className={`transition-colors ${isFavourited(selectedConv, auth.currentUser.uid) ? 'text-amber-400' : 'hover:text-amber-400'}`}
                  >
                    <Star size={18} className={isFavourited(selectedConv, auth.currentUser.uid) ? 'fill-amber-400' : ''} />
                  </button>
                )}
                <button
                  onClick={() => setShowChatDetails(prev => !prev)}
                  className={`transition-colors ${showChatDetails ? 'text-cyan-500' : 'hover:text-primary'}`}
                  title="Chat details"
                >
                  <Info size={18} />
                </button>
              </motion.div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 pt-24 space-y-4 custom-scrollbar overflow-x-hidden">
              {messages.map((msg, i) => {
                const isMe = msg.senderId === auth.currentUser?.uid;
                const prevMsg = i > 0 ? messages[i - 1] : null;
                const showDateHeader = isNewDay(msg, prevMsg);

                return (
                  <div key={msg.id}>
                    {showDateHeader && (
                      <div key={`date-${msg.createdAt?.seconds || i}`} className="flex items-center gap-4 py-6">
                        <div className="flex-1 h-[1px] bg-black/5 dark:bg-white/5" />
                        <span className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-widest">
                          {getDateLabel(msg.createdAt)}
                        </span>
                        <div className="flex-1 h-[1px] bg-black/5 dark:bg-white/5" />
                      </div>
                    )}
                    <div id={`message-${msg.id}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} transition-all mb-4`}>
                      <div className={`max-w-[70%] group relative`}>
                        {msg.replyTo && (
                          <div
                            onClick={() => scrollToMessage(msg.replyTo!.id)}
                            className="flex items-center gap-2 mb-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer text-xs bg-black/5 dark:bg-white/5 p-2 rounded-lg border-l-2 border-primary text-black dark:text-white"
                          >
                            <p className="truncate italic">
                              <span className="font-bold">{msg.replyTo.senderId === auth.currentUser?.uid ? 'You' : 'Them'}:</span> {msg.replyTo.content}
                            </p>
                          </div>
                        )}
                        <div className={`p-4 rounded-4xl text-[15px] ${isMe
                            ? 'bg-primary/60  text-white rounded-tr-none shadow-lg shadow-primary/20'
                            : 'bg-black/10 dark:bg-white/10 text-black dark:text-white rounded-tl-none border border-black/5 dark:border-white/5'
                          } ${isSoloEmoji(msg.content) && editingMessageId !== msg.id ? 'bg-transparent !p-0 shadow-none border-none' : ''}`}>
                          {editingMessageId === msg.id ? (
                            <div className="flex flex-col gap-2 min-w-[200px]">
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
                                className="w-full bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-xl p-2 text-sm outline-none focus:border-white/50 text-white resize-none"
                                rows={2}
                                autoFocus
                              />
                              <div className="flex justify-between items-center text-[10px] text-white/80">
                                <span>esc <button type="button" onClick={() => setEditingMessageId(null)} className="underline hover:text-white">cancel</button></span>
                                <span>•</span>
                                <span>enter <button type="button" onClick={() => handleEditMessage(msg.id)} className="underline hover:text-white">save</button></span>
                              </div>
                            </div>
                          ) : msg.type === 'gift' ? (
                            <div className="flex items-center gap-3 py-2 px-4 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl border border-yellow-500/30">
                              <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20">
                                <Gift className="text-white" size={20} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-yellow-500">XP Gift Received!</p>
                                <p className="text-xs text-black/50 dark:text-white/70">+{msg.giftAmount} XP awarded to you</p>
                              </div>
                            </div>
                          ) : msg.type === 'attachment' ? (
                            <div className="space-y-2">
                              {msg.attachmentType?.startsWith('image/') ? (
                                <img
                                  src={msg.attachmentUrl}
                                  alt={msg.attachmentName}
                                  className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity border border-black/5 dark:border-white/10"
                                  onClick={() => window.open(msg.attachmentUrl, '_blank')}
                                />
                              ) : (
                                <a
                                  href={msg.attachmentUrl}
                                  download={msg.attachmentName}
                                  className="flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all border border-black/10 dark:border-white/10"
                                >
                                  <div className="p-2 bg-primary/20 rounded-lg">
                                    <Paperclip size={20} className="text-primary" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate text-black dark:text-white">{msg.attachmentName}</p>
                                    <p className="text-[10px] text-black/40 dark:text-white/40 uppercase">Click to download</p>
                                  </div>
                                </a>
                              )}
                            </div>
                          ) : msg.type === 'call_history' ? (
                            <div className={`flex items-center gap-4 py-3 px-5 rounded-2xl border ${msg.metadata?.status === 'missed'
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                                : 'bg-green-500/5 border-green-500/10 text-green-500 dark:text-green-400'
                              }`}>
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${msg.metadata?.status === 'missed' ? 'bg-rose-500/20' : 'bg-green-500/20'
                                }`}>
                                {msg.metadata?.status === 'missed' ? (
                                  <PhoneOff size={20} />
                                ) : (
                                  msg.metadata?.media === 'video' ? <Video size={20} /> : <Phone size={20} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold leading-tight">
                                  {msg.metadata?.status === 'missed' ? 'Missed Call' : `${msg.metadata?.media === 'video' ? 'Video' : 'Voice'} Call Ended`}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {isMe ? <ArrowUpRight size={12} className="opacity-60" /> : <ArrowDownLeft size={12} className="opacity-60" />}
                                  <p className="text-[10px] font-medium opacity-60 uppercase tracking-wider">
                                    {msg.metadata?.status === 'missed'
                                      ? (isMe ? 'Outgoing' : 'Unanswered')
                                      : (msg.metadata?.duration ? `${Math.floor(msg.metadata.duration / 60)}m ${msg.metadata.duration % 60}s` : 'Call Ended')}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (() => {
                            const solo = isSoloEmoji(msg.content);
                            if (solo?.type === 'animated') {
                              return (
                                <div className="w-48 h-48 my-2">
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

                            const urlRegex = /(https?:\/\/[^\s]+)/g;
                            const parts = msg.content.split(urlRegex);

                            return (
                               <div>
                                 <span>
                                   {parts.map((part, index) => {
                                     if (part.match(urlRegex)) {
                                       return (
                                         <a
                                           key={index}
                                           href={part}
                                           target="_blank"
                                           rel="noopener noreferrer"
                                           className={isMe ? "text-white underline font-medium" : "text-violet-600 dark:text-violet-400 hover:underline transition-colors font-medium underline decoration-violet-500/30 underline-offset-2"}
                                           onClick={(e) => e.stopPropagation()}
                                         >
                                           {part}
                                         </a>
                                       );
                                     }
                                     return <AnimatedEmojiRenderer key={index} content={part} />;
                                   })}
                                 </span>
                                 <MessageLinkPreview content={msg.content} isMe={isMe} />
                               </div>
                             );
                          })()}
                        </div>

                        {/* Reactions Display */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1 justify-start">
                            {Object.entries(msg.reactions).map(([emoji, data]: [string, any]) => {
                              if (data.count === 0) return null;
                              const hasReacted = data.uids.includes(auth.currentUser?.uid);
                              return (
                                <motion.button
                                  key={emoji}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => handleAddReaction(msg.id, emoji)}
                                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border transition-all ${
                                    hasReacted 
                                      ? 'bg-primary/20 border-primary/40 text-primary' 
                                      : 'bg-black/5 border-black/10 text-black/60 dark:bg-white/5 dark:border-white/10 dark:text-white/60 hover:border-black/20 dark:hover:border-white/20'
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  <span className="text-[10px]">{data.count}</span>
                                </motion.button>
                              );
                            })}
                          </div>
                        )}

                        {/* Message Actions Toolkit */}
                        <div className={`absolute -top-9 ${isMe ? 'right-2' : 'left-2'} opacity-0 group-hover:opacity-100 transition-all flex items-center bg-white dark:bg-[#1A1F2C] border border-black/10 dark:border-white/10 rounded-xl shadow-lg z-10 overflow-visible py-0.5 px-1`}>
                          
                          {/* Reactions Button & Submenu */}
                          <div className="relative">
                            <button 
                              onClick={() => setShowReactionMenu(showReactionMenu === msg.id ? null : msg.id)}
                              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-all"
                              title="Add Reaction"
                            >
                              <Smile size={15} />
                            </button>
                            
                            <AnimatePresence>
                              {showReactionMenu === msg.id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setShowReactionMenu(null)} />
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white dark:bg-[#1A1F2C] border border-black/10 dark:border-white/10 p-1 rounded-full shadow-2xl z-50 whitespace-nowrap"
                                  >
                                    {REACTION_EMOJIS.map((r) => (
                                      <button
                                        key={r.emoji}
                                        onClick={() => handleAddReaction(msg.id, r.emoji)}
                                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all hover:scale-125 text-lg"
                                        title={r.label}
                                      >
                                        {r.emoji}
                                      </button>
                                    ))}
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Reply Button */}
                          <button 
                            onClick={() => {
                              setReplyTo(msg);
                              setShowReactionMenu(null);
                              inputRef.current?.focus();
                            }}
                            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-all"
                            title="Reply"
                          >
                            <Reply size={15} />
                          </button>

                          {/* Gift XP Button (only for other user's messages) */}
                          {!isMe && isConversationAccepted(selectedConv) && (
                            <button 
                              onClick={() => {
                                handleGiftXP(100);
                                setShowReactionMenu(null);
                              }}
                              className="p-1.5 rounded-lg hover:bg-yellow-500/10 text-black/40 dark:text-white/40 hover:text-yellow-500 transition-all"
                              title="Quick Gift 100 XP"
                            >
                              <Gift size={15} />
                            </button>
                          )}

                          {/* Edit Button (only for my text messages) */}
                          {isMe && (!msg.type || msg.type === 'text') && (
                            <button 
                              onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditContent(msg.content);
                                setShowReactionMenu(null);
                              }}
                              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-all"
                              title="Edit"
                            >
                              <Edit2 size={15} />
                            </button>
                          )}

                          {/* Delete Button (only for my messages) */}
                          {isMe && (
                            <button 
                              onClick={() => {
                                handleDeleteMessage(msg.id);
                                setShowReactionMenu(null);
                              }}
                              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-black/40 dark:text-white/40 hover:text-rose-500 transition-all"
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>

                        <div className={`flex items-center gap-1.5 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {msg.isEdited && (
                            <span className="text-[9px] text-black/40 dark:text-white/40 italic">
                              (edited)
                            </span>
                          )}
                          <span className="text-[10px] text-black/20 dark:text-white/20">
                            {(() => {
                              if (!msg.createdAt) return '';
                              try {
                                const d = msg.createdAt.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt);
                                if (!(d instanceof Date) || isNaN(d.getTime())) return '';
                                return formatDistanceToNow(d, { addSuffix: true });
                              } catch (e) {
                                return '';
                              }
                            })()}
                          </span>
                          {isMe && (
                            <span className="text-primary">
                              {msg.read ? <CheckCheck size={12} /> : <Check size={12} />}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            {isIncomingRequestChat ? (
              <div className="p-6 border-t border-black/5 dark:border-white/5 bg-gradient-to-r from-pink-500/5 to-rose-500/5 shrink-0">
                <div className="max-w-md mx-auto text-center space-y-4">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/25">
                    <UserPlus size={24} className="text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Message request from {selectedConv.otherUser?.username}</p>
                    <p className="text-xs text-black/50 dark:text-white/50 mt-1">Accept to start chatting, or decline to remove this request.</p>
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={handleDeclineRequest}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 text-sm font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                    >
                      <X size={16} /> Decline
                    </button>
                    <button
                      onClick={handleAcceptRequest}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-white text-sm font-bold shadow-lg shadow-cyan-500/25 hover:scale-105 transition-all"
                    >
                      <CheckCircle2 size={16} /> Accept
                    </button>
                  </div>
                </div>
              </div>
            ) : isWaitingForAcceptance ? (
              <div className="p-6 border-t border-black/5 dark:border-white/5 bg-gradient-to-r from-amber-500/5 to-orange-500/5 shrink-0 text-center">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Your message request is pending. You can send more messages once {selectedConv.otherUser?.username} accepts.</p>
              </div>
            ) : canSendMessages ? (
              <div className="p-4 border-t border-black/5 dark:border-white/5 bg-white/80 dark:bg-black/40 shrink-0 text-black dark:text-white">
                {replyTo && (
                  <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 px-4 py-2 rounded-t-2xl border-x border-t border-black/10 dark:border-white/10 animate-in slide-in-from-bottom-2 text-black dark:text-white">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-1 h-6 bg-primary rounded-full shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase font-bold text-primary">Replying to {replyTo.senderId === auth.currentUser?.uid ? 'yourself' : 'them'}</p>
                        <p className="text-xs text-black/60 dark:text-white/60 truncate italic font-medium">{replyTo.content}</p>
                      </div>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="text-black/30 dark:text-white/30 hover:text-primary transition-colors">
                      <MoreVertical size={16} className="rotate-45" />
                    </button>
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                    accept="image/*,.pdf,.doc,.docx,.txt"
                  />

                  {isConversationAccepted(selectedConv) && (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="text-black/30 dark:text-white/30 hover:text-primary transition-colors disabled:opacity-50"
                        title="Attach File"
                      >
                        <Paperclip size={20} className={isUploading ? 'animate-pulse' : ''} />
                      </button>

                      <motion.div
                        className="relative"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <button
                          type="button"
                          onClick={() => setShowGiftOptions(!showGiftOptions)}
                          className={`text-black/30 dark:text-white/30 hover:text-yellow-500 transition-colors ${showGiftOptions ? 'text-yellow-500' : ''}`}
                          title="Gift XP"
                        >
                          <Gift size={20} />
                        </button>

                        <AnimatePresence>
                          {showGiftOptions && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute bottom-full mb-4 left-0 z-50 bg-white dark:bg-[#151A2C] border border-black/10 dark:border-white/10 rounded-2xl p-4 shadow-2xl w-48 shadow-black/10"
                            >
                              <p className="text-[10px] uppercase font-bold text-black/40 dark:text-white/40 mb-3 tracking-wider">Gift XP</p>
                              <div className="grid grid-cols-2 gap-2">
                                {[50, 100, 250, 500].map(amount => (
                                  <button
                                    key={amount}
                                    type="button"
                                    onClick={() => handleGiftXP(amount)}
                                    className="px-3 py-2 bg-black/5 dark:bg-white/5 hover:bg-yellow-500/20 border border-black/5 dark:border-white/5 hover:border-yellow-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-between group text-black dark:text-white"
                                  >
                                    <span className="text-yellow-500">{amount}</span>
                                    <Zap size={10} className="fill-yellow-500 text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </>
                  )}

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowAnimatedPicker(!showAnimatedPicker)}
                      className={`hover:scale-110 transition-transform ${showAnimatedPicker ? 'grayscale-0' : 'grayscale opacity-50 hover:opacity-100 hover:grayscale-0'}`}
                      title="Animated Emoji"
                    >
                      <div className="w-6 h-6">
                        <SafeAnimatedEmoji emoji="joy" size="24px" />
                      </div>
                    </button>

                    <AnimatePresence>
                      {showAnimatedPicker && (
                        <div className="absolute bottom-full mb-4 left-0 z-50">
                          <div className="fixed inset-0" onClick={() => setShowAnimatedPicker(false)} />
                          <div className="relative">
                            <AnimatedEmojiPicker
                              onSelect={(emoji) => {
                                sendMessage(`:animated-${emoji}:`);
                                setShowAnimatedPicker(false);
                              }}
                              onClose={() => setShowAnimatedPicker(false)}
                            />
                          </div>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`text-black/30 dark:text-white/30 hover:text-primary transition-colors ${showEmojiPicker ? 'text-primary' : ''}`}
                      title="Emoji Picker"
                    >
                      <Smile size={20} />
                    </button>

                    {showEmojiPicker && (
                      <div className="absolute bottom-full mb-4 left-0 z-50">
                        <div className="fixed inset-0" onClick={() => setShowEmojiPicker(false)} />
                        <div className="relative">
                          <EmojiPicker
                            theme={document.documentElement.classList.contains('dark') ? Theme.DARK : Theme.LIGHT}
                            onEmojiClick={(emojiData) => {
                              setNewMessage(prev => prev + emojiData.emoji);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 relative">
                    <input
                      type="text"
                      ref={inputRef}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder={isNewRequestChat ? 'Write your message request...' : 'Start a new message'}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-primary outline-none transition-all text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-full flex items-center justify-center disabled:opacity-50 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-cyan-500/25"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-black dark:text-white">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
              <Send className="text-primary" size={40} />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-black dark:text-white">Select a message</h2>
            <p className="text-black/40 dark:text-white/40 max-w-xs">
              Choose from your existing conversations or start a new one to begin chatting.
            </p>
            <button className="mt-8 px-8 py-3 bg-primary text-white rounded-xl font-bold hover:scale-105 transition-all shadow-lg shadow-primary/20">
              New Message
            </button>
          </div>
        )}
      </div>

      {/* Chat details sidebar — desktop */}
      <AnimatePresence>
        {showChatDetails && selectedConv && otherUserId && (
          <ChatDetailsSidebar
            key={selectedConv.id}
            userId={otherUserId}
            messages={messages}
            onClose={() => setShowChatDetails(false)}
            className="hidden lg:flex lg:col-span-3"
          />
        )}
      </AnimatePresence>

      {/* Chat details sidebar — mobile overlay */}
      <AnimatePresence>
        {showChatDetails && selectedConv && otherUserId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowChatDetails(false)}
            />
            <div className="lg:hidden fixed inset-y-0 right-0 w-full max-w-sm z-50 shadow-2xl">
              <ChatDetailsSidebar
                key={`mobile-${selectedConv.id}`}
                userId={otherUserId}
                messages={messages}
                onClose={() => setShowChatDetails(false)}
                className="h-full"
              />
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MessageLinkPreview({ content, isMe }: { content: string; isMe: boolean }) {
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

  const cardBg = isMe 
    ? 'bg-black/20 dark:bg-black/30' 
    : 'bg-black/5 dark:bg-white/5';
  const cardBorder = isMe 
    ? 'border-white/10' 
    : 'border-black/5 dark:border-white/10';
  const textColor = isMe 
    ? 'text-white' 
    : 'text-black dark:text-white';
  const subTextColor = isMe 
    ? 'text-white/60' 
    : 'text-black/50 dark:text-white/40';

  return (
    <a 
      href={preview.url} 
      target="_blank" 
      rel="noopener noreferrer"
      className={`mt-2 block rounded-2xl border ${cardBg} ${cardBorder} overflow-hidden transition-all group max-w-sm`}
    >
      {preview.image && preview.image.trim() !== '' && (
        <div className={`w-full aspect-video overflow-hidden border-b ${cardBorder}`}>
          <img 
            src={preview.image} 
            alt={preview.title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <div className="p-3 text-left">
        <div className="flex items-center gap-1.5 mb-1">
          <ExternalLink size={10} className={isMe ? 'text-white/40' : 'text-black/30 dark:text-white/30'} />
          <span className={`text-[8px] uppercase tracking-widest font-bold font-mono ${subTextColor}`}>{preview.siteName || 'Link Preview'}</span>
        </div>
        <h4 className={`text-xs font-bold ${textColor} line-clamp-1 group-hover:underline`}>{preview.title}</h4>
        {preview.description && <p className={`text-[10px] ${subTextColor} mt-1 line-clamp-2 leading-relaxed`}>{preview.description}</p>}
      </div>
    </a>
  );
}
