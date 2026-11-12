import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getLiveSessionInfo } from '../_lib/liveSessionInfo.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : '';
  try {
    const { status, body } = await getLiveSessionInfo(eventId, req.headers.authorization);
    res.status(status).json(body);
  } catch (error) {
    console.error('Error reading live session info:', error);
    res.status(500).json({ error: 'Failed to read the live session' });
  }
}
