import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
} catch (e) {
  console.warn("Failed to initialize GoogleGenAI:", e);
}

export async function suggestHashtags(content: string, code?: string) {
  if (!ai) {
    console.warn("Gemini API key not configured. Returning empty hashtags.");
    return [];
  }
  try {
    const prompt = `
      Analyze the following social post content and optional code snippet.
      Suggest 3-5 relevant hashtags for a diverse social platform (not limited to coding).
      If there is code, include technical tags. If it's about life, art, or other topics, suggest appropriate tags.
      Return ONLY the hashtags separated by spaces, starting with #.
      
      Content: ${content}
      Code: ${code || 'None'}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    const text = response.text || "";
    return text.match(/#[\w-]+/g) || [];
  } catch (error) {
    console.error("Error suggesting hashtags:", error);
    return [];
  }
}

export async function detectLanguage(code: string) {
  if (!ai) {
    console.warn("Gemini API key not configured. Returning 'text'.");
    return "text";
  }
  try {
    const prompt = `
      Identify the programming language for the following code snippet.
      Return ONLY the name of the language (e.g., 'javascript', 'python', 'typescript').
      If unsure, return 'text'.
      
      Code: ${code}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    return response.text.trim().toLowerCase() || "text";
  } catch (error) {
    console.error("Error detecting language:", error);
    return "text";
  }
}
