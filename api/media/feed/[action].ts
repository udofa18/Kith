import { createApiApp } from '../../_lib/apiApp.js';

/**
 * `/api/media/feed/process`, `/retry`, `/status`, `/attach` and `/cleanup`.
 *
 * Vercel expands one dynamic segment per directory, so these nested routes share this
 * entrypoint. The Express app in `api/_lib/apiApp.ts` owns the actual routing.
 */
export const config = { api: { bodyParser: false } };

export default createApiApp();
