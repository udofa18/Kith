import { auth } from "../firebase";

export interface ModerationResult {
  isSafe: boolean;
  score: number; // 0 to 1, higher is safer
  flaggedReasons: string[];
  suggestedAction?: 'allow' | 'flag' | 'block';
}

const ALLOW: ModerationResult = { isSafe: true, score: 1.0, flaggedReasons: [], suggestedAction: 'allow' };

/** Server-side Gemini moderation (/api/gemini/moderate). Fails open so outages don't block chat. */
export const analyzeContent = async (content: string): Promise<ModerationResult> => {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return ALLOW;
    const res = await fetch('/api/gemini/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as ModerationResult;
  } catch (error) {
    console.error("AI Moderation error:", error);
    return ALLOW;
  }
};
