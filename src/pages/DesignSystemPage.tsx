import { useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Compass,
  Moon,
  Palette,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardEyebrow,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '../components/ui';
import KithStamp from '../components/KithStamp';

/* -------------------------------------------------------------------------- */

function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight tracking-[-0.045em] text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Swatch({
  name,
  token,
  className,
  darkText = false,
}: {
  name: string;
  token: string;
  className: string;
  darkText?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className={`h-16 ${className}`} />
      <div className="px-3 py-2.5">
        <p className="text-xs font-semibold text-foreground">{name}</p>
        <p className={`mt-0.5 font-mono text-[9px] ${darkText ? 'text-muted-foreground' : 'text-faint'}`}>
          {token}
        </p>
      </div>
    </div>
  );
}

const brandColors = [
  { name: 'Ink', token: '--ds-brand-ink', className: 'bg-ink' },
  { name: 'Ink soft', token: '--ds-brand-ink-soft', className: 'bg-ink-soft' },
  { name: 'Ink raised', token: '--ds-brand-ink-raised', className: 'bg-ink-raised' },
  { name: 'Cream', token: '--ds-brand-cream', className: 'bg-cream' },
  { name: 'Coral', token: '--ds-brand-coral', className: 'bg-coral' },
  { name: 'Amber', token: '--ds-brand-amber', className: 'bg-amber' },
  { name: 'Lilac', token: '--ds-brand-lilac', className: 'bg-lilac' },
  { name: 'Mint', token: '--ds-brand-mint', className: 'bg-mint' },
  { name: 'Blush', token: '--ds-brand-blush', className: 'bg-blush' },
  { name: 'Sky', token: '--ds-brand-sky', className: 'bg-sky' },
];

const semanticColors = [
  { name: 'Background', token: '--ds-background', className: 'bg-background' },
  { name: 'Surface', token: '--ds-surface', className: 'bg-surface' },
  { name: 'Surface raised', token: '--ds-surface-raised', className: 'bg-surface-raised' },
  { name: 'Muted', token: '--ds-muted', className: 'bg-muted' },
  { name: 'Primary', token: '--ds-primary', className: 'bg-primary' },
  { name: 'Accent', token: '--ds-accent', className: 'bg-accent' },
  { name: 'Success', token: '--ds-success', className: 'bg-success' },
  { name: 'Info', token: '--ds-info', className: 'bg-info' },
  { name: 'Warning', token: '--ds-warning', className: 'bg-warning' },
  { name: 'Destructive', token: '--ds-destructive', className: 'bg-destructive' },
];

const navItems = [
  { href: '#foundations', label: 'Foundations' },
  { href: '#color', label: 'Color' },
  { href: '#type', label: 'Type' },
  { href: '#components', label: 'Components' },
  { href: '#patterns', label: 'Patterns' },
];

/* -------------------------------------------------------------------------- */

export default function DesignSystemPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [light, setLight] = useState(() =>
    typeof document === 'undefined' ? false : document.documentElement.classList.contains('light'),
  );

  const toggleTheme = () => {
    const next = !light;
    setLight(next);
    localStorage.setItem('theme', next ? 'light' : 'dark');
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(next ? 'light' : 'dark');
    document.documentElement.style.colorScheme = next ? 'light' : 'dark';
  };

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-full bg-background pb-16 text-foreground">
      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-panel border border-border bg-surface px-6 py-8 shadow-soft sm:px-9 sm:py-10">
          <div className="pointer-events-none absolute -right-14 -top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.28),transparent_68%)] blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-14 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.2),transparent_70%)] blur-2xl" />

          <div className="relative flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-[54ch]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary" dot className="whitespace-nowrap">
                  Living system
                </Badge>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
                  v1 · warm product language
                </span>
              </div>
              <h1 className="mt-4 font-display text-[clamp(2.1rem,5vw,3.4rem)] font-semibold leading-[0.96] tracking-[-0.06em] text-foreground">
                Kith, made
                <br />
                <span className="font-serif font-normal italic text-primary">consistent.</span>
              </h1>
              <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
                One warm ink-and-cream system for every surface: tokens, type, controls and
                patterns that keep the product feeling like the same place — from the feed to the
                studio.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button leftIcon={<Palette size={16} />} onClick={() => jump('color')}>
                  Start with tokens
                </Button>
                <Button
                  variant="outline"
                  leftIcon={<Compass size={16} />}
                  onClick={() => jump('components')}
                >
                  Explore components
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 sm:justify-end">
              <KithStamp className="h-16 w-16 sm:h-24 sm:w-24" />
              <Button
                variant="outline"
                size="icon"
                onClick={toggleTheme}
                aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
                title={light ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {light ? <Moon size={17} /> : <Sun size={17} />}
              </Button>
            </div>
          </div>
        </header>

        {/* Quick nav */}
        <nav
          aria-label="Design system sections"
          className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-surface p-1.5"
        >
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <main className="mt-10 space-y-14">
          {/* Foundations */}
          <Section
            id="foundations"
            eyebrow="01 · Foundations"
            title="Ink, cream, and a little warmth."
            description="The base is a low-lit ink canvas with cream type. Coral is the action colour; amber, lilac, mint, blush and sky carry personality in small doses. Everything else is a quiet surface."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card variant="elevated" className="p-4">
                <CardEyebrow>Radius</CardEyebrow>
                <div className="mt-3 flex items-end gap-2">
                  <span className="h-10 w-10 rounded-control bg-primary/15 ring-1 ring-primary/25" title="rounded-control" />
                  <span className="h-10 w-10 rounded-card bg-primary/15 ring-1 ring-primary/25" title="rounded-card" />
                  <span className="h-10 w-10 rounded-panel bg-primary/15 ring-1 ring-primary/25" title="rounded-panel" />
                  <span className="h-10 w-10 rounded-full bg-primary/15 ring-1 ring-primary/25" title="rounded-full" />
                </div>
                <p className="mt-3 font-mono text-[9px] text-faint">control · card · panel · pill</p>
              </Card>
              <Card variant="elevated" className="p-4">
                <CardEyebrow>Elevation</CardEyebrow>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <span className="h-10 rounded-xl bg-surface-raised shadow-soft" />
                  <span className="h-10 rounded-xl bg-surface-raised shadow-lift" />
                  <span className="h-10 rounded-xl bg-surface-raised shadow-float" />
                </div>
                <p className="mt-3 font-mono text-[9px] text-faint">soft · lift · float</p>
              </Card>
              <Card variant="elevated" className="p-4">
                <CardEyebrow>Motion</CardEyebrow>
                <p className="mt-2 text-sm font-semibold text-foreground">Arrive softly.</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  150 ms for state, 200 ms for controls, 320 ms for surfaces.
                </p>
                <p className="mt-3 font-mono text-[9px] text-faint">--ds-ease-out</p>
              </Card>
              <Card variant="elevated" className="p-4">
                <CardEyebrow>Spacing</CardEyebrow>
                <div className="mt-3 flex items-end gap-1">
                  {[8, 12, 16, 24, 32].map((size) => (
                    <span
                      key={size}
                      className="rounded-sm bg-primary/25"
                      style={{ width: size / 2, height: size }}
                    />
                  ))}
                </div>
                <p className="mt-3 font-mono text-[9px] text-faint">4 · 8 · 12 · 16 · 24 · 32</p>
              </Card>
            </div>
          </Section>

          {/* Color */}
          <Section
            id="color"
            eyebrow="02 · Color"
            title="A palette that feels lived in."
            description="Brand colours are fixed. Semantic colours adapt between the dark ink theme and the warm cream light theme, so components never hard-code a surface."
          >
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {brandColors.map((color) => (
                <Swatch key={color.token} {...color} />
              ))}
            </div>

            <div className="mt-7 flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Semantic tokens
              </p>
              <span className="h-px flex-1 bg-border" />
              <Badge variant="neutral">{light ? 'Light theme' : 'Dark theme'}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {semanticColors.map((color) => (
                <Swatch key={color.token} {...color} />
              ))}
            </div>

            <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Try the other theme.</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Components should hold their shape and contrast in both.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={light ? <Moon size={14} /> : <Sun size={14} />}
                onClick={toggleTheme}
              >
                Switch to {light ? 'dark' : 'light'}
              </Button>
            </Card>
          </Section>

          {/* Typography */}
          <Section
            id="type"
            eyebrow="03 · Typography"
            title="Editorial headlines, plain-spoken body."
            description="Instrument Serif is the voice. Space Grotesk gives structure to product UI. Plus Jakarta Sans keeps long reads comfortable. JetBrains Mono marks code and token names."
          >
            <Card className="divide-y divide-border">
              <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-baseline sm:justify-between">
                <p className="font-serif text-[clamp(2rem,5vw,3rem)] leading-none text-foreground">
                  Make room for your people.
                </p>
                <code className="shrink-0 font-mono text-[10px] text-faint">font-serif · 48/1</code>
              </div>
              <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-baseline sm:justify-between">
                <p className="font-display text-[clamp(1.5rem,4vw,2.1rem)] font-semibold leading-tight tracking-[-0.05em] text-foreground">
                  A calmer place to make things together.
                </p>
                <code className="shrink-0 font-mono text-[10px] text-faint">font-display · 32/1.1</code>
              </div>
              <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-baseline sm:justify-between">
                <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
                  Body copy is Plus Jakarta Sans at 14–16 px with generous line height. It stays out
                  of the way and keeps dense product surfaces readable.
                </p>
                <code className="shrink-0 font-mono text-[10px] text-faint">font-sans · 14/1.6</code>
              </div>
              <div className="flex flex-wrap items-center gap-2 p-5">
                <Badge variant="primary">Coral</Badge>
                <Badge variant="success">Mint</Badge>
                <Badge variant="info">Sky</Badge>
                <Badge variant="warning">Amber</Badge>
                <Badge variant="danger">Ember</Badge>
                <code className="ml-auto font-mono text-[10px] text-faint">Badge · 5 tones</code>
              </div>
            </Card>
          </Section>

          {/* Components */}
          <Section
            id="components"
            eyebrow="04 · Components"
            title="Small pieces, one grammar."
            description="Every control shares the same radius, focus ring, motion and surface. Import from `src/components/ui` and compose — don't restyle from scratch."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Buttons */}
              <Card>
                <CardHeader>
                  <CardEyebrow>Button</CardEyebrow>
                  <CardTitle>Actions with a clear hierarchy.</CardTitle>
                  <CardDescription>
                    Primary for the one next step. Secondary or outline for support. Ghost in
                    toolbars. Danger only when something is destructive.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Button leftIcon={<Sparkles size={15} />}>Create post</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="soft">Soft</Button>
                  <Button variant="danger">Delete</Button>
                </CardContent>
                <CardFooter className="flex-wrap">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon" variant="outline" aria-label="Notifications">
                    <Bell size={16} />
                  </Button>
                  <Button loading>Loading</Button>
                </CardFooter>
              </Card>

              {/* Fields */}
              <Card>
                <CardHeader>
                  <CardEyebrow>Fields</CardEyebrow>
                  <CardTitle>Inputs that explain themselves.</CardTitle>
                  <CardDescription>
                    Always pair a control with a label. Hints guide; errors say what to fix.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3.5">
                  <Field label="Display name" hint="This is how people will find you.">
                    <Input placeholder="Maya Chen" />
                  </Field>
                  <Field label="Email" error="Use the email linked to your account.">
                    <Input type="email" placeholder="you@example.com" invalid />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Role">
                      <Select defaultValue="maker">
                        <option value="maker">Maker</option>
                        <option value="host">Host</option>
                        <option value="collector">Collector</option>
                      </Select>
                    </Field>
                    <Field label="Availability" optional>
                      <Input placeholder="Open to work" />
                    </Field>
                  </div>
                  <Field label="A little about you" hint="A sentence is plenty.">
                    <Textarea placeholder="I make small tools and loud playlists." />
                  </Field>
                </CardContent>
              </Card>

              {/* Card sample */}
              <Card variant="elevated" className="overflow-hidden">
                <div className="relative h-32 overflow-hidden bg-[radial-gradient(circle_at_25%_20%,rgba(255,107,74,0.55),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(182,156,255,0.5),transparent_55%),#211a28]">
                  <KithStamp className="absolute bottom-3 right-3 h-12 w-12 opacity-80" />
                  <Badge variant="primary" className="absolute left-3 top-3">
                    Open brief
                  </Badge>
                </div>
                <CardHeader>
                  <CardEyebrow>Bounty · 6 days left</CardEyebrow>
                  <CardTitle>Design a welcome ritual for a small circle.</CardTitle>
                  <CardDescription>
                    A warm, repeatable way for new members to meet three people in their first week.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar seed="maya" size={24} status="online" />
                    <span className="text-[11px] font-semibold text-muted-foreground">Maya Chen</span>
                  </div>
                  <Button variant="soft" size="sm" rightIcon={<ArrowUpRight size={13} />}>
                    View brief
                  </Button>
                </CardFooter>
              </Card>

              {/* Empty + skeleton */}
              <div className="space-y-3">
                <EmptyState
                  icon={<Users size={20} />}
                  title="No circles yet."
                  description="Join a circle and it will live here, with its people and its quiet corners."
                  action={
                    <Button variant="soft" size="sm" rightIcon={<ChevronRight size={13} />}>
                      Browse circles
                    </Button>
                  }
                />
                <Card className="p-4">
                  <CardEyebrow>Loading state</CardEyebrow>
                  <div className="mt-3 flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-2/5" />
                      <Skeleton className="h-2.5 w-3/5" />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Skeleton className="h-2.5 w-full" />
                    <Skeleton className="h-2.5 w-4/5" />
                  </div>
                </Card>
              </div>

              {/* Avatars + badge */}
              <Card>
                <CardHeader>
                  <CardEyebrow>Avatar & status</CardEyebrow>
                  <CardTitle>People first.</CardTitle>
                  <CardDescription>
                    Deterministic fallbacks mean a missing photo never breaks a surface.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-4">
                  <Avatar seed="maya" size={56} status="online" ring />
                  <Avatar seed="noah" size={44} status="away" />
                  <Avatar seed="lina" size={36} status="busy" />
                  <Avatar seed="sol" size={28} status="offline" />
                  <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1">
                    <Check size={12} className="text-success" />
                    <span className="text-[10px] font-semibold text-muted-foreground">Verified</span>
                  </div>
                </CardContent>
              </Card>

              {/* Dialog */}
              <Card className="flex flex-col justify-between">
                <CardHeader>
                  <CardEyebrow>Dialog</CardEyebrow>
                  <CardTitle>Ask once, clearly.</CardTitle>
                  <CardDescription>
                    A focused surface for decisions. Escape and backdrop close; focus returns to
                    where it came from.
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button variant="secondary" onClick={() => setDialogOpen(true)}>
                    Open dialog
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </Section>

          {/* Patterns */}
          <Section
            id="patterns"
            eyebrow="05 · Patterns"
            title="How the pieces go together."
            description="Use these recipes when a surface needs to feel native without inventing new chrome."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  title: 'A quiet page',
                  body: 'Background → Section heading → Card with border + soft shadow. No more than one primary action per card.',
                  icon: <Palette size={16} />,
                },
                {
                  title: 'A person',
                  body: 'Avatar + name + a single line of context. Use a badge for status, never more than two tones at once.',
                  icon: <Users size={16} />,
                },
                {
                  title: 'A decision',
                  body: 'Dialog with a verb title, one sentence of consequence, then a ghost cancel and a primary confirm.',
                  icon: <Bell size={16} />,
                },
              ].map((pattern) => (
                <Card key={pattern.title} className="p-4">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12 text-primary">
                    {pattern.icon}
                  </span>
                  <p className="mt-3 font-display text-sm font-semibold tracking-[-0.02em] text-foreground">
                    {pattern.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{pattern.body}</p>
                </Card>
              ))}
            </div>

            <Card variant="outline" className="mt-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardEyebrow>Rules of thumb</CardEyebrow>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                    <li>• Use semantic tokens, never raw hex, in product UI.</li>
                    <li>• Let one thing be loud. Everything else stays quiet.</li>
                    <li>• Prefer a border and a soft shadow to a heavy gradient panel.</li>
                    <li>• Reach for the shared primitive before writing new control styles.</li>
                  </ul>
                </div>
                <Badge variant="success" dot>
                  Ready to adopt
                </Badge>
              </div>
            </Card>
          </Section>
        </main>

        <footer className="mt-14 flex flex-col items-center justify-between gap-2 border-t border-border pt-6 text-center sm:flex-row sm:text-left">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-faint">
            Kith · make room for your people
          </p>
          <p className="text-[11px] text-muted-foreground">
            Tokens live in <code className="font-mono text-primary">src/design-system/tokens.css</code>
          </p>
        </footer>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Leave this circle?"
        description="You can come back any time, but you will need a new invite."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Stay
            </Button>
            <Button variant="danger" onClick={() => setDialogOpen(false)}>
              Leave circle
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
            <Users size={20} />
          </span>
          <p className="pt-1 text-sm leading-relaxed text-muted-foreground">
            Your posts stay in the circle, but your profile will no longer appear in the member
            list.
          </p>
        </div>
      </Dialog>
    </div>
  );
}
