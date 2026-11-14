import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMyMemberships } from '../../_lib/communityBilling.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { status, body } = await getMyMemberships(req.headers.authorization);
  res.status(status).json(body);
}
