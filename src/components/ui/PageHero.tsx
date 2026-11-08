import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Full-bleed editorial hero used at the top of major discovery pages
 * (marketplace, communities, events, articles).
 *
 * It intentionally stays dark in both themes — an ink band with warm coral /
 * lilac light — so the page's content below reads as a separate surface.
 * Pass `visual` for a bespoke composition, `image` for 3D artwork, or `icon`
 * for a lightweight branded motif.
 */
export default function PageHero({
  image,
  visual,
  icon,
  eyebrow,
  title,
  titleClassName,
  description,
  actions,
  children,
  containerClassName,
}: {
  /** Optional artwork, right-aligned and blended into the ink background. */
  image?: string;
  /** Bespoke decorative composition for the right side (overrides image/icon). */
  visual?: ReactNode;
  /** Fallback motif shown on the right when no artwork is supplied. */
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  titleClassName?: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Extra full-width content under the headline (search, stats, filters). */
  children?: ReactNode;
  containerClassName?: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-[var(--ds-brand-ink)] text-[var(--ds-brand-cream)]">
      {visual ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[46%] items-center justify-center md:flex"
        >
          {visual}
        </div>
      ) : image ? (
        <img
          src={image}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-full object-cover object-right opacity-40 md:opacity-100"
        />
      ) : (
        icon && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] items-center justify-center md:flex"
          >
            <div className="relative flex h-[22rem] w-[22rem] items-center justify-center">
              <div className="absolute h-[20rem] w-[20rem] rounded-full border border-white/10" />
              <div className="absolute h-[14rem] w-[14rem] rounded-full border border-white/10" />
              <div className="absolute h-[22rem] w-[22rem] rounded-full bg-primary/15 blur-3xl" />
              <div className="landing-float relative flex h-32 w-32 items-center justify-center rounded-[2rem] border border-white/15 bg-[var(--ds-brand-ink-raised)]/85 text-primary shadow-[0_30px_90px_-20px_rgba(255,107,74,0.5)] backdrop-blur">
                {icon}
              </div>
              <span className="absolute left-10 top-12 h-3 w-3 rounded-full bg-primary shadow-[0_0_28px_rgba(255,107,74,0.85)]" />
              <span className="absolute right-8 top-24 h-2.5 w-2.5 rounded-full bg-[var(--ds-brand-lilac)] shadow-[0_0_22px_rgba(182,156,255,0.85)]" />
              <span className="absolute bottom-12 left-20 h-2 w-2 rounded-full bg-[var(--ds-brand-mint)] shadow-[0_0_18px_rgba(130,230,200,0.8)]" />
            </div>
          </div>
        )
      )}

      {/* Warm light + texture, consistent with the marketplace hero. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            'radial-gradient(circle at 82% 4%, color-mix(in oklab, var(--ds-brand-coral) 22%, transparent), transparent 45%), radial-gradient(circle at 96% 78%, color-mix(in oklab, var(--ds-brand-lilac) 20%, transparent), transparent 44%), radial-gradient(circle at 55% 120%, color-mix(in oklab, var(--ds-brand-amber) 12%, transparent), transparent 50%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(to_right,rgba(247,242,232,0.5)_1px,transparent_1px),linear-gradient(to_bottom,rgba(247,242,232,0.5)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_70%_40%,#000,transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--ds-brand-ink)] via-[var(--ds-brand-ink)]/85 to-transparent md:via-[var(--ds-brand-ink)]/60"
      />

      <div
        className={cn(
          'relative mx-auto px-5 pb-11 pt-11 sm:px-8 sm:pb-14 sm:pt-14',
          containerClassName,
        )}
      >
        <div className="relative z-10 max-w-2xl space-y-4">
          {eyebrow && <div>{eyebrow}</div>}
          <h1
            className={cn(
              'font-display text-4xl font-extrabold tracking-tight md:text-5xl',
              titleClassName,
            )}
          >
            {title}
          </h1>
          {description && (
            <div className="max-w-xl text-sm leading-relaxed text-[var(--ds-brand-cream)]/70 sm:text-base">
              {description}
            </div>
          )}
          {actions && (
            <div className="flex flex-wrap items-center gap-2.5 pt-2">{actions}</div>
          )}
        </div>

        {children && <div className="relative z-10 mt-8">{children}</div>}
      </div>
    </section>
  );
}
