import type { ReactNode } from 'react';

/**
 * Lightweight rich text for posts and channel messages.
 *
 * Messages stay plain strings in Firestore (the security rules require that), so
 * formatting is a small Markdown subset applied by the composer toolbar:
 *
 *   **bold**  *italic*  ~~strike~~  `<code>`  <u>underline</u>
 *   [label](https://example.com)  https://example.com
 *   > quote            - bullet           1. numbered
 *   # Heading          ## Heading         ### Heading
 *
 * Rendering builds React nodes directly (never HTML), so message text cannot inject
 * markup. Mentions, hashtags and links can be styled by the caller.
 */
export interface RichTextRenderers {
  /** `username` is the handle without the leading @. */
  mention?: (username: string, key: string) => ReactNode;
  /** `tag` is the hashtag/channel name without the leading #. */
  hashtag?: (tag: string, key: string) => ReactNode;
  /** Bare or Markdown links. The URL is already limited to http(s)/mailto. */
  link?: (url: string, key: string) => ReactNode;
  /** Plain runs of text, for example to render inline emoji. */
  text?: (text: string, key: string) => ReactNode;
}

const INLINE_PATTERN = new RegExp(
  [
    '(`[^`\\n]+`)', // inline code
    '(\\*\\*\\*[^\\n]+?\\*\\*\\*)', // ***bold italic***
    '(\\*\\*[^\\n]+?\\*\\*)', // **bold**
    '(__[^\\n]+?__)', // __bold__
    '(~~[^\\n]+?~~)', // ~~strike~~
    '(<u>[^\\n]+?<\\/u>)', // <u>underline</u>
    '(\\*[^*\\n]+?\\*)', // *italic*
    '(\\[[^\\]\\n]+\\]\\((?:https?:\\/\\/|mailto:)[^\\s)]+\\))', // [label](url)
    '(https?:\\/\\/[^\\s<>()]+)', // bare link
    '(@[\\w-]+)', // @mention
    '(#[\\w-]+)', // #hashtag / #channel
  ].join('|'),
  'g',
);

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function plainText(text: string, renderers: RichTextRenderers, key: string): ReactNode {
  return renderers.text ? renderers.text(text, key) : text;
}

function safeLink(url: string, label: ReactNode, key: string, renderers: RichTextRenderers): ReactNode {
  const href = url.trim();
  if (!SAFE_URL.test(href)) return plainText(url, renderers, key);
  if (renderers.link) return renderers.link(href, key);
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={event => event.stopPropagation()}
      className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary break-words"
    >
      {label}
    </a>
  );
}

export function renderInline(value: string, renderers: RichTextRenderers = {}, prefix = 'r'): ReactNode[] {
  if (!value) return [];

  const nodes: ReactNode[] = [];
  const pattern = new RegExp(INLINE_PATTERN.source, 'g');
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > last) {
      nodes.push(plainText(value.slice(last, match.index), renderers, `${prefix}-t${index}`));
    }

    const token = match[0];
    const key = `${prefix}-${index}`;
    const inner = (start: number, end: number) =>
      renderInline(token.slice(start, token.length - end), renderers, key);

    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-black/[0.07] px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('***')) {
      nodes.push(<strong key={key} className="font-bold"><em className="italic">{inner(3, 3)}</em></strong>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key} className="font-bold">{inner(2, 2)}</strong>);
    } else if (token.startsWith('__')) {
      nodes.push(<strong key={key} className="font-bold">{inner(2, 2)}</strong>);
    } else if (token.startsWith('~~')) {
      nodes.push(<s key={key} className="line-through opacity-80">{inner(2, 2)}</s>);
    } else if (token.startsWith('<u>')) {
      nodes.push(<u key={key}>{inner(3, 4)}</u>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key} className="italic">{inner(1, 1)}</em>);
    } else if (token.startsWith('_')) {
      nodes.push(<em key={key} className="italic">{inner(1, 1)}</em>);
    } else if (token.startsWith('[')) {
      const divider = token.indexOf('](');
      const label = renderInline(token.slice(1, divider), renderers, `${key}-label`);
      nodes.push(safeLink(token.slice(divider + 2, -1), label, key, renderers));
    } else if (/^https?:\/\//i.test(token)) {
      const trailing = token.match(/[.,;:!?]+$/)?.[0] ?? '';
      const url = trailing ? token.slice(0, -trailing.length) : token;
      nodes.push(safeLink(url, url, key, renderers));
      if (trailing) nodes.push(plainText(trailing, renderers, `${key}-trail`));
    } else if (token.startsWith('@')) {
      const username = token.slice(1);
      nodes.push(
        renderers.mention
          ? renderers.mention(username, key)
          : <span key={key} className="font-medium text-primary">@{username}</span>,
      );
    } else if (token.startsWith('#')) {
      const tag = token.slice(1);
      nodes.push(
        renderers.hashtag
          ? renderers.hashtag(tag, key)
          : <span key={key} className="font-medium text-primary">#{tag}</span>,
      );
    } else {
      nodes.push(plainText(token, renderers, key));
    }

    last = pattern.lastIndex;
    index += 1;
  }

  if (last < value.length) {
    nodes.push(plainText(value.slice(last), renderers, `${prefix}-tail`));
  }
  return nodes;
}

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/;

export function renderRichText(value: string, renderers: RichTextRenderers = {}): ReactNode {
  if (!value) return null;

  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  let block = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const sizes = ['text-xl font-bold', 'text-lg font-bold', 'text-base font-semibold'];
      blocks.push(
        <p key={`b${block}`} className={`${sizes[level - 1]} leading-snug`}>
          {renderInline(heading[2], renderers, `b${block}`)}
        </p>,
      );
      index += 1;
      block += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: ReactNode[] = [];
      let lineNumber = 0;
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        if (lineNumber > 0) quote.push(<br key={`br-${lineNumber}`} />);
        quote.push(...renderInline(lines[index].replace(/^\s*>\s?/, ''), renderers, `q${block}-${lineNumber}`));
        lineNumber += 1;
        index += 1;
      }
      blocks.push(
        <blockquote key={`b${block}`} className="border-l-2 border-primary/40 pl-3 text-black/65 dark:text-white/65">
          {quote}
        </blockquote>,
      );
      block += 1;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length && LIST_ITEM.test(lines[index])) {
        // A numbered list starting under bullets is a new list, not more items.
        if (/^\s*\d+[.)]\s+/.test(lines[index]) !== ordered) break;
        const item = lines[index].match(LIST_ITEM);
        items.push(<li key={`li-${items.length}`}>{renderInline(item?.[2] ?? '', renderers, `l${block}-${items.length}`)}</li>);
        index += 1;
      }
      blocks.push(
        ordered
          ? <ol key={`b${block}`} className="list-decimal space-y-0.5 pl-5 marker:text-primary/60">{items}</ol>
          : <ul key={`b${block}`} className="list-disc space-y-0.5 pl-5 marker:text-primary/60">{items}</ul>,
      );
      block += 1;
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push(<hr key={`b${block}`} className="border-black/10 dark:border-white/10" />);
      index += 1;
      block += 1;
      continue;
    }

    // A paragraph: keep going until a heading, quote, list or rule starts.
    const paragraph: string[] = [];
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,3})\s+/.test(lines[index])
      && !/^\s*>\s?/.test(lines[index])
      && !LIST_ITEM.test(lines[index])
      && !/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`b${block}`} className="whitespace-pre-wrap break-words">
        {renderInline(paragraph.join('\n'), renderers, `b${block}`)}
      </p>,
    );
    block += 1;
  }

  return <div className="space-y-1.5">{blocks}</div>;
}
