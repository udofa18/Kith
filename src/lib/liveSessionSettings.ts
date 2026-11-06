/**
 * Host-controlled room settings, persisted on `eventSessions/{eventId}.settings`.
 * Everything defaults to open so older rooms keep working exactly as before.
 */
export interface LiveSessionSettings {
  chat: boolean;
  qa: boolean;
  polls: boolean;
  reactions: boolean;
  handRaise: boolean;
}

export const DEFAULT_LIVE_SETTINGS: LiveSessionSettings = {
  chat: true,
  qa: true,
  polls: true,
  reactions: true,
  handRaise: true,
};

export function normalizeLiveSettings(value: unknown): LiveSessionSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    chat: raw.chat !== false,
    qa: raw.qa !== false,
    polls: raw.polls !== false,
    reactions: raw.reactions !== false,
    handRaise: raw.handRaise !== false,
  };
}
