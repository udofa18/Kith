import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { signOut, updateProfile } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import { auth } from '../firebase';
import { usersRepository, type OnboardingProfile } from '../services/db/usersRepository';
import { TOPIC_GROUPS, interestsFromTopics } from '../lib/onboarding-topics';
import KithLogo from '../components/KithLogo';
import { startGettingStarted } from '../components/GettingStartedCard';
import ProfileStep from '../components/onboarding/ProfileStep';
import TopicsStep from '../components/onboarding/TopicsStep';
import ConnectStep from '../components/onboarding/ConnectStep';

const STEPS = ['Profile', 'Interests', 'Follow'] as const;
const KNOWN_TOPICS = new Set(TOPIC_GROUPS.flatMap(g => g.topics));

const saveError = () => toast.error("Couldn't save your progress. Check your connection and try again.");

export default function Onboarding({ user }: { user: any }) {
  const navigate = useNavigate();
  const uid: string = user.uid;

  // Resume where the user left off (onboardingStep is saved after each step).
  const [step, setStep] = useState(() => Math.min(Math.max(Number(user.onboardingStep) || 0, 0), STEPS.length - 1));
  const [topics, setTopics] = useState<string[]>(() => ((user.skills as string[]) || []).filter(t => KNOWN_TOPICS.has(t)));
  const [displayName, setDisplayName] = useState<string>(user.displayName || '');

  const initialProfile = useMemo<OnboardingProfile>(() => ({
    displayName: user.displayName || '',
    username: user.username || '',
    bio: user.bio || '',
    profileImage: user.profileImage || user.photoURL || '',
    accountType: user.accountType === 'brand' ? 'brand' : 'personal',
  }), [user.displayName, user.username, user.bio, user.profileImage, user.photoURL, user.accountType]);

  const saveProfile = async (profile: OnboardingProfile) => {
    try {
      await usersRepository.saveOnboardingProgress(uid, 1, profile);
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: profile.displayName,
          ...(profile.profileImage ? { photoURL: profile.profileImage } : {}),
        });
      }
      setDisplayName(profile.displayName);
      setStep(1);
    } catch (err) {
      console.error(err);
      saveError();
    }
  };

  const saveTopics = async (selected: string[]) => {
    try {
      await Promise.all([
        usersRepository.saveInterests(uid, interestsFromTopics(selected)),
        usersRepository.saveOnboardingProgress(uid, 2, { skills: selected }),
      ]);
      setTopics(selected);
      setStep(2);
    } catch (err) {
      console.error(err);
      saveError();
    }
  };

  const skipTopics = async () => {
    try {
      await usersRepository.saveOnboardingProgress(uid, 2);
      setTopics([]);
      setStep(2);
    } catch (err) {
      console.error(err);
      saveError();
    }
  };

  const finish = async () => {
    try {
      await usersRepository.completeOnboarding(uid, STEPS.length);
      startGettingStarted(uid);
      navigate('/feed', { replace: true });
    } catch (err) {
      console.error(err);
      saveError();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <KithLogo size={28} />
          <span className="font-bold tracking-tight">Kith</span>
        </div>
        <button onClick={() => signOut(auth)} className="text-sm text-white/40 hover:text-white transition-colors">
          Sign out
        </button>
      </header>

      <main className="flex-1 flex justify-center px-4 pb-12 pt-4 sm:pt-10">
        <div className="w-full max-w-lg">
          <ol className="flex gap-2 mb-10" aria-label="Onboarding progress">
            {STEPS.map((label, i) => (
              <li key={label} className="flex-1" aria-current={i === step ? 'step' : undefined}>
                <div className={`h-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-primary' : 'bg-white/10'}`} />
                <p className={`mt-2 text-xs font-medium ${i === step ? 'text-white' : 'text-white/30'}`}>
                  {i + 1}. {label}
                </p>
              </li>
            ))}
          </ol>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {step === 0 && <ProfileStep uid={uid} initial={initialProfile} onNext={saveProfile} />}
              {step === 1 && <TopicsStep initial={topics} onNext={saveTopics} onSkip={skipTopics} onBack={() => setStep(0)} />}
              {step === 2 && (
                <ConnectStep uid={uid} displayName={displayName} topics={topics} onBack={() => setStep(1)} onFinish={finish} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
