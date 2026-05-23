import { motion } from 'motion/react';

export default function ComponentSkeleton() {
  return (
    <div className="glass rounded-2xl overflow-hidden animate-pulse">
      {/* Image placeholder */}
      <div className="aspect-video bg-white/5" />
      
      <div className="p-6 space-y-4">
        {/* Stats and Price row */}
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <div className="h-3 w-12 bg-white/5 rounded" />
            <div className="h-3 w-12 bg-white/5 rounded" />
            <div className="h-3 w-12 bg-white/5 rounded" />
          </div>
          <div className="h-6 w-16 bg-white/5 rounded" />
        </div>

        {/* Title placeholder */}
        <div className="h-7 w-3/4 bg-white/5 rounded" />

        {/* Description placeholder */}
        <div className="space-y-2">
          <div className="h-4 w-full bg-white/5 rounded" />
          <div className="h-4 w-5/6 bg-white/5 rounded" />
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white/5" />
            <div className="h-3 w-20 bg-white/5 rounded" />
          </div>
          <div className="flex gap-1">
            <div className="h-4 w-12 bg-white/5 rounded" />
            <div className="h-4 w-12 bg-white/5 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
