/**
 * Client for the Gemini serverless endpoints in /api/gemini.
 * The API key lives only on the server; requests are authenticated with the user's Firebase ID token.
 */
import { auth } from '../firebase';

async function callGemini<T>(endpoint: string, body: unknown): Promise<T | null> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return null;
  try {
    const res = await fetch(`/api/gemini/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  } catch (error) {
    console.error(`Gemini ${endpoint} failed:`, error);
    return null;
  }
}

export async function suggestHashtags(content: string, code?: string): Promise<string[]> {
  return (await callGemini<{ hashtags: string[] }>('suggest-hashtags', { content, code }))?.hashtags ?? [];
}

export async function detectLanguage(code: string): Promise<string> {
  return (await callGemini<{ language: string }>('detect-language', { code }))?.language ?? 'text';
}

export interface DigestItem {
  postId: string;
  text: string;
}

export async function generateDigest(
  posts: { id: string; author: string; content: string; likes: number; comments: number }[],
): Promise<DigestItem[] | null> {
  return (await callGemini<{ items: DigestItem[] }>('digest', { posts }))?.items ?? null;
}

export async function generateProductDescription(input: { title: string; tagline: string; category: string }): Promise<string | null> {
  return (await callGemini<{ description: string }>('product-description', input))?.description ?? null;
}
