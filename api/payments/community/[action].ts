import { createApiApp } from '../../_lib/apiApp.js';

/**
 * `/api/payments/community/*` (subscriptions, billing, reconcile). The reconcile route is also a
 * Vercel Cron target, which sends `Authorization: Bearer <CRON_SECRET>`.
 *
 * See `api/live-session/[action].ts`: the API is one Express app, and Vercel needs a file at each
 * path depth because it only expands a single dynamic segment per directory.
 */
export const config = { api: { bodyParser: false } };

export default createApiApp();
