import React, { useState, useEffect } from 'react';
import { getAvailableEmojis } from "@remotion/animated-emoji";

interface SafeAnimatedEmojiProps {
  emoji: any;
  size?: number | string;
  className?: string;
}

export default function SafeAnimatedEmoji({ emoji, size = '100%', className = "" }: SafeAnimatedEmojiProps) {
  const [useFallback, setUseFallback] = useState(false);
  const [codepoint, setCodepoint] = useState<string | null>(null);

  useEffect(() => {
    try {
      const allEmojis = getAvailableEmojis();
      const emojiData = allEmojis.find(e => e.name === emoji);
      if (emojiData) {
        setCodepoint(emojiData.codepoint);
      }
    } catch (e) {
      console.error("Failed to get emoji data", e);
    }
  }, [emoji]);

  // Animated WebP from Google Noto CDN (very reliable and lightweight)
  const animatedUrl = codepoint 
    ? `https://fonts.gstatic.com/s/e/notoemoji/latest/${codepoint}/512.webp`
    : null;

  if (animatedUrl && !useFallback) {
    return (
      <div className={className} style={{ width: size, height: size }}>
        <img 
          src={animatedUrl} 
          alt={emoji}
          className="w-full h-full object-contain"
          onError={() => setUseFallback(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // Final fallback: just a circle with a color if we can't show the emoji
  return (
    <div 
      className={`bg-white/5 rounded-full flex items-center justify-center ${className}`} 
      style={{ width: size, height: size }}
    >
      <span className="opacity-50 text-[10px]">✨</span>
    </div>
  );
}
