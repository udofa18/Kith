import type { ReactNode } from 'react';
import PublicNav from './PublicNav';
import PublicFooter from './PublicFooter';

/**
 * Chrome for every public page (landing + discovery).
 *
 * Deliberately separate from the app shell: no sidebar, no mobile app tabs,
 * no community channels. Discovery pages live here and only enter the app
 * through an explicit "Open Kith" action.
 *
 * `dark` is intentional. The public surface is always warm ink, so components
 * written with `dark:` utilities keep their dark styling even when the app
 * itself is set to light.
 */
export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div
      id="top"
      className="public-shell dark min-h-full bg-[#0e0b13] text-[#f7f2e8]"
    >
      <PublicNav />
      <div>{children}</div>
      <PublicFooter />
    </div>
  );
}
