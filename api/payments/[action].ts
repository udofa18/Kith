import { createApiApp } from '../_lib/apiApp.js';

/**
 * `/api/payments/*` — checkout, webhooks, payouts, balance, receipts and downloads.
 *
 * See `api/live-session/[action].ts`: the API is one Express app, and Vercel needs a file at each
 * path depth because it only expands a single dynamic segment per directory.
 */
export const config = { api: { bodyParser: false } };

export default createApiApp();
