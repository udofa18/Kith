import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// VerifiedBadge subscribes to Firestore, which is irrelevant to the quoted-card markup.
vi.mock('../src/components/VerifiedBadge', () => ({ default: () => null }));

import QuotedPost from '../src/components/post/QuotedPost';

const quoted = {
  id: 'quoted-1',
  authorUid: 'author-2',
  authorName: 'TopsKills Sports UK',
  authorUsername: 'topskillssportuk',
  authorPhoto: 'https://cdn.example.com/avatar.jpg',
  content: 'Bukayo Saka’s planned wedding has been called off.',
  media: [
    {
      type: 'image' as const,
      url: 'https://cdn.example.com/quoted-portrait.jpg',
      width: 800,
      height: 1000,
      aspectRatio: 0.8,
    },
  ],
};

describe('quoted post card', () => {
  it('shows the quoted author, handle, text and media', () => {
    const markup = renderToStaticMarkup(createElement(QuotedPost, { post: quoted }));

    expect(markup).toContain('TopsKills Sports UK');
    expect(markup).toContain('@topskillssportuk');
    expect(markup).toContain('Bukayo Saka’s planned wedding has been called off.');
    expect(markup).toContain('src="https://cdn.example.com/quoted-portrait.jpg"');
    expect(markup).toContain('rounded-2xl');
  });

  it('keeps video media in the quoted preview', () => {
    const markup = renderToStaticMarkup(
      createElement(QuotedPost, {
        post: {
          ...quoted,
          content: 'Watch this',
          media: [{ type: 'video' as const, url: 'https://cdn.example.com/quoted-clip.mp4' }],
        },
      }),
    );

    expect(markup).toContain('<video');
    expect(markup).toContain('https://cdn.example.com/quoted-clip.mp4');
  });

  it('omits the media section when the quoted post has none', () => {
    const markup = renderToStaticMarkup(
      createElement(QuotedPost, { post: { ...quoted, media: [] } }),
    );

    expect(markup).not.toContain('quoted-portrait');
    expect(markup).not.toContain('<video');
  });
});
