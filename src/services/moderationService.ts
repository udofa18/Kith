import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ModerationResult {
  isSafe: boolean;
  score: number; // 0 to 1, higher is safer
  flaggedReasons: string[];
  suggestedAction?: 'allow' | 'flag' | 'block';
}

export const analyzeContent = async (content: string): Promise<ModerationResult> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following community message for toxicity, hate speech, harassment, or violations of community standards:
      "${content}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isSafe: { type: Type.BOOLEAN },
            score: { type: Type.NUMBER, description: "Safety score from 0.0 to 1.0" },
            flaggedReasons: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            },
            suggestedAction: { 
              type: Type.STRING, 
              enum: ["allow", "flag", "block"] 
            }
          },
          required: ["isSafe", "score", "flaggedReasons", "suggestedAction"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result as ModerationResult;
  } catch (error) {
    console.error("AI Moderation error:", error);
    // Fail safe: allow but mention error
    return {
      isSafe: true,
      score: 1.0,
      flaggedReasons: [],
      suggestedAction: 'allow'
    };
  }
};
