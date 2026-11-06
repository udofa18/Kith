import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOrderStatus } from '../_lib/payments.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const { status, body } = await getOrderStatus(id, req.headers.authorization);
  res.status(status).json(body);
}
