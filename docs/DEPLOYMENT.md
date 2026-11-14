# Deployment

## Vercel function layout

The API is served by **one** Serverless Function:

- `api/[...route].ts` — the catch-all entry point.
- `api/_lib/apiApp.ts` — the Express app with every route.

Vercel's Hobby plan allows at most **12 Serverless Functions per deployment**. A file per endpoint
(32 at the time of the limit being hit) failed with:

> No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.

Everything under `api/_lib` is a shared module, not an endpoint, because Vercel ignores
underscore-prefixed files and directories. Adding a new endpoint means adding a route in
`api/_lib/apiApp.ts`, **not** a new file under `api/`.

`api/[...route].ts` sets `bodyParser: false`; Express parses bodies itself. This is required by the
Paystack and LiveKit webhooks, whose signatures cover the raw request bytes.

Local development uses the same app: `server.ts` calls `createApiApp()` and then mounts Vite.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | `sk_test_...` or `sk_live_...`; enables Paystack checkout. |
| `PAYSTACK_PUBLIC_KEY` | Browser key used by checkout. |
| `PAYSTACK_WEBHOOK_SECRET` | `whsec_...` signing secret(s), comma-separated during rotation. |
| `CRON_SECRET` | Vercel Cron calls `/api/payments/community/reconcile` with this bearer token. |
| `MEMBERSHIP_GRACE_DAYS` | Optional; defaults to 3. |
| `FIREBASE_SERVICE_ACCOUNT` | Service-account JSON on one line for server-side Firebase Admin. | |

Set the Paystack webhook URL to `https://<your-domain>/api/payments/paystack-webhook`. See
`docs/PAYSTACK.md` for signature handling and the subscription lifecycle.

## Cron

`vercel.json` schedules `/api/payments/community/reconcile` daily at 03:00 UTC. In production the
endpoint returns 503 when `CRON_SECRET` is missing rather than running unauthenticated.
