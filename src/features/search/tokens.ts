/**
 * Search indexing for posts. Firestore has no full-text search, so each post stores
 * `searchTokens`: its distinct words plus their short prefixes, which lets a single
 * `array-contains` query find posts by a whole word or by the start of one.
 */

/** Prefixes are stored up to this length; longer query words are matched on their first MAX_PREFIX chars. */
export const MAX_PREFIX = 10;
const MIN_PREFIX = 2;
const MAX_TOKENS = 400;

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have', 'i', 'in', 'is', 'it',
  'its', 'me', 'my', 'of', 'on', 'or', 'so', 'that', 'the', 'this', 'to', 'was', 'we', 'with', 'you', 'your',
]);

const URL_RE = /https?:\/\/\S+/g;

/** Lowercase, accent-free words of at least two characters, in order. */
export function words(text: string): string[] {
  return text
    .replace(URL_RE, url => {
      // Keep the domain name searchable ("github", "figma") without the noise of paths.
      try { return new URL(url).hostname.replace(/^www\./, '').replace(/\./g, ' '); } catch { return ' '; }
    })
    .replace(/<[^>]+>/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2);
}

/** `#Tag` / `tag` → `tag` (letters, digits, underscore only). */
export const normalizeTag = (tag: string) =>
  tag.replace(/^#/, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_]/g, '');

/** Hashtags written in the text, normalized and de-duplicated. */
export function extractHashtags(text: string): string[] {
  const found = text.replace(URL_RE, ' ').match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(found.map(normalizeTag).filter(Boolean))];
}

/** Union of tag lists, keeping the first spelling of each tag, always with a leading '#'. */
export function mergeTags(...lists: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const tag of lists.flat()) {
    const key = normalizeTag(tag);
    if (key && !seen.has(key)) seen.set(key, tag.startsWith('#') ? tag : `#${tag}`);
  }
  return [...seen.values()].slice(0, 20);
}

/** Tokens stored on a post: words and prefixes from its text, tags, project and author. */
export function buildSearchTokens(parts: Array<string | null | undefined>): string[] {
  const tokens = new Set<string>();
  // "#tag" parts are kept verbatim so hashtag search can use the same index.
  for (const part of parts) if (part?.startsWith('#')) tokens.add(part);
  for (const word of words(parts.filter(p => p && !p.startsWith('#')).join(' '))) {
    if (tokens.size >= MAX_TOKENS) break;
    if (STOPWORDS.has(word)) continue;
    tokens.add(word.slice(0, MAX_PREFIX * 2));
    for (let n = MIN_PREFIX; n <= Math.min(word.length - 1, MAX_PREFIX); n++) tokens.add(word.slice(0, n));
  }
  return [...tokens].slice(0, MAX_TOKENS);
}

/** Simple plural folding so "dashboards" finds "dashboard" (matching is by prefix). */
const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** Query words worth matching on (stopwords dropped unless that leaves nothing). */
export function queryWords(query: string): string[] {
  const all = words(query).map(singular);
  const meaningful = all.filter(w => !STOPWORDS.has(w));
  return [...new Set(meaningful.length ? meaningful : all)];
}

/** The token to send to Firestore: the longest query word, cut to what's indexed. */
export function indexKey(qWords: string[]): string | null {
  const longest = [...qWords].sort((a, b) => b.length - a.length)[0];
  return longest ? longest.slice(0, MAX_PREFIX) : null;
}

/** Every query word must start some word of the post (so "desi" matches "design"). */
export function matchesWords(text: string, qWords: string[]): boolean {
  if (qWords.length === 0) return false;
  const postWords = words(text);
  return qWords.every(q => postWords.some(w => w.startsWith(q)));
}
