import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCommunityPaidMembers } from '../../_lib/communityBilling.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : '';
  const { status, body } = await getCommunityPaidMembers(communityId, req.headers.authorization);
  res.status(status).json(body);
}
