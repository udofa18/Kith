import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCheckoutOptions } from '../_lib/payments.js';

/** Returns the server-priced amount, currency and available providers for one checkout target. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { status, body } = await getCheckoutOptions(req.body, req.headers.authorization);
  res.status(status).json(body);
}
