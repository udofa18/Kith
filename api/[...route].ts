import { createApiApp } from './_lib/apiApp.js';

/**
 * One serverless function for every API route.
 *
 * Vercel's Hobby plan allows at most 12 Serverless Functions per deployment. A file per endpoint
 * exceeded that, so all routes are served by the Express app in `api/_lib/apiApp.ts` and Vercel's
 * filesystem routing sends `/api/*` here. Everything under `api/_lib` is a shared module, not an
 * endpoint (Vercel ignores underscore-prefixed files).
 */
export const config = { api: { bodyParser: false } };

export default createApiApp();
