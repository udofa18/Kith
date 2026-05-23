import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { 
  Mic, MicOff, Video, VideoOff, Monitor, X, MessageSquare, 
  Settings, MoreVertical, ScreenShare, Layout, Share2, 
  HelpCircle, BarChart3, Radio
} from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Track } from 'livekit-client';
import { toast } from 'react-hot-toast';

interface HostControlsProps {
  isHost: boolean;
  showChat: boolean;
  setShowChat: (show: boolean) => void;
  communityId: string;
  channelId: string;
  streamId: string;
}

export default function HostControls({ isHost, showChat, setShowChat, communityId, channelId, streamId }: HostControlsProps) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const [showSettings, setShowSettings] = useState(false);
  
  const toggleMic = async () => {
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  };

  const toggleCam = async () => {
    await localParticipant.setCameraEnabled(!isCameraEnabled);
  };

  const toggleScreenShare = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (e) {
      console.error('Screen share error:', e);
    }
  };

  return (
    <div className="relative">
      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-background border border-foreground/10 dark:bg-[#161618] dark:border-white/10 rounded-[3rem] p-8 shadow-2xl overflow-hidden"
            >
               <div className="absolute top-0 right-0 p-4">
                  <button onClick={() => setShowSettings(false)} className="text-foreground/20 dark:text-white/20 hover:text-foreground dark:hover:text-white transition-colors p-2 bg-foreground/5 dark:bg-white/5 rounded-full"><X size={20} /></button>
               </div>

               <div className="space-y-8">
                  <div>
                    <h3 className="text-xl font-black flex items-center gap-3"><Settings className="text-primary" /> Stream Intelligence</h3>
                    <p className="text-xs text-foreground/40 dark:text-white/40 mt-1 font-medium">Configure real-time stage dynamics</p>
                  </div>

                  <div className="space-y-4">
                    {[
                      { id: 'chat', label: 'Allow Member Chat', desc: 'Enable real-time interaction', enabled: true },
                      { id: 'requests', label: 'Stage Requests', desc: 'Allow members to ask for speaking slots', enabled: true },
                      { id: 'slow', label: 'Slow Mode (10s)', desc: 'Prevent chat spamming', enabled: false },
                      { id: 'recording', label: 'Auto-Record Session', desc: 'Save for later viewing', enabled: true }
                    ].map((config) => (
                      <div key={config.id} className="flex items-center justify-between p-4 bg-foreground/5 dark:bg-white/5 border border-foreground/5 dark:border-white/5 rounded-2xl group hover:border-primary/20 transition-all">
                        <div className="pr-4">
                           <p className="text-sm font-bold text-foreground dark:text-white">{config.label}</p>
                           <p className="text-[10px] text-foreground/30 dark:text-white/30 font-medium">{config.desc}</p>
                        </div>
                        <div className={`w-10 h-5 rounded-full p-1 relative cursor-pointer ${config.enabled ? 'bg-primary' : 'bg-foreground/10 dark:bg-white/10'}`}>
                           <div className={`w-3 h-3 bg-white rounded-full ${config.enabled ? 'ml-auto' : ''}`} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => {
                        toast.success('Stage policies updated');
                        setShowSettings(false);
                    }}
                    className="w-full py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all"
                  >
                    Deploy New Policies
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between p-2 rounded-[2.5rem] bg-background/40 dark:bg-zinc-900/40 border border-foreground/10 dark:border-white/5 backdrop-blur-3xl shadow-2xl">
        {/* Left: General info/tools */}
        <div className="flex items-center gap-1.5 p-1.5">
          <button 
             className={`p-4 rounded-3xl transition-all ${showChat ? 'bg-primary text-white shadow-neon' : 'text-foreground/40 dark:text-white/40 hover:text-foreground dark:hover:text-white hover:bg-foreground/5 dark:hover:bg-white/5'}`}
             onClick={() => setShowChat(!showChat)}
          >
            <MessageSquare size={20} />
          </button>
          {isHost && (
            <>
              <button className="p-4 rounded-3xl text-foreground/40 dark:text-white/40 hover:text-foreground dark:hover:text-white hover:bg-foreground/5 dark:hover:bg-white/5 transition-all">
                <HelpCircle size={20} />
              </button>
              <button className="p-4 rounded-3xl text-foreground/40 dark:text-white/40 hover:text-foreground dark:hover:text-white hover:bg-foreground/5 dark:hover:bg-white/5 transition-all">
                <BarChart3 size={20} />
              </button>
            </>
          )}
        </div>

        {/* Center: Main Media Controls */}
        <div className="flex items-center gap-4 px-2">
          <button 
            onClick={toggleMic}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMicrophoneEnabled ? 'bg-foreground/10 dark:bg-white/10 text-foreground dark:text-white hover:bg-foreground/20 dark:hover:bg-white/20' : 'bg-rose-500 text-white shadow-xl'}`}
          >
            {isMicrophoneEnabled ? <Mic size={24} /> : <MicOff size={24} />}
          </button>
          
          <button 
             onClick={toggleCam}
             className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isCameraEnabled ? 'bg-foreground/10 dark:bg-white/10 text-foreground dark:text-white hover:bg-foreground/20 dark:hover:bg-white/20' : 'bg-rose-500 text-white shadow-xl'}`}
          >
            {isCameraEnabled ? <Video size={24} /> : <VideoOff size={24} />}
          </button>

          {isHost && (
            <button 
               onClick={toggleScreenShare}
               className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isScreenShareEnabled ? 'bg-primary text-white shadow-neon' : 'bg-foreground/10 dark:bg-white/10 text-foreground dark:text-white hover:bg-foreground/20 dark:hover:bg-white/20'}`}
            >
              <Monitor size={24} />
            </button>
          )}
        </div>

        {/* Right: Management */}
        <div className="flex items-center gap-1.5 p-1.5">
          {isHost && (
            <button className="p-4 rounded-3xl text-foreground/40 dark:text-white/40 hover:text-foreground dark:hover:text-white hover:bg-foreground/5 dark:hover:bg-white/5 transition-all">
              <Layout size={20} />
            </button>
          )}
          <button className="p-4 rounded-3xl text-foreground/40 dark:text-white/40 hover:text-foreground dark:hover:text-white hover:bg-foreground/5 dark:hover:bg-white/5 transition-all">
            <Share2 size={20} />
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-4 rounded-3xl text-foreground/40 dark:text-white/40 hover:text-foreground dark:hover:text-white hover:bg-foreground/5 dark:hover:bg-white/5 transition-all"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Floating Record indicator for Host */}
      {isHost && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2">
           <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)] animate-pulse" />
        </div>
      )}
    </div>
  );
}
