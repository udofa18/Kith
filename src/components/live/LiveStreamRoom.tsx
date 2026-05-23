import { useEffect, useState, useRef } from 'react';
import { 
  LiveKitRoom, 
  VideoConference, 
  RoomAudioRenderer, 
  ControlBar,
  useTracks,
  GridLayout,
  ParticipantTile,
  LayoutContextProvider,
  Chat,
  useRoomContext,
  useLocalParticipant,
  TrackLoop,
  TrackRefContext,
  VideoTrack,
  ParticipantLoop
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { 
  Users, 
  MessageSquare, 
  MessageCircle, 
  Heart, 
  Sparkles, 
  LogOut, 
  Settings, 
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  X,
  Plus,
  Send,
  HelpCircle,
  BarChart3,
  ThumbsUp,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../../firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  increment
} from 'firebase/firestore';
import { useLiveSession } from '../../contexts/LiveSessionContext';
import StreamChat from './StreamChat';
import StreamEngagement from './StreamEngagement';
import HostControls from './HostControls';
import StreamStage from './StreamStage';

interface LiveStreamRoomProps {
  communityId: string;
  channelId: string;
  streamId: string;
  token: string;
  serverUrl: string;
  isHost: boolean;
  hostId: string;
  onLeave: () => void;
  streamTitle: string;
  streamType: string;
}

export default function LiveStreamRoom(props: LiveStreamRoomProps) {
  const [showChat, setShowChat] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);

  const { minimizeSession } = useLiveSession();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [activeTab, setActiveTab] = useState<'chat' | 'people' | 'qa'>('chat');

  useEffect(() => {
    if (!room || !localParticipant) return;
    const handleData = (payload: Uint8Array, participant: any) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type === 'mute_request') {
          localParticipant.setMicrophoneEnabled(false);
        } else if (data.type === 'kick_request') {
          props.onLeave();
        }
      } catch (e) {
        console.error('Error handling data message:', e);
      }
    };

    room.on('dataReceived', handleData);
    return () => {
      room.off('dataReceived', handleData);
    };
  }, [room, localParticipant, props.onLeave]);

  // Sync viewer count
  useEffect(() => {
    // Viewer increment logic
    if (!props.isHost) {
      const docRef = doc(db, 'communities', props.communityId, 'channels', props.channelId, 'liveStreams', props.streamId);
      updateDoc(docRef, { viewerCount: increment(1) }).catch(console.error);
    }

    const unsub = onSnapshot(doc(db, 'communities', props.communityId, 'channels', props.channelId, 'liveStreams', props.streamId), (snap) => {
      if (snap.exists()) {
        setViewerCount(snap.data().viewerCount || 0);
      }
    });

    return () => {
      unsub();
      if (!props.isHost) {
        const docRef = doc(db, 'communities', props.communityId, 'channels', props.channelId, 'liveStreams', props.streamId);
        updateDoc(docRef, { viewerCount: increment(-1) }).catch(console.error);
      }
    };
  }, [props.communityId, props.channelId, props.streamId, props.isHost]);

  const participants = useTracks([Track.Source.Camera, Track.Source.Microphone]).map(t => t.participant);
  const allParticipants = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
      <div className="flex-1 flex overflow-hidden">
      {/* Main Stage */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header info bar */}
        <div className="absolute top-0 inset-x-0 h-20 px-8 flex items-center justify-between z-30 bg-gradient-to-b from-background/80 to-transparent pointer-events-none">
          <div className="flex items-center gap-4 pointer-events-auto">
            <div className="px-3 py-1 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-[0_0_20px_rgba(244,63,94,0.4)]">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-black text-foreground dark:text-white leading-tight drop-shadow-lg">{props.streamTitle}</h1>
              <div className="flex items-center gap-3 text-[10px] text-foreground/60 dark:text-white/60 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <Users size={12} className="text-foreground/40 dark:text-white/40" />
                  {viewerCount} viewers
                </span>
                <span className="w-1 h-1 rounded-full bg-foreground/20 dark:bg-white/20" />
                <span>{props.streamType} mode</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            <button 
                onClick={minimizeSession}
                className="p-3 bg-foreground/5 dark:bg-white/5 hover:bg-foreground/10 dark:hover:bg-white/10 rounded-2xl text-foreground/60 dark:text-white/60 hover:text-foreground dark:hover:text-white transition-all border border-foreground/5 dark:border-white/5"
                title="Minimize to pop-out"
            >
                <Minimize2 size={18} />
            </button>
            <button 
                onClick={() => {
                    setShowChat(true);
                    setActiveTab('people');
                }}
                className="p-3 bg-foreground/5 dark:bg-white/5 hover:bg-foreground/10 dark:hover:bg-white/10 rounded-2xl text-foreground/60 dark:text-white/60 hover:text-foreground dark:hover:text-white transition-all border border-foreground/5 dark:border-white/5"
            >
                <Users size={18} />
            </button>
            <button 
              onClick={props.onLeave}
              className="px-6 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-2xl text-xs font-black transition-all flex items-center gap-2 border border-rose-500/20 group"
            >
              <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
              {props.isHost ? 'End Stream' : 'Leave Space'}
            </button>
          </div>
        </div>

        {/* Video Content */}
        <div className="flex-1 flex items-center justify-center p-4 pt-16">
          <StreamStage isHost={props.isHost} streamType={props.streamType} />
        </div>

        {/* Engagement overlay (floating reactions) */}
        <StreamEngagement communityId={props.communityId} channelId={props.channelId} streamId={props.streamId} />

        {/* Bottom Host/Participant Controls */}
        <div className="mt-auto px-8 pb-8 z-30 bg-gradient-to-t from-background/80 to-transparent">
          <div className="max-w-3xl mx-auto">
            <HostControls 
              isHost={props.isHost} 
              showChat={showChat} 
              setShowChat={setShowChat} 
              communityId={props.communityId}
              channelId={props.channelId}
              streamId={props.streamId}
            />
          </div>
        </div>
      </div>

      {/* Sidebars (Chat / Q&A / Polls / People) */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-l border-foreground/10 dark:border-white/5 bg-background dark:bg-[#0A0A0B] flex flex-col relative z-40 overflow-hidden"
          >
            <div className="flex-1 flex flex-col min-w-[400px]">
                {/* Tabs */}
                <div className="flex items-center gap-1 p-3 border-b border-foreground/5 dark:border-white/5 bg-foreground/2 dark:bg-white/2">
                    {[
                        { id: 'chat', label: 'Chat', icon: <MessageSquare size={14} /> },
                        { id: 'people', label: 'People', icon: <Users size={14} /> },
                        { id: 'qa', label: 'Q&A', icon: <HelpCircle size={14} /> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-primary text-white shadow-lg' : 'text-foreground/30 dark:text-white/30 hover:text-foreground/60 dark:hover:text-white/60 hover:bg-foreground/5 dark:hover:bg-white/5'}`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                    <button onClick={() => setShowChat(false)} className="p-2 text-foreground/20 dark:text-white/20 hover:text-foreground dark:hover:text-white transition-colors ml-1">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden">
                    {activeTab === 'chat' && (
                        <StreamChat 
                            communityId={props.communityId} 
                            channelId={props.channelId} 
                            streamId={props.streamId}
                            isHost={props.isHost}
                        />
                    )}

                    {activeTab === 'people' && (
                        <div className="p-6 space-y-6 overflow-y-auto h-full custom-scrollbar">
                           <div className="flex items-center justify-between">
                               <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground/30 dark:text-white/30">Participants ({allParticipants.length})</h3>
                               {props.isHost && <button className="text-[10px] font-black text-primary hover:underline">Manage All</button>}
                           </div>
                           
                           <div className="space-y-4">
                               {allParticipants.map((p, i) => (
                                   <div key={p.sid || i} className="flex items-center justify-between group">
                                       <div className="flex items-center gap-3">
                                           <div className="w-10 h-10 rounded-xl bg-foreground/5 dark:bg-white/5 border border-foreground/10 dark:border-white/10 overflow-hidden relative">
                                               <img 
                                                src={p.metadata ? JSON.parse(p.metadata).photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.identity}`} 
                                                className="w-full h-full object-cover" 
                                               />
                                               {p.isSpeaking && <div className="absolute inset-0 border-2 border-primary animate-pulse" />}
                                           </div>
                                           <div>
                                               <p className="text-sm font-bold text-foreground dark:text-white flex items-center gap-2">
                                                   {p.name || p.identity}
                                                   {p.identity === props.hostId ? <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[8px] font-black uppercase rounded">Host</span> : null}
                                               </p>
                                               <p className="text-[10px] text-foreground/30 dark:text-white/30 font-medium">Joined {i === 0 ? 'recently' : 'just now'}</p>
                                           </div>
                                       </div>
                                       
                                       <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                           {props.isHost && p.identity !== props.hostId && (
                                               <>
                                                   <button className="p-2 bg-foreground/5 dark:bg-white/5 hover:bg-rose-500/20 text-foreground/40 dark:text-white/40 hover:text-rose-500 rounded-lg transition-all">
                                                       <MicOff size={14} />
                                                   </button>
                                                   <button className="p-2 bg-foreground/5 dark:bg-white/5 hover:bg-rose-500/20 text-foreground/40 dark:text-white/40 hover:text-rose-500 rounded-lg transition-all">
                                                       <X size={14} />
                                                   </button>
                                               </>
                                           )}
                                       </div>
                                   </div>
                               ))}
                           </div>
                        </div>
                    )}

                    {activeTab === 'qa' && (
                        <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-4">
                           <div className="p-4 bg-primary/10 rounded-2xl text-primary">
                               <HelpCircle size={32} />
                           </div>
                           <div>
                               <h4 className="text-sm font-black text-foreground dark:text-white">Q&A session not active</h4>
                               <p className="text-[10px] text-foreground/30 dark:text-white/30 font-medium mt-1">Host can start a Q&A session anytime.</p>
                           </div>
                           {props.isHost && (
                               <button className="px-6 py-2 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg">Start Q&A</button>
                           )}
                        </div>
                    )}
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
);
}

