import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  User, 
  Settings as SettingsIcon, 
  Shield, 
  Bell, 
  Lock, 
  CreditCard, 
  Zap, 
  Users, 
  Terminal, 
  Trash2,
  ChevronRight,
  Github,
  Globe,
  Camera,
  Check,
  X,
  Plus,
  ArrowRight,
  LogOut,
  Mail,
  Smartphone,
  Info,
  ExternalLink,
  Save,
  Loader2,
  Globe2,
  Menu,
  Edit2,
  Download,
  Eye,
  Instagram,
  Linkedin,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, storage, handleFirestoreError, OperationType } from '../firebase';
import { doc, onSnapshot, updateDoc, collection, query, where, getDocs, deleteDoc, increment, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth';
import Sidebar from '../components/Sidebar';
import LocationInput from '../components/LocationInput';

const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User, description: 'Manage your public identity and profile picture' },
  { id: 'account', label: 'Account', icon: Mail, description: 'Update your email and personal details' },
  { id: 'security', label: 'Security', icon: Shield, description: 'Protect your account and revoke sessions' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Control how you receive updates' },
  { id: 'appearance', label: 'Appearance', icon: Eye, description: 'Customize theme, layout, and focus mode' },
  { id: 'privacy', label: 'Privacy', icon: Lock, description: 'Manage visibility and data usage' },
  { id: 'billing', icon: CreditCard, label: 'Billing', description: 'Manage subscriptions and payment methods' },
  { id: 'rewards', label: 'XP & Rewards', icon: Zap, description: 'View your experience history and levels' },
  { id: 'communities', label: 'Communities', icon: Users, description: 'Manage your community memberships' },
  { id: 'developer', label: 'Developer', icon: Terminal, description: 'Customize your CLI and dev tools' },
  { id: 'danger', label: 'Danger Zone', icon: Trash2, description: 'Irreversible account actions' },
];

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentTab = searchParams.get('tab') || 'profile';
  const [userProfile, setUserProfile] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });

  useEffect(() => {
    if (!auth.currentUser) {
      navigate('/login');
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setUserProfile(data);
        // Initialize form data only once or when reset
        setFormData((prev: any) => ({ ...data, ...prev }));
      }
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${auth.currentUser?.uid}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleUpdateProfile = async (updates: any = formData) => {
    if (!auth.currentUser) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), updates);
      setSuccess('Settings updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLocationChange = async (location: string, lat?: number, lng?: number) => {
    const updates: any = { location };
    
    if (lat && lng) {
      const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
      const timestamp = Math.floor(Date.now() / 1000);
      try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${apiKey}`);
        const data = await response.json();
        if (data.status === 'OK') {
          updates.timezone = data.timeZoneId;
        }
      } catch (err) {
        console.error("Timezone fetch failed:", err);
      }
    }

    setFormData({ ...formData, ...updates });
    // Auto-save location/timezone changes
    handleUpdateProfile(updates);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    setUploading(true);
    setError(null);
    try {
      const storageRef = ref(storage, `avatars/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        null,
        (error) => {
          console.error('Avatar upload error:', error);
          setError(error.message || 'Image upload failed');
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          await updateDoc(doc(db, 'users', auth.currentUser!.uid), { profileImage: url });
          setSuccess('Profile picture updated!');
          setUploading(false);
        }
      );
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setError(err.message || 'Image upload failed');
      setUploading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.next !== passwords.confirm) {
      setError("New passwords don't match");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) return;
      const credential = EmailAuthProvider.credential(user.email, passwords.current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwords.next);
      setSuccess('Password changed successfully!');
      setPasswords({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      setError(err.message || 'Password change failed');
    } finally {
      setSaving(false);
    }
  };

  const changeTab = (tabId: string) => {
    setSearchParams({ tab: tabId });
    setIsSidebarOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="flex bg-[#050505] min-h-screen">
      <main className="flex-1 flex flex-col md:flex-row min-w-0">
        {/* Settings Sidebar */}
        <div className={`fixed inset-0 z-50 md:relative md:inset-auto md:z-auto bg-black/80 backdrop-blur-xl md:bg-transparent ${isSidebarOpen ? 'block' : 'hidden md:block'}`}>
          <div className="w-80 h-full border-r border-white/5 flex flex-col pt-24 px-6 md:pt-12">
            <div className="flex items-center justify-between mb-8 md:hidden">
              <h2 className="text-xl font-bold">Menu</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 glass rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <h1 className="text-2xl font-bold mb-8 px-2">Settings</h1>
            
            <nav className="space-y-1">
              {SETTINGS_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => changeTab(section.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    currentTab === section.id 
                    ? 'bg-primary/20 text-primary border border-primary/20 shadow-[0_0_20px_rgba(0,242,255,0.1)]' 
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <section.icon size={18} />
                  <span className="font-medium text-sm">{section.label}</span>
                  {currentTab === section.id && <motion.div layoutId="active" className="ml-auto w-1 h-4 bg-primary rounded-full" />}
                </button>
              ))}
            </nav>

            <div className="mt-auto pb-12 px-2">
              <button 
                onClick={() => signOut(auth)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-500/10 transition-all font-medium text-sm"
              >
                <LogOut size={18} /> Exit System
              </button>
            </div>
          </div>
        </div>

        {/* Settings Content */}
        <div className="flex-1 h-screen overflow-y-auto custom-scrollbar pt-20 md:pt-12 pb-24 px-4 md:px-12">
          {/* Mobile Header */}
          <div className="flex items-center justify-between mb-8 md:hidden">
            <button onClick={() => setIsSidebarOpen(true)} className="flex items-center gap-2 p-3 glass rounded-xl">
              <Menu size={20} />
              <span className="text-xs font-bold uppercase tracking-wider">{SETTINGS_SECTIONS.find(s => s.id === currentTab)?.label}</span>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10">
                <img src={(userProfile?.profileImage && userProfile.profileImage.trim() !== '') ? userProfile.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.uid}`} referrerPolicy="no-referrer" />
              </div>
            </div>
          </div>

          <div className="max-w-4xl">
            <div className="mb-0">
               <h2 className="text-3xl font-bold mb-2">{SETTINGS_SECTIONS.find(s => s.id === currentTab)?.label}</h2>
               <p className="text-white/40 mb-12">{SETTINGS_SECTIONS.find(s => s.id === currentTab)?.description}</p>
            </div>

            <div className="space-y-4 mb-8">
              <AnimatePresence>
                {success && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl text-green-400 text-sm flex items-center gap-2"
                  >
                    <Check size={18} /> {success}
                  </motion.div>
                )}

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-center gap-2"
                  >
                    <X size={18} /> {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                {/* --- PROFILE SECTION --- */}
                {currentTab === 'profile' && (
                  <>
                    <div className="glass rounded-3xl p-8 border border-white/5 bg-gradient-to-br from-white/5 to-transparent">
                      <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="relative group">
                          <div className="w-32 h-32 rounded-[32px] overflow-hidden border-4 border-white/10 neon-glow relative">
                            <img 
                              src={(userProfile?.profileImage && userProfile.profileImage.trim() !== '') ? userProfile.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.uid}`} 
                              alt="Avatar" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            {uploading && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                <Loader2 className="animate-spin text-primary" />
                              </div>
                            )}
                          </div>
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center hover:scale-110 transition-all shadow-xl neon-glow"
                          >
                            <Camera size={18} />
                          </button>
                          <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                        </div>
                        <div className="text-center md:text-left">
                          <h3 className="text-xl font-bold mb-1">{userProfile?.displayName}</h3>
                          <p className="text-white/40 text-sm mb-4">@{userProfile?.username}</p>
                          <div className="flex flex-wrap gap-2">
                             <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-bold uppercase">LVL {Math.floor((userProfile?.xp || 0) / 100) + 1}</span>
                             <span className="px-3 py-1 bg-white/5 text-white/40 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-wider">{userProfile?.userType || 'Developer'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="glass rounded-3xl p-8 border border-white/5 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Display Name</label>
                          <input 
                            type="text" 
                            value={formData.displayName || ''}
                            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-primary outline-none transition-all placeholder:text-white/10"
                            placeholder="John Doe"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Username</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-mono">@</span>
                            <input 
                              type="text" 
                              value={formData.username || ''}
                              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 focus:border-primary outline-none transition-all"
                            />
                          </div>
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Short Bio</label>
                          <textarea 
                            value={formData.bio || ''}
                            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-primary outline-none transition-all h-28 resize-none"
                            placeholder="Tell us what you build..."
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Location</label>
                          <LocationInput 
                            defaultValue={userProfile?.location}
                            onLocationSelect={handleLocationChange}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">External Website</label>
                          <div className="relative">
                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                            <input 
                              type="url" 
                              value={formData.websiteUrl || ''}
                              onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                              className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:border-primary outline-none transition-all"
                              placeholder="https://example.com"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end pt-4">
                        <button 
                          onClick={() => handleUpdateProfile()}
                          disabled={saving}
                          className="px-8 py-3 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-xl neon-glow flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
                        >
                          {saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                          Save Profile Details
                        </button>
                      </div>
                    </div>

                    <div className="glass rounded-3xl p-8 border border-white/5 space-y-6">
                      <h3 className="text-lg font-bold">Social Links</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { icon: Github, label: 'GitHub', key: 'githubUrl', placeholder: 'github.com/username' },
                          { icon: Globe, label: 'Twitter', key: 'twitterUrl', placeholder: 'twitter.com/username' },
                          { icon: Instagram, label: 'Instagram', key: 'instagramUrl', placeholder: 'instagram.com/username' },
                          { icon: Linkedin, label: 'LinkedIn', key: 'linkedinUrl', placeholder: 'linkedin.com/username' },
                        ].map(({ icon: Icon, label, key, placeholder }) => (
                          <div key={key} className="relative">
                            <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                            <input 
                              type="text" 
                              value={formData[key] || ''}
                              onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                              className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:border-primary outline-none transition-all"
                              placeholder={placeholder}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end pt-2">
                        <button 
                          onClick={() => handleUpdateProfile()}
                          disabled={saving}
                          className="px-8 py-3 bg-white/5 border border-white/10 text-white/80 text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
                        >
                          Update Socials
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* --- ACCOUNT SECTION --- */}
                {currentTab === 'account' && (
                  <div className="space-y-6">
                    <div className="glass rounded-3xl p-8 border border-white/5 space-y-8">
                       <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                          <div className="w-12 h-12 bg-primary/20 text-primary rounded-xl flex items-center justify-center">
                            <Mail size={24} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Primary Email</p>
                            <p className="text-white font-medium">{userProfile?.email}</p>
                          </div>
                          <span className="ml-auto px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-[10px] font-bold uppercase tracking-widest">Verified</span>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                             <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Language</label>
                             <select 
                                defaultValue={userProfile?.language || 'en'}
                                onChange={(e) => handleUpdateProfile({ language: e.target.value })}
                                className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all text-white"
                             >
                                <option value="en">English (US)</option>
                                <option value="uk">English (UK)</option>
                                <option value="es">Spanish</option>
                                <option value="fr">French</option>
                             </select>
                          </div>
                          <div className="space-y-2">
                             <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Timezone</label>
                             <div className="relative">
                               <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                               <input 
                                  readOnly
                                  value={userProfile?.timezone || 'UTC'}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 outline-none transition-all text-white/50 cursor-not-allowed italic"
                               />
                             </div>
                             <p className="text-[10px] text-white/20 mt-1 pl-1">Automatically updated via Location settings.</p>
                          </div>
                       </div>
                    </div>

                    <div className="glass rounded-3xl p-8 border border-white/5">
                      <h4 className="font-bold mb-4">Onboarding Status</h4>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <div className={`w-3 h-3 rounded-full ${userProfile?.onboardingCompleted ? 'bg-green-500 neon-glow' : 'bg-yellow-500 animate-pulse'}`} />
                           <span className="text-sm text-white/70">
                              {userProfile?.onboardingCompleted ? 'Systems initialized. Fully onboarded.' : 'Incomplete setup. Re-run initialization required.'}
                           </span>
                        </div>
                        {!userProfile?.onboardingCompleted && (
                           <button onClick={() => navigate('/onboarding')} className="px-6 py-2 bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-primary hover:text-white transition-all">
                              Initialize
                           </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* --- SECURITY SECTION --- */}
                {currentTab === 'security' && (
                  <div className="space-y-6">
                    <div className="glass rounded-3xl p-8 border border-white/5">
                      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <Lock size={20} className="text-primary" /> Update Password
                      </h3>
                      <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/30 uppercase pl-1">Current Password</label>
                          <input 
                            type="password" 
                            required 
                            value={passwords.current}
                            onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/30 uppercase pl-1">New Password</label>
                          <input 
                            type="password" 
                            required 
                            value={passwords.next}
                            onChange={(e) => setPasswords({...passwords, next: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/30 uppercase pl-1">Confirm New Password</label>
                          <input 
                            type="password" 
                            required 
                            value={passwords.confirm}
                            onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary"
                          />
                        </div>
                        <button 
                          type="submit" 
                          disabled={saving}
                          className="w-full py-4 bg-primary text-white font-bold rounded-2xl hover:scale-[1.02] active:scale-95 transition-all neon-glow flex items-center justify-center gap-2"
                        >
                          {saving ? <Loader2 className="animate-spin" /> : <Shield size={18} />}
                          Save Password
                        </button>
                      </form>
                    </div>

                    <div className="glass rounded-3xl p-8 border border-white/5">
                      <div className="flex items-center justify-between mb-8">
                         <div>
                            <h3 className="text-lg font-bold mb-1">Two-Factor Authentication</h3>
                            <p className="text-sm text-white/40">Add an extra layer of security to your identity.</p>
                         </div>
                         <div className="w-12 h-6 bg-white/10 rounded-full relative p-1 cursor-pointer">
                            <div className="w-4 h-4 bg-white/30 rounded-full" />
                         </div>
                      </div>
                      <div className="flex items-center gap-4 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                         <Info className="text-primary" size={20} />
                         <p className="text-xs text-white/60">Strongly recommended for accounts with high component sales.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- NOTIFICATIONS SECTION --- */}
                {currentTab === 'notifications' && (
                  <div className="space-y-6">
                    {[
                      { 
                        title: 'Email Alerts', 
                        items: [
                          { label: 'Weekly Performance Report', key: 'emailPerformance', desc: 'Summary of component sales and impressions' },
                          { label: 'Security Alerts', key: 'emailSecurity', desc: 'Notification of login attempts from new devices', disabled: true },
                        ]
                      },
                      { 
                        title: 'Push Notifications', 
                        items: [
                          { label: 'Direct Messages', key: 'pushDMs', desc: 'When you receive a new chat message' },
                          { label: 'Component Sales', key: 'pushSales', desc: 'Instant alert when someone buys your component' },
                          { label: 'Marketplace Trends', key: 'pushTrends', desc: 'Trending components and developer alerts' }
                        ]
                      }
                    ].map((group, i) => (
                      <div key={i} className="glass rounded-3xl p-8 border border-white/5 space-y-6">
                        <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest">{group.title}</h4>
                        <div className="space-y-6">
                          {group.items.map((item) => (
                            <div key={item.key} className="flex items-center justify-between">
                              <div className="max-w-md">
                                <p className="font-bold text-sm mb-1">{item.label}</p>
                                <p className="text-xs text-white/40 leading-relaxed">{item.desc}</p>
                              </div>
                              <button 
                                onClick={() => !item.disabled && handleUpdateProfile({ [`notif_${item.key}`]: !userProfile?.[`notif_${item.key}`] })}
                                className={`w-12 h-6 rounded-full transition-all relative ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${userProfile?.[`notif_${item.key}`] ? 'bg-primary' : 'bg-white/10'}`}
                              >
                                <motion.div 
                                  animate={{ x: userProfile?.[`notif_${item.key}`] ? 26 : 4 }}
                                  className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg"
                                />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                 {/* --- APPEARANCE SECTION --- */}
                {currentTab === 'appearance' && (
                  <div className="space-y-6">
                    <div className="glass rounded-3xl p-8 border border-white/5 space-y-8">
                       <div>
                          <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest mb-6">Theme Settings</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button 
                              onClick={() => {
                                handleUpdateProfile({ theme: 'dark' });
                                document.documentElement.classList.remove('light');
                              }}
                              className={`p-6 rounded-2xl border transition-all flex flex-col items-center gap-4 ${userProfile?.theme !== 'light' ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(139,92,246,0.15)]' : 'bg-white/5 border-white/5 hover:border-white/20'}`}
                            >
                              <div className="w-16 h-16 rounded-full bg-[#111827] border border-white/10 flex items-center justify-center shadow-lg">
                                <div className="w-6 h-6 rounded-full bg-primary" />
                              </div>
                              <div className="text-center">
                                <p className="font-bold text-sm">Dark Theme</p>
                                <p className="text-[10px] text-white/40 uppercase">Default Appearance</p>
                              </div>
                            </button>

                            <button 
                              onClick={() => {
                                handleUpdateProfile({ theme: 'light' });
                                document.documentElement.classList.add('light');
                              }}
                              className={`p-6 rounded-2xl border transition-all flex flex-col items-center gap-4 ${userProfile?.theme === 'light' ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(139,92,246,0.15)]' : 'bg-white/5 border-white/5 hover:border-white/20'}`}
                            >
                              <div className="w-16 h-16 rounded-full bg-[#f8fafc] border border-black/10 flex items-center justify-center shadow-lg">
                                <div className="w-6 h-6 rounded-full bg-primary" />
                              </div>
                              <div className="text-center">
                                <p className="font-bold text-sm">Light Theme</p>
                                <p className="text-[10px] text-white/40 uppercase">High Contrast</p>
                              </div>
                            </button>
                          </div>
                       </div>

                       <div className="pt-8 border-t border-white/5 space-y-8">
                          <div>
                            <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest mb-6">UI Customization</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                               <div className="flex items-center justify-between">
                                  <div className="max-w-[200px]">
                                     <p className="font-bold text-sm">Focus Mode</p>
                                     <p className="text-xs text-white/40">Hide non-essential elements to maximize engineering flow.</p>
                                  </div>
                                  <button 
                                    onClick={() => handleUpdateProfile({ focusMode: !userProfile?.focusMode })}
                                    className={`w-12 h-6 rounded-full transition-all relative cursor-pointer ${userProfile?.focusMode ? 'bg-primary' : 'bg-white/10'}`}
                                  >
                                    <motion.div 
                                      animate={{ x: userProfile?.focusMode ? 26 : 4 }}
                                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg"
                                    />
                                  </button>
                               </div>

                               <div className="flex flex-col gap-2">
                                  <p className="font-bold text-sm">Display Layout</p>
                                  <div className="flex gap-2">
                                     {['compact', 'comfortable'].map(l => (
                                        <button 
                                           key={l}
                                           onClick={() => handleUpdateProfile({ layout: l })}
                                           className={`flex-1 py-2 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${userProfile?.layout === l ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-white/5 text-white/40'}`}
                                        >
                                           {l}
                                        </button>
                                     ))}
                                  </div>
                               </div>
                            </div>
                          </div>
                       </div>
                    </div>
                  </div>
                )}

                {/* --- PRIVACY SECTION --- */}
                {currentTab === 'privacy' && (
                  <div className="space-y-6">
                     <div className="glass rounded-3xl p-8 border border-white/5 space-y-8">
                        <div>
                           <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest mb-6">Profile Visibility</h4>
                           <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-primary/20 transition-all cursor-pointer">
                              <div className="flex items-center gap-4">
                                 <Globe size={20} className="text-primary" />
                                 <div>
                                    <p className="font-bold text-sm">Public Profile</p>
                                    <p className="text-xs text-white/40">Visible to search engines and guests</p>
                                 </div>
                              </div>
                              <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                                 <div className="w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_10px_rgba(0,242,255,0.8)]" />
                              </div>
                           </div>
                        </div>

                        <div className="space-y-4">
                           <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest">Data & Analytics</h4>
                           <div className="flex items-center justify-between">
                              <div className="max-w-md">
                                 <p className="font-bold text-sm mb-1">Share Anonymous Usage</p>
                                 <p className="text-xs text-white/40">Help us improve the developer experience by sharing anonymous interaction data.</p>
                              </div>
                              <button className="w-12 h-6 bg-primary rounded-full relative p-1">
                                 <div className="w-4 h-4 bg-white rounded-full ml-auto" />
                              </button>
                           </div>
                        </div>
                     </div>

                     <div className="glass rounded-3xl p-8 border border-white/5">
                        <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest mb-6">Linked Connections</h4>
                        <div className="space-y-4">
                           <div className="flex items-center gap-4 p-4 bg-black/40 rounded-2xl border border-white/10">
                              <Github size={24} />
                              <div>
                                 <p className="font-bold text-sm">GitHub Account</p>
                                 <p className="text-[10px] text-green-500 font-mono">CONNECTED: {userProfile?.githubUsername || 'danieludofa452'}</p>
                              </div>
                              <button className="ml-auto text-red-500 text-[10px] font-bold uppercase tracking-widest hover:underline">Revoke</button>
                           </div>
                        </div>
                     </div>
                  </div>
                )}

                {/* --- BILLING SECTION --- */}
                {currentTab === 'billing' && (
                  <div className="space-y-6">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="glass rounded-3xl p-8 border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent relative overflow-hidden">
                           <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/10 rounded-full blur-[80px]" />
                           <p className="text-xs font-bold text-primary uppercase tracking-[0.2em] mb-4">Current Plan</p>
                           <h3 className="text-4xl font-black mb-1 italic">CREATOR PRO</h3>
                           <p className="text-white/40 text-sm mb-8">$29 / month • Renews May 12</p>
                           <div className="flex gap-4">
                              <button className="flex-1 py-3 bg-white text-black rounded-xl font-bold text-xs uppercase transition-all hover:bg-white/80">Manage Plan</button>
                              <button className="flex-1 py-3 glass text-white rounded-xl font-bold text-xs uppercase border border-white/10 hover:bg-white/10">Invoices</button>
                           </div>
                        </div>

                        <div className="glass rounded-3xl p-8 border border-white/5 flex flex-col justify-between">
                           <div>
                              <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">Payment Method</p>
                              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                                 <div className="w-10 h-10 bg-blue-500/10 text-blue-400 rounded-lg flex items-center justify-center">
                                    <CreditCard size={20} />
                                 </div>
                                 <div>
                                    <p className="text-sm font-bold">VISA •••• 4242</p>
                                    <p className="text-[10px] text-white/30 font-mono italic uppercase">Expires 12/28</p>
                                 </div>
                                 <button className="ml-auto p-2 glass rounded-lg hover:text-primary transition-all">
                                    <Edit2 size={14} />
                                 </button>
                              </div>
                           </div>
                           <button className="w-full py-3 mt-4 text-primary text-xs font-bold uppercase tracking-widest border border-primary/20 rounded-xl hover:bg-primary/10 transition-all flex items-center justify-center gap-2">
                              <Plus size={14} /> Add Payment Method
                           </button>
                        </div>
                     </div>

                     <div className="glass rounded-3xl p-8 border border-white/5">
                        <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest mb-6">Recent Invoices</h4>
                        <div className="space-y-4">
                           {[
                             { date: 'Apr 12, 2024', amount: '$29.00', status: 'Paid', id: 'INV-4921' },
                             { date: 'Mar 12, 2024', amount: '$29.00', status: 'Paid', id: 'INV-3281' },
                           ].map((inv, k) => (
                             <div key={k} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <div>
                                   <p className="font-bold text-sm tracking-tight">{inv.id}</p>
                                   <p className="text-[10px] text-white/30">{inv.date}</p>
                                </div>
                                <div className="text-right">
                                   <p className="font-bold text-sm">{inv.amount}</p>
                                   <p className="text-[8px] uppercase tracking-widest text-green-500 font-black">SUCCESSFUL</p>
                                </div>
                                <button className="p-2 ml-4 glass rounded-lg hover:text-primary">
                                   <Download size={14} />
                                </button>
                             </div>
                           ))}
                        </div>
                     </div>
                  </div>
                )}

                {/* --- REWARDS SECTION --- */}
                {currentTab === 'rewards' && (
                  <div className="space-y-6">
                    <div className="glass rounded-3xl p-8 border border-yellow-400/20 bg-gradient-to-br from-yellow-400/5 to-transparent relative overflow-hidden">
                       <div className="absolute -top-10 -left-10 w-40 h-40 bg-yellow-400/10 rounded-full blur-[80px]" />
                       <div className="flex items-center gap-6 mb-12">
                          <div className="w-24 h-24 glass rounded-[32px] border-2 border-yellow-400/30 flex items-center justify-center relative">
                             <Zap size={48} className="text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                             <div className="absolute -bottom-2 px-3 py-1 bg-yellow-400 text-black text-[10px] font-black rounded-full uppercase">LVL {Math.floor((userProfile?.xp || 0) / 100) + 1}</div>
                          </div>
                          <div>
                             <h3 className="text-3xl font-black mb-2 italic uppercase">System Reputation</h3>
                             <p className="text-white/40 text-sm max-w-sm">Earn XP by contributing components, participating in challenges, and engaging with the community.</p>
                          </div>
                       </div>
                       
                       <div className="space-y-3">
                          <div className="flex justify-between items-end mb-1">
                             <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-[0.2em]">{userProfile?.xp % 100} / 100 XP to NEXT LEVEL</p>
                             <p className="text-2xl font-black italic">TOTAL {userProfile?.xp || 0}</p>
                          </div>
                          <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/10">
                             <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${userProfile?.xp % 100}%` }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className="h-full bg-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)]" 
                             />
                          </div>
                       </div>

                       <div className="pt-10 space-y-6">
                          <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest">Achieved Badges</h4>
                          <div className="flex flex-wrap gap-4">
                             {userProfile?.badges && userProfile.badges.length > 0 ? (
                               userProfile.badges.map((badge: string, i: number) => (
                                 <div key={i} className="group relative">
                                   <div className="w-14 h-14 glass rounded-2xl border border-yellow-400/20 flex items-center justify-center group-hover:scale-110 group-hover:border-yellow-400/50 transition-all cursor-help bg-gradient-to-br from-yellow-400/10 to-transparent">
                                     <Award className="text-yellow-400/80 group-hover:text-yellow-400" />
                                   </div>
                                   <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-3 py-2 bg-black border border-white/10 rounded-xl text-[10px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all backdrop-blur-xl z-50">
                                     {badge}
                                   </div>
                                 </div>
                               ))
                             ) : (
                               <p className="text-xs text-white/20 italic">No badges earned yet. Start contributing to earn awards!</p>
                             )}
                          </div>
                       </div>
                    </div>

                    <div className="glass rounded-3xl p-8 border border-white/5">
                       <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest mb-6 px-1">XP Log_History</h4>
                       <div className="space-y-4">
                          {[
                            { event: 'Component_Purchase_Bonus', date: '2h ago', xp: '+50', type: 'positive' },
                            { event: 'Daily_Login_Streak', date: '5h ago', xp: '+10', type: 'positive' },
                            { event: 'Community_Engagement', date: '1d ago', xp: '+5', type: 'positive' },
                            { event: 'System_Maintenance_Reward', date: '3d ago', xp: '+100', type: 'special' },
                          ].map((log, l) => (
                             <div key={l} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors group">
                                <div className="flex items-center gap-4">
                                   <div className={`w-2 h-2 rounded-full ${log.type === 'special' ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'}`} />
                                   <div>
                                      <p className="text-sm font-bold font-mono tracking-tight uppercase group-hover:text-primary transition-colors">{log.event}</p>
                                      <p className="text-[10px] text-white/30">{log.date} • Verified_Entry</p>
                                   </div>
                                </div>
                                <span className={`font-mono font-bold ${log.type === 'special' ? 'text-purple-400' : 'text-green-400'} italic`}>{log.xp} XP</span>
                             </div>
                          ))}
                       </div>
                    </div>
                  </div>
                )}

                {/* --- COMMUNITIES SECTION --- */}
                {currentTab === 'communities' && (
                  <div className="space-y-6">
                     <div className="glass rounded-3xl p-8 border border-white/5">
                        <div className="flex items-center justify-between mb-8">
                           <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest">Joined Communities</h4>
                           <button onClick={() => navigate('/communities')} className="text-primary text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:underline">
                              Discover More <ArrowRight size={12} />
                           </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {/* Placeholder for joined communities - effectively integrated by Sidebar but listing here for management */}
                           <div className="flex items-center gap-4 p-4 glass rounded-2xl border border-white/10 hover:border-primary/20 transition-all group">
                              <div className="w-14 h-14 bg-primary/20 rounded-xl overflow-hidden shadow-2xl">
                                 <img src="https://picsum.photos/seed/fullstack/100/100" className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1 min-w-0">
                                 <h4 className="font-bold text-sm truncate uppercase italic tracking-tight">Fullstack_Engineers</h4>
                                 <p className="text-[10px] text-white/40 font-mono">ROLE: SENIOR_CREATOR</p>
                              </div>
                              <div className="relative group/menu">
                                 <button className="p-2 glass rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-all">
                                    <LogOut size={16} />
                                 </button>
                                 <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover/menu:opacity-100 px-3 py-1.5 glass text-[10px] font-bold rounded-lg whitespace-nowrap pointer-events-none transition-all uppercase">Leave Community</div>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
                )}

                {/* --- DEVELOPER SECTION --- */}
                {currentTab === 'developer' && (
                  <div className="space-y-6">
                    <div className="glass rounded-3xl p-8 border border-white/5 space-y-8">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                             <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest pl-1">Preferred Package Manager</h4>
                             <div className="grid grid-cols-2 gap-3">
                                {['npm', 'yarn', 'pnpm', 'bun'].map((pkg) => (
                                  <button
                                    key={pkg}
                                    onClick={() => handleUpdateProfile({ packageManager: pkg })}
                                    className={`py-3 rounded-xl border font-mono text-sm font-bold transition-all uppercase tracking-widest ${
                                      userProfile?.packageManager === pkg
                                      ? 'bg-primary/20 border-primary text-primary shadow-[0_0_20px_rgba(0,242,255,0.15)]'
                                      : 'bg-white/5 border-white/5 text-white/30 hover:border-white/20'
                                    }`}
                                  >
                                    {pkg}
                                  </button>
                                ))}
                             </div>
                          </div>
                          <div className="space-y-4">
                             <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest pl-1">Primary CLI Framework</h4>
                             <select 
                                defaultValue={userProfile?.cliFramework || 'shadcn'}
                                onChange={(e) => handleUpdateProfile({ cliFramework: e.target.value })}
                                className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3.5 outline-none focus:border-primary transition-all text-sm font-mono tracking-tighter"
                             >
                                <option value="shadcn">shadcn/ui</option>
                                <option value="tailwind">Tailwind CSS</option>
                                <option value="material">Material UI</option>
                                <option value="chakra">Chakra UI</option>
                             </select>
                          </div>
                       </div>
                    </div>

                    <div className="glass rounded-3xl p-8 border border-white/5 space-y-6">
                       <div className="flex items-center justify-between">
                          <h4 className="font-bold text-white/30 text-xs uppercase tracking-widest">System_API_Keys</h4>
                          <button className="px-4 py-2 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl neon-glow flex items-center gap-2">
                             <Plus size={14} /> New_Key
                          </button>
                       </div>
                       <div className="space-y-4">
                          <div className="p-4 bg-black/40 border border-white/10 rounded-2xl group flex items-center justify-between">
                             <div className="flex items-center gap-4">
                                <Terminal size={20} className="text-white/30" />
                                <div>
                                   <p className="text-xs font-bold font-mono text-white/70">PROD_IDENTITY_KEY</p>
                                   <p className="text-[10px] text-white/20 font-mono uppercase">Last used: 2h ago • NEVER_EXPIRES</p>
                                </div>
                             </div>
                             <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-2 glass rounded-lg hover:text-primary"><Eye size={16} /></button>
                                <button className="p-2 glass rounded-lg hover:text-red-500"><Trash2 size={16} /></button>
                             </div>
                          </div>
                       </div>
                    </div>
                  </div>
                )}

                {/* --- DANGER SECTION --- */}
                {currentTab === 'danger' && (
                  <div className="space-y-6">
                    <div className="glass rounded-3xl p-8 border border-red-500/20 bg-gradient-to-br from-red-500/10 to-transparent relative overflow-hidden">
                       <div className="absolute -top-10 -right-10 w-40 h-40 bg-red-500/10 rounded-full blur-[80px]" />
                       <h3 className="text-xl font-bold text-red-500 mb-2 flex items-center gap-2">
                          <Trash2 size={24} /> Delete Account Identity
                       </h3>
                       <p className="text-white/50 text-sm mb-8 leading-relaxed max-w-xl">
                          Once you delete your account, there is no going back. All your published components, earned XP, and reputation in the system will be permanently purged from our servers.
                       </p>
                       <button className="px-8 py-4 bg-red-500 text-white rounded-2xl font-bold uppercase tracking-widest text-sm hover:bg-red-600 transition-all shadow-xl shadow-red-500/20 active:scale-95">
                          Erase System Data
                       </button>
                    </div>

                    <div className="p-6 border border-white/5 rounded-3xl bg-white/5 flex items-center gap-4">
                       <Info className="text-white/20" size={24} />
                       <p className="text-xs text-white/40 italic">System security protocol: Deletion requires re-authentication of identity.</p>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}

