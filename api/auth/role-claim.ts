import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureFirebaseRoleClaim } from '../_lib/authClaims.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { status, body } = await ensureFirebaseRoleClaim(req.headers.authorization);
  res.status(status).json(body);
}
