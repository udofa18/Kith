import { createContext, useContext, type ReactNode } from 'react';

/**
 * The signed-in user (Firebase auth user merged with their users/{uid} doc), kept live by App.
 * Read this instead of opening another listener on the current user's document.
 */
const CurrentUserContext = createContext<any>(null);

export function CurrentUserProvider({ user, children }: { user: any; children: ReactNode }) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export const useCurrentUser = () => useContext(CurrentUserContext);
