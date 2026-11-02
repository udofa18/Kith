import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

interface LiveSessionState {
  eventId: string | null;
  isMinimized: boolean;
  isOverlayHidden: boolean;
  isActive: boolean;
  eventTitle?: string;
  token: string | null;
  eventData: any | null;
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

  const [guestName, setGuestNameState] = useState<string>('');

  const fetchSessionData = async (eventId: string, gName?: string) => {
    try {
      const eventSnap = await getDoc(doc(db, 'events', eventId));
      if (!eventSnap.exists()) return;
      const eventData = eventSnap.data();

      // Members prove who they are with their ID token; guests get a guest_ identity.
      const idToken = await auth.currentUser?.getIdToken();
      const response = await axios.post('/api/livekit-token', {
        eventId,
        userId: auth.currentUser?.uid || `guest_${Math.random().toString(36).substring(2, 12)}`,
        username: auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || gName || guestName || 'Guest',
        photoURL: auth.currentUser?.photoURL || ''
      }, idToken ? { headers: { Authorization: `Bearer ${idToken}` } } : undefined);

      setSession(prev => ({
        ...prev,
        eventId,
        eventTitle: eventData.title,
        eventData: { id: eventSnap.id, ...eventData },
        token: response.data.token,
        isActive: true,
        isMinimized: false,
        isOverlayHidden: false,
      }));
    } catch (error) {
      console.error('Failed to fetch session data:', error);
    }
  };

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
      pipWindow: null,
      pipSettings: session.pipSettings
    };
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionState(cleared);
  };

  const setGuestName = (name: string) => {
    setGuestNameState(name);
    if (session.eventId) {
      fetchSessionData(session.eventId, name);
    }
  };

  const updatePipSettings = (settings: Partial<LiveSessionState['pipSettings']>) => {
    setSession(prev => ({
      ...prev,
      pipSettings: { ...prev.pipSettings, ...settings }
    }));
  };

  return (
    <LiveSessionContext.Provider value={{ session, startSession, minimizeSession, expandSession, hideOverlay, endSession, setGuestName, updatePipSettings }}>
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
