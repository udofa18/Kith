import { describe, expect, it } from 'vitest';
import { docToMarkdown, markdownToEditorHtml, markdownToPlainText } from '../src/lib/richTextDoc';

const text = (value: string, marks: { type: string; attrs?: Record<string, unknown> }[] = []) => ({
  type: 'text',
  text: value,
  marks,
});

describe('rich text document bridge', () => {
  it('turns stored markdown into editor HTML without exposing the markers', () => {
    const markup = markdownToEditorHtml('Hi **bold**, *italic*, <u>under</u>, ~~gone~~ and `code`');
    expect(markup).toContain('<strong>bold</strong>');
    expect(markup).toContain('<em>italic</em>');
    expect(markup).toContain('<u>under</u>');
    expect(markup).toContain('<s>gone</s>');
    expect(markup).toContain('<code>code</code>');
  });

  it('does not let raw markup from a post reach the editor', () => {
    const markup = markdownToEditorHtml('hello <img src=x onerror=alert(1)>');
    expect(markup).not.toContain('<img');
    expect(markup).toContain('&lt;img');
  });

  it('serializes editor marks back to the stored markdown subset', () => {
    const markdown = docToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            text('Bold', [{ type: 'bold' }]),
            text(' '),
            text('both', [{ type: 'bold' }, { type: 'italic' }]),
            text(' '),
            text('under', [{ type: 'underline' }]),
            text(' '),
            text('gone', [{ type: 'strike' }]),
            text(' '),
            text('code', [{ type: 'code' }]),
            text(' '),
            text('link', [{ type: 'link', attrs: { href: 'https://kith.app' } }]),
          ],
        },
      ],
    });

    expect(markdown).toContain('**Bold**');
    expect(markdown).toContain('***both***');
    expect(markdown).toContain('<u>under</u>');
    expect(markdown).toContain('~~gone~~');
    expect(markdown).toContain('`code`');
    expect(markdown).toContain('[link](https://kith.app)');
  });

  it('keeps headings, quotes, lists and rules stable in a round trip', () => {
    const markdown = '# Title\n\n> note\n\n- one\n- two\n\n1. first\n2. second\n\n---';
    expect(docToMarkdown({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [text('note')] }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('one')] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('two')] }] },
          ],
        },
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('first')] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('second')] }] },
          ],
        },
        { type: 'horizontalRule' },
      ],
    })).toBe(markdown);
  });

  it('flattens formatting for previews', () => {
    const preview = markdownToPlainText('## Ship log\n\nShipped **the editor**, *finally*\n\n- faster\n- cleaner\n\n[Repo](https://kith.app)');
    expect(preview).toBe('Ship log Shipped the editor, finally faster cleaner Repo');
  });
});
