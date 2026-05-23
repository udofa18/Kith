import React, { createContext, useContext, useState, ReactNode } from 'react';

interface VoiceSession {
  communityId: string;
  channelId: string;
  channelName: string;
  token: string;
  serverUrl: string;
  mode: 'open' | 'stage' | 'private';
}

interface VoiceContextType {
  activeSession: VoiceSession | null;
  joinVoice: (session: VoiceSession) => void;
  leaveVoice: () => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<VoiceSession | null>(null);

  const joinVoice = (session: VoiceSession) => {
    setActiveSession(session);
  };

  const leaveVoice = () => {
    setActiveSession(null);
  };

  return (
    <VoiceContext.Provider value={{ activeSession, joinVoice, leaveVoice }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (context === undefined) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
}
