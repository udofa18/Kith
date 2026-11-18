import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderRichText } from '../src/lib/richText';

const html = (value: string) => renderToStaticMarkup(createElement(Fragment, null, renderRichText(value)));

describe('rich text', () => {
  it('renders the inline formatting the composer inserts', () => {
    const markup = html('Hi **bold**, *italic*, ***both***, <u>under</u>, ~~gone~~ and `code`');
    expect(markup).toContain('<strong');
    expect(markup).toContain('<em');
    expect(markup).toContain('<u>under</u>');
    expect(markup).toContain('<s');
    expect(markup).toContain('<code');
    expect(markup).toContain('<em class="italic">both</em>');
  });

  it('keeps headings, quotes, rules, and separate bullet and numbered lists', () => {
    const markup = html('## Title\n> note\n- one\n- two\n1. first\n2. second\n---');
    expect(markup).toContain('text-lg font-bold');
    expect(markup).toContain('<blockquote');
    expect(markup.match(/<ul/g)).toHaveLength(1);
    expect(markup.match(/<ol/g)).toHaveLength(1);
    expect(markup).toContain('<hr');
  });

  it('links safe URLs only', () => {
    const markup = html('[kith](https://kith.app) [bad](javascript:alert(1)) https://example.com.');
    expect(markup).toContain('href="https://kith.app"');
    expect(markup).toContain('href="https://example.com"');
    // An unsafe scheme stays visible as plain text but never becomes a link.
    expect(markup).not.toContain('href="javascript:');
    expect(markup.match(/<a /g)).toHaveLength(2);
    // Trailing sentence punctuation stays outside the link.
    expect(markup).toContain('</a>.');
  });

  it('passes mentions and hashtags to the caller and leaves underscores alone', () => {
    const seen: string[] = [];
    const markup = renderToStaticMarkup(
      createElement(Fragment, null, renderRichText('@ada #design snake_case_name', {
        mention: (username, key) => {
          seen.push(`@${username}`);
          return createElement('span', { key }, username);
        },
        hashtag: (tag, key) => {
          seen.push(`#${tag}`);
          return createElement('span', { key }, tag);
        },
      })),
    );
    expect(seen).toEqual(['@ada', '#design']);
    expect(markup).toContain('snake_case_name');
    expect(markup).not.toContain('<em');
  });
});
