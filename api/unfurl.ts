import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchMetadata, validateUrl } from './_lib/unfurl.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = typeof req.query.url === 'string' ? validateUrl(req.query.url) : null;
  if (!url) return res.status(400).json({ error: 'A public http(s) URL is required' });

  try {
    const metadata = await fetchMetadata(url);
    // Previews rarely change; let the CDN absorb repeat requests.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.json(metadata);
  } catch (error: any) {
    console.error('Unfurl error:', error.message);
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    res.status(error.status === 429 ? 429 : 502).json({ error: 'Failed to unfurl URL' });
  }
}
