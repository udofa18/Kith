import type { VercelRequest, VercelResponse } from '@vercel/node';
import { firestoreAdmin } from '../firebaseApp.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Express puts the path segment in `params`; Vercel's dynamic route used `query`.
  const params = (req as any).params ?? {};
  const slug = typeof req.query.slug === 'string' ? req.query.slug : params.slug;

  if (typeof slug !== 'string') {
    return res.status(400).json({ error: 'Invalid slug' });
  }
  
  try {
    const snapshot = await firestoreAdmin()
      .collection('components')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Component not found' });
    }

    const componentData = snapshot.docs[0].data();
    
    // Return metadata for CLI
    res.json({
      slug: componentData.slug,
      name: componentData.title,
      repo: componentData.githubRepo,
      filesPath: componentData.filesPath || '/',
      dependencies: componentData.techStack || [],
      framework: componentData.category || 'react'
    });
  } catch (error: any) {
    console.error('Error fetching component metadata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
