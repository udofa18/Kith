import { useState, useRef } from 'react';
import axios from 'axios';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { common, createLowlight } from 'lowlight';
import { ref, uploadBytesResumable, getDownloadURL } from '../../lib/storage';
import { auth } from '../../firebase';
import { toast } from 'react-hot-toast';
import { 
  Bold, Italic, List, ListOrdered, Quote, Heading1, 
  Heading2, Heading3, Code, ImageIcon, Link as LinkIcon, Check, X, UploadCloud, Loader2
} from 'lucide-react';
import 'highlight.js/styles/github-dark.css';

const lowlight = createLowlight(common);

const MenuBar = ({ editor }: { editor: any }) => {
  const [showImageInput, setShowImageInput] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) {
    return null;
  }

  const insertImage = (src: string) => {
    editor
      .chain()
      .focus()
      .setImage({ src, alt: imageAlt.trim(), title: imageCaption.trim() })
      .run();
    setShowImageInput(false);
    setUrlInput('');
    setImageAlt('');
    setImageCaption('');
  };

  const handleAddImage = () => {
    if (urlInput.trim()) insertImage(urlInput.trim());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image is too large. Max size is 5MB.");
      return;
    }

    setUploading(true);
    try {
      const storageRef = ref(null, `editor/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        null,
        (error) => {
          console.error("Upload failed", error);
          toast.error(error.message || "Failed to upload image.");
          setUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          insertImage(downloadURL);
          setUploading(false);
        }
      );
    } catch (error: any) {
      console.error("Upload failed", error);
      toast.error(error.message || "Failed to upload image. Please try again.");
      setUploading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddLink = () => {
    if (urlInput.trim()) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: urlInput }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    }
    setShowLinkInput(false);
    setUrlInput('');
  };

  return (
    <div className="flex flex-col border-b border-border rounded-t-control sticky top-0 z-10 backdrop-blur-md bg-surface/90">
      <div className="flex flex-wrap gap-2 p-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          title="Bold"
        >
          <Bold size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          title="Italic"
        >
          <Italic size={18} />
        </button>
        
        <div className="w-px h-6 bg-border mx-1 self-center" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          title="Heading 1"
        >
          <Heading1 size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          title="Heading 2"
        >
          <Heading2 size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          title="Heading 3"
        >
          <Heading3 size={18} />
        </button>

        <div className="w-px h-6 bg-border mx-1 self-center" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          title="Bullet List"
        >
          <List size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('orderedList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          title="Numbered List"
        >
          <ListOrdered size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('blockquote') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          title="Quote"
        >
          <Quote size={18} />
        </button>

        <div className="w-px h-6 bg-border mx-1 self-center" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('codeBlock') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          title="Code Block"
        >
          <Code size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            setShowLinkInput(false);
            setShowImageInput(!showImageInput);
            setUrlInput('');
            setImageAlt('');
            setImageCaption('');
          }}
          className={`p-2 rounded-lg transition-colors ${showImageInput ? 'bg-muted' : 'hover:bg-muted'}`}
          title="Add Image URL"
        >
          <ImageIcon size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            setShowImageInput(false);
            setShowLinkInput(!showLinkInput);
            setUrlInput(editor.isActive('link') ? editor.getAttributes('link').href : '');
          }}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('link') || showLinkInput ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          title="Add Link URL"
        >
          <LinkIcon size={18} />
        </button>
      </div>

      {(showImageInput || showLinkInput) && (
        <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-2 px-3 pb-3 pt-1">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={showImageInput ? 'Paste image URL…' : 'Paste link URL…'}
            aria-label={showImageInput ? 'Image URL' : 'Link URL'}
            className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors"
            autoFocus={!uploading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                showImageInput ? handleAddImage() : handleAddLink();
              } else if (e.key === 'Escape') {
                setShowImageInput(false);
                setShowLinkInput(false);
              }
            }}
          />

          {showImageInput && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                placeholder="Alt text: describe the image"
                aria-label="Image alt text"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors"
              />
              <input
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
                placeholder="Caption (optional)"
                aria-label="Image caption"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={showImageInput ? handleAddImage : handleAddLink}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:brightness-110"
            >
              <Check size={14} />
              {showImageInput ? 'Insert image' : 'Apply link'}
            </button>

            {showImageInput && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs font-semibold transition-all hover:bg-muted/80 disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                  {uploading ? 'Uploading…' : 'Upload file'}
                </button>
                <span className="text-[10px] leading-relaxed text-faint">
                  Alt text is read aloud; captions appear under the image.
                </span>
              </>
            )}

            <button
              onClick={() => {
                setShowImageInput(false);
                setShowLinkInput(false);
              }}
              className="ml-auto p-1.5 rounded-md bg-muted text-foreground transition-all hover:bg-muted/80"
              aria-label="Close image or link input"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export function RichTextEditor({ 
  content, 
  onChange 
}: { 
  content: string; 
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'javascript',
      }),
      Image,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
      Placeholder.configure({
        placeholder: 'Write your story here... Use "/" for commands.',
      }),
      CharacterCount,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert prose-p:leading-relaxed prose-pre:bg-[#0d1117] prose-pre:p-4 prose-pre:rounded-lg max-w-none text-foreground focus:outline-none min-h-[400px] p-4',
      },
    },
  });

  return (
    <div className="border border-border rounded-control overflow-hidden bg-surface relative">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
      {editor && (
        <div className="absolute bottom-2 right-4 text-xs text-faint">
          {editor.storage.characterCount.words()} words
        </div>
      )}
    </div>
  );
}
