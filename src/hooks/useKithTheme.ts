import { useEffect, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type Theme = 'dark' | 'light';

/**
 * Reads and writes the warm Kith theme, keeping the DOM and the user document
 * in sync. Shared by the desktop sidebar and the mobile "More" sheet.
 */
export function useKithTheme(user: any) {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('light')
      ? 'light'
      : 'dark',
  );

  useEffect(() => {
    // Keep internal state in sync with the root class, wherever it changes.
    const observer = new MutationObserver(() => {
      const isLight = document.documentElement.classList.contains('light');
      setTheme(isLight ? 'light' : 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = async () => {
    // Read the resolved theme from the DOM so rapid toggles never reuse stale state.
    const newTheme: Theme = document.documentElement.classList.contains('light') ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(newTheme);
    document.documentElement.style.colorScheme = newTheme;

    if (user?.uid) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          // `settings.appearance.theme` is the source of truth (see features/settings).
          // Writing only the legacy flat `theme` let the next user snapshot revert this.
          'settings.appearance.theme': newTheme,
          theme: newTheme,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error('Error updating theme:', error);
      }
    }
  };

  return { theme, toggleTheme };
}
