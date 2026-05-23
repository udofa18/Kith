import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0; +http://example.com/bot)',
      },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);
    const metadata = {
      title: $('meta[property="og:title"]').attr('content') || $('title').text() || url,
      description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '',
      image: $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '',
      siteName: $('meta[property="og:site_name"]').attr('content') || new URL(url).hostname,
      url: url,
    };

    res.json(metadata);
  } catch (error: any) {
    console.error('Unfurl error:', error.message);
    res.status(500).json({ error: 'Failed to unfurl URL' });
  }
}
