import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Eye,
  EyeOff,
  Github,
  Loader2,
  Lock,
  Mail,
  Radio,
  ShoppingBag,
  User,
  Users,
} from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AuthService } from '../lib/auth-service';
import LinkAccountModal from '../components/LinkAccountModal';
import { AuthCredential } from 'firebase/auth';
import KithLogo from '../components/KithLogo';
import KithStamp from '../components/KithStamp';
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

const describeAuthError = (err: any) =>
  AUTH_ERRORS[err?.code] || err?.message || 'Something went wrong. Please try again.';

const faces = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&crop=faces&w=160&h=160&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&crop=faces&w=160&h=160&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&crop=faces&w=160&h=160&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&crop=faces&w=160&h=160&q=80',
];

const proof = [
  { icon: Users, label: 'Communities' },
  { icon: Radio, label: 'Live rooms' },
  { icon: CalendarDays, label: 'Events' },
  { icon: ShoppingBag, label: 'Marketplace' },
];

type Busy = null | 'google' | 'github' | 'email';

export default function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const mode: 'login' | 'signup' = searchParams.get('mode') === 'signup' ? 'signup' : 'login';

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const loading = busy !== null;

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

  const setMode = (next: 'login' | 'signup') => {
    setError(null);
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'signup') nextParams.set('mode', 'signup');
    else nextParams.delete('mode');
    setSearchParams(nextParams, { replace: true, state: location.state });
  };

  const handleAuthResult = async (result: any) => {
    if (result.type === 'LINK_REQUIRED') {
      setLinkData({
        email: result.email,
        providers: result.providers,
        pendingCredential: result.pendingCredential,
      });
    }

    // On SUCCESS the auth listener in App redirects to onboarding or the page the user came from.
  };

  const handleSocialLogin = async (provider: 'google' | 'github') => {
    setBusy(provider);
    setError(null);
    try {
      const result =
        provider === 'google'
          ? await AuthService.loginWithGoogle()
          : await AuthService.loginWithGithub();
      await handleAuthResult(result);
    } catch (err: any) {
      if (!SILENT_ERRORS.has(err?.code)) setError(describeAuthError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('email');
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
      setBusy(null);
    }
  };

  return (
    <div className="auth-page relative min-h-screen overflow-hidden">
      {/* Warm atmosphere */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-1/2 h-[640px] w-[980px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_top,rgba(255,107,74,0.19),transparent_70%)] blur-3xl" />
        <div className="absolute -left-48 bottom-[-20%] h-[540px] w-[540px] rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.14),transparent_68%)] blur-3xl" />
        <div className="absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(255,182,92,0.1),transparent_70%)] blur-3xl" />
        <div className="landing-grid absolute inset-0 opacity-30" />
      </div>
      <div className="landing-grain" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-5 md:px-8">
        <header className="flex h-[76px] shrink-0 items-center justify-between">
          <Link to="/" className="group flex items-center gap-2.5" aria-label="Kith home">
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-[#f7f2e8]">
              <KithLogo size={30} />
            </span>
            <span className="font-display text-[22px] font-semibold tracking-[-0.05em] text-[#f7f2e8]">
              kith
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[#f7f2e8]/35 sm:block">Nice to have you here.</span>
            <Link
              to="/"
              className="group inline-flex items-center gap-1.5 rounded-full border border-[#ffffff16] px-3.5 py-2 text-xs font-medium text-[#f7f2e8]/65 transition-colors hover:border-[#ffffff36] hover:text-[#f7f2e8]"
            >
              <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
              Back home
            </Link>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 pb-10 pt-4 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:pb-14 lg:pt-0">
          {/* Editorial side */}
          <aside className="relative hidden lg:block">
            <div className="max-w-[530px]">
              <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ffb65c]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff6b4a]" />
                A home for the people you choose
              </p>
              <p className="mt-5 text-[clamp(3rem,4.6vw,4.7rem)] font-semibold leading-[0.92] tracking-[-0.07em] text-[#f7f2e8]">
                Come as you are.
                <br />
                <span className="landing-serif landing-gradient-text pr-2">
                  Stay for the people.
                </span>
              </p>
              <p className="mt-5 max-w-[470px] text-base leading-relaxed text-[#f7f2e8]/55">
                Communities, live rooms, events, bounties and creative work — together in one warm
                place. Come for the conversation. Stay for the people.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {proof.map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#ffffff12] px-3 py-1.5 text-xs text-[#f7f2e8]/55"
                  >
                    <item.icon size={12} className="text-[#ffb65c]" />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mt-9 max-w-[520px]">
              <div className="absolute -inset-6 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.18),transparent_70%)] blur-3xl" />

              <motion.div
                initial={{ opacity: 0, y: 18, rotate: 0.8 }}
                animate={{ opacity: 1, y: 0, rotate: 0.4 }}
                transition={{ duration: 0.9, delay: 0.15 }}
                className="relative overflow-hidden rounded-[28px] border border-[#ffffff14] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]"
              >
                <img
                  src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80"
                  alt="Friends spending time together"
                  loading="eager"
                  referrerPolicy="no-referrer"
                  className="aspect-[16/10] w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0b13] via-[#0e0b13]/10 to-transparent" />

                <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-[#ffffff24] bg-black/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#82e6c8]" />
                  Inside Kith
                </span>

                <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#ffb65c]">
                      Community supper
                    </p>
                    <p className="mt-0.5 text-lg font-semibold leading-tight text-[#f7f2e8]">
                      Sunday supper club
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {faces.slice(0, 3).map((face) => (
                        <img
                          key={face}
                          src={face}
                          alt=""
                          width={24}
                          height={24}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-6 w-6 rounded-full bg-[#2a2234] object-cover ring-2 ring-[#0e0b13]"
                        />
                      ))}
                    </div>
                    <span className="text-[11px] font-semibold text-[#f7f2e8]/70">38 going</span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, -7, 0] }}
                transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -right-4 top-7 w-[176px] rounded-2xl border border-[#ffffff14] bg-[#171120]/95 p-3 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="landing-pulse-dot absolute inline-flex h-full w-full rounded-full bg-[#ff6b4a]" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff6b4a]" />
                  </span>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#ffb65c]">
                    Live room
                  </p>
                </div>
                <p className="mt-2 text-sm font-medium text-[#f7f2e8]">Late-night ideas</p>
                <p className="mt-0.5 text-[10px] text-[#f7f2e8]/45">12 people · voice</p>
              </motion.div>

              <motion.div
                animate={{ y: [0, 7, 0] }}
                transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                className="absolute -bottom-6 -left-4 flex items-center gap-2.5 rounded-2xl border border-[#ffffff14] bg-[#171120]/95 px-3 py-2.5 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex -space-x-2">
                  {faces.slice(1, 4).map((face) => (
                    <img
                      key={face}
                      src={face}
                      alt=""
                      width={22}
                      height={22}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-[22px] w-[22px] rounded-full bg-[#2a2234] object-cover ring-2 ring-[#171120]"
                    />
                  ))}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-[#f7f2e8]">Your people are here.</p>
                  <p className="text-[9px] text-[#f7f2e8]/40">Hosts, makers and members</p>
                </div>
              </motion.div>

              <KithStamp className="absolute -bottom-8 right-2 h-20 w-20" />
            </div>
          </aside>

          {/* Form side */}
          <main className="flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[480px]"
            >
              <div className="mb-5 flex items-center justify-center gap-2.5 lg:hidden">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6b4a]" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#ffb65c]">
                  A home for the people you choose
                </p>
              </div>

              <div className="relative overflow-hidden rounded-[30px] border border-[#ffffff1a] bg-[#f7f2e8] p-6 text-[#211a28] shadow-[0_45px_120px_-45px_rgba(0,0,0,0.95)] sm:p-8">
                <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#ff6b4a]/15 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -left-16 h-44 w-44 rounded-full bg-[#ffb65c]/15 blur-3xl" />

                <div className="relative">
                  <div
                    role="group"
                    aria-label="Choose sign in or create account"
                    className="flex rounded-full bg-[#211a28]/[0.055] p-1"
                  >
                    {(
                      [
                        { id: 'login', label: 'Sign in' },
                        { id: 'signup', label: 'Create account' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setMode(tab.id)}
                        aria-pressed={mode === tab.id}
                        className={`flex-1 rounded-full px-3 py-2 text-xs font-bold transition-colors sm:text-[13px] ${
                          mode === tab.id
                            ? 'bg-[#211a28] text-[#f7f2e8] shadow-sm'
                            : 'text-[#211a28]/50 hover:text-[#211a28]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-7">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#c9452a]">
                      {mode === 'login' ? 'Welcome back' : 'Join Kith'}
                    </p>
                    <h1 className="mt-2 font-display text-[clamp(1.9rem,6vw,2.4rem)] font-semibold leading-[1.02] tracking-[-0.055em] text-[#211a28]">
                      {mode === 'login' ? (
                        <>
                          Good to see you{' '}
                          <span className="landing-serif font-normal text-[#c9452a]">again.</span>
                        </>
                      ) : (
                        <>
                          Make yourself{' '}
                          <span className="landing-serif font-normal text-[#c9452a]">at home.</span>
                        </>
                      )}
                    </h1>
                    <p className="mt-2.5 text-sm leading-relaxed text-[#211a28]/55">
                      {mode === 'login'
                        ? 'Pick up where you left off — the rooms, the people, the good stuff.'
                        : 'One small profile, then the good part: finding the people who get you.'}
                    </p>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSocialLogin('google')}
                      disabled={loading}
                      aria-label="Continue with Google"
                      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#211a28]/12 bg-[#fffdf8] px-3 text-sm font-semibold text-[#211a28] transition-all hover:-translate-y-0.5 hover:border-[#211a28]/25 hover:shadow-sm disabled:translate-y-0 disabled:opacity-50"
                    >
                      {busy === 'google' ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.28.81-.56z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                      )}
                      <span>Google</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSocialLogin('github')}
                      disabled={loading}
                      aria-label="Continue with GitHub"
                      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#211a28] px-3 text-sm font-semibold text-[#f7f2e8] transition-all hover:-translate-y-0.5 hover:bg-[#2c2233] hover:shadow-sm disabled:translate-y-0 disabled:opacity-50"
                    >
                      {busy === 'github' ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Github size={18} />
                      )}
                      <span>GitHub</span>
                    </button>
                  </div>

                  <div className="my-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[#211a28]/12" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#211a28]/35">
                      or with email
                    </span>
                    <div className="h-px flex-1 bg-[#211a28]/12" />
                  </div>

                  <form onSubmit={handleSubmit} aria-busy={busy === 'email'} className="space-y-3.5">
                    <AnimatePresence initial={false} mode="popLayout">
                      {mode === 'signup' && (
                        <motion.div
                          key="name"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <label
                            htmlFor="auth-name"
                            className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[#211a28]/45"
                          >
                            Full name
                          </label>
                          <div className="relative">
                            <User
                              size={16}
                              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#211a28]/30"
                            />
                            <input
                              id="auth-name"
                              type="text"
                              placeholder="Maya Chen"
                              autoComplete="name"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              required
                              className="h-12 w-full rounded-xl border border-[#211a28]/12 bg-[#fffdf8] pl-10 pr-4 text-sm font-medium text-[#211a28] outline-none transition placeholder:text-[#211a28]/30 focus:border-[#ff6b4a] focus:bg-white focus:ring-4 focus:ring-[#ff6b4a]/10"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                      <label
                        htmlFor="auth-email"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[#211a28]/45"
                      >
                        Email address
                      </label>
                      <div className="relative">
                        <Mail
                          size={16}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#211a28]/30"
                        />
                        <input
                          id="auth-email"
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="h-12 w-full rounded-xl border border-[#211a28]/12 bg-[#fffdf8] pl-10 pr-4 text-sm font-medium text-[#211a28] outline-none transition placeholder:text-[#211a28]/30 focus:border-[#ff6b4a] focus:bg-white focus:ring-4 focus:ring-[#ff6b4a]/10"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="auth-password"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[#211a28]/45"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <Lock
                          size={16}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#211a28]/30"
                        />
                        <input
                          id="auth-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="h-12 w-full rounded-xl border border-[#211a28]/12 bg-[#fffdf8] pl-10 pr-11 text-sm font-medium text-[#211a28] outline-none transition placeholder:text-[#211a28]/30 focus:border-[#ff6b4a] focus:bg-white focus:ring-4 focus:ring-[#ff6b4a]/10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          aria-pressed={showPassword}
                          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#211a28]/35 transition-colors hover:bg-[#211a28]/5 hover:text-[#211a28]"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {mode === 'signup' && (
                        <p className="mt-1.5 text-[10px] text-[#211a28]/40">
                          Six characters is plenty. You can change it later.
                        </p>
                      )}
                    </div>

                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div
                            role="alert"
                            className="flex items-start gap-2 rounded-xl border border-[#ff6b4a]/30 bg-[#ff6b4a]/10 px-3 py-2.5 text-xs font-medium leading-relaxed text-[#a83820]"
                          >
                            <AlertCircle size={14} className="mt-px shrink-0" />
                            {error}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button
                      type="submit"
                      disabled={loading}
                      className="group mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#171120] px-4 text-sm font-bold text-[#f7f2e8] transition-all hover:-translate-y-0.5 hover:bg-[#ff6b4a] hover:text-[#211a28] hover:shadow-[0_12px_30px_-12px_rgba(255,107,74,0.8)] disabled:translate-y-0 disabled:opacity-60"
                    >
                      {busy === 'email' ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <>
                          {mode === 'login' ? 'Sign in' : 'Create account'}
                          <ArrowRight
                            size={16}
                            className="transition-transform group-hover:translate-x-0.5"
                          />
                        </>
                      )}
                    </button>
                  </form>

                  <p className="mt-5 text-center text-sm text-[#211a28]/50">
                    {mode === 'login' ? (
                      <>
                        New to Kith?{' '}
                        <button
                          type="button"
                          onClick={() => setMode('signup')}
                          className="font-semibold text-[#b23a24] underline-offset-4 hover:underline"
                        >
                          Create an account
                        </button>
                      </>
                    ) : (
                      <>
                        Already have an account?{' '}
                        <button
                          type="button"
                          onClick={() => setMode('login')}
                          className="font-semibold text-[#b23a24] underline-offset-4 hover:underline"
                        >
                          Sign in
                        </button>
                      </>
                    )}
                  </p>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-[#211a28]/10 pt-4 text-[10px] text-[#211a28]/45">
                    <span className="flex items-center gap-1">
                      <Check size={11} className="text-[#2a9d87]" /> Free to join
                    </span>
                    <span className="flex items-center gap-1">
                      <Check size={11} className="text-[#2a9d87]" /> No algorithm games
                    </span>
                    <span className="flex items-center gap-1">
                      <Check size={11} className="text-[#2a9d87]" /> Leave any room quietly
                    </span>
                  </div>
                </div>
              </div>

              <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-[#f7f2e8]/35 lg:hidden">
                <span>Communities, rooms, events and work.</span>
                <Link
                  to="/feed?view=communities"
                  className="inline-flex items-center gap-1 font-medium text-[#f7f2e8]/60 transition-colors hover:text-[#f7f2e8]"
                >
                  Look around first
                  <ArrowUpRight size={12} />
                </Link>
              </p>
            </motion.div>
          </main>
        </div>
      </div>

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
