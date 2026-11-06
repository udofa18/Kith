import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  STATIC_PAGES,
  fetchPublishedArticles,
  siteOrigin,
  xmlEscape,
} from './_lib/contentFeed';

function lastmod(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = siteOrigin(req.headers);
  let articles: Awaited<ReturnType<typeof fetchPublishedArticles>> = [];

  try {
    articles = await fetchPublishedArticles(500, origin);
  } catch (error) {
    console.error('Sitemap article query failed:', error);
  }

  const staticUrls = STATIC_PAGES.map(
    (page) => `  <url>
    <loc>${xmlEscape(`${origin}${page.path}`)}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  ).join('\n');

  const articleUrls = articles
    .map(
      (article) => `  <url>
    <loc>${xmlEscape(article.url)}</loc>
    <lastmod>${lastmod(article.updatedAt)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${articleUrls}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}
