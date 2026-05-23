import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AccessToken, TrackSource } from 'livekit-server-sdk';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { eventId, userId, username, photoURL } = req.body;

  if (!eventId || !userId || !username) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error('LiveKit credentials missing from environment variables');
      return res.status(500).json({ 
        error: 'LiveKit credentials not configured. Please add LIVEKIT_API_KEY and LIVEKIT_API_SECRET to your environment variables.' 
      });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: username,
      metadata: JSON.stringify({ avatar: photoURL || '' }),
    });

    at.addGrant({
      roomJoin: true,
      room: eventId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
      canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
    });

    res.json({ token: await at.toJwt() });
  } catch (error: any) {
    console.error('Error generating token:', error);
    res.status(500).json({ 
      error: 'Failed to generate LiveKit token',
      details: error.message
    });
  }
}
