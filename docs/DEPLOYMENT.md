# Deployment

## Vercel function layout

All API routes are defined in one Express app, but Vercel needs one function file per directory
depth (its `[...route]` syntax matches a single segment, not a catch-all):

- `api/[...route].ts` — single-segment paths such as `/api/health`.
- `api/<dir>/[action].ts` — nested paths such as `/api/media/feed/process` and
  `/api/payments/community/reconcile`.
- `api/_lib/apiApp.ts` — the Express app with every route. These files only export it.

Vercel's Hobby plan allows at most **12 Serverless Functions per deployment**. A file per endpoint
(32 at the time of the limit being hit) failed with:

> No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.

Everything under `api/_lib` is a shared module, not an endpoint, because Vercel ignores
underscore-prefixed files and directories. Adding an endpoint means adding a route in
`api/_lib/apiApp.ts` and reusing an existing entrypoint for that path depth, **not** creating a
file per endpoint. `tests/apiRouting.test.ts` enforces both the path coverage and the limit.

`api/[...route].ts` sets `bodyParser: false`; Express parses bodies itself. This is required by the
Paystack and LiveKit webhooks, whose signatures cover the raw request bytes.

Local development uses the same app: `server.ts` calls `createApiApp()` and then mounts Vite.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | `sk_test_...` or `sk_live_...`; enables Paystack checkout. |
| `PAYSTACK_PUBLIC_KEY` | Browser key used by checkout. |
| `PAYSTACK_WEBHOOK_SECRET` | `whsec_...` signing secret(s), comma-separated during rotation. |
| `CRON_SECRET` | Vercel Cron calls `/api/payments/community/reconcile` and `/api/media/feed/cleanup` with this bearer token. |
| `MEMBERSHIP_GRACE_DAYS` | Optional; defaults to 3. |
| `FIREBASE_SERVICE_ACCOUNT` | Service-account JSON on one line for server-side Firebase Admin. | |

Set the Paystack webhook URL to `https://<your-domain>/api/payments/paystack-webhook`. See
`docs/PAYSTACK.md` for signature handling and the subscription lifecycle.

## Cron

`vercel.json` schedules `/api/payments/community/reconcile` daily at 03:00 UTC and
`/api/media/feed/cleanup` daily at 04:30 UTC. In production both endpoints return 503 when
`CRON_SECRET` is missing rather than running unauthenticated.

## Feed images

Feed image uploads use Sharp for validation and responsive WebP variants. Before deploying the
media routes:

1. Apply `supabase/migrations/20261119000000_feed_media.sql` (`supabase db push`). Without it,
   `/api/media/feed/process` returns 500.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) server-only; variant uploads and
   `feed_media` writes use the service role.
3. Optionally set `VITE_SUPABASE_IMAGE_TRANSFORMATIONS=true` only if the Supabase project has
   Image Transformations. Pre-generated variants are used regardless.

Images are stored in the existing public `posts` bucket under `<uid>/feed-media/<mediaId>/`;
no bucket or CORS change is needed. See `docs/MEDIA_PIPELINE.md` for the full pipeline,
limits, retry and cleanup behaviour.
