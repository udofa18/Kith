import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { getSupabase } from '../../supabase';
import { DEFAULT_SETTINGS } from './defaults';
import {
  applyAppearance,
  legacyMirror,
  normalizeSettings,
  resolveTheme,
} from './preferences';
import type { Settings } from './types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveState {
  status: SaveStatus;
  message?: string;
}

export interface UpdateProfileOptions {
  silent?: boolean;
  message?: string;
}

const PROFILE_COLUMNS: Record<string, string> = {
  displayName: 'display_name',
  username: 'username',
  bio: 'bio',
  profileImage: 'profile_image',
  location: 'location',
  theme: 'theme',
};

/**
 * Single owner of the user document's settings.
 *
 * - Subscribes once per signed-in user.
 * - Applies appearance immediately, before the save finishes.
 * - Serialises writes so rapid toggles land in order.
 * - Mirrors the same settings object to Supabase for server-side jobs.
 */
export function useSettings() {
  const uid = auth.currentUser?.uid ?? null;

  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });

  const settingsRef = useRef(settings);
  const profileRef = useRef(profile);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const savedTimer = useRef<number | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snapshot) => {
        const data = snapshot.exists() ? (snapshot.data() as Record<string, any>) : null;
        const next = normalizeSettings(data);
        profileRef.current = data;
        settingsRef.current = next;
        setProfile(data);
        setSettings(next);
        applyAppearance(next.appearance);
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message || 'Could not load your settings.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [uid]);

  // Follow the OS when the user picks "System".
  useEffect(() => {
    if (settings.appearance.theme !== 'system') {
      applyAppearance(settings.appearance);
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyAppearance(settingsRef.current.appearance);
    media.addEventListener('change', onChange);
    applyAppearance(settings.appearance);
    return () => media.removeEventListener('change', onChange);
  }, [settings.appearance]);

  const markSaved = useCallback(() => {
    setSaveState({ status: 'saved' });
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaveState({ status: 'idle' }), 2200);
  }, []);

  const persist = useCallback(
    (next: Settings) => {
      if (!uid) return;
      setSaveState({ status: 'saving' });

      writeQueue.current = writeQueue.current
        .then(async () => {
          const resolvedTheme = applyAppearance(next.appearance);
          await updateDoc(doc(db, 'users', uid), {
            settings: next,
            ...legacyMirror(next, resolvedTheme),
            updatedAt: serverTimestamp(),
          });

          // Best-effort mirror for jobs that run outside Firestore.
          getSupabase()
            .from('users')
            .update({
              settings: next as never,
              theme: resolvedTheme,
              updated_at: new Date().toISOString(),
            })
            .eq('id', uid)
            .then(({ error: mirrorError }) => {
              if (mirrorError) console.warn('Settings saved locally but not mirrored:', mirrorError.message);
            });

          setError(null);
          markSaved();
        })
        .catch((writeError: unknown) => {
          const message =
            writeError instanceof Error ? writeError.message : 'Could not save your settings.';
          setError(message);
          setSaveState({ status: 'error', message });
        });
    },
    [markSaved, uid],
  );

  /** Apply an immutable settings update and persist it. */
  const updateSettings = useCallback(
    (mutator: (current: Settings) => Settings) => {
      const next = mutator(settingsRef.current);
      if (next === settingsRef.current) return;

      settingsRef.current = next;
      setSettings(next);
      applyAppearance(next.appearance);
      persist(next);
    },
    [persist],
  );

  const updateProfile = useCallback(
    async (updates: Record<string, unknown>, options: UpdateProfileOptions = {}) => {
      if (!uid) return false;
      if (!options.silent) setSaveState({ status: 'saving' });

      try {
        setProfile((current) => ({ ...current, ...updates }));
        await updateDoc(doc(db, 'users', uid), {
          ...updates,
          updatedAt: serverTimestamp(),
        });

        const columns: Record<string, unknown> = {};
        for (const [field, column] of Object.entries(PROFILE_COLUMNS)) {
          if (updates[field] !== undefined) columns[column] = updates[field];
        }
        if (Object.keys(columns).length > 0) {
          columns.updated_at = new Date().toISOString();
          const { error: mirrorError } = await getSupabase()
            .from('users')
            .update(columns as never)
            .eq('id', uid);
          if (mirrorError) console.warn('Profile saved locally but not mirrored:', mirrorError.message);
        }

        setError(null);
        if (!options.silent) markSaved();
        return true;
      } catch (writeError) {
        const message =
          writeError instanceof Error ? writeError.message : 'Could not save your changes.';
        setError(message);
        setSaveState({ status: 'error', message });
        return false;
      }
    },
    [markSaved, uid],
  );

  const clearSaveState = useCallback(() => setSaveState({ status: 'idle' }), []);

  return {
    uid,
    profile,
    settings,
    loading,
    error,
    setError,
    saveState,
    resolvedTheme: resolveTheme(settings.appearance.theme),
    updateSettings,
    updateProfile,
    clearSaveState,
  };
}
