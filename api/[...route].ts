import { createApiApp } from './_lib/apiApp.js';

/**
 * Entrypoint for single-segment `/api/*` paths (`/api/health`, `/api/livekit-token`, `/api/unfurl`,
 * `/api/payments/checkout`, …).
 *
 * Vercel's Hobby plan allows at most 12 Serverless Functions per deployment. A file per endpoint
 * exceeded that, so all routes are served by the Express app in `api/_lib/apiApp.ts` and Vercel's
 * filesystem routing sends requests here. Everything under `api/_lib` is a shared module, not an
 * endpoint (Vercel ignores underscore-prefixed files).
 *
 * Despite the `[...route]` name, Vercel expands only ONE dynamic segment per directory, so nested
 * paths (`/api/live-session/info`) are handled by the sibling entrypoints in their own
 * subdirectories. `tests/apiRouting.test.ts` keeps every client path covered.
 */
export const config = { api: { bodyParser: false } };

export default createApiApp();
