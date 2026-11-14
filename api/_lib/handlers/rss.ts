import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPublishedArticles, siteOrigin, xmlEscape } from '../contentFeed.js';

function pubDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = siteOrigin(req.headers);
  let articles: Awaited<ReturnType<typeof fetchPublishedArticles>> = [];

  try {
    articles = await fetchPublishedArticles(50, origin);
  } catch (error) {
    console.error('RSS article query failed:', error);
  }

  const items = articles
    .map(
      (article) => `    <item>
      <title>${xmlEscape(article.title)}</title>
      <link>${xmlEscape(article.url)}</link>
      <guid isPermaLink="true">${xmlEscape(article.url)}</guid>
      <pubDate>${pubDate(article.publishedAt)}</pubDate>
      <description>${xmlEscape(article.description)}</description>
      <dc:creator>${xmlEscape(article.authorName)}</dc:creator>
      <category>${xmlEscape(article.category)}</category>
    </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>The Kith Journal</title>
    <link>${xmlEscape(`${origin}/articles`)}</link>
    <description>Long-form stories about making things with other people.</description>
    <language>en</language>
    <atom:link href="${xmlEscape(`${origin}/rss.xml`)}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}
