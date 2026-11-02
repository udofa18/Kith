export const EVENT_CATEGORIES = [
  { name: 'Festival', emoji: '🥳' }, { name: 'Tech', emoji: '💻' }, { name: 'AI', emoji: '🧠' },
  { name: 'Arts', emoji: '🎨' }, { name: 'Educational', emoji: '🎓' }, { name: 'Pop culture', emoji: '🎬' },
  { name: 'Food & Drinks', emoji: '🍸' }, { name: 'Convention', emoji: '🏅' }, { name: 'Community', emoji: '👥' },
  { name: 'Holiday', emoji: '🎄' }, { name: 'Markets', emoji: '🛍️' }, { name: 'Fair', emoji: '🎪' },
  { name: 'Fintech', emoji: '💳' }, { name: 'Fashion', emoji: '👗' }, { name: 'Leadership', emoji: '👑' },
  { name: 'Coaching', emoji: '💡' },
] as const;

export const emojiFor = (category?: string) => EVENT_CATEGORIES.find(c => c.name === category)?.emoji ?? '✨';
