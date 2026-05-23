import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { doc, getDoc, setDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db, auth, storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { RichTextEditor } from '../components/ui/RichTextEditor';
import { Save, Image as ImageIcon, Send, X, ArrowLeft, Loader2, Check, UploadCloud, ChevronDown, ListFilter, Sliders } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ARTICLE_CATEGORIES, ArticleDifficulty } from '../types/articles';

export default function ArticleWrite() {
  const { articleId } = useParams();
  const navigate = useNavigate();
  
  const [id, setId] = useState<string>(articleId || doc(collection(db, 'articles')).id);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  
  // New Article Taxonomy
  const [primaryCategory, setPrimaryCategory] = useState<string>('');
  const [subcategory, setSubcategory] = useState<string>('');
  const [difficulty, setDifficulty] = useState<ArticleDifficulty>('Intermediate');
  const [isFeatured, setIsFeatured] = useState(false);
  
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(articleId ? true : false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove non-word chars
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/--+/g, '-') // Replace multiple - with single -
      .trim();
  };

  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (articleId) {
      loadArticle(articleId);
    }
  }, [articleId]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image is too large. Max size is 5MB.");
      return;
    }

    setUploadingCover(true);
    try {
      const storageRef = ref(storage, `article_covers/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        null,
        (error) => {
          console.error("Upload failed", error);
          toast.error(error.message || "Failed to upload image.");
          setUploadingCover(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setCoverImage(downloadURL);
          setShowCoverModal(false);
          setUploadingCover(false);
        }
      );
    } catch (error: any) {
      console.error("Upload failed", error);
      toast.error(error.message || "Failed to upload image. Please try again.");
      setUploadingCover(false);
    } finally {
      if (coverFileInputRef.current) coverFileInputRef.current.value = '';
    }
  };

  const loadArticle = async (docId: string) => {
    try {
      const docRef = doc(db, 'articles', docId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().authorUid === auth.currentUser?.uid) {
        const data = docSnap.data();
        setTitle(data.title || '');
        setSubtitle(data.subtitle || '');
        setCoverImage(data.coverImage || null);
        setContent(data.content || '');
        setTags(data.tags || []);
        setStatus(data.status || 'draft');
        setPrimaryCategory(data.primaryCategoryId || '');
        setSubcategory(data.subcategory || '');
        setDifficulty(data.difficulty || 'Intermediate');
        setIsFeatured(data.isFeatured || false);
      } else if (docSnap.exists()) {
        navigate('/articles'); // unauthorized
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = useCallback(async (isPublishing = false) => {
    if (!auth.currentUser || !title.trim()) return;
    
    setSaving(true);
    try {
      const articleRef = doc(db, 'articles', id);
      const articleDoc = await getDoc(articleRef);
      
      // Calculate basic reading time based on word count
      const wordCount = content.replace(/<[^>]*>?/gm, '').split(/\s+/).length;
      const readingTime = Math.ceil(wordCount / 200);

      const payload = {
        id,
        authorUid: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous',
        title: title.trim(),
        subtitle: subtitle.trim(),
        coverImage: coverImage || '',
        content,
        tags,
        primaryCategoryId: primaryCategory,
        subcategory,
        difficulty,
        isFeatured,
        status: isPublishing ? 'published' : status,
        readingTime,
        updatedAt: serverTimestamp(),
        seo: {
          metaTitle: title.trim(),
          metaDescription: subtitle.trim() || String(content || '').replace(/<[^>]*>?/gm, '').substring(0, 160).trim(),
          keywords: tags,
          slug: generateSlug(title),
          canonicalUrl: `https://creatorspace.app/article/${id}`,
          ogType: 'article',
          ogImage: coverImage || '',
          twitterCard: 'summary_large_image'
        }
      };

      if (!articleDoc.exists()) {
        Object.assign(payload, {
          createdAt: serverTimestamp(),
          viewsCount: 0,
          likesCount: 0,
        });
      }

      if (isPublishing && status !== 'published') {
        Object.assign(payload, { publishedAt: serverTimestamp() });
      }

      await setDoc(articleRef, payload, { merge: true });
      setStatus(isPublishing ? 'published' : status);
      setLastSaved(new Date());
      
      if (isPublishing) {
        navigate(`/article/${id}`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  }, [id, title, subtitle, coverImage, content, tags, status, navigate]);

  // Auto-save effect
  useEffect(() => {
    if (!title.trim() || status === 'published') return;
    
    const timeoutId = setTimeout(() => {
      handleSave(false);
    }, 3000); // auto-save after 3 seconds of inactivity

    return () => clearTimeout(timeoutId);
  }, [title, subtitle, coverImage, content, tags]);

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim() && tags.length < 5) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Top Navbar */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-white/5 py-4">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/articles')}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col">
              <span className="font-bold">
                {status === 'published' ? 'Editing Published Article' : 'Draft'}
              </span>
              <span className="text-xs text-white/40">
                {saving ? 'Saving...' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : 'Unsaved changes'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleSave(false)}
              disabled={saving || !title.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              <span className="hidden sm:inline">Save Draft</span>
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving || !title.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-black font-bold hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              <Send size={16} />
              Publish
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Cover Image */}
        <div className="space-y-2">
          {coverImage ? (
            <div className="relative aspect-[21/9] w-full rounded-2xl overflow-hidden group">
              <img src={(coverImage && coverImage.trim() !== '') ? coverImage : `https://picsum.photos/seed/${id}/800/400`} alt="Cover" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                <button 
                  onClick={() => {
                    setCoverUrlInput(coverImage);
                    setShowCoverModal(true);
                  }}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl font-medium transition-colors"
                >
                  Change Image
                </button>
                <button 
                  onClick={() => setCoverImage(null)}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 backdrop-blur-md rounded-xl font-medium transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : showCoverModal ? (
             <div className="w-full py-12 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center bg-white/5 bg-black/20 p-8 space-y-4">
               <div className="flex w-full max-w-lg items-center gap-2 flex-wrap sm:flex-nowrap">
                 <input
                   type="url"
                   value={coverUrlInput}
                   onChange={(e) => setCoverUrlInput(e.target.value)}
                   placeholder="Paste Cover Image URL here..."
                   className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors min-w-[200px]"
                   autoFocus={!uploadingCover}
                   disabled={uploadingCover}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       e.preventDefault();
                       if (coverUrlInput) setCoverImage(coverUrlInput);
                       setShowCoverModal(false);
                     } else if (e.key === 'Escape') {
                       setShowCoverModal(false);
                     }
                   }}
                 />
                 <button
                   onClick={() => {
                     if (coverUrlInput) setCoverImage(coverUrlInput);
                     setShowCoverModal(false);
                   }}
                   disabled={uploadingCover}
                   className="p-3 bg-primary text-black rounded-xl hover:brightness-110 transition-all font-bold disabled:opacity-50"
                 >
                   <Check size={20} />
                 </button>
                 
                 <div className="hidden sm:block w-px h-8 bg-white/10 mx-1" />
                 
                 <input 
                   type="file" 
                   ref={coverFileInputRef}
                   onChange={handleCoverUpload}
                   accept="image/*"
                   className="hidden"
                 />
                 <button
                   onClick={() => coverFileInputRef.current?.click()}
                   disabled={uploadingCover}
                   className="flex items-center gap-2 px-4 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all font-medium disabled:opacity-50 whitespace-nowrap"
                 >
                   {uploadingCover ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={18} />}
                   <span className="hidden sm:inline">{uploadingCover ? 'Uploading...' : 'Upload File'}</span>
                 </button>

                 <button
                   onClick={() => setShowCoverModal(false)}
                   className="p-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all"
                 >
                   <X size={20} />
                 </button>
               </div>
             </div>
          ) : (
            <button
              onClick={() => {
                setCoverUrlInput('');
                setShowCoverModal(true);
              }}
              className="w-full py-12 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-white/40 hover:text-white hover:border-white/30 transition-colors bg-white/5"
            >
              <ImageIcon size={32} className="mb-2" />
              <span>Add Cover Image</span>
            </button>
          )}
        </div>

        {/* Title & Subtitle */}
        <div className="space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article Title..."
            className="w-full bg-transparent text-4xl sm:text-5xl font-display font-bold placeholder:text-white/20 focus:outline-none"
          />
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle (optional)..."
            className="w-full bg-transparent text-xl sm:text-2xl text-white/60 placeholder:text-white/20 focus:outline-none"
          />
        </div>

        {/* Article Taxonomy Settings */}
        <div className="bg-white/5 border border-white/10 rounded-[24px] p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                <ListFilter size={14} /> Category
              </label>
              <div className="relative">
                <select
                  value={primaryCategory}
                  onChange={(e) => {
                    setPrimaryCategory(e.target.value);
                    setSubcategory('');
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors appearance-none"
                >
                  <option value="">Select Category</option>
                  {ARTICLE_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              </div>
            </div>

            {/* Subcategory */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                <Sliders size={14} /> Subcategory
              </label>
              <div className="relative">
                <select
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  disabled={!primaryCategory}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors appearance-none disabled:opacity-50"
                >
                  <option value="">Select Subcategory</option>
                  {ARTICLE_CATEGORIES.find(c => c.id === primaryCategory)?.subcategories.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-white/40">Difficulty Level</label>
            <div className="flex flex-wrap gap-3">
              {(['Beginner', 'Intermediate', 'Advanced', 'Expert'] as ArticleDifficulty[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                    difficulty === level 
                      ? 'bg-primary text-black border-primary' 
                      : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-2">
          {tags.map(tag => (
            <span key={tag} className="flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 text-sm">
              #{tag}
              <button onClick={() => removeTag(tag)} className="p-0.5 hover:bg-white/20 rounded-full transition-colors">
                <X size={12} />
              </button>
            </span>
          ))}
          {tags.length < 5 && (
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={addTag}
              placeholder="Add tag and press Enter..."
              className="bg-transparent text-sm min-w-[200px] text-white/60 placeholder:text-white/20 focus:outline-none"
            />
          )}
        </div>

        {/* Main Editor */}
        <div className="pt-4">
          <RichTextEditor 
            content={content} 
            onChange={(html) => setContent(html)} 
          />
        </div>
      </div>
    </div>
  );
}
