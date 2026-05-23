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
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../../firebase';
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) {
    return null;
  }

  const handleAddImage = () => {
    if (urlInput.trim()) {
      editor.chain().focus().setImage({ src: urlInput }).run();
    }
    setShowImageInput(false);
    setUrlInput('');
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
      const storageRef = ref(storage, `editor/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
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
          editor.chain().focus().setImage({ src: downloadURL }).run();
          setShowImageInput(false);
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
    <div className="flex flex-col border-b border-white/10 rounded-t-xl sticky top-0 z-10 backdrop-blur-md bg-white/5">
      <div className="flex flex-wrap gap-2 p-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('bold') ? 'bg-primary text-black' : 'hover:bg-white/10'}`}
          title="Bold"
        >
          <Bold size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('italic') ? 'bg-primary text-black' : 'hover:bg-white/10'}`}
          title="Italic"
        >
          <Italic size={18} />
        </button>
        
        <div className="w-px h-6 bg-white/10 mx-1 self-center" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-primary text-black' : 'hover:bg-white/10'}`}
          title="Heading 1"
        >
          <Heading1 size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-primary text-black' : 'hover:bg-white/10'}`}
          title="Heading 2"
        >
          <Heading2 size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-primary text-black' : 'hover:bg-white/10'}`}
          title="Heading 3"
        >
          <Heading3 size={18} />
        </button>

        <div className="w-px h-6 bg-white/10 mx-1 self-center" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('bulletList') ? 'bg-primary text-black' : 'hover:bg-white/10'}`}
          title="Bullet List"
        >
          <List size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('orderedList') ? 'bg-primary text-black' : 'hover:bg-white/10'}`}
          title="Numbered List"
        >
          <ListOrdered size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('blockquote') ? 'bg-primary text-black' : 'hover:bg-white/10'}`}
          title="Quote"
        >
          <Quote size={18} />
        </button>

        <div className="w-px h-6 bg-white/10 mx-1 self-center" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('codeBlock') ? 'bg-primary text-black' : 'hover:bg-white/10'}`}
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
          }}
          className={`p-2 rounded-lg transition-colors ${showImageInput ? 'bg-white/20' : 'hover:bg-white/10'}`}
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
          className={`p-2 rounded-lg transition-colors ${editor.isActive('link') || showLinkInput ? 'bg-primary text-black' : 'hover:bg-white/10'}`}
          title="Add Link URL"
        >
          <LinkIcon size={18} />
        </button>
      </div>

      {(showImageInput || showLinkInput) && (
        <div className="px-3 pb-3 pt-1 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 flex-wrap">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={showImageInput ? "Paste image URL..." : "Paste link URL..."}
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors min-w-[200px]"
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
          <button
            onClick={showImageInput ? handleAddImage : handleAddLink}
            className="p-1.5 bg-primary text-black rounded-md hover:brightness-110 transition-all"
          >
            <Check size={16} />
          </button>
          
          {showImageInput && (
            <>
              <div className="w-px h-6 bg-white/10 mx-1" />
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
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md transition-all text-sm font-medium disabled:opacity-50"
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Upload File'}</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              setShowImageInput(false);
              setShowLinkInput(false);
            }}
            className="p-1.5 bg-white/10 text-white rounded-md hover:bg-white/20 transition-all ml-1"
          >
            <X size={16} />
          </button>
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
        class: 'prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#0d1117] prose-pre:p-4 prose-pre:rounded-lg max-w-none focus:outline-none min-h-[400px] p-4',
      },
    },
  });

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden bg-white/5 relative">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
      {editor && (
        <div className="absolute bottom-2 right-4 text-xs text-white/40">
          {editor.storage.characterCount.words()} words
        </div>
      )}
    </div>
  );
}
