import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { LIVE_HEARTBEAT_INTERVAL_MS } from '../lib/livePresence';

interface LiveSessionState {
  eventId: string | null;
  isMinimized: boolean;
  isOverlayHidden: boolean;
  isActive: boolean;
  eventTitle?: string;
  token: string | null;
  eventData: any | null;
  /** Firebase uid or guest identity the room token belongs to. */
  ownerUid?: string | null;
  pipWindow: Window | null;
  pipSettings: {
    autoEnterEnabled: boolean;
    alwaysAsk: boolean;
    disabled: boolean;
  };
}

interface LiveSessionContextType {
  session: LiveSessionState;
  startSession: (eventId: string) => Promise<void>;
  minimizeSession: () => Promise<boolean>;
  expandSession: () => void;
  hideOverlay: () => void;
  endSession: () => void;
  /** Ask the server to end the room for everyone, then clear local state. */
  endSessionForEveryone: (eventId?: string) => Promise<boolean>;
  setGuestName: (name: string) => void;
  updatePipSettings: (settings: Partial<LiveSessionState['pipSettings']>) => void;
}

const LiveSessionContext = createContext<LiveSessionContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = 'ais_active_live_session';

export function LiveSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<LiveSessionState>(() => {
    const defaultPipSettings = {
      autoEnterEnabled: true,
      alwaysAsk: false,
      disabled: false
    };

    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...parsed,
          pipWindow: null,
          pipSettings: parsed.pipSettings || defaultPipSettings
        };
      }
      return {
        eventId: null,
        isMinimized: false,
        isOverlayHidden: false,
        isActive: false,
        token: null,
        eventData: null,
        pipWindow: null,
        pipSettings: defaultPipSettings
      };
    } catch (e) {
      return {
        eventId: null,
        isMinimized: false,
        isOverlayHidden: false,
        isActive: false,
        token: null,
        eventData: null,
        pipWindow: null,
        pipSettings: defaultPipSettings
      };
    }
  });

  const setSession = (newState: LiveSessionState | ((prev: LiveSessionState) => LiveSessionState)) => {
    setSessionState(prev => {
      const next = typeof newState === 'function' ? newState(prev) : newState;
      // Don't store pipWindow in localStorage
      const { pipWindow, ...storedData } = next;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedData));
      return next;
    });
  };

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SESSION_STORAGE_KEY) {
        if (e.newValue) {
          const parsed = JSON.parse(e.newValue);
          setSessionState(prev => ({ ...prev, ...parsed }));
        } else {
          // Session cleared in another tab
          setSessionState(prev => ({
            ...prev,
            eventId: null,
            isActive: false,
            token: null,
            eventData: null,
            isMinimized: false,
            pipWindow: null, // piPWindow can't be cleared across tabs like this, but we close it if possible
          }));
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // A stored room token belongs to the account that fetched it. If another
  // account signs in on this browser, drop the token instead of joining the
  // room with someone else's LiveKit identity.
  useEffect(() => onAuthStateChanged(auth, (user) => {
    const nextUid = user?.uid ?? null;
    setSessionState(prev => {
      const owner = prev.ownerUid;
      if (!prev.isActive || !owner || String(owner).startsWith('guest_') || owner === nextUid) return prev;
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return {
        eventId: null,
        isMinimized: false,
        isOverlayHidden: false,
        isActive: false,
        token: null,
        eventData: null,
        eventTitle: undefined,
        ownerUid: null,
        pipWindow: null,
        pipSettings: prev.pipSettings,
      };
    });
  }), []);

  // The cleanup below needs the *latest* session to decide whether the room is
  // really over, not the values captured when the effect first ran.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // While a host or co-host is on air, publish a small heartbeat document.
  // Avatars subscribe to these docs, and attendees use the heartbeat to notice
  // a room whose host has disappeared.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const eventId = session.eventId;
    const data = session.eventData;
    if (!session.isActive || !session.token || !eventId || !uid || !data) return;

    const coHostIds: string[] = Array.isArray(data.coHostIds) ? data.coHostIds : [];
    if (data.hostId !== uid && !coHostIds.includes(uid)) return;

    let stopped = false;
    const publish = () => {
      if (stopped) return;
      setDoc(doc(db, 'liveStatus', uid), {
        uid,
        eventId,
        hostId: uid,
        visibility: data.visibility || 'unlisted',
        active: true,
        startedAt: data.startDate || new Date().toISOString(),
        heartbeatAt: Date.now(),
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => undefined);
    };

    publish();
    const timer = setInterval(publish, LIVE_HEARTBEAT_INTERVAL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);

      // Only remove presence when this room is actually over. Re-running the
      // effect (for example when the event document refreshes) must not race a
      // fresh publish and leave the host looking offline while live.
      const latest = sessionRef.current;
      const stillLive =
        latest.isActive &&
        latest.eventId === eventId &&
        auth.currentUser?.uid === uid;
      if (!stillLive) {
        deleteDoc(doc(db, 'liveStatus', uid)).catch(() => undefined);
      }
    };
  }, [
    session.isActive,
    session.token,
    session.eventId,
    session.eventData?.hostId,
    session.eventData?.coHostIds?.join(','),
  ]);

  const [guestName, setGuestNameState] = useState<string>('');

  const fetchSessionData = async (eventId: string, gName?: string) => {
    // Display data is best-effort: the token endpoint is the authority on who
    // may join, so a room the viewer cannot read still has a chance to open.
    let localEvent: any = {};
    try {
      const eventSnap = await getDoc(doc(db, 'events', eventId));
      if (eventSnap.exists()) localEvent = { id: eventSnap.id, ...eventSnap.data() };
    } catch {
      // Firestore rules may hide the event document from guests until they join.
    }

    // Members prove who they are with their ID token; guests get a guest_ identity.
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    const identity = auth.currentUser?.uid || `guest_${Math.random().toString(36).substring(2, 12)}`;

    try {
      const response = await axios.post('/api/livekit-token', {
        eventId,
        userId: identity,
        username: auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || gName || guestName || 'Guest',
        photoURL: auth.currentUser?.photoURL || ''
      }, idToken ? { headers: { Authorization: `Bearer ${idToken}` } } : undefined);

      // Guests cannot read unlisted event documents, so the server returns the
      // routing fields (type, dates, managers) with the token.
      const eventData = response.data?.event
        ? { ...localEvent, ...response.data.event, id: eventId }
        : { ...localEvent, id: eventId };

      setSession(prev => ({
        ...prev,
        eventId,
        eventTitle: eventData.title,
        eventData,
        ownerUid: identity,
        token: response.data.token,
        isActive: true,
        isMinimized: false,
        isOverlayHidden: false,
      }));
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        'We could not open this room';
      console.error('Failed to fetch session data:', error);
      throw new Error(message);
    }
  };

  /** Join a room. Rejects with the server's reason when access is denied. */
  const startSession = async (eventId: string) => {
    if (session.eventId === eventId && session.token) return;
    await fetchSessionData(eventId);
  };

  const minimizeSession = async () => {
    // If PiP is supported, try to request it immediately from this user gesture
    if ('documentPictureInPicture' in window) {
      try {
        const width = 450;
        const height = 300;
        const pipWin = await (window as any).documentPictureInPicture.requestWindow({ width, height });
        
        // Copy styles to the new window
        const allStyleSheets = Array.from(document.styleSheets);
        allStyleSheets.forEach((styleSheet) => {
          try {
            const cssRules = Array.from(styleSheet.cssRules)
              .map((rule) => rule.cssText)
              .join('');
            const style = document.createElement('style');
            style.textContent = cssRules;
            pipWin.document.head.appendChild(style);
          } catch (e) {
            const link = document.createElement('link');
            if (styleSheet.href) {
              link.rel = 'stylesheet';
              link.href = styleSheet.href;
              pipWin.document.head.appendChild(link);
            }
          }
        });

        // Add tailwind class to body
        pipWin.document.body.classList.add('bg-black');

        pipWin.addEventListener('pagehide', () => {
          setSession(prev => {
            // Only expand if we are currently minimized
            if (prev.isMinimized) {
              return { ...prev, pipWindow: null, isMinimized: false };
            }
            return { ...prev, pipWindow: null };
          });
        });

        setSession(prev => ({ ...prev, isMinimized: true, isOverlayHidden: false, pipWindow: pipWin }));
        return true;
      } catch (error) {
        console.error('Failed to enter Document PiP:', error);
        // Fallback to internal minimized state if PiP fails
        setSession(prev => ({ ...prev, isMinimized: true, isOverlayHidden: false, pipWindow: null }));
        return false;
      }
    } else {
      setSession(prev => ({ ...prev, isMinimized: true, isOverlayHidden: false, pipWindow: null }));
      return true;
    }
  };

  const expandSession = () => {
    if (session.pipWindow) {
      session.pipWindow.close();
    }
    setSession(prev => ({ ...prev, isMinimized: false, isOverlayHidden: false, pipWindow: null }));
    // Bring window to focus
    window.focus();
  };

  const hideOverlay = () => {
    setSession(prev => ({ ...prev, isOverlayHidden: true }));
  };

  const endSession = () => {
    if (session.pipWindow) {
      session.pipWindow.close();
    }
    const cleared = { 
      eventId: null, 
      isMinimized: false, 
      isOverlayHidden: false,
      isActive: false, 
      token: null, 
      eventData: null,
      eventTitle: undefined,
      ownerUid: null,
      pipWindow: null,
      pipSettings: session.pipSettings
    };
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionState(cleared);
  };

  /**
   * End the room for everyone. The server verifies that the caller is the host
   * or a co-host, marks the event/session ended, removes live presence and
   * deletes the LiveKit room. Local state is only cleared once the server has
   * accepted the request, so a failed call leaves the host in the room.
   */
  const endSessionForEveryone = async (eventIdArg?: string) => {
    const eventId = eventIdArg || session.eventId;
    if (!eventId) {
      endSession();
      return false;
    }

    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    if (!idToken) {
      endSession();
      return false;
    }

    try {
      await axios.post(
        '/api/live-session/end',
        { eventId },
        { headers: { Authorization: `Bearer ${idToken}` } },
      );
      endSession();
      return true;
    } catch (error) {
      console.error('Failed to end the live session:', error);
      return false;
    }
  };

  /**
   * Remember the name a guest chose. Joining is left to the caller (and its
   * loading/error UI) so a name change never silently swaps a live token.
   */
  const setGuestName = (name: string) => {
    setGuestNameState(name);
  };

  const updatePipSettings = (settings: Partial<LiveSessionState['pipSettings']>) => {
    setSession(prev => ({
      ...prev,
      pipSettings: { ...prev.pipSettings, ...settings }
    }));
  };

  return (
    <LiveSessionContext.Provider value={{ session, startSession, minimizeSession, expandSession, hideOverlay, endSession, endSessionForEveryone, setGuestName, updatePipSettings }}>
      {children}
    </LiveSessionContext.Provider>
  );
}

export function useLiveSession() {
  const context = useContext(LiveSessionContext);
  if (context === undefined) {
    throw new Error('useLiveSession must be used within a LiveSessionProvider');
  }
  return context;
}
