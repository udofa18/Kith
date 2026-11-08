import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState, type ReactElement } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Toaster } from 'react-hot-toast';
import { reminderService } from './services/reminderService';
import { VoiceProvider, useVoice } from './contexts/VoiceContext';
import { CallProvider } from './contexts/CallContext';
import PersistentVoiceOverlay from './components/PersistentVoiceOverlay';
import CallInterface from './components/call/CallInterface';
import { LiveKitRoom } from '@livekit/components-react';
import { unlockAudio } from './lib/sounds';
import { applyNotificationPreferences, clearNotificationPreferences } from './lib/notificationPreferences';
import { prefetchFeedExperienceData } from './lib/queryClient';
import { applyAppearance, normalizeSettings } from './features/settings/preferences';

// Pages
import LandingPage from './pages/LandingPage';
import MarketplacePage from './pages/MarketplacePage';
import ProductPage from './pages/ProductPage';
import CreatorProfile from './pages/CreatorProfile';
import ProductEditor from './pages/ProductEditor';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import LibraryPage from './pages/LibraryPage';
import PayoutSettingsPage from './pages/PayoutSettingsPage';
import SocialFeed from './pages/SocialFeed';
import PostDetails from './pages/PostDetails';
import Challenges from './pages/Challenges';
import ChallengeDetails from './pages/ChallengeDetails';
import ChallengeSubmissions from './pages/ChallengeSubmissions';
import CreateChallenge from './pages/CreateChallenge';
import EventsPage from './pages/EventsPage';
import EventDetails from './pages/EventDetails';
import LiveSession from './pages/LiveSession';
import SettingsPage from './pages/SettingsPage';
import AuthPage from './pages/AuthPage';
import ArticleWrite from './pages/ArticleWrite';
import ArticleView from './pages/ArticleView';
import ArticlesPage from './pages/ArticlesPage';
import AdminPage from './pages/AdminPage';
import DesignSystemPage from './pages/DesignSystemPage';

// Components
import AppSidebar from './components/AppSidebar';
import MobileNav from './components/MobileNav';
import ComposeFab from './components/ComposeDialog';

import { LiveSessionProvider } from './contexts/LiveSessionContext';
import { CurrentUserProvider } from './contexts/CurrentUserContext';
import { LiveStatusProvider } from './contexts/LiveStatusContext';
import FloatingLiveSession from './components/live/FloatingLiveSession';

import LiveSessionWrapper from './LiveSessionWrapper';
import { usePresence } from './features/messages/usePresence';

function CommunityRedirect() {
  const { communityId } = useParams();
  return <Navigate to={`/feed?view=community&id=${communityId}`} replace />;
}

function JoinRedirect() {
  const { inviteCode } = useParams();
  return <Navigate to={`/feed?invite=${inviteCode}`} replace />;
}

function ProductRedirect() {
  const { id } = useParams();
  return <Navigate to={`/products/${id}`} replace />;
}

function RequireAuth({ user, children }: { user: any, children: ReactElement }) {
  const location = useLocation();
  return user ? children : <Navigate to="/login" state={{ from: location }} replace />;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

function AppRoutes({ user, onboardingRequired }: { user: any, onboardingRequired: boolean }) {
  const location = useLocation();
  const isOnboardingPath = location.pathname === '/onboarding';

  // Signed-in users finish onboarding before anything else, and can't revisit it afterwards.
  if (user && onboardingRequired && !isOnboardingPath) {
    return <Navigate to="/onboarding" replace />;
  }
  if (user && !onboardingRequired && isOnboardingPath) {
    return <Navigate to="/feed" replace />;
  }

  // Send signed-in users back to where they were headed before login.
  if (user && location.pathname === '/login') {
    const from = (location.state as { from?: Location } | null)?.from?.pathname;
    return <Navigate to={from && from !== '/login' ? from : '/feed'} replace />;
  }

  const isAdmin = user && (user.role === 'admin' || user.email === 'danieludofa452@gmail.com');
  const priv = (element: ReactElement) => <RequireAuth user={user}>{element}</RequireAuth>;

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/design-system" element={<DesignSystemPage />} />
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/explore" element={<Navigate to="/marketplace" replace />} />
      <Route path="/products/:id" element={<ProductPage />} />
      <Route path="/components/:id" element={<ProductRedirect />} />
      <Route path="/creators/:id" element={<CreatorProfile />} />
      <Route path="/success" element={<Navigate to="/library" replace />} />
      <Route path="/feed" element={<SocialFeed />} />
      <Route path="/post/:id" element={<PostDetails />} />
      <Route path="/challenges" element={<Challenges />} />
      <Route path="/challenges/:challengeId" element={<ChallengeDetails />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/events/:eventId" element={<EventDetails />} />
      <Route path="/live/:eventId" element={<LiveSession />} />
      <Route path="/articles" element={<ArticlesPage />} />
      <Route path="/article/:articleId" element={<ArticleView />} />
      <Route path="/community/:communityId" element={<CommunityRedirect />} />
      <Route path="/join/:inviteCode" element={<JoinRedirect />} />

      {/* Signed-in only */}
      <Route path="/onboarding" element={priv(<Onboarding user={user} />)} />
      <Route path="/profile" element={priv(<Navigate to={`/creators/${user?.uid}`} replace />)} />
      <Route path="/create-challenge" element={priv(<CreateChallenge />)} />
      <Route path="/edit-challenge/:challengeId" element={priv(<CreateChallenge />)} />
      <Route path="/challenges/:challengeId/submissions" element={priv(<ChallengeSubmissions />)} />
      <Route path="/events/:eventId/live" element={priv(<LiveSession />)} />
      <Route path="/write" element={priv(<ArticleWrite />)} />
      <Route path="/write/:articleId" element={priv(<ArticleWrite />)} />
      <Route path="/upload" element={priv(<ProductEditor />)} />
      <Route path="/edit/:id" element={priv(<ProductEditor />)} />
      <Route path="/dashboard" element={priv(<Dashboard />)} />
      <Route path="/library" element={priv(<LibraryPage />)} />
      <Route path="/payouts" element={priv(<PayoutSettingsPage />)} />
      <Route path="/settings" element={priv(<SettingsPage />)} />
      <Route path="/admin" element={priv(isAdmin ? <AdminPage user={user} /> : <Navigate to="/feed" replace />)} />

      <Route path="*" element={<Navigate to={user ? '/feed' : '/'} replace />} />
    </Routes>
  );
}

function AppContent({ user, onboardingRequired }: { user: any, onboardingRequired: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeSession, leaveVoice } = useVoice();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  
  const isLandingPage = location.pathname === '/';
  const isLoginPage = location.pathname === '/login';
  const isOnboardingPage = location.pathname === '/onboarding';
  const isLivePage = location.pathname.includes('/live');

  // We only show the sidebar if not on landing/login/onboarding/live.
  // Public users can still see the sidebar for navigation.
  const showSidebar = !isLandingPage && !isLoginPage && !isOnboardingPage && !isLivePage;

  const queryParams = new URLSearchParams(location.search);
  // The community view keeps the open channel in the URL (?view=community&id=…&channelId=…).
  const currentCommunityId = queryParams.get('view') === 'community' ? queryParams.get('id') : null;
  const currentChannelId = queryParams.get('channelId');
  
  const isViewingVoiceChannel = activeSession && 
    currentCommunityId === activeSession.communityId && 
    currentChannelId === activeSession.channelId;

  const handleReturnToVoice = (communityId: string, channelId: string) => {
    navigate(`/feed?view=community&id=${communityId}&channelId=${channelId}`);
  };

  const mainContent = (
    <div className="app-shell flex flex-col md:flex-row bg-background overflow-hidden text-foreground">
      {showSidebar && isDesktop && <AppSidebar user={user} />}
      <main className="min-h-0 flex-1 overflow-hidden transition-all duration-300 relative">
        <div className="h-full overflow-y-auto custom-scrollbar">
          <AppRoutes user={user} onboardingRequired={onboardingRequired} />
        </div>
      </main>
      {showSidebar && !isDesktop && <MobileNav user={user} />}
      {activeSession && !isViewingVoiceChannel && (
        <PersistentVoiceOverlay onReturn={handleReturnToVoice} />
      )}
      {user && !onboardingRequired && showSidebar && (
        <ComposeFab hidden={!!activeSession && !isViewingVoiceChannel} />
      )}
    </div>
  );

  return (
    <LiveSessionWrapper>
      {user && activeSession ? (
        <LiveKitRoom
          token={activeSession.token}
          serverUrl={activeSession.serverUrl}
          connect={true}
          audio={true}
          video={false}
          onDisconnected={leaveVoice}
        >
          {mainContent}
        </LiveKitRoom>
      ) : mainContent}
    </LiveSessionWrapper>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const presence = user?.settings?.activity?.presence;
  const lastActive = user?.settings?.activity?.lastActive;
  usePresence(
    user?.uid,
    presence !== 'nobody' && presence !== 'me' && lastActive !== 'me' && lastActive !== 'nobody',
  );

  useEffect(() => {
    // Add audio unlock listeners
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Start reminders
        reminderService.start();
        prefetchFeedExperienceData(user.uid);

        // Set up real-time listener for the user document
        unsubscribeSnapshot = onSnapshot(doc(db, 'users', user.uid), (userDoc) => {
          const userData = userDoc.exists() ? userDoc.data() : null;
          if (userData?.onboardingCompleted) {
            setOnboardingRequired(false);
          } else {
            setOnboardingRequired(true);
          }
          // Merge auth user with firestore data for universal XP
          setUser(userData ? { ...user, ...userData } : user);

          const settings = normalizeSettings(userData);
          applyAppearance(settings.appearance);
          applyNotificationPreferences(settings.notifications);
          
          setLoading(false);
        }, (error) => {
          console.error("User doc listener error:", error);
          setLoading(false);
        });
      } else {
        reminderService.stop();
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        clearNotificationPreferences();
        setUser(null);
        setOnboardingRequired(false);
        
        // Use localStorage preference or default to dark
        const savedTheme = localStorage.getItem('theme') || 'dark';
        if (savedTheme === 'light') {
          document.documentElement.classList.add('light');
          document.documentElement.classList.remove('dark');
          document.documentElement.style.colorScheme = 'light';
        } else {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
          document.documentElement.style.colorScheme = 'dark';
        }
        
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <Router>
      <LiveSessionProvider>
        <VoiceProvider>
          <CallProvider>
            <CurrentUserProvider user={user}>
              <LiveStatusProvider>
                <AppContent user={user} onboardingRequired={onboardingRequired} />
                <CallInterface />
              </LiveStatusProvider>
            </CurrentUserProvider>
          </CallProvider>
          <Toaster 
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0B0F19',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#fff',
              },
            },
          }}
        />
        </VoiceProvider>
      </LiveSessionProvider>
    </Router>
  );
}
