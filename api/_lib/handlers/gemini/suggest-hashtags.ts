import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { requireUser } from '../../auth.js';

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireUser(req, res))) return;
  if (!ai) return res.status(500).json({ error: 'Gemini API not configured' });
  const { content, code } = req.body;
  try {
    const prompt = `
      Analyze the following social post content and optional code snippet.
      Suggest 3-5 relevant hashtags for a diverse creator platform (not limited to coding).
      If there is code, include technical tags.
      Return ONLY the hashtags separated by spaces, starting with #.
      
      Content: ${content}
      Code: ${code || 'None'}
    `;
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    const text = response.text || "";
    res.json({ hashtags: text.match(/#[\w-]+/g) || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
