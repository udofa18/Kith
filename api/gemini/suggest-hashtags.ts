import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ai) return res.status(500).json({ error: 'Gemini API not configured' });
  const { content, code } = req.body;
  try {
    const prompt = `
      Analyze the following developer post content and optional code snippet.
      Suggest 3-5 relevant hashtags for a developer social platform.
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
