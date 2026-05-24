import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
import { prefetchFeedExperienceData } from './lib/queryClient';

// Pages
import LandingPage from './pages/LandingPage';
import MarketplacePage from './pages/MarketplacePage';
import ComponentDetails from './pages/ComponentDetails';
import CreatorProfile from './pages/CreatorProfile';
import UploadComponent from './pages/UploadComponent';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import SuccessPage from './pages/SuccessPage';
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

// Components
import AppSidebar from './components/AppSidebar';

import { LiveSessionProvider } from './contexts/LiveSessionContext';
import FloatingLiveSession from './components/live/FloatingLiveSession';

import LiveSessionWrapper from './LiveSessionWrapper';

function CommunityRedirect() {
  const { communityId } = useParams();
  return <Navigate to={`/feed?view=community&id=${communityId}`} replace />;
}

function JoinRedirect() {
  const { inviteCode } = useParams();
  return <Navigate to={`/feed?invite=${inviteCode}`} replace />;
}

function AppRoutes({ user, onboardingRequired }: { user: any, onboardingRequired: boolean }) {
  const location = useLocation();

  // Redirect to onboarding if required and not already there
  if (user && onboardingRequired && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // Redirect unauthenticated users to login if they try to access protected routes
  const publicRoutes = ['/', '/login', '/explore', '/feed', '/events', '/articles', '/challenges'];
  const isPublicParameterized = 
    location.pathname.startsWith('/creators/') || 
    location.pathname.startsWith('/components/') || 
    location.pathname.startsWith('/post/') || 
    location.pathname.startsWith('/article/') || 
    location.pathname.startsWith('/events/') || 
    location.pathname.startsWith('/live/') || 
    location.pathname.startsWith('/challenges/');

  if (!user && !publicRoutes.includes(location.pathname) && !isPublicParameterized) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect authenticated users away from login page
  if (user && location.pathname === '/login') {
    return <Navigate to={onboardingRequired ? "/onboarding" : "/feed"} replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/explore" element={<Navigate to="/marketplace" replace />} />
      <Route path="/products/:id" element={<ComponentDetails />} />
      <Route path="/components/:id" element={<Navigate to="/products/:id" replace />} />
      <Route path="/creators/:id" element={<CreatorProfile />} />
      <Route 
        path="/profile" 
        element={user && !onboardingRequired ? <Navigate to={`/creators/${user.uid}`} replace /> : <Navigate to={user ? "/onboarding" : "/"} />} 
      />
      <Route path="/success" element={<SuccessPage />} />
      <Route 
        path="/feed" 
        element={user && onboardingRequired ? <Navigate to="/onboarding" /> : <SocialFeed />} 
      />
      <Route 
        path="/post/:id" 
        element={user && onboardingRequired ? <Navigate to="/onboarding" /> : <PostDetails />} 
      />
      <Route 
        path="/challenges" 
        element={user && onboardingRequired ? <Navigate to="/onboarding" /> : <Challenges />} 
      />
      <Route 
        path="/create-challenge" 
        element={user && !onboardingRequired ? <CreateChallenge /> : <Navigate to={user ? "/onboarding" : "/"} />} 
      />
      <Route 
        path="/edit-challenge/:challengeId" 
        element={user && !onboardingRequired ? <CreateChallenge /> : <Navigate to={user ? "/onboarding" : "/"} />} 
      />
      <Route 
        path="/challenges/:challengeId" 
        element={user && onboardingRequired ? <Navigate to="/onboarding" /> : <ChallengeDetails />} 
      />
      <Route 
        path="/challenges/:challengeId/submissions" 
        element={user && !onboardingRequired ? <ChallengeSubmissions /> : <Navigate to={user ? "/onboarding" : "/"} />} 
      />
      <Route 
        path="/events" 
        element={user && onboardingRequired ? <Navigate to="/onboarding" /> : <EventsPage />} 
      />
      <Route 
        path="/events/:eventId" 
        element={user && onboardingRequired ? <Navigate to="/onboarding" /> : <EventDetails />} 
      />
      <Route 
        path="/events/:eventId/live" 
        element={user && !onboardingRequired ? <LiveSession /> : <Navigate to={user ? "/onboarding" : "/"} />} 
      />
      <Route 
        path="/live/:eventId" 
        element={<LiveSession />} 
      />

      <Route 
        path="/articles" 
        element={user && onboardingRequired ? <Navigate to="/onboarding" /> : <ArticlesPage />} 
      />
      <Route 
        path="/write" 
        element={user && !onboardingRequired ? <ArticleWrite /> : <Navigate to={user ? "/onboarding" : "/login"} />} 
      />
      <Route 
        path="/write/:articleId" 
        element={user && !onboardingRequired ? <ArticleWrite /> : <Navigate to={user ? "/onboarding" : "/login"} />} 
      />
      <Route 
        path="/article/:articleId" 
        element={<ArticleView />} 
      />
      
      <Route 
        path="/onboarding" 
        element={user ? <Onboarding /> : <Navigate to="/" />} 
      />
      
      <Route 
        path="/upload" 
        element={user && !onboardingRequired ? <UploadComponent /> : <Navigate to={user ? "/onboarding" : "/"} />} 
      />

      <Route 
        path="/edit/:id" 
        element={user && !onboardingRequired ? <UploadComponent /> : <Navigate to={user ? "/onboarding" : "/"} />} 
      />
      
      <Route 
        path="/dashboard" 
        element={user && !onboardingRequired ? <Dashboard /> : <Navigate to={user ? "/onboarding" : "/"} />} 
      />
      <Route 
        path="/settings" 
        element={user && !onboardingRequired ? <SettingsPage /> : <Navigate to={user ? "/onboarding" : "/"} />} 
      />
      <Route 
        path="/admin" 
        element={user && !onboardingRequired && (user.role === 'admin' || user.email === 'danieludofa452@gmail.com') ? <AdminPage user={user} /> : <Navigate to={user ? "/feed" : "/"} />} 
      />
      <Route path="/community/:communityId" element={<CommunityRedirect />} />
      <Route path="/join/:inviteCode" element={<JoinRedirect />} />
    </Routes>
  );
}

function AppContent({ user, onboardingRequired }: { user: any, onboardingRequired: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeSession, leaveVoice } = useVoice();
  
  const isLandingPage = location.pathname === '/';
  const isLoginPage = location.pathname === '/login';
  const isOnboardingPage = location.pathname === '/onboarding';
  const isLivePage = location.pathname.includes('/live');

  // We only show the sidebar if not on landing/login/onboarding/live.
  // Public users can still see the sidebar for navigation.
  const showSidebar = !isLandingPage && !isLoginPage && !isOnboardingPage && !isLivePage;

  const queryParams = new URLSearchParams(location.search);
  const currentCommunityId = queryParams.get('community');
  const currentChannelId = queryParams.get('channel');
  
  const isViewingVoiceChannel = activeSession && 
    currentCommunityId === activeSession.communityId && 
    currentChannelId === activeSession.channelId;

  const handleReturnToVoice = (communityId: string, channelId: string) => {
    navigate(`/feed?view=community&id=${communityId}&channelId=${channelId}`);
  };

  const mainContent = (
    <div className="h-screen flex bg-background overflow-hidden text-foreground">
      {showSidebar && <AppSidebar user={user} />}
      <main className="flex-grow h-full overflow-hidden transition-all duration-300 relative">
        <div className="h-full overflow-y-auto custom-scrollbar">
          <AppRoutes user={user} onboardingRequired={onboardingRequired} />
        </div>
      </main>
      {activeSession && !isViewingVoiceChannel && (
        <PersistentVoiceOverlay onReturn={handleReturnToVoice} />
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
          
          const targetTheme = userData?.theme || localStorage.getItem('theme') || 'dark';
          if (targetTheme === 'light') {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
            document.documentElement.style.colorScheme = 'light';
          } else {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
            document.documentElement.style.colorScheme = 'dark';
          }
          
          setLoading(false);
        }, (error) => {
          console.error("User doc listener error:", error);
          setLoading(false);
        });
      } else {
        reminderService.stop();
        if (unsubscribeSnapshot) unsubscribeSnapshot();
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
        <div className="animate-pulse text-primary font-mono">INITIALIZING_SYSTEM...</div>
      </div>
    );
  }

  return (
    <Router>
      <LiveSessionProvider>
        <VoiceProvider>
          <CallProvider>
            <AppContent user={user} onboardingRequired={onboardingRequired} />
            <CallInterface />
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
