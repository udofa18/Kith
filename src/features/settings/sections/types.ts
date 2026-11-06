import type { Settings } from '../types';

export interface SectionProps {
  settings: Settings;
  update: (mutator: (current: Settings) => Settings) => void;
  profile: Record<string, any> | null;
  updateProfile: (
    updates: Record<string, unknown>,
    options?: { silent?: boolean; message?: string },
  ) => Promise<boolean>;
  onNavigate: (id: string) => void;
}

export const setProfile = (
  update: SectionProps['update'],
  value: Settings['profile']['visibility'],
) =>
  update((current) => ({
    ...current,
    profile: { ...current.profile, visibility: value },
  }));
