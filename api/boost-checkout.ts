import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createBoostCheckout } from './_lib/boost.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { status, body } = await createBoostCheckout(req.body, req.headers.authorization);
    res.status(status).json(body);
  } catch (error: any) {
    console.error('Boost error:', error);
    res.status(500).json({ error: 'Boost failed' });
  }
}
