import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { requireUser } from '../../auth.js';

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireUser(req, res))) return;
  if (!ai) return res.status(500).json({ error: 'Gemini API not configured' });
  const { code } = req.body;
  try {
    const prompt = `
      Detect the programming language of the following code snippet.
      Return ONLY the language name (e.g., javascript, typescript, python, html, css).
      If unsure, return "text".
      
      Code: ${code}
    `;
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    res.json({ language: response.text?.toLowerCase().trim() || "text" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
