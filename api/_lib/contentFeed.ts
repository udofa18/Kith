import firebaseConfig from '../../firebase-applet-config.json' assert { type: 'json' };

export interface FeedArticle {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  authorName: string;
  url: string;
  publishedAt: string;
  updatedAt: string;
  coverImage: string;
}

const PROJECT_ID = firebaseConfig.projectId;
const DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';
const API_KEY = firebaseConfig.apiKey;

function parseValue(value: any): any {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    return (value.arrayValue?.values || []).map((item: any) => parseValue(item));
  }
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue?.fields || {}).map(([key, item]) => [key, parseValue(item)]),
    );
  }
  return undefined;
}

function parseDocument(document: any): Record<string, any> {
  const fields = document.fields || {};
  const decoded = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, parseValue(value)]),
  ) as Record<string, any>;
  return { id: String(document.name || '').split('/').pop() || '', ...decoded };
}

function plainText(html?: string | null) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function siteOrigin(headers: Record<string, any> = {}) {
  const host =
    (typeof headers['x-forwarded-host'] === 'string' && headers['x-forwarded-host']) ||
    (typeof headers.host === 'string' && headers.host) ||
    'kith.app';
  const forwardedProto =
    typeof headers['x-forwarded-proto'] === 'string' ? headers['x-forwarded-proto'] : '';
  const proto =
    forwardedProto ||
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function xmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function truncate(value: string, length: number) {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}

/**
 * Public published-article feed for sitemap/RSS.
 *
 * Uses the Firestore REST API with the public web config rather than Admin
 * credentials, so it works in the same environments as the browser app. Rules
 * only expose published articles to anonymous readers.
 */
export async function fetchPublishedArticles(limit = 500, origin = 'https://kith.app'): Promise<FeedArticle[]> {
  const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:runQuery?key=${API_KEY}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'articles' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: 'published' },
          },
        },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Firestore feed query failed (${response.status})`);
  }

  const rows: any[] = await response.json();
  return rows
    .filter((row) => row.document)
    .map((row) => {
      const article = parseDocument(row.document);
      const seo = article.seo || {};
      const publishedAt =
        article.publishedAt || article.createdAt || article.updatedAt || new Date().toISOString();
      const description =
        seo.metaDescription ||
        article.subtitle ||
        truncate(plainText(article.content), 220) ||
        'A story from the Kith Journal.';

      return {
        id: article.id,
        title: article.title || 'Untitled story',
        subtitle: article.subtitle || '',
        description,
        category: article.primaryCategoryId || 'Journal',
        authorName: article.authorName || 'Kith writer',
        url: `${origin}/article/${article.id}`,
        publishedAt: String(publishedAt),
        updatedAt: String(article.updatedAt || publishedAt),
        coverImage: article.coverImage || '',
      };
    })
    .filter((article) => article.id);
}

export const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/articles', priority: '0.9', changefreq: 'daily' },
  { path: '/marketplace', priority: '0.7', changefreq: 'weekly' },
  { path: '/events', priority: '0.7', changefreq: 'daily' },
  { path: '/challenges', priority: '0.7', changefreq: 'weekly' },
];
