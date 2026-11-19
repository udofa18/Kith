import { createApiApp } from '../_lib/apiApp.js';

/**
 * `/api/live-session/info` and `/api/live-session/end`.
 *
 * Vercel's `/api` router expands one dynamic segment per directory level: `[...route].ts` behaves
 * like `[route].ts`, so a nested path needs a file in a matching subdirectory. Each of these
 * entrypoints mounts the same Express app, which routes on the untouched request path.
 */
export const config = { api: { bodyParser: false } };

export default createApiApp();
