import React from 'react';
import SafeAnimatedEmoji from './SafeAnimatedEmoji';

const ANIMATED_EMOJIS = [
  'smile', 'grin', 'sweat', 'party-popper', 'rocket', 'sparkles', 
  'thumbs-up', 'monkey', 'robot', 'turtle', 'snowflake', 'bell'
];

interface AnimatedEmojiRendererProps {
  content: string;
  size?: number;
}

export default function AnimatedEmojiRenderer({ content, size = 44 }: AnimatedEmojiRendererProps) {
  const regex = /:animated-([a-z-]+):/g;
  const elements: (string | React.ReactNode)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      elements.push(content.substring(lastIndex, match.index));
    }

    const emojiName = match[1];
    if (ANIMATED_EMOJIS.includes(emojiName as any)) {
      elements.push(
        <span key={match.index} className="inline-block align-middle mx-0.5">
          <SafeAnimatedEmoji emoji={emojiName as any} size={size} />
        </span>
      );
    } else {
      elements.push(match[0]); // Not a valid animated emoji, keep as text
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    elements.push(content.substring(lastIndex));
  }

  return <span>{elements}</span>;
}

// Special case for solo emoji
export function isSoloAnimatedEmoji(content: string) {
  const regex = /^:animated-([a-z-]+):$/;
  const match = content.trim().match(regex);
  if (match && ANIMATED_EMOJIS.includes(match[1] as any)) {
    return match[1];
  }
  return null;
}

export function isSoloStandardEmoji(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return null;
  
  // Use Intl.Segmenter if available for reliable emoji sequence detection
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' });
    const segments = Array.from(segmenter.segment(trimmed)) as any[];
    if (segments.length === 1) {
      // Check if this single grapheme is an emoji
      const emojiRegex = /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u;
      if (emojiRegex.test(segments[0].segment)) {
        return segments[0].segment;
      }
    }
  } else {
    // Fallback for environments without Segmenter
    // This matches common single-emoji patterns including those with variations
    const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})(\ufe0f)?$/u;
    if (emojiRegex.test(trimmed)) return trimmed;
  }
  
  return null;
}

export function isSoloEmoji(content: string) {
  const animated = isSoloAnimatedEmoji(content);
  if (animated) return { type: 'animated', value: animated };
  
  const standard = isSoloStandardEmoji(content);
  if (standard) return { type: 'standard', value: standard };
  
  return null;
}
