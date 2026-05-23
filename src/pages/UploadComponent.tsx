import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db, auth, storage, OperationType, handleFirestoreError } from '../firebase';
import { collection, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertCircle, 
  Check, 
  ChevronRight, 
  ChevronLeft,
  DollarSign, 
  Edit3, 
  Image as ImageIcon, 
  Rocket, 
  Upload, 
  X, 
  Zap, 
  Layers, 
  BookOpen, 
  Music, 
  Video, 
  Globe,
  FileText,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Loader2,
  HelpCircle,
  Trash2,
  Plus
} from 'lucide-react';
import ProductLivePreview from '../components/ProductLivePreview';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const STEPS = [
  { id: 'basics', title: 'Basics', icon: <Layers size={18} /> },
  { id: 'assets', title: 'Assets', icon: <ImageIcon size={18} /> },
  { id: 'description', title: 'Content', icon: <FileText size={18} /> },
  { id: 'pricing', title: 'Pricing', icon: <DollarSign size={18} /> },
  { id: 'publish', title: 'Finalize', icon: <Rocket size={18} /> }
];

const CATEGORIES = [
  { id: 'ebook', name: 'E-Book', icon: <BookOpen size={18} /> },
  { id: 'course', name: 'Course', icon: <Zap size={18} /> },
  { id: 'app', name: 'App/Tool', icon: <Globe size={18} /> },
  { id: 'music', name: 'Audio', icon: <Music size={18} /> },
  { id: 'video', name: 'Video', icon: <Video size={18} /> },
  { id: 'asset', name: 'Asset', icon: <Layers size={18} /> },
];

export default function UploadComponent() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<any>({
    title: '',
    tagline: '',
    productType: 'asset',
    tags: [],
    price: 0,
    description: '',
    previewImage: '',
    previewImages: [],
    fileUrl: '',
    demoUrl: '',
    license: 'personal',
    metadata: {
      pageCount: 0,
      duration: '',
      lessonsCount: 0,
      format: 'Digital',
      includeFaq: false
    },
    faq: [],
    status: 'draft',
    slug: ''
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const id = searchParams.get('edit');
  const isEditMode = !!id;

  useEffect(() => {
    if (isEditMode && id) {
      const fetchProduct = async () => {
        setFetching(true);
        try {
          const docSnap = await getDoc(doc(db, 'products', id));
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.creatorUid !== auth.currentUser?.uid) {
              setError('You do not have permission to edit this product.');
              return;
            }
            // Ensure defaults for optional fields
            setFormData({ 
              ...data, 
              id: docSnap.id,
              metadata: {
                pageCount: 0,
                duration: '',
                lessonsCount: 0,
                format: 'Digital',
                includeFaq: false,
                ...data.metadata
              },
              faq: data.faq || []
            });
          }
        } catch (err) {
          setError('We could not load the product data at this time.');
        } finally {
          setFetching(false);
        }
      };
      fetchProduct();
    }
  }, [isEditMode, id]);

  // Auto-generate slug from title
  useEffect(() => {
    if (!isEditMode && formData.title) {
      const generatedSlug = formData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setFormData(prev => ({ ...prev, slug: generatedSlug }));
    }
  }, [formData.title, isEditMode]);

  const handleFileUpload = async (file: File, type: 'product' | 'preview') => {
  if (!auth.currentUser) {
    setError("User not authenticated");
    return null;
  }

  setUploading(prev => ({ ...prev, [type]: true }));
  setUploadProgress(prev => ({ ...prev, [type]: 0 }));

  return new Promise<string | null>((resolve) => {
    const folder = `${type}s`;
    const storageRef = ref(
      storage,
      `${folder}/${auth.currentUser!.uid}/${Date.now()}_${file.name}`
    );

    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(prev => ({ ...prev, [type]: progress }));
      },
      (error) => {
        console.error("Upload error:", error);
        setError(`Upload failed: ${error.message}`);
        setUploading(prev => ({ ...prev, [type]: false }));
        resolve(null);
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

        if (type === "product") {
          setFormData(prev => ({ ...prev, fileUrl: downloadURL }));
        } else {
          setFormData(prev => ({ ...prev, previewImage: downloadURL }));
        }

        setUploading(prev => ({ ...prev, [type]: false }));
        setUploadProgress(prev => ({ ...prev, [type]: 100 }));

        resolve(downloadURL);
      }
    );
  });
};

  const handleNext = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
  const handleBack = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  const generateAiDescription = async () => {
    if (!formData.title) {
      setError('Please enter a product title first.');
      return;
    }
    setIsAiGenerating(true);
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Write a high-converting, professional, and punchy product description for a digital asset in a marketplace.
      Product Title: ${formData.title}
      Tagline: ${formData.tagline}
      Category: ${formData.productType}
      Include: What's included, why it's valuable, and a call to action. Keep it under 200 words. Format with markdown.`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      setFormData({ ...formData, description: response.text() });
    } catch (err) {
      console.error(err);
      setError('AI generation failed. Please try again.');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        price: Number(formData.price),
        updatedAt: new Date().toISOString()
      };

      if (isEditMode && id) {
        await updateDoc(doc(db, 'products', id), payload);
        navigate(`/products/${id}`);
      } else {
        const docRef = await addDoc(collection(db, 'products'), {
          ...payload,
          creatorUid: auth.currentUser.uid,
          creatorName: auth.currentUser.displayName || 'Anonymous',
          creatorPhoto: auth.currentUser.photoURL || '',
          createdAt: new Date().toISOString(),
          salesCount: 0,
          impressions: 0,
          likes: 0,
          avgRating: 5.0,
          reviewCount: 0
        });
        navigate(`/products/${docRef.id}`);
      }
    } catch (err) {
      handleFirestoreError(err, isEditMode ? OperationType.UPDATE : OperationType.CREATE, 'products');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="min-h-screen flex items-center justify-center text-primary font-bold animate-pulse uppercase tracking-widest text-xs">Loading data...</div>;

  return (
    <div className="h-screen bg-white dark:bg-[#050505] flex flex-col overflow-hidden text-black dark:text-white font-sans">
      {/* Header */}
      <header className="h-20 border-b border-black/5 dark:border-white/5 px-8 flex items-center justify-between sticky top-0 bg-white/80 dark:bg-[#050505]/80 backdrop-blur-xl z-30">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white">
            <ChevronLeft size={24} />
          </button>
          <div className="h-8 w-px bg-black/10 dark:bg-white/10" />
          <h1 className="text-xl font-bold tracking-tight text-black dark:text-white transition-colors">
            {isEditMode ? 'Edit' : 'Upload'} <span className="text-teal-500 font-black">{formData.title || 'Product'}</span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[10px] font-black uppercase bg-black/5 dark:bg-white/5 px-3 py-1 rounded-full text-black/40 dark:text-white/40 tracking-widest border border-black/5 dark:border-white/5">
            Auto-saved draft
          </span>
          <button 
            onClick={handleSubmit}
            disabled={loading || Object.values(uploading).some(v => v) || !formData.fileUrl}
            className="px-8 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all outline-none disabled:opacity-50 disabled:grayscale shadow-lg shadow-teal-500/20"
          >
            {loading ? 'Processing...' : Object.values(uploading).some(v => v) ? 'Uploading...' : 'Publish Now'}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Form */}
        <div className="w-full lg:w-[60%] flex flex-col items-center py-6 px-8 bg-white dark:bg-[#050505] overflow-hidden">
          <div className="max-w-2xl w-full h-full flex flex-col justify-between">
            {/* Progress Stepper */}
            <div className="flex items-center justify-between mb-8 px-4 shrink-0">
              {STEPS.map((step, i) => (
                <div key={step.id} className="flex items-center group">
                  <div className="flex flex-col items-center gap-3 cursor-pointer" onClick={() => setCurrentStep(i)}>
                    <div 
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border ${
                        currentStep >= i ? 'bg-teal-500 border-teal-500 text-white shadow-[0_0_20px_rgba(20,184,166,0.3)]' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-black/30 dark:text-white/30'
                      }`}
                    >
                      {currentStep > i ? <Check size={24} strokeWidth={3} /> : step.icon}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${currentStep >= i ? 'text-black dark:text-white' : 'text-black/20 dark:text-white/20'}`}>
                      {step.title}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-px w-10 sm:w-16 mx-2 sm:mx-4 transition-colors duration-700 ${currentStep > i ? 'bg-teal-500' : 'bg-black/10 dark:bg-white/10'}`} />
                  )}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar py-4 px-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="pb-12"
                >
                {currentStep === 0 && (
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <h2 className="text-4xl font-bold tracking-tight text-black dark:text-white">Basic Information</h2>
                      <p className="text-black/40 dark:text-white/40 text-lg font-medium leading-snug">Give your digital product a clear name and category to help buyers find it.</p>
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Product Title</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Modern UI Masterclass"
                          value={formData.title}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                          className="w-full bg-black/5 dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-2xl px-6 py-5 text-xl font-bold focus:border-teal-500 outline-none transition-all placeholder:text-black/10 dark:placeholder:text-white/10 shadow-sm text-black dark:text-white"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Short Tagline</label>
                        <input 
                          type="text" 
                          placeholder="The ultimate guide to building fast interfaces"
                          value={formData.tagline}
                          onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                          className="w-full bg-black/5 dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-2xl px-6 py-5 focus:border-teal-500 outline-none transition-all text-black dark:text-white font-medium"
                        />
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Category</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {CATEGORIES.map(cat => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setFormData({ ...formData, productType: cat.id })}
                              className={`p-4 rounded-3xl border flex flex-col items-center gap-2 transition-all ${
                                formData.productType === cat.id 
                                  ? 'bg-teal-500/10 border-teal-500 shadow-lg shadow-teal-500/10' 
                                  : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 text-black/40 dark:text-white/40 hover:border-black/20 dark:hover:border-white/20'
                              }`}
                            >
                              <div className={formData.productType === cat.id ? 'text-teal-600 dark:text-teal-400' : 'text-black/20 dark:text-white/20'}>
                                {cat.icon}
                              </div>
                              <span className={`text-xs font-bold ${formData.productType === cat.id ? 'text-teal-700 dark:text-teal-300' : ''}`}>{cat.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                 {currentStep === 1 && (
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <h2 className="text-4xl font-bold tracking-tight text-black dark:text-white">Product Assets</h2>
                      <p className="text-black/40 dark:text-white/40 text-lg font-medium leading-snug">Upload your product files and some high-quality previews to show buyers exactly what they're getting.</p>
                    </div>

                    <div className="space-y-8">
                       <div 
                         onClick={() => fileInputRef.current?.click()}
                         className={`p-12 border-2 border-dashed rounded-[40px] flex flex-col items-center justify-center gap-6 transition-all group cursor-pointer ${
                           formData.fileUrl ? 'border-teal-500/50 bg-teal-500/5' : 'border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01] hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
                         }`}
                       >
                         <input 
                           type="file" 
                           ref={fileInputRef}
                           className="hidden"
                           onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'product')}
                         />
                         
                         {uploading['product'] ? (
                           <div className="flex flex-col items-center gap-4">
                             <div className="relative w-20 h-20">
                               <svg className="w-full h-full transform -rotate-90">
                                 <circle
                                   cx="40"
                                   cy="40"
                                   r="36"
                                   fill="none"
                                   stroke="currentColor"
                                   strokeWidth="4"
                                   className="text-black/5 dark:text-white/5"
                                 />
                                 <circle
                                   cx="40"
                                   cy="40"
                                   r="36"
                                   fill="none"
                                   stroke="currentColor"
                                   strokeWidth="4"
                                   strokeDasharray={226.19}
                                   strokeDashoffset={226.19 * (1 - uploadProgress['product'] / 100)}
                                   className="text-teal-500 transition-all duration-300"
                                 />
                               </svg>
                               <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-teal-600 dark:text-teal-400">
                                 {Math.round(uploadProgress['product'])}%
                               </div>
                             </div>
                             <p className="text-sm font-black text-teal-600 dark:text-teal-400 animate-pulse uppercase tracking-widest">Uploading_Securely...</p>
                           </div>
                         ) : formData.fileUrl ? (
                           <div className="flex flex-col items-center gap-4">
                             <div className="w-16 h-16 rounded-[24px] bg-teal-500 flex items-center justify-center text-white shadow-lg shadow-teal-500/30">
                               <Check size={32} />
                             </div>
                             <div className="text-center">
                               <p className="text-lg font-black text-teal-600 dark:text-teal-400 uppercase tracking-tight">File Linked Successfully</p>
                               <p className="text-black/30 dark:text-white/30 text-[10px] uppercase font-black tracking-widest mt-1">Ready for deployment</p>
                             </div>
                           </div>
                         ) : (
                           <>
                             <div className="w-16 h-16 rounded-[24px] bg-black/5 dark:bg-white/5 flex items-center justify-center text-black/20 dark:text-white/20 group-hover:text-teal-500 transition-colors">
                               <Upload size={32} />
                             </div>
                             <div className="text-center">
                                <p className="text-lg font-black mb-1 text-black dark:text-white uppercase tracking-tight">Click to upload product file</p>
                                <p className="text-black/30 dark:text-white/30 text-xs uppercase font-black tracking-widest">ZIP, PDF, MP3, MP4 up to 500MB</p>
                             </div>
                           </>
                         )}
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Cover Image</label>
                            <div 
                              onClick={() => imageInputRef.current?.click()}
                              className="aspect-video rounded-3xl border-2 border-dashed border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01] hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group overflow-hidden relative"
                            >
                              <input 
                                type="file" 
                                ref={imageInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'preview')}
                              />
                              
                              {uploading['preview'] ? (
                                <div className="flex flex-col items-center gap-2">
                                  <Loader2 className="animate-spin text-teal-500" size={24} />
                                  <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest">Processing Image</span>
                                </div>
                              ) : formData.previewImage ? (
                                <>
                                  <img src={formData.previewImage} alt="Preview" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <div className="flex items-center gap-2 text-white font-black uppercase tracking-widest text-xs">
                                      <Edit3 size={16} /> Change Cover
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <ImageIcon className="text-black/20 dark:text-white/20 group-hover:text-teal-500 transition-colors" size={32} />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-black/30 dark:text-white/30">Upload Artwork</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Demo URL (Optional)</label>
                            <div className="h-full flex flex-col justify-end">
                              <input 
                                type="text" 
                                placeholder="https://demo.your-product.com"
                                value={formData.demoUrl}
                                onChange={(e) => setFormData({ ...formData, demoUrl: e.target.value })}
                                className="w-full bg-black/5 dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-teal-500 transition-all font-medium text-sm text-black dark:text-white"
                              />
                              <p className="mt-3 text-[10px] text-black/20 dark:text-white/20 uppercase font-black tracking-widest">External preview link</p>
                            </div>
                          </div>
                       </div>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <h2 className="text-4xl font-black tracking-tighter text-black dark:text-white uppercase transition-colors">Tell Your Story</h2>
                      <p className="text-black/40 dark:text-white/40 text-lg font-medium">Detail what makes this asset essential. Creators buy solutions, not files.</p>
                    </div>

                    <div className="space-y-8">
                       <div className="relative group">
                          <div className="absolute -top-12 right-0 flex items-center gap-2">
                             <button 
                               onClick={generateAiDescription}
                               disabled={isAiGenerating}
                               className="flex items-center gap-2 px-4 py-2 bg-teal-500/20 text-teal-600 dark:text-teal-400 hover:bg-teal-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-teal-500/30 transition-all disabled:opacity-50 shadow-sm"
                             >
                               {isAiGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                               {isAiGenerating ? 'AI Magic in progress...' : 'Magic Write'}
                             </button>
                          </div>
                          <textarea 
                            rows={12}
                            placeholder="Describe the problem this solves, what's included, and how to use it..."
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full bg-black/5 dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-[32px] p-8 focus:border-teal-500 outline-none transition-all leading-relaxed font-medium shadow-sm text-black dark:text-white"
                          />
                       </div>

                       <div className="flex items-center justify-between p-6 bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-3xl">
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-teal-600 dark:text-teal-400">
                               <ShieldCheck size={24} />
                             </div>
                             <div>
                               <p className="font-black text-black dark:text-white uppercase tracking-tight">License Type</p>
                               <p className="text-[10px] text-black/30 dark:text-white/30 uppercase font-black tracking-widest">Standard Personal/Commercial</p>
                             </div>
                          </div>
                          <select 
                            value={formData.license}
                            onChange={(e) => setFormData({ ...formData, license: e.target.value })}
                            className="bg-transparent text-sm font-black uppercase tracking-widest outline-none text-teal-600 dark:text-teal-400 cursor-pointer"
                          >
                            <option value="personal" className="bg-white dark:bg-black">Personal only</option>
                            <option value="commercial" className="bg-white dark:bg-black">Commercial</option>
                            <option value="extended" className="bg-white dark:bg-black">Extended</option>
                          </select>
                       </div>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <h2 className="text-4xl font-bold tracking-tight text-black dark:text-white">Pricing & Earnings</h2>
                      <p className="text-black/40 dark:text-white/40 text-lg font-medium leading-snug">Set a fair price for your work. You'll receive 90% of every sale directly to your account.</p>
                    </div>

                    <div className="space-y-12">
                       <div className="flex items-center gap-8 bg-black/[0.02] dark:bg-white/[0.02] p-10 rounded-[48px] border border-black/5 dark:border-white/5 relative overflow-hidden group">
                          <div className="absolute inset-0 bg-teal-500/5 dark:bg-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="flex-1 space-y-4 relative z-10">
                             <label className="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Price (USD)</label>
                             <div className="relative">
                                <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 text-black/20 dark:text-white/20" size={32} />
                                <input 
                                  type="number" 
                                  value={formData.price}
                                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                  className="w-full bg-black/5 dark:bg-black/40 border-b-2 border-black/10 dark:border-white/10 focus:border-teal-500 px-16 py-8 text-6xl font-black outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm text-black dark:text-white"
                                />
                             </div>
                          </div>
                       </div>

                       <div className="grid grid-cols-2 gap-6 text-center">
                          <div className="p-8 bg-black/5 dark:bg-[#121212] rounded-[32px] border border-black/5 dark:border-white/5 group hover:border-black/20 dark:hover:border-white/20 transition-all">
                             <p className="text-[10px] font-black uppercase tracking-widest text-black/20 dark:text-white/20 mb-4">Platform Fee (10%)</p>
                             <p className="text-3xl font-black text-red-600 dark:text-red-500/80">-${(Number(formData.price) * 0.1).toFixed(2)}</p>
                          </div>
                          <div className="p-8 bg-teal-500/10 rounded-[32px] border border-teal-500/20 group hover:bg-teal-500/20 transition-all">
                             <p className="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 mb-4">Your Earnings</p>
                             <p className="text-4xl font-black text-teal-700 dark:text-white">${(Number(formData.price) * 0.9).toFixed(2)}</p>
                          </div>
                       </div>
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <h2 className="text-4xl font-bold tracking-tight text-black dark:text-white">Final Review</h2>
                      <p className="text-black/40 dark:text-white/40 text-lg font-medium leading-snug">Almost there! Review your product details before making it public.</p>
                    </div>

                    <div className="space-y-8">
                        <div className="p-8 bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-[40px] space-y-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-500">
                                 <CheckCircle2 size={24} />
                               </div>
                               <div>
                                 <p className="font-black text-black dark:text-white uppercase tracking-tight">Public Release</p>
                                 <p className="text-xs text-black/30 dark:text-white/30 font-medium">Instantly searchable in the marketplace.</p>
                               </div>
                            </div>
                            <button type="button" className="w-14 h-8 bg-teal-500 rounded-full p-1 relative flex items-center justify-end">
                               <div className="w-6 h-6 bg-white rounded-full shadow-lg" />
                            </button>
                          </div>

                          <div className="h-px bg-black/5 dark:bg-white/5" />

                          {/* FAQ Toggle and Management */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                                <HelpCircle size={24} />
                              </div>
                              <div>
                                <p className="font-black text-black dark:text-white uppercase tracking-tight">Support Protocol</p>
                                <p className="text-xs text-black/30 dark:text-white/30 font-medium">Include frequently asked questions for buyers.</p>
                              </div>
                            </div>
                            <button 
                              type="button" 
                              onClick={() => setFormData({
                                ...formData,
                                metadata: { ...formData.metadata, includeFaq: !formData.metadata.includeFaq }
                              })}
                              className={`w-14 h-8 rounded-full p-1 relative flex items-center transition-colors ${
                                formData.metadata.includeFaq ? 'bg-orange-500 justify-end' : 'bg-black/10 dark:bg-white/10 justify-start'
                              }`}
                            >
                              <motion.div 
                                layout
                                className="w-6 h-6 bg-white rounded-full shadow-lg" 
                              />
                            </button>
                          </div>

                          {formData.metadata.includeFaq && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="space-y-4 pt-4 border-t border-black/5 dark:border-white/5"
                            >
                              {formData.faq?.map((item: any, index: number) => (
                                <div key={index} className="space-y-3 p-6 bg-black/5 dark:bg-white/5 rounded-2xl relative group/faq">
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      const newFaq = [...formData.faq];
                                      newFaq.splice(index, 1);
                                      setFormData({ ...formData, faq: newFaq });
                                    }}
                                    className="absolute top-4 right-4 text-red-500 opacity-0 group-hover/faq:opacity-100 transition-opacity"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-black/40 dark:text-white/40 tracking-widest">Question</label>
                                    <input 
                                      type="text"
                                      value={item.question}
                                      onChange={(e) => {
                                        const newFaq = [...formData.faq];
                                        newFaq[index].question = e.target.value.toUpperCase();
                                        setFormData({ ...formData, faq: newFaq });
                                      }}
                                      placeholder="E.G. WHAT IS INCLUDED IN THE SOURCE FILE?"
                                      className="w-full bg-transparent border-b border-black/10 dark:border-white/10 py-2 outline-none font-bold text-sm text-black dark:text-white uppercase"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-black/40 dark:text-white/40 tracking-widest">Answer</label>
                                    <textarea 
                                      value={item.answer}
                                      onChange={(e) => {
                                        const newFaq = [...formData.faq];
                                        newFaq[index].answer = e.target.value;
                                        setFormData({ ...formData, faq: newFaq });
                                      }}
                                      placeholder="Describe the answer in detail..."
                                      rows={2}
                                      className="w-full bg-transparent py-2 outline-none font-medium text-sm text-black/60 dark:text-white/60 resize-none"
                                    />
                                  </div>
                                </div>
                              ))}
                              <button 
                                type="button"
                                onClick={() => setFormData({ 
                                  ...formData, 
                                  faq: [...(formData.faq || []), { question: '', answer: '' }] 
                                })}
                                className="w-full py-4 border-2 border-dashed border-black/10 dark:border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 hover:border-orange-500/50 hover:text-orange-500 transition-all flex items-center justify-center gap-2"
                              >
                                <Plus size={14} /> Add FAQ Pair
                              </button>
                            </motion.div>
                          )}

                          <div className="h-px bg-black/5 dark:bg-white/5" />

                          <div className="space-y-2">
                             <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Custom URL Slug</label>
                             <div className="flex items-center bg-black/5 dark:bg-black/40 rounded-2xl px-6 py-4 border border-black/5 dark:border-white/5">
                                <span className="text-black/20 dark:text-white/20 font-black mr-2 text-sm">kith.com/assets/</span>
                                <input 
                                  type="text" 
                                  value={formData.slug}
                                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                  placeholder={formData.title.toLowerCase().replace(/ /g, '-')}
                                  className="flex-1 bg-transparent outline-none font-bold text-sm text-teal-600 dark:text-teal-400"
                                />
                             </div>
                          </div>
                       </div>

                       <div className="p-8 bg-teal-500/5 rounded-[40px] border border-teal-500/10 flex items-center gap-8 group">
                          <div className="w-20 h-20 rounded-[28px] bg-teal-500 flex items-center justify-center text-white shrink-0 shadow-teal-500/50 shadow-2xl group-hover:scale-110 transition-transform">
                             <CheckCircle2 size={40} />
                          </div>
                          <div>
                             <h3 className="text-2xl font-bold mb-1 text-black dark:text-white">Ready to Publish</h3>
                             <p className="text-black/50 dark:text-white/50 leading-snug font-medium">Your product is ready for the marketplace. Click below to make it live.</p>
                          </div>
                       </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

            {/* Navigation */}
            <div className="mt-8 flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-8 shrink-0">
              <button 
                type="button"
                onClick={handleBack}
                disabled={currentStep === 0}
                className={`flex items-center gap-2 font-black uppercase tracking-[0.2em] text-[10px] transition-all ${
                  currentStep === 0 ? 'opacity-0' : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'
                }`}
              >
                <ChevronLeft size={16} /> Back
              </button>
              
              {currentStep < STEPS.length - 1 ? (
                <button 
                  type="button"
                  onClick={handleNext}
                  className="px-10 py-5 bg-black/5 dark:bg-white/10 hover:bg-black dark:hover:bg-white text-black dark:text-white hover:text-white dark:hover:text-black rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2"
                >
                  Next Step <ChevronRight size={16} />
                </button>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  {!formData.fileUrl && currentStep === 4 && (
                    <p className="text-[10px] text-red-600 dark:text-red-500 font-black uppercase tracking-widest animate-pulse">Product File Required</p>
                  )}
                  <button 
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || Object.values(uploading).some(v => v) || !formData.fileUrl}
                    className="px-12 py-5 bg-teal-500 text-white rounded-[24px] font-bold uppercase tracking-widest text-[10px] transition-all shadow-lg shadow-teal-500/20 flex items-center gap-3 disabled:opacity-50 disabled:grayscale"
                  >
                    {loading ? 'Publishing...' : Object.values(uploading).some(v => v) ? 'Uploading Files...' : 'Publish Product'} <Rocket size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Live Preview */}
        <aside className="hidden lg:block w-[40%] bg-black/[0.02] dark:bg-[#080808] border-l border-black/5 dark:border-white/5 p-12 overflow-hidden">
           <ProductLivePreview product={formData} />
        </aside>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 p-6 glass rounded-2xl border border-red-500/20 text-red-400 flex items-center gap-4 z-50"
          >
            <AlertCircle size={24} />
            <p className="font-bold uppercase tracking-tight text-sm">{error}</p>
            <button onClick={() => setError(null)} className="p-1 hover:bg-white/10 rounded-lg ml-auto">
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
