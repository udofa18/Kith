import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getReceipt } from '../_lib/communityBilling.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : '';
  const { status, body } = await getReceipt(orderId, req.headers.authorization);
  res.status(status).json(body);
}
