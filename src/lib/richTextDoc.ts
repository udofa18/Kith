import MarkdownIt from 'markdown-it';
import type { JSONContent } from '@tiptap/core';

/**
 * Bridges the Markdown subset stored in Firestore and the rich editor.
 *
 * The composer is WYSIWYG (Tiptap), but posts and channel messages keep storing the
 * same lightweight markers they always have, so feeds, notifications and previews
 * keep working without a data migration:
 *
 *   **bold**  *italic*  ~~strike~~  `<code>`  <u>underline</u>
 *   [label](https://example.com)  > quote  - bullet  1. numbered
 *   # Heading  ## Heading  ### Heading  ---
 */

// Private-use placeholders: markdown-it preserves them, ordinary text never contains them.
const OPEN_UNDERLINE = '\uE000';
const CLOSE_UNDERLINE = '\uE001';
const OPEN_STRIKE = '\uE002';
const CLOSE_STRIKE = '\uE003';

let markdownIt: MarkdownIt | null = null;

function renderer(): MarkdownIt {
  markdownIt ??= new MarkdownIt({ html: false, linkify: true, breaks: true });
  return markdownIt;
}

/**
 * Markdown → HTML for `editor.commands.setContent`.
 *
 * Raw HTML stays disabled: only `<u>` (which our serializer emits for underline) and
 * `~~strike~~` are translated, and every other angle bracket is escaped first so a
 * message can never inject markup into the editor.
 */
export function markdownToEditorHtml(markdown: string): string {
  const guarded = markdown
    .replace(/<\s*u\s*>/gi, OPEN_UNDERLINE)
    .replace(/<\s*\/\s*u\s*>/gi, CLOSE_UNDERLINE)
    .replace(/~~([^~\n]+)~~/g, `${OPEN_STRIKE}$1${CLOSE_STRIKE}`)
    .replace(/</g, '&lt;');

  return renderer()
    .render(guarded)
    .replaceAll(OPEN_UNDERLINE, '<u>')
    .replaceAll(CLOSE_UNDERLINE, '</u>')
    .replaceAll(OPEN_STRIKE, '<s>')
    .replaceAll(CLOSE_STRIKE, '</s>');
}

function inline(nodes: JSONContent[] | undefined): string {
  return (nodes ?? []).map(node => {
    if (node.type === 'hardBreak') return '\n';
    if (node.type !== 'text') return inline(node.content);

    let text = node.text ?? '';
    const marks = new Set((node.marks ?? []).map(mark => mark.type));

    if (marks.has('code')) text = `\`${text}\``;
    if (marks.has('strike')) text = `~~${text}~~`;
    if (marks.has('italic')) text = `*${text}*`;
    if (marks.has('bold')) text = `**${text}**`;
    if (marks.has('underline')) text = `<u>${text}</u>`;

    const link = node.marks?.find(mark => mark.type === 'link');
    const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : '';
    if (href) text = `[${text}](${href.replace(/\)/g, '%29').replace(/\s/g, '%20')})`;

    return text;
  }).join('');
}

function listItem(item: JSONContent, marker: string): string {
  const children = item.content ?? [];
  return children.map((child, index) => {
    if (child.type === 'paragraph') {
      return `${index === 0 ? marker : '  '}${inline(child.content)}`;
    }
    if (child.type === 'bulletList' || child.type === 'orderedList') {
      return listMarkdown(child).split('\n').map(line => `  ${line}`).join('\n');
    }
    return block(child);
  }).filter(line => line !== '').join('\n');
}

function listMarkdown(node: JSONContent): string {
  const ordered = node.type === 'orderedList';
  const start = Number(node.attrs?.start ?? 1);
  return (node.content ?? []).map((item, index) => (
    listItem(item, ordered ? `${start + index}. ` : '- ')
  )).join('\n');
}

function block(node: JSONContent): string {
  switch (node.type) {
    case 'paragraph':
      return inline(node.content);
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
      return `${'#'.repeat(level)} ${inline(node.content)}`;
    }
    case 'blockquote': {
      const inner = (node.content ?? []).map(block).join('\n\n');
      return inner.split('\n').map(line => `> ${line}`).join('\n');
    }
    case 'bulletList':
    case 'orderedList':
      return listMarkdown(node);
    case 'horizontalRule':
      return '---';
    default:
      return inline(node.content);
  }
}

/** Tiptap document → the Markdown subset stored in `content`. */
export function docToMarkdown(doc: JSONContent): string {
  return (doc.content ?? [])
    .map(block)
    .filter(text => text !== '')
    .join('\n\n')
    .trim();
}

/**
 * Readable one-line version of stored markdown, for previews (reply snippets,
 * search results) where rendering blocks would not fit.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/<\/?u>/gi, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^---$/gm, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}
