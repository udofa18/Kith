import { ACCENT_BY_ID, DEFAULT_SETTINGS } from './defaults';
import type { Settings } from './types';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep-merge stored settings over defaults without mutating either side. */
function merge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return (patch === undefined ? base : (patch as T));
  }

  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = next[key];
    next[key] = isPlainObject(current) && isPlainObject(value) ? merge(current, value) : value;
  }
  return next as T;
}

/**
 * Turns a raw user document into a complete Settings object.
 * Unknown or partial documents are completed with defaults; legacy flat fields
 * are folded in so existing accounts keep their choices.
 */
export function normalizeSettings(profile: Record<string, any> | null | undefined): Settings {
  const raw = profile?.settings;
  const next = merge(DEFAULT_SETTINGS, isPlainObject(raw) ? raw : {});
  const stored = isPlainObject(raw) ? raw : {};

  const storedAppearance = isPlainObject(stored.appearance) ? stored.appearance : null;

  if (!storedAppearance?.theme && profile?.theme === 'light') next.appearance.theme = 'light';
  if (!storedAppearance?.theme && profile?.theme === 'dark') next.appearance.theme = 'dark';
  if (!storedAppearance?.density && profile?.layout === 'compact') next.appearance.density = 'compact';
  if (storedAppearance?.focusMode === undefined && profile?.focusMode === true) {
    next.appearance.focusMode = true;
  }

  if (!isPlainObject(stored.profile) && profile?.privacyPublicProfile === false) {
    next.profile.visibility = 'followers';
  }
  if (!isPlainObject(stored.privacy) && profile?.privacySearchable === false) {
    next.privacy.discoverable = false;
    next.privacy.searchIndex = false;
  }
  if (!isPlainObject(stored.data) && profile?.shareAnonymousUsage === false) {
    next.data.personalization = false;
  }

  if (!isPlainObject(stored.notifications)) {
    if (profile?.notif_pushDMs === false) next.notifications.matrix.messages.inApp = false;
    if (profile?.notif_pushSales === false) next.notifications.matrix.marketplace.inApp = false;
    if (profile?.notif_pushTrends === false) next.notifications.matrix.platform.inApp = false;
    if (profile?.notif_emailPerformance === false) next.notifications.matrix.marketplace.email = false;
  }

  return next;
}

/** Resolves the user's theme against the operating-system preference. */
export function resolveTheme(theme: Settings['appearance']['theme']): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const TEXT_SCALE: Record<Settings['appearance']['textScale'], string> = {
  sm: '15px',
  md: '16px',
  lg: '17.5px',
  xl: '19px',
};

/**
 * Applies appearance settings to the document root. This is deliberately the only
 * place that touches theme/accent DOM state so every entry point stays consistent.
 */
export function applyAppearance(appearance: Settings['appearance']): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';

  const root = document.documentElement;
  const resolved = resolveTheme(appearance.theme);
  const accent = ACCENT_BY_ID[appearance.accent] ?? ACCENT_BY_ID.coral;
  const palette = resolved === 'light' ? accent.light : accent.dark;

  root.classList.toggle('light', resolved === 'light');
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;

  root.style.setProperty('--ds-primary', palette.primary);
  root.style.setProperty('--ds-primary-hover', palette.primaryHover);
  root.style.setProperty('--ds-primary-foreground', palette.primaryForeground);
  root.style.setProperty('--ds-ring', palette.primary);
  root.style.setProperty('--ds-accent', palette.accent);
  root.style.setProperty('--ds-accent-foreground', palette.accentForeground);

  root.dataset.accent = appearance.accent;
  root.dataset.contrast = appearance.contrast;
  root.dataset.density = appearance.density;
  root.dataset.readableFont = String(appearance.readableFont);
  root.dataset.colorBlindSafe = String(appearance.colorBlindSafe);
  root.dataset.focusMode = String(appearance.focusMode);
  root.dataset.dataSaver = String(appearance.dataSaver);
  root.style.fontSize = TEXT_SCALE[appearance.textScale];

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduceMotion =
    appearance.reduceMotion === 'on' ||
    (appearance.reduceMotion === 'system' && prefersReducedMotion);
  root.dataset.reduceMotion = String(reduceMotion);

  try {
    localStorage.setItem('theme', resolved);
  } catch {
    /* storage can be unavailable in private mode */
  }

  return resolved;
}

/** Flat fields other pages still read. Kept in sync on every settings save. */
export function legacyMirror(settings: Settings, resolvedTheme: 'dark' | 'light'): Record<string, unknown> {
  const matrix = settings.notifications.matrix;
  return {
    theme: resolvedTheme,
    layout: settings.appearance.density,
    focusMode: settings.appearance.focusMode,
    privacyPublicProfile: settings.profile.visibility === 'public',
    privacySearchable: settings.privacy.discoverable,
    shareAnonymousUsage: settings.data.personalization,
    notif_pushDMs: matrix.messages.inApp,
    notif_pushSales: matrix.marketplace.inApp,
    notif_pushTrends: matrix.platform.inApp,
    notif_emailPerformance: matrix.marketplace.email,
    notif_emailSecurity: true,
  };
}

export interface PresenceContext {
  viewerUid?: string | null;
  viewerFollows?: boolean;
  viewerIsFollowed?: boolean;
}

/** Whether a viewer may see the target's presence/activity. */
export function canViewPresence(
  target: Record<string, any> | null | undefined,
  context: PresenceContext = {},
): boolean {
  if (!target) return false;

  const targetId = target.id ?? target.uid;
  if (context.viewerUid && targetId === context.viewerUid) return true;

  const who = target.settings?.activity?.presence ?? 'everyone';
  if (who === 'nobody') return false;
  if (who === 'me') return false;
  if (who === 'followers') return Boolean(context.viewerFollows);
  if (who === 'mutuals') return Boolean(context.viewerFollows && context.viewerIsFollowed);
  return true;
}

/** Whether the target accepts direct messages from this viewer. */
export function canMessageTarget(
  target: Record<string, any> | null | undefined,
  context: PresenceContext = {},
): boolean {
  if (!target) return true;

  const who = target.settings?.messaging?.whoCanDM ?? 'anyone';
  if (who === 'nobody') return false;
  if (who === 'followers') return Boolean(context.viewerFollows);
  if (who === 'mutuals') return Boolean(context.viewerFollows && context.viewerIsFollowed);
  return true;
}

/** A compact summary used by the "Preview as" dialog and profile warnings. */
export function audienceSummary(settings: Settings): string {
  const visibility = settings.profile.visibility;
  if (visibility === 'hidden') return 'Your profile is hidden from everyone.';
  if (visibility === 'followers') return 'Only people who follow you can open your full profile.';
  return 'Anyone can open your profile.';
}
