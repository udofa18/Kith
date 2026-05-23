import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  updateDoc, 
  getDoc,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { playNotificationSound } from '../lib/sounds';

export type CallType = 'one-to-one' | 'group';
export type MediaMode = 'voice' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined';

export interface CallParticipant {
  status: 'ringing' | 'accepted' | 'declined' | 'missed';
  displayName: string;
  photoURL: string;
}

export interface CallSession {
  id: string;
  type: CallType;
  media: MediaMode;
  status: CallStatus;
  callerId: string;
  callerName: string;
  callerPhoto: string;
  chatId: string;
  participants: { [uid: string]: CallParticipant };
  createdAt: any;
  endedAt?: any;
}

interface CallContextType {
  activeCall: CallSession | null;
  incomingCall: CallSession | null;
  initiateCall: (
    chatId: string, 
    participantIds: string[], 
    type: CallType, 
    media: MediaMode, 
    callerMetadata: { name: string, photo: string },
    recipientsMetadata: { [uid: string]: { displayName: string, photoURL: string } }
  ) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  isMinimized: boolean;
  setIsMinimized: (val: boolean) => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  useEffect(() => {
    return auth.onAuthStateChanged(setCurrentUser);
  }, []);

  // Listen for incoming calls
  useEffect(() => {
    if (!currentUser) {
      setIncomingCall(null);
      return;
    }

    const q = query(
      collection(db, 'callSessions'),
      where('status', '==', 'ringing'),
      where('participantIds', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const incoming = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as CallSession))
        .find(call => 
          call.callerId !== currentUser.uid && 
          currentUser.uid in call.participants &&
          call.participants[currentUser.uid].status === 'ringing'
        );

      if (incoming) {
        setIncomingCall(incoming);
        // Play ringtone logic here if desired
      } else {
        setIncomingCall(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'callSessions (ringing query)');
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Listen for active call updates
  useEffect(() => {
    if (!activeCall) return;

    const unsubscribe = onSnapshot(doc(db, 'callSessions', activeCall.id), (doc) => {
      if (doc.exists()) {
        const data = { id: doc.id, ...doc.data() } as CallSession;
        if (data.status === 'ended' || data.status === 'declined' || data.status === 'missed') {
          setActiveCall(null);
          setIsMinimized(false);
        } else {
          setActiveCall(data);
        }
      } else {
        setActiveCall(null);
        setIsMinimized(false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `callSessions/${activeCall.id}`);
    });

    return () => unsubscribe();
  }, [activeCall?.id]);

  const initiateCall = async (
    chatId: string, 
    participantIds: string[], 
    type: CallType, 
    media: MediaMode, 
    callerMetadata: { name: string, photo: string },
    recipientsMetadata: { [uid: string]: { displayName: string, photoURL: string } }
  ) => {
    if (!auth.currentUser) return;

    const participants: { [uid: string]: CallParticipant } = {};
    for (const uid of participantIds) {
      if (uid !== auth.currentUser.uid) {
        participants[uid] = {
          status: 'ringing',
          displayName: recipientsMetadata[uid]?.displayName || '',
          photoURL: recipientsMetadata[uid]?.photoURL || ''
        };
      }
    }

    const callData = {
      type,
      media,
      status: 'ringing',
      callerId: auth.currentUser.uid,
      callerName: callerMetadata.name,
      callerPhoto: callerMetadata.photo,
      chatId,
      participantIds: [...participantIds, auth.currentUser.uid],
      participants,
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'callSessions'), callData);
    setActiveCall({ id: docRef.id, ...callData, createdAt: new Date() } as CallSession);
  };

  const acceptCall = async () => {
    if (!incomingCall || !auth.currentUser) return;

    const callRef = doc(db, 'callSessions', incomingCall.id);
    await updateDoc(callRef, {
      status: 'active',
      [`participants.${auth.currentUser.uid}.status`]: 'accepted'
    });

    setActiveCall(incomingCall);
    setIncomingCall(null);
  };

  const declineCall = async () => {
    if (!incomingCall || !auth.currentUser) return;

    const callRef = doc(db, 'callSessions', incomingCall.id);
    await updateDoc(callRef, {
      status: 'declined',
      [`participants.${auth.currentUser.uid}.status`]: 'declined'
    });
    setIncomingCall(null);
  };

  const endCall = async () => {
    const callToEnd = activeCall || incomingCall;
    if (!callToEnd || !auth.currentUser) return;

    const callRef = doc(db, 'callSessions', callToEnd.id);
    const otherUserId = Object.keys(callToEnd.participants).find(id => id !== auth.currentUser?.uid) || '';
    
    // If it was just ringing and caller ends it
    if (callToEnd.callerId === auth.currentUser.uid) {
      const isStillRinging = callToEnd.status === 'ringing';
      await updateDoc(callRef, {
        status: isStillRinging ? 'missed' : 'ended',
        endedAt: serverTimestamp()
      });

      // Log in chat history
      await addDoc(collection(db, 'conversations', callToEnd.chatId, 'messages'), {
        senderId: auth.currentUser.uid,
        receiverId: otherUserId,
        content: isStillRinging ? `Missed ${callToEnd.media} call` : `${callToEnd.media.charAt(0).toUpperCase() + callToEnd.media.slice(1)} call ended`,
        type: 'call_history',
        metadata: {
          media: callToEnd.media,
          status: isStillRinging ? 'missed' : 'ended',
          duration: callToEnd.createdAt ? Math.floor((Date.now() - (callToEnd.createdAt.toDate?.() || callToEnd.createdAt)) / 1000) : 0
        },
        createdAt: serverTimestamp(),
        read: false,
        conversationId: callToEnd.chatId
      });
    } else {
      // Participant leaves
      await updateDoc(callRef, {
        [`participants.${auth.currentUser.uid}.status`]: 'declined' // for simplicity in 1on1
      });
      
      const snap = await getDoc(callRef);
      const data = snap.data() as CallSession;
      const anyActive = Object.values(data.participants).some(p => p.status === 'accepted' || p.status === 'ringing');
      if (!anyActive) {
        await updateDoc(callRef, { status: 'ended', endedAt: serverTimestamp() });
        
        // Log in chat history
        await addDoc(collection(db, 'conversations', callToEnd.chatId, 'messages'), {
          senderId: auth.currentUser.uid,
          receiverId: otherUserId,
          content: `${callToEnd.media.charAt(0).toUpperCase() + callToEnd.media.slice(1)} call ended`,
          type: 'call_history',
          metadata: {
            media: callToEnd.media,
            status: 'ended',
            duration: callToEnd.createdAt ? Math.floor((Date.now() - (callToEnd.createdAt.toDate?.() || callToEnd.createdAt)) / 1000) : 0
          },
          createdAt: serverTimestamp(),
          read: false,
          conversationId: callToEnd.chatId
        });
      }
    }

    setActiveCall(null);
    setIncomingCall(null);
    setIsMinimized(false);
  };

  return (
    <CallContext.Provider value={{ 
      activeCall, 
      incomingCall, 
      initiateCall, 
      acceptCall, 
      declineCall, 
      endCall,
      isMinimized,
      setIsMinimized
    }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}
