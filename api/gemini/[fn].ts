import { createApiApp } from '../_lib/apiApp.js';

/**
 * `/api/gemini/:fn` (digest, moderate, product-description, suggest-hashtags, detect-language).
 *
 * See `api/live-session/[action].ts`: the API is one Express app, and Vercel needs a file at each
 * path depth because it only expands a single dynamic segment per directory.
 */
export const config = { api: { bodyParser: false } };

export default createApiApp();
