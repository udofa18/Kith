import type { VercelRequest, VercelResponse } from '@vercel/node';
import { endLiveSession } from '../_lib/liveSession.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { status, body } = await endLiveSession(req.body, req.headers.authorization);
    res.status(status).json(body);
  } catch (error: any) {
    console.error('Error ending live session:', error);
    res.status(500).json({ error: 'Failed to end the live session' });
  }
}
