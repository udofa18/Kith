import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, Github, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../lib/auth-service';
import LinkAccountModal from '../components/LinkAccountModal';
import { AuthCredential } from 'firebase/auth';
import KithLogo from '../components/KithLogo';
import { toast } from 'react-hot-toast';

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups and try again.',
  'auth/network-request-failed': 'Network error. Check your connection.',
};

// Closing the provider popup is a choice, not an error.
const SILENT_ERRORS = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

const describeAuthError = (err: any) => AUTH_ERRORS[err?.code] || err?.message || 'Something went wrong. Please try again.';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Link account state
  const [linkData, setLinkData] = useState<{
    email: string;
    providers: string[];
    pendingCredential: AuthCredential;
  } | null>(null);

  const handleAuthResult = async (result: any) => {
    if (result.type === 'LINK_REQUIRED') {
      setLinkData({
        email: result.email,
        providers: result.providers,
        pendingCredential: result.pendingCredential
      });
      return;
    }
    
    // On SUCCESS the auth listener in App redirects to onboarding or the page the user came from.
  };

  const handleSocialLogin = async (provider: 'google' | 'github') => {
    setLoading(true);
    setError(null);
    try {
      const result = provider === 'google' 
        ? await AuthService.loginWithGoogle() 
        : await AuthService.loginWithGithub();
      await handleAuthResult(result);
    } catch (err: any) {
      if (!SILENT_ERRORS.has(err?.code)) setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signup') {
        await AuthService.signupWithEmail(email, password, name);
        toast.success('Account created. Check your inbox to verify your email.');
      } else {
        await AuthService.loginWithEmail(email, password);
      }
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Immersive Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[120px]" />
      </div>      {/* Floating Back Link */}
      <div className="absolute top-4 left-4 md:top-8 md:left-8 z-20">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 rounded-2xl text-white/70 hover:text-white transition-all text-xs font-bold font-mono tracking-wider uppercase group backdrop-blur-md"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          Back to Home
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-[440px]"
      >
        {/* Auth Card */}
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 md:p-10 shadow-2xl relative overflow-hidden group">
          {/* Decorative shine */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-transparent pointer-events-none" />
          
          <div className="text-center mb-10">
            <div className="w-20 h-20 relative flex items-center justify-center mx-auto mb-8 group pt-4">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-purple via-brand-pink to-brand-orange rounded-2xl blur-md opacity-50 group-hover:opacity-100 transition-opacity animate-pulse" />
              <KithLogo size={80} className="relative z-10 drop-shadow-[0_0_10px_rgba(236,72,153,0.4)]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-white/40 text-sm">
              {mode === 'login'
                ? 'Sign in to continue to Kith'
                : 'Join creators building, sharing, and selling on Kith'}
            </p>
          </div>

          <div className="space-y-4 mb-8">
            <button 
              onClick={() => handleSocialLogin('google')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white text-black font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.28.81-.56z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            <button 
              onClick={() => handleSocialLogin('github')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-[#24292F] text-white font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all border border-white/10 disabled:opacity-50"
            >
              <Github size={20} />
              <span>Continue with GitHub</span>
            </button>
          </div>

          <div className="flex items-center gap-4 mb-8">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-white/30">or continue with email</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {mode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
                    <input 
                      type="text" 
                      placeholder="Full name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-primary focus:bg-white/10 transition-all font-medium"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
              <input 
                type="email" 
                placeholder="Email address"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-primary focus:bg-white/10 transition-all font-medium"
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
              <input 
                type="password" 
                placeholder={mode === 'signup' ? 'Password (6+ characters)' : 'Password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-primary focus:bg-white/10 transition-all font-medium"
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-black font-black py-4 rounded-2xl hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-xs text-center font-medium"
            >
              {error}
            </motion.div>
          )}

          <div className="mt-10 text-center">
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
              className="text-sm text-white/40 hover:text-white transition-colors"
            >
              {mode === 'login' ? <>New to Kith? <span className="text-primary font-semibold">Create an account</span></> : <>Already have an account? <span className="text-primary font-semibold">Sign in</span></>}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Account Linking Modal */}
      <LinkAccountModal 
        isOpen={!!linkData}
        onClose={() => setLinkData(null)}
        email={linkData?.email || ''}
        existingProviders={linkData?.providers || []}
        pendingCredential={linkData?.pendingCredential!}
        onSuccess={() => {
          setLinkData(null);
          toast.success('Accounts linked');
        }}
      />
    </div>
  );
}
