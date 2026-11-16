import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import KithLogo from '../KithLogo';
import { useCurrentUser } from '../../contexts/CurrentUserContext';

/**
 * The public header used by the landing page and every discovery page.
 *
 * The one primary action is "Open Kith": it carries signed-out visitors to
 * sign-up, and signed-in visitors straight into the app. Discovery pages stay
 * in this shell, so nobody lands in the app chrome (sidebar, channels) from a
 * marketing page.
 */
export const PUBLIC_NAV_LINKS = [
  { label: 'Communities', to: '/communities' },
  { label: 'Events', to: '/events' },
  { label: 'Marketplace', to: '/marketplace' },
  { label: 'Journal', to: '/articles' },
];

export function openKithHref(user: any): string {
  return user ? '/feed' : '/login?mode=signup';
}

export default function PublicNav() {
  const [open, setOpen] = useState(false);
  const user = useCurrentUser();
  const openKith = openKithHref(user);

  return (
    <header className="sticky top-0 z-50 border-b border-[#ffffff0d] bg-[#0e0b13]/82 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center gap-8 px-5 md:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-[#f7f2e8]">
            <KithLogo size={30} />
          </span>
          <span className="font-display text-[22px] font-semibold tracking-[-0.05em] text-[#f7f2e8]">
            kith
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Explore Kith">
          {PUBLIC_NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className="text-sm text-[#f7f2e8]/55 transition-colors hover:text-[#f7f2e8]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {!user && (
            <Link
              to="/login"
              className="rounded-full px-4 py-2 text-sm text-[#f7f2e8]/60 transition-colors hover:text-[#f7f2e8]"
            >
              Sign in
            </Link>
          )}
          <Link
            to={openKith}
            className="group inline-flex items-center gap-2 rounded-full bg-[#f7f2e8] px-5 py-2.5 text-sm font-semibold text-[#171120] transition-transform hover:-translate-y-0.5"
          >
            Open Kith
            <ArrowUpRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="ml-auto grid h-10 w-10 place-items-center rounded-full border border-[#ffffff14] text-[#f7f2e8] md:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="overflow-hidden border-t border-[#ffffff0d] md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4">
              {PUBLIC_NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm text-[#f7f2e8]/70 transition-colors hover:bg-[#ffffff08] hover:text-[#f7f2e8]"
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-[#ffffff16] px-4 py-2.5 text-center text-sm text-[#f7f2e8]/70"
                >
                  Sign in
                </Link>
                <Link
                  to={openKith}
                  onClick={() => setOpen(false)}
                  className="rounded-full bg-[#f7f2e8] px-4 py-2.5 text-center text-sm font-semibold text-[#171120]"
                >
                  Open Kith
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
