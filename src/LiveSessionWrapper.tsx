import React from 'react';
import { useLiveSession } from './contexts/LiveSessionContext';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import FloatingLiveSession from './components/live/FloatingLiveSession';
import RoomParticipantPresence from './components/live/RoomParticipantPresence';

/**
 * One root LiveKit room for live sessions.
 *
 * The room lives here (not inside the page) so minimizing can keep the call
 * connected while the user browses the rest of the app. Voice rooms are mounted
 * separately in AppContent and are intentionally skipped on live routes, so a
 * live page never ends up nested inside a second room.
 */
export default function LiveSessionWrapper({ children }: { children: React.ReactNode }) {
  const { session, endSession } = useLiveSession();

  if (!session.token) return <>{children}</>;

  return (
    <LiveKitRoom
      token={session.token}
      serverUrl={(import.meta as any).env.VITE_LIVEKIT_URL}
      connect={true}
      audio={false}
      video={false}
      onDisconnected={endSession}
      className="flex flex-col h-full"
    >
      {children}
      <RoomParticipantPresence />
      <FloatingLiveSession />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
