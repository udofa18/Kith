import type { VercelRequest, VercelResponse } from '@vercel/node';
import { reconcileCommunityMemberships } from '../../_lib/communityBilling.js';

/**
 * Cron entry point for membership expiry, grace removal and renewal reminders.
 * Protect it with CRON_SECRET: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Without the shared secret anyone could trigger membership changes. In production that is a
    // configuration error, not an open endpoint.
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'CRON_SECRET is not configured' });
    }
  } else {
    const auth = req.headers.authorization;
    const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const querySecret = typeof req.query.secret === 'string' ? req.query.secret : null;
    if (bearer !== secret && querySecret !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { status, body } = await reconcileCommunityMemberships();
  res.status(status).json(body);
}
