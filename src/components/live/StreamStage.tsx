import { useTracks, ParticipantTile, GridLayout, VideoTrack } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { motion, AnimatePresence } from 'motion/react';
import { Maximize2, User, MicOff } from 'lucide-react';

interface StreamStageProps {
  isHost: boolean;
  streamType: string;
}

export default function StreamStage({ isHost, streamType }: StreamStageProps) {
  // Get all camera tracks
  const tracks = useTracks(
    [
      Track.Source.Camera,
      Track.Source.ScreenShare,
    ]
  );

  // Separate screen share from camera
  const screenShareTrack = tracks.find(t => t.source === Track.Source.ScreenShare);
  const cameraTracks = tracks.filter(t => t.source === Track.Source.Camera);

  if (tracks.length === 0) {
    return (
      <div className="w-full aspect-video rounded-[3rem] bg-foreground/5 dark:bg-zinc-900/50 border border-foreground/5 dark:border-white/5 flex flex-col items-center justify-center gap-6 shadow-3xl overflow-hidden relative group">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10" />
        <div className="relative z-10 w-24 h-24 rounded-full bg-foreground/5 dark:bg-white/5 flex items-center justify-center text-foreground/20 dark:text-white/20">
          <User size={48} />
        </div>
        <div className="relative z-10 space-y-2">
          <h3 className="text-xl font-bold text-foreground/50 dark:text-white/50">Waiting for live feed...</h3>
          <p className="text-foreground/20 dark:text-white/20 text-sm">The broadcast will start as soon as the host is ready</p>
        </div>
      </div>
    );
  }

  // Layout logic based on stream type and active screen share
  if (screenShareTrack) {
    return (
      <div className="w-full h-full flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
        {/* Main Screen Share */}
        <div className="flex-[3] relative rounded-[2rem] overflow-hidden bg-black/5 dark:bg-black border border-foreground/10 dark:border-white/10 shadow-2xl">
          <VideoTrack trackRef={screenShareTrack} className="w-full h-full object-contain" disablePictureInPicture playsInline />
          <div className="absolute bottom-6 left-6 px-3 py-1 bg-primary text-white text-[10px] font-black uppercase rounded-lg z-10">
            Screen Share
          </div>
        </div>

        {/* Floating/Side Camera tiles */}
        <div className="flex-1 flex lg:flex-col gap-4 overflow-x-auto lg:overflow-y-auto">
          {cameraTracks.map(track => (
            <div key={track.participant.sid} className="flex-shrink-0 aspect-video lg:w-full rounded-2xl overflow-hidden border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-zinc-900 relative">
              <VideoTrack 
                trackRef={track} 
                className="w-full h-full object-cover"
                style={{ transform: track.participant.isLocal ? 'scaleX(-1)' : 'none' }}
                disablePictureInPicture
                playsInline
              />
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-background/60 dark:bg-black/60 backdrop-blur-md rounded-md text-[8px] text-foreground dark:text-white font-bold uppercase truncate max-w-[100px] z-10 flex items-center gap-1.5 border border-foreground/10 dark:border-white/10">
                {track.participant.name || track.participant.identity}
                {!track.participant.isMicrophoneEnabled && <MicOff size={8} className="text-rose-500" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Standard multi-guest or broadcast layout
  return (
    <div className="w-full h-full relative p-4 flex items-center justify-center">
      <AnimatePresence mode="popLayout">
        <motion.div 
          layout
          className={`grid gap-6 w-full ${
            cameraTracks.length === 1 ? 'max-w-4xl aspect-video' : 
            cameraTracks.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-6xl aspect-[16/9]' :
            'grid-cols-2 lg:grid-cols-3 max-w-7xl'
          }`}
        >
          {cameraTracks.map((track, i) => (
            <motion.div
              layout
              key={track.participant.sid}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="relative aspect-video rounded-[2.5rem] overflow-hidden border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-zinc-900 shadow-2xl group"
            >
              <VideoTrack 
                trackRef={track} 
                className="w-full h-full object-cover"
                // Disable mirroring for everyone by default to avoid confusion
                // Most pro tools don't mirror the output, only the preview.
                style={{ transform: track.participant.isLocal ? 'scaleX(-1)' : 'none' }}
                disablePictureInPicture
                playsInline
              />
              
              {/* Overlay per tile */}
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-background/80 dark:from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border border-foreground/10 dark:border-white/20 overflow-hidden bg-foreground/5 dark:bg-zinc-800">
                    <img 
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${track.participant.identity}`} 
                      className="w-full h-full object-cover" 
                      alt="" 
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-foreground dark:text-white font-bold text-xs">{track.participant.name || 'Anonymous'}</span>
                    <span className="text-[10px] text-foreground/60 dark:text-white/60 font-medium uppercase tracking-wider">
                      {i === 0 ? 'Speaker' : 'Guest'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status badges */}
              <div className="absolute top-4 right-4 flex gap-2">
                {!track.participant.isMicrophoneEnabled && (
                  <div className="p-2 bg-rose-500/80 backdrop-blur-md rounded-xl text-white shadow-lg">
                    <MicOff size={14} />
                  </div>
                )}
                {track.participant.isSpeaking && (
                  <div className="px-2 py-1 bg-green-500 rounded-lg shadow-lg animate-bounce items-center flex">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
