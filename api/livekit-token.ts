import type { VercelRequest, VercelResponse } from '@vercel/node';
import { issueLivekitToken } from './_lib/livekitToken.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { status, body } = await issueLivekitToken(req.body, req.headers.authorization);
    res.status(status).json(body);
  } catch (error: any) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: 'Failed to generate LiveKit token' });
  }
}
