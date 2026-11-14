import type { VercelRequest, VercelResponse } from '@vercel/node';
import detectLanguage from './detect-language.js';
import digest from './digest.js';
import moderate from './moderate.js';
import productDescription from './product-description.js';
import suggestHashtags from './suggest-hashtags.js';

/**
 * The five Gemini helpers used to be separate files in `api/gemini`, which each counted against
 * Vercel's per-deployment function limit. They are now routed from the single `api/[...route]`
 * function. Map them by their public path segment.
 */
export type VercelHandler = (req: VercelRequest, res: VercelResponse) => unknown;

export const geminiHandlers: Record<string, VercelHandler> = {
  'detect-language': detectLanguage,
  digest,
  moderate,
  'product-description': productDescription,
  'suggest-hashtags': suggestHashtags,
};
