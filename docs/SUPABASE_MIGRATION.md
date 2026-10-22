# Firestore → Supabase Migration Guide

This project supports a phased migration from Firebase Firestore to Supabase Postgres while keeping **Firebase Auth** and **Firebase Storage**.

## Prerequisites

1. Create a [Supabase project](https://supabase.com/dashboard)
2. In **Authentication → Third-Party Auth**, add Firebase project ID: `gen-lang-client-0475896362`
3. Copy env vars to `.env` (see `.env.example`)

## 1. Apply database schema

```bash
# Link to your Supabase project
npx supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
npx supabase db push
```

Migrations live in `supabase/migrations/`:
- `20250625000000_initial_schema.sql` — tables
- `20250625000001_functions.sql` — `gift_xp`, admin helpers
- `20250625000002_rls_policies.sql` — Row Level Security
- `20250625000003_realtime.sql` — Realtime publication

## 2. Set Firebase custom claims

All users need `role: 'authenticated'` for Supabase RLS:

```bash
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json \
npx tsx scripts/set-firebase-role-claim.ts --dry-run

# Then apply:
npx tsx scripts/set-firebase-role-claim.ts
```

## 3. Export & load production data

```bash
# Export from named Firestore database
GOOGLE_APPLICATION_CREDENTIALS=... npx tsx scripts/firestore-to-postgres/export.ts

# Transform to Postgres format
npx tsx scripts/firestore-to-postgres/transform-export.ts

# Load into Supabase
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
npx tsx scripts/firestore-to-postgres/load.ts

# Validate counts
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
npx tsx scripts/firestore-to-postgres/validate.ts
```

## 4. Phased cutover

Control migration phase via `VITE_DB_PHASE`:

| Phase | Value | Behavior |
|-------|-------|----------|
| A | `firestore` | Firestore only (default legacy) |
| B | `dual_write` | Write both; read Firestore |
| C | `supabase_reads` | Write both; read Supabase |
| D | `supabase` | Supabase only |

During phase B, specific collections can read from Supabase early:

```
VITE_SUPABASE_READ_COLLECTIONS=notifications,hashtags,user_interests,user_engagement_profiles
```

Run nightly delta sync during dual-write:

```bash
npx tsx scripts/firestore-to-postgres/delta-sync.ts
```

### Final cutover checklist

1. Set `VITE_DB_PHASE=supabase_reads` — verify reads in staging
2. Run final delta sync
3. Schedule ~30 min maintenance window
4. Set `VITE_DB_PHASE=supabase`
5. Keep Firestore read-only for 2 weeks as rollback safety net

## Architecture

```
App → Firebase Auth (ID token) → Supabase Postgres (RLS)
App → Firebase Storage (unchanged)
```

Client: `src/supabase.ts` passes Firebase ID tokens via `accessToken`.
Data layer: `src/services/db/` with dual-read/dual-write via `src/lib/database-config.ts`.

## npm scripts

```bash
npm run db:export      # Export Firestore
npm run db:transform   # Transform export
npm run db:load        # Load to Supabase
npm run db:validate    # Compare counts
npm run db:delta-sync  # Nightly drift fix
npm run db:claims      # Set Firebase role claims
```
