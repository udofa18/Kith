// Event "vibes": gradients used for posters without a banner. Warm brand colours first.
export const EVENT_THEMES = [
  { id: 'sunset', name: 'Sunset', from: '#EC4899', to: '#F97316' },
  { id: 'ocean', name: 'Ocean', from: '#3B82F6', to: '#06B6D4' },
  { id: 'neon', name: 'Neon', from: '#8B5CF6', to: '#EC4899' },
  { id: 'forest', name: 'Forest', from: '#10B981', to: '#84CC16' },
  { id: 'gold', name: 'Gold', from: '#F59E0B', to: '#EF4444' },
  { id: 'midnight', name: 'Midnight', from: '#1E3A8A', to: '#7C3AED' },
] as const;

export function themeOf(event: { id?: string; theme?: string }) {
  const found = EVENT_THEMES.find(t => t.id === event.theme);
  if (found) return found;
  let h = 0;
  for (const c of event.id || 'x') h = (h * 31 + c.charCodeAt(0)) % EVENT_THEMES.length;
  return EVENT_THEMES[h];
}

export const themeGradient = (event: { id?: string; theme?: string }) => {
  const t = themeOf(event);
  return `linear-gradient(135deg, ${t.from}, ${t.to})`;
};
