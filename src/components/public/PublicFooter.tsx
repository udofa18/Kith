import { Link } from 'react-router-dom';
import KithLogo from '../KithLogo';
import { useCurrentUser } from '../../contexts/CurrentUserContext';

const FACES = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&crop=faces&w=80&h=80&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&crop=faces&w=80&h=80&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&crop=faces&w=80&h=80&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&crop=faces&w=80&h=80&q=80',
];

/**
 * Public footer for the landing page and discovery pages.
 *
 * Kept intentionally free of a copyright bar: the page ends on the things
 * someone can actually do next.
 */
export default function PublicFooter() {
  const user = useCurrentUser();

  const explore = [
    { label: 'Communities', to: '/communities' },
    { label: 'Events', to: '/events' },
    { label: 'Marketplace', to: '/marketplace' },
    { label: 'Journal', to: '/articles' },
  ];

  const start = [
    { label: 'Join Kith', to: '/login?mode=signup' },
    { label: 'Sign in', to: '/login' },
    { label: 'Create a community', to: user ? '/feed?view=communities' : '/login?mode=signup' },
    { label: 'Sell your work', to: user ? '/upload' : '/login?mode=signup' },
  ];

  const columns = [
    { title: 'Explore', links: explore },
    { title: 'Get started', links: start },
  ];

  const backToTop = () => {
    document.getElementById('top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <footer className="relative z-10 border-t border-[#ffffff0d] bg-[#0e0b13] text-[#f7f2e8]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden">
        <div className="absolute -left-24 -top-32 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.12),transparent_70%)] blur-2xl" />
        <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.1),transparent_70%)] blur-2xl" />
      </div>

      <div className="relative mx-auto max-w-[1240px] px-5 py-14 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1.4fr]">
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-[#f7f2e8]">
                <KithLogo size={30} />
              </span>
              <span className="font-display text-[22px] font-semibold tracking-[-0.05em]">kith</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#f7f2e8]/40">
              A home for communities, conversation, live rooms, events and creative work. Made for
              people who make room for others.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <div className="flex -space-x-2.5">
                {FACES.map((face) => (
                  <img
                    key={face}
                    src={face}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 shrink-0 rounded-full bg-[#2a2234] object-cover ring-2 ring-[#0e0b13]"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
              <p className="text-xs text-[#f7f2e8]/35">People are already here.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:gap-12">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f7f2e8]/30">
                  {column.title}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-sm text-[#f7f2e8]/55 transition-colors hover:text-[#f7f2e8]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-[#ffffff0d] pt-6 text-xs text-[#f7f2e8]/30 sm:flex-row sm:items-center sm:justify-between">
          <p>Made for the people who make room.</p>
          <div className="flex items-center gap-4">
            <Link to="/help" className="transition-colors hover:text-[#f7f2e8]/70">
              Help
            </Link>
            <span className="h-1 w-1 rounded-full bg-[#f7f2e8]/20" />
            <button
              type="button"
              onClick={backToTop}
              className="transition-colors hover:text-[#f7f2e8]/70"
            >
              Back to top
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
