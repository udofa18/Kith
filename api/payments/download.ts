import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createDownloadUrl } from '../_lib/downloads.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const productId = typeof req.query.productId === 'string' ? req.query.productId : '';
  const fileId = typeof req.query.fileId === 'string' ? req.query.fileId : undefined;
  const { status, body } = await createDownloadUrl(productId, fileId, req.headers.authorization);
  res.status(status).json(body);
}
