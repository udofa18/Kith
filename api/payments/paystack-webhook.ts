import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePaystackWebhook } from '../_lib/payments.js';

// Paystack signs the exact raw bytes, so the body must not be parsed before verification.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const rawBody = await readRawBody(req);
  const signature = req.headers['x-paystack-signature'];
  const { status, body } = await handlePaystackWebhook(rawBody, typeof signature === 'string' ? signature : undefined);
  res.status(status).json(body);
}
