import React from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveSession } from './contexts/LiveSessionContext';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import FloatingLiveSession from './components/live/FloatingLiveSession';

export default function LiveSessionWrapper({ children }: { children: React.ReactNode }) {
  const { session } = useLiveSession();
  const location = useLocation();
  const isLivePage = location.pathname.startsWith('/live/');

  if (!session.token) return <>{children}</>;

  return (
    <LiveKitRoom
      token={session.token}
      serverUrl={(import.meta as any).env.VITE_LIVEKIT_URL}
      connect={true}
      audio={false}
      video={false}
      className="flex flex-col h-full"
    >
      {children}
      <FloatingLiveSession />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
