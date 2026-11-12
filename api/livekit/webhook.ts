import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleLivekitWebhook } from '../_lib/livekitWebhook.js';

// LiveKit signs the exact raw bytes, so the body must not be parsed before verification.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = await readRawBody(req);
  const { status, body } = await handleLivekitWebhook(rawBody, header(req.headers.authorization));
  res.status(status).json(body);
}
