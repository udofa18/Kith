/**
 * 1:1 voice and video calls. A call is a `callSessions/{id}` document that moves through
 * ringing → active → ended (or declined / missed); media runs over LiveKit (see CallInterface).
 *
 * The caller owns the call's bookkeeping: ring timeout, and writing the call into the chat
 * once it finishes, so each call is logged exactly once.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { logCall } from '../features/messages/api';

export type CallType = 'one-to-one' | 'group';
export type MediaMode = 'voice' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined';

export interface CallParticipant {
  status: 'ringing' | 'accepted' | 'declined' | 'missed' | 'busy';
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
  participantIds?: string[];
  participants: { [uid: string]: CallParticipant };
  createdAt: any;
  answeredAt?: any;
  endedAt?: any;
}

/** Why the last call closed, shown briefly before the call screen goes away. */
export interface CallOutcome {
  reason: 'declined' | 'busy' | 'no-answer' | 'ended';
  name: string;
  photo: string;
  seconds?: number;
}

interface CallContextType {
  activeCall: CallSession | null;
  incomingCall: CallSession | null;
  outcome: CallOutcome | null;
  initiateCall: (
    chatId: string,
    participantIds: string[],
    type: CallType,
    media: MediaMode,
    callerMetadata: { name: string; photo: string },
    recipientsMetadata: { [uid: string]: { displayName: string; photoURL: string } }
  ) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  isMinimized: boolean;
  setIsMinimized: (val: boolean) => void;
}

const RING_TIMEOUT_MS = 45_000;
/** Incoming calls older than this are stale (the caller probably closed the app). */
const STALE_RING_MS = 60_000;
const OUTCOME_MS = 2500;

const toMillis = (v: any): number | null => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === 'number' ? v : null);

export const otherPartyOf = (call: CallSession, me: string | undefined) => {
  if (call.callerId === me) {
    const id = Object.keys(call.participants)[0];
    return { id, name: call.participants[id]?.displayName || 'Member', photo: call.participants[id]?.photoURL || '' };
  }
  return { id: call.callerId, name: call.callerName || 'Member', photo: call.callerPhoto || '' };
};

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [uid, setUid] = useState(auth.currentUser?.uid ?? null);
  const activeRef = useRef<CallSession | null>(null);
  const logged = useRef(new Set<string>());
  const outcomeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => auth.onAuthStateChanged(u => setUid(u?.uid ?? null)), []);
  useEffect(() => { activeRef.current = activeCall; }, [activeCall]);

  const showOutcome = useCallback((o: CallOutcome) => {
    clearTimeout(outcomeTimer.current);
    setOutcome(o);
    outcomeTimer.current = setTimeout(() => setOutcome(null), OUTCOME_MS);
  }, []);

  /** Caller-side: write the finished call into the chat, once. */
  const record = useCallback((call: CallSession, status: 'missed' | 'ended' | 'declined', seconds = 0) => {
    if (call.callerId !== auth.currentUser?.uid || logged.current.has(call.id)) return;
    logged.current.add(call.id);
    const callee = Object.keys(call.participants)[0];
    if (callee) logCall(call.chatId, call.callerId, callee, call.media, status, seconds).catch(err => console.warn('Call log failed', err));
  }, []);

  // Incoming calls.
  useEffect(() => {
    if (!uid) { setIncomingCall(null); return; }
    const q = query(collection(db, 'callSessions'), where('status', '==', 'ringing'), where('participantIds', 'array-contains', uid));
    return onSnapshot(q, snap => {
      const now = Date.now();
      const ringing = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as CallSession))
        .find(c => c.callerId !== uid && c.participants[uid]?.status === 'ringing' && now - (toMillis(c.createdAt) ?? now) < STALE_RING_MS);

      // Already on a call: tell the new caller we're busy instead of ringing over it.
      if (ringing && activeRef.current && activeRef.current.id !== ringing.id) {
        updateDoc(doc(db, 'callSessions', ringing.id), { status: 'declined', [`participants.${uid}.status`]: 'busy' }).catch(() => undefined);
        return;
      }
      setIncomingCall(ringing ?? null);
    }, err => console.warn('Incoming call listener failed', err));
  }, [uid]);

  // The call we're in.
  useEffect(() => {
    if (!activeCall?.id) return;
    const callId = activeCall.id;
    return onSnapshot(doc(db, 'callSessions', callId), snap => {
      const call = snap.exists() ? ({ id: snap.id, ...snap.data() } as CallSession) : null;
      if (call && (call.status === 'ringing' || call.status === 'active')) {
        setActiveCall(call);
        return;
      }
      setActiveCall(null);
      setIsMinimized(false);
      if (!call) return;

      const me = auth.currentUser?.uid;
      const other = otherPartyOf(call, me);
      const answered = toMillis(call.answeredAt);
      const seconds = answered ? Math.max(0, Math.round(((toMillis(call.endedAt) ?? Date.now()) - answered) / 1000)) : 0;
      const busy = Object.values(call.participants).some(p => p.status === 'busy');

      if (call.status === 'declined') {
        showOutcome({ reason: busy ? 'busy' : 'declined', name: other.name, photo: other.photo });
        record(call, busy ? 'missed' : 'declined');
      } else if (call.status === 'missed') {
        // Either the ring timed out, or we hung up before they answered (nothing to announce).
        const timedOut = call.participants[Object.keys(call.participants)[0]]?.status === 'missed';
        if (timedOut) showOutcome({ reason: 'no-answer', name: other.name, photo: other.photo });
        record(call, 'missed');
      } else {
        showOutcome({ reason: 'ended', name: other.name, photo: other.photo, seconds });
        record(call, answered ? 'ended' : 'missed', seconds);
      }
    }, err => console.warn('Call listener failed', err));
  }, [activeCall?.id, record, showOutcome]);

  // Caller-side ring timeout.
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'ringing' || activeCall.callerId !== uid) return;
    const started = toMillis(activeCall.createdAt) ?? Date.now();
    const t = setTimeout(() => {
      const callee = Object.keys(activeCall.participants)[0];
      updateDoc(doc(db, 'callSessions', activeCall.id), {
        status: 'missed',
        endedAt: serverTimestamp(),
        ...(callee ? { [`participants.${callee}.status`]: 'missed' } : {}),
      }).catch(() => undefined);
    }, Math.max(0, RING_TIMEOUT_MS - (Date.now() - started)));
    return () => clearTimeout(t);
  }, [activeCall?.id, activeCall?.status, uid]);

  // Flash the tab title while a call is ringing in.
  useEffect(() => {
    if (!incomingCall) return;
    const original = document.title;
    const alt = `📞 ${incomingCall.callerName || 'Incoming call'}`;
    const t = setInterval(() => { document.title = document.title === alt ? original : alt; }, 1000);
    return () => { clearInterval(t); document.title = original; };
  }, [incomingCall?.id]);

  const initiateCall: CallContextType['initiateCall'] = async (chatId, participantIds, type, media, callerMetadata, recipientsMetadata) => {
    const me = auth.currentUser?.uid;
    if (!me || activeRef.current) return;

    const participants: Record<string, CallParticipant> = {};
    for (const id of participantIds) {
      if (id !== me) participants[id] = { status: 'ringing', displayName: recipientsMetadata[id]?.displayName || '', photoURL: recipientsMetadata[id]?.photoURL || '' };
    }
    const callData = {
      type,
      media,
      status: 'ringing' as const,
      callerId: me,
      callerName: callerMetadata.name,
      callerPhoto: callerMetadata.photo,
      chatId,
      participantIds: [...new Set([...participantIds, me])],
      participants,
      createdAt: serverTimestamp(),
    };
    setOutcome(null);
    const ref = await addDoc(collection(db, 'callSessions'), callData);
    setIsMinimized(false);
    setActiveCall({ ...callData, id: ref.id, createdAt: new Date() });
  };

  const acceptCall = async () => {
    const me = auth.currentUser?.uid;
    if (!incomingCall || !me) return;
    const call = incomingCall;
    setIncomingCall(null);
    await updateDoc(doc(db, 'callSessions', call.id), {
      status: 'active',
      answeredAt: serverTimestamp(),
      [`participants.${me}.status`]: 'accepted',
    });
    setOutcome(null);
    setIsMinimized(false);
    setActiveCall({ ...call, status: 'active', answeredAt: new Date() });
  };

  const declineCall = async () => {
    const me = auth.currentUser?.uid;
    if (!incomingCall || !me) return;
    const call = incomingCall;
    setIncomingCall(null);
    await updateDoc(doc(db, 'callSessions', call.id), {
      status: 'declined',
      endedAt: serverTimestamp(),
      [`participants.${me}.status`]: 'declined',
    }).catch(() => undefined);
  };

  const ending = useRef(false);
  const endCall = async () => {
    const call = activeRef.current;
    const me = auth.currentUser?.uid;
    if (!call || !me || ending.current) return;
    ending.current = true;
    try {
      // Hanging up before an answer cancels the call (the other side sees a missed call).
      await updateDoc(doc(db, 'callSessions', call.id), {
        status: call.status === 'ringing' ? 'missed' : 'ended',
        endedAt: serverTimestamp(),
      }).catch(() => undefined);
    } finally {
      ending.current = false;
    }
  };

  return (
    <CallContext.Provider value={{ activeCall, incomingCall, outcome, initiateCall, acceptCall, declineCall, endCall, isMinimized, setIsMinimized }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (context === undefined) throw new Error('useCall must be used within a CallProvider');
  return context;
}
