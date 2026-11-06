import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createCheckout } from '../_lib/payments.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { status, body } = await createCheckout(req.body, req.headers.authorization);
  res.status(status).json(body);
}
