import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { requireUser } from '../_lib/auth.js';

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireUser(req, res))) return;
  if (!ai) return res.status(500).json({ error: 'Gemini API not configured' });

  const title = String(req.body?.title ?? '').slice(0, 200);
  const tagline = String(req.body?.tagline ?? '').slice(0, 300);
  const category = String(req.body?.category ?? '').slice(0, 50);
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Write a professional, punchy product description for a digital asset in a marketplace.
Product Title: ${title}
Tagline: ${tagline}
Category: ${category}
Include: what's included, why it's valuable, and a call to action. Keep it under 200 words. Format with markdown.`,
    });
    res.json({ description: response.text || '' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Generation failed' });
  }
}
