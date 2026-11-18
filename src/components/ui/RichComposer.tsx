import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import {
  Bold, Code, Eraser, Italic, Link as LinkIcon, List, ListOrdered, Minus, Quote,
  Strikethrough, Underline,
} from 'lucide-react';
import { docToMarkdown, markdownToEditorHtml } from '../../lib/richTextDoc';

/**
 * WYSIWYG composer used by posts, channel messages and edits.
 *
 * Formatting is applied to the contenteditable document, so people see bold, lists and
 * the rest as they type. The stored value stays the lightweight Markdown subset built
 * from the editor document (see `src/lib/richTextDoc.ts`), which keeps posts and
 * messages readable in feeds, previews, notifications and search.
 */

export interface RichComposerHandle {
  focus: () => void;
  clear: () => void;
  /** Insert literal text at the caret. */
  insertText: (text: string) => void;
  /** Replace the @/# token being typed with a picked mention. */
  insertMention: (text: string) => void;
  getText: () => string;
}

export interface RichComposerProps {
  /** Markdown value, as stored on the post or message. */
  value: string;
  onChange: (markdown: string, text: string) => void;
  placeholder?: string;
  /** Plain-text character limit. The editor refuses input past it. */
  limit?: number;
  autoFocus?: boolean;
  className?: string;
  /** Typography and sizing for the editable area. */
  editorClassName?: string;
  /** When to show the formatting row. Defaults to focus or any content. */
  toolbar?: 'focus' | 'always' | 'never';
  onCountChange?: (characters: number) => void;
  onFocusChange?: (focused: boolean) => void;
  /** Text of the current block before the caret, for @/# suggestions. */
  onCaretText?: (beforeCursor: string) => void;
  /** Return true to stop the editor from handling the key. */
  onKeyDown?: (event: KeyboardEvent, beforeCursor: string) => boolean;
  onPasteFiles?: (files: File[]) => void;
}

function beforeCursor(editor: Editor): string {
  const { $from } = editor.state.selection;
  return $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
}

function safeHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed) || /^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

export const RichComposer = forwardRef<RichComposerHandle, RichComposerProps>(function RichComposer({
  value,
  onChange,
  placeholder = '',
  limit,
  autoFocus = false,
  className = '',
  editorClassName = '',
  toolbar = 'focus',
  onCountChange,
  onFocusChange,
  onCaretText,
  onKeyDown,
  onPasteFiles,
}, ref) {
  const [focused, setFocused] = useState(false);
  const [hasContent, setHasContent] = useState(value.trim().length > 0);
  const lastMarkdown = useRef(value);
  const propsRef = useRef({ onChange, onCountChange, onCaretText, onKeyDown, onPasteFiles, onFocusChange });
  propsRef.current = { onChange, onCountChange, onCaretText, onKeyDown, onPasteFiles, onFocusChange };

  const count = (editor: Editor) => editor.storage.characterCount.characters();

  // Keep callbacks and the editor handle available without recreating the editor.
  const editorRef = useRef<Editor | null>(null);
  const onKeyDownRef = useRef(onKeyDown);
  onKeyDownRef.current = onKeyDown;
  const onPasteFilesRef = useRef(onPasteFiles);
  onPasteFilesRef.current = onPasteFiles;

  const emit = (editor: Editor) => {
    const markdown = docToMarkdown(editor.getJSON());
    lastMarkdown.current = markdown;
    setHasContent(markdown.length > 0);
    propsRef.current.onChange(markdown, editor.getText());
    propsRef.current.onCountChange?.(count(editor));
    propsRef.current.onCaretText?.(beforeCursor(editor));
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: limit ?? null }),
    ],
    content: markdownToEditorHtml(value),
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: `rich-composer outline-none ${editorClassName}`,
        'aria-label': placeholder || 'Message',
      },
      handleKeyDown: (_view, event) => {
        const instance = editorRef.current;
        if (!instance) return false;
        return onKeyDownRef.current?.(event, beforeCursor(instance)) ?? false;
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.length) return false;
        onPasteFilesRef.current?.(files);
        event.preventDefault();
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => emit(instance),
    onSelectionUpdate: ({ editor: instance }) => {
      propsRef.current.onCaretText?.(beforeCursor(instance));
    },
    onFocus: ({ editor: instance }) => {
      setFocused(true);
      propsRef.current.onFocusChange?.(true);
      propsRef.current.onCaretText?.(beforeCursor(instance));
    },
    onBlur: () => {
      setFocused(false);
      propsRef.current.onFocusChange?.(false);
    },
  });

  // Read by the key handler, which ProseMirror may call before React re-renders.
  editorRef.current = editor;

  // Follow external value changes (clearing after send, emoji picks, a new edit target).
  useEffect(() => {
    if (!editor) return;
    const current = docToMarkdown(editor.getJSON());
    if (value !== lastMarkdown.current && value !== current) {
      lastMarkdown.current = value;
      editor.commands.setContent(markdownToEditorHtml(value), { emitUpdate: false });
      setHasContent(value.trim().length > 0);
    } else {
      lastMarkdown.current = current;
    }
    onCountChange?.(count(editor));
    // The editor instance itself is stable; only external values should reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // Premium accounts get a larger allowance, which can change while the app is open.
  useEffect(() => {
    if (!editor) return;
    const extension = editor.extensionManager.extensions.find(item => item.name === 'characterCount');
    if (extension) (extension.options as { limit: number | null }).limit = limit ?? null;
  }, [limit, editor]);

  // The composer placeholder follows the selected post kind.
  useEffect(() => {
    if (!editor) return;
    const extension = editor.extensionManager.extensions.find(item => item.name === 'placeholder');
    if (extension) (extension.options as { placeholder: string }).placeholder = placeholder;
  }, [placeholder, editor]);

  useImperativeHandle(ref, () => ({
    focus: () => { editor?.commands.focus(); },
    clear: () => { editor?.commands.clearContent(true); },
    insertText: (text: string) => {
      editor?.chain().focus().insertContent({ type: 'text', text }).run();
    },
    insertMention: (text: string) => {
      if (!editor) return;
      const { from } = editor.state.selection;
      const current = beforeCursor(editor);
      const match = current.match(/(^|[\s(])[@#][^\s@#]*$/);
      const start = match ? from - (match[0].length - match[1].length) : from;
      editor
        .chain()
        .focus()
        .deleteRange({ from: start, to: from })
        .insertContent({ type: 'text', text: `${text} ` })
        .run();
    },
    getText: () => editor?.getText() ?? '',
  }), [editor]);

  const link = () => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const input = window.prompt('Link address', previous || 'https://');
    if (input === null) return;
    const href = safeHref(input);
    if (!href) {
      if (!input.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor.chain().focus().insertContent({
        type: 'text',
        text: href,
        marks: [{ type: 'link', attrs: { href } }],
      }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
  };

  const visible = toolbar === 'always'
    || (toolbar !== 'never' && (focused || hasContent));

  const button = (active: boolean, action: () => void, title: string, children: React.ReactNode) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={event => event.preventDefault()}
      onClick={action}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-black/55 hover:bg-black/[0.07] hover:text-black dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );

  const headingButton = (level: 1 | 2 | 3) => (
    <button
      key={level}
      type="button"
      title={`Heading ${level}`}
      aria-label={`Heading ${level}`}
      aria-pressed={!!editor?.isActive('heading', { level })}
      onMouseDown={event => event.preventDefault()}
      onClick={() => editor?.chain().focus().toggleHeading({ level }).run()}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold transition-colors ${
        editor?.isActive('heading', { level })
          ? 'bg-primary/15 text-primary'
          : 'text-black/55 hover:bg-black/[0.07] hover:text-black dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white'
      }`}
    >
      H{level}
    </button>
  );

  return (
    <div className={className}>
      {visible && editor && (
        <div className="flex items-center gap-0.5 overflow-x-auto py-0.5" role="toolbar" aria-label="Text formatting">
          {button(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold', <Bold size={15} />)}
          {button(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic', <Italic size={15} />)}
          {button(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline', <Underline size={15} />)}
          {button(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Strikethrough', <Strikethrough size={15} />)}
          {button(editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), 'Code', <Code size={15} />)}
          <span className="mx-0.5 h-4 w-px shrink-0 bg-black/10 dark:bg-white/10" aria-hidden />
          {headingButton(1)}
          {headingButton(2)}
          {headingButton(3)}
          {button(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), 'Quote', <Quote size={14} />)}
          {button(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Bulleted list', <List size={15} />)}
          {button(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Numbered list', <ListOrdered size={15} />)}
          {button(false, () => editor.chain().focus().setHorizontalRule().run(), 'Divider', <Minus size={15} />)}
          {button(editor.isActive('link'), link, 'Link', <LinkIcon size={14} />)}
          {button(false, () => editor.chain().focus().unsetAllMarks().clearNodes().run(), 'Clear formatting', <Eraser size={14} />)}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
});

export default RichComposer;
