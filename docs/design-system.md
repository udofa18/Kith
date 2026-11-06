# Kith Design System

The product follows one warm, human design language: **ink, cream, coral, and a small cast of
accent colours**. This document is the source of truth for tokens, primitives, and adoption.

Live reference: `/design-system`

## Principles

1. **Warm, not loud.** Ink canvas, cream type, coral action. Accent colours appear in small doses.
2. **One loud thing.** A surface gets one primary action; supporting actions are quiet.
3. **Tokens before hex.** Product UI uses semantic tokens. Raw hex belongs only in tokens or brand illustration.
4. **Reuse before restyle.** Reach for `src/components/ui` before writing new control styles.
5. **Both themes.** Every surface must hold its shape and contrast in dark and light mode.

## Tokens

Tokens live in `src/design-system/tokens.css` and are exposed to Tailwind in `src/index.css`.

### Brand palette (fixed)

| Token | Value | Use |
| --- | --- | --- |
| `--ds-brand-ink` | `#0e0b13` | Deep canvas |
| `--ds-brand-ink-soft` | `#15101d` | Surface |
| `--ds-brand-ink-raised` | `#211a28` | Raised surface / editorial panels |
| `--ds-brand-cream` | `#f7f2e8` | Type on ink |
| `--ds-brand-coral` | `#ff6b4a` | Primary action |
| `--ds-brand-amber` | `#ffb65c` | Warm highlight |
| `--ds-brand-lilac` | `#b69cff` | Secondary highlight |
| `--ds-brand-mint` | `#82e6c8` | Success / presence |
| `--ds-brand-blush` | `#f3a6c9` | Editorial accent |
| `--ds-brand-sky` | `#9ad8ff` | Info / messages |

### Semantic tokens (theme-aware)

Use these through Tailwind utilities.

| Utility | Token | Notes |
| --- | --- | --- |
| `bg-background` / `text-foreground` | `--ds-background` / `--ds-foreground` | Page base |
| `bg-surface` | `--ds-surface` | Standard card and rail |
| `bg-surface-raised` | `--ds-surface-raised` | Dialog, popover, elevated card |
| `bg-muted` | `--ds-muted` | Quiet fill / hover |
| `text-muted-foreground` | `--ds-muted-foreground` | Secondary copy |
| `text-faint` | `--ds-faint` | Metadata and placeholders |
| `border-border` | `--ds-border` | Default dividers |
| `bg-primary` / `text-primary` | `--ds-primary` | Main action / emphasis |
| `bg-accent` | `--ds-accent` | Warm highlight |
| `bg-destructive` | `--ds-destructive` | Destructive actions |
| `bg-success`, `bg-warning`, `bg-info` | — | Status tones |
| `ring-ring` | `--ds-ring` | Keyboard focus |

Do not hard-code `#0e0b13`, `#f7f2e8`, or `#ff6b4a` in product UI. Use the token-backed utility.

### Shape, depth, motion

- `rounded-control` — buttons, inputs, compact chips
- `rounded-card` — cards and rails
- `rounded-panel` — dialogs and large sheets
- `rounded-pill` / `rounded-full` — capsules and avatars
- `shadow-soft` / `shadow-lift` / `shadow-float` — three elevation steps
- Motion: 150 ms state, 200 ms controls, 320 ms surfaces, `--ds-ease-out`

## Typography

- `font-serif` — Instrument Serif. Editorial headlines and one italic emphasis.
- `font-display` — Space Grotesk. Product headings, titles, numerals.
- `font-sans` — Plus Jakarta Sans. Body copy.
- `font-mono` — JetBrains Mono. Code and token names.

Keep body copy at 14–16 px with relaxed leading. Don't use serif for controls.

## Components

Import from `src/components/ui`:

```tsx
import { Avatar, Badge, Button, Card, CardHeader, CardTitle, Field, Input } from './components/ui';
```

### Button

```tsx
<Button>Create post</Button>
<Button variant="secondary">Preview</Button>
<Button variant="ghost" size="icon" aria-label="Close"><X size={16} /></Button>
<Button variant="danger" loading={deleting}>Delete</Button>
```

Variants: `primary`, `secondary`, `outline`, `ghost`, `soft`, `danger`, `link`.
Sizes: `sm`, `md`, `lg`, `icon`, `icon-sm`.

One primary action per surface. Use danger only for irreversible actions.

### Field + Input

```tsx
<Field label="Email" hint="We'll only use this for account notices.">
  <Input type="email" placeholder="you@example.com" />
</Field>

<Field label="Email" error="That address is already in use.">
  <Input type="email" invalid />
</Field>
```

`Input`, `Textarea`, and `Select` share the same surface, radius, and focus ring.

### Card

```tsx
<Card variant="elevated">
  <CardHeader>
    <CardTitle>Open brief</CardTitle>
    <CardDescription>Six days left.</CardDescription>
  </CardHeader>
  <CardContent>…</CardContent>
  <CardFooter>…</CardFooter>
</Card>
```

Variants: `default`, `elevated`, `outline`, `ghost`.

### Badge

```tsx
<Badge variant="primary" dot>Open brief</Badge>
<Badge variant="success">Verified</Badge>
```

Variants: `neutral`, `primary`, `success`, `warning`, `danger`, `info`.

### Dialog

`Dialog` handles the portal, backdrop, Escape, scroll lock, focus return, and footer layout.

```tsx
<Dialog
  open={open}
  onClose={close}
  title="Leave this circle?"
  description="You can come back with a new invite."
  footer={<><Button variant="ghost" onClick={close}>Stay</Button><Button variant="danger">Leave</Button></>}
>
  …
</Dialog>
```

Destructive confirmations should use `ConfirmModal` (with variants) or `ConfirmDialog`, both of
which compose `Dialog` + `Button`.

### Other primitives

- `Avatar` — photo, deterministic fallback, presence dot, optional ring.
- `EmptyState` — icon, title, description, single action.
- `Skeleton` — loading placeholder with the shared muted fill.
- `PageHeader` — sticky back header.
- `RailSection` / `RailRow` — feed side-rail card and rows.

## Adoption checklist

When touching a surface:

1. Replace raw background/border/text hex with semantic utilities.
2. Replace bespoke buttons with `Button`.
3. Wrap form controls in `Field` and use `Input` / `Textarea` / `Select`.
4. Replace ad-hoc panels with `Card`.
5. Use `Badge` for status, not coloured text alone.
6. Check the surface in both dark and light mode at 360 px, 768 px, and desktop.
7. Keep the one-primary-action rule.

## Current status

- [x] Token layer + Tailwind mapping
- [x] Core primitives: Button, Input/Field, Card, Badge, Avatar, Dialog, EmptyState, Skeleton
- [x] ConfirmModal, PageHeader, RailSection now compose primitives
- [x] Living reference at `/design-system`
- [x] Journal surfaces: discovery, card system, reader and composer migrated
- [ ] Migrate legacy page-level controls incrementally (feed composer, marketplace filters, settings forms)
- [ ] Remove the broad `html.light .text-white` override once legacy pages use semantic tokens

## Journal patterns

The article surfaces are the reference implementation for an editorial slice inside the product.

- **Article art** — `components/articles/ArticleCover` shows an authored photo when one exists and
  otherwise draws a deterministic, category-tinted illustration. Missing covers never leave a hole,
  and category colour stays in the illustration rather than the chrome.
- **Article card** — `ArticleCard` has four compositions: `default` (feed row), `grid` (related),
  `featured` (editor's pick) and `compact` (rails). All share the same border, radius, hover lift,
  avatar, metadata and save affordance.
- **Discovery** — `/articles` uses a search field, sort segmented control, difficulty and topic
  chips, curated shelves, a sticky filter bar and a trending/topics/voices rail. The feed uses flat
  divider rows; only the featured story and related grid are card-shaped. Filters are applied
  client-side over the latest page so no extra composite indexes are required.
- **Reader** — `/article/:id` adds reading progress, a heading-derived table of contents, text-size
  controls, persistent likes/bookmarks, author follow, comments, related stories, and a warm
  editorial header with a serif headline and a drop cap. The contents rail is an independent sticky
  gutter outside the centered reading column; it only appears when the surface is wide enough.
- **Composer** — `/write` is a two-column studio: cover picker with presets/upload, title and
  subtitle, tags, rich-text body, publishing controls, readiness checklist, and live search/social
  previews for the metadata it saves. Images prompt for alt text and an optional caption; captions
  render as `<figcaption>` in the reader.
- **SEO** — the reader emits canonical, robots, Open Graph, Twitter and `BlogPosting` +
  `BreadcrumbList` JSON-LD. The journal index emits `CollectionPage` + `ItemList`. Drafts are
  `noindex`. `/sitemap.xml` and `/rss.xml` are served by `api/sitemap.ts` and `api/rss.ts` from the
  published-article feed.

When extending the journal, keep using the shared primitives. The only intentional raw colours are
inside generated cover illustrations, photo overlays and the code block surface.
