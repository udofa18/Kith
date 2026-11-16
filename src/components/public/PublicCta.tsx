import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useCurrentUser } from '../../contexts/CurrentUserContext';

/**
 * Closing call to action for public pages.
 *
 * The public site never opens the app for you: this is the one door in. Members
 * land on their feed, everyone else lands on sign-up.
 */
export default function PublicCta({
  eyebrow = 'Open Kith',
  title,
  body,
  secondary,
}: {
  eyebrow?: string;
  title: ReactNode;
  body?: string;
  secondary?: { label: string; to: string };
}) {
  const user = useCurrentUser();

  return (
    <section className="mx-auto max-w-[1240px] px-5 pb-24 pt-4 md:px-8">
      <div className="relative overflow-hidden rounded-[32px] border border-[#ffffff12] bg-[#141019] px-6 py-12 text-center md:px-12 md:py-16">
        <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.16),transparent_70%)] blur-2xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.14),transparent_70%)] blur-2xl" />

        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#ffb65c]">{eyebrow}</p>
          <h2 className="mx-auto mt-4 max-w-[22ch] font-display text-3xl font-semibold leading-[1.02] tracking-[-0.05em] text-[#f7f2e8] sm:text-4xl md:text-[2.75rem]">
            {title}
          </h2>
          {body && (
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#f7f2e8]/50 sm:text-base">
              {body}
            </p>
          )}

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to={user ? '/feed' : '/login?mode=signup'}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#f7f2e8] px-6 py-3.5 text-sm font-bold text-[#171120] transition-transform hover:-translate-y-0.5"
            >
              {user ? 'Open Kith' : 'Join Kith'}
              <ArrowUpRight
                size={16}
                className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>
            {secondary && (
              <Link
                to={secondary.to}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#ffffff1c] px-6 py-3.5 text-sm font-semibold text-[#f7f2e8]/70 transition-colors hover:border-[#ffffff3d] hover:text-[#f7f2e8]"
              >
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
