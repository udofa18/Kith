import { 
  signInWithPopup, 
  fetchSignInMethodsForEmail, 
  linkWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  AuthProvider,
  AuthCredential,
  OAuthProvider,
  GoogleAuthProvider,
  GithubAuthProvider,
  getMultiFactorResolver,
  EmailAuthProvider
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, githubProvider } from '../firebase';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  username?: string;
  interests?: string[];
  onboardingCompleted: boolean;
  xp: number;
  providers: string[];
  createdAt: any;
}

export class AuthService {
  static async handleAuthError(error: any, pendingCredential?: AuthCredential) {
    if (error.code === 'auth/account-exists-with-different-credential') {
      const email = error.customData?.email || error.email;
      const providers = await fetchSignInMethodsForEmail(auth, email);
      
      return {
        type: 'LINK_REQUIRED',
        email,
        providers,
        pendingCredential: error.credential
      };
    }
    throw error;
  }

  static async socialLogin(provider: AuthProvider) {
    try {
      const result = await signInWithPopup(auth, provider);
      await this.syncUserToFirestore(result.user);
      return { type: 'SUCCESS', user: result.user };
    } catch (error: any) {
      return await this.handleAuthError(error);
    }
  }

  static async loginWithGoogle() {
    return this.socialLogin(googleProvider);
  }

  static async loginWithGithub() {
    return this.socialLogin(githubProvider);
  }

  static async signupWithEmail(email: string, pass: string, name: string) {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(result.user, { displayName: name });
    await sendEmailVerification(result.user);
    await this.syncUserToFirestore(result.user);
    return result.user;
  }

  static async loginWithEmail(email: string, pass: string) {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    await this.syncUserToFirestore(result.user);
    return result.user;
  }

  static async linkAccounts(email: string, existingProviderId: string, pendingCredential: AuthCredential) {
    // 1. Sign in with the existing provider first to get a user object
    let provider: AuthProvider;
    if (existingProviderId.includes('google')) provider = googleProvider;
    else if (existingProviderId.includes('github')) provider = githubProvider;
    else if (existingProviderId.includes('password')) {
      // For email/password, we need the user to log in manually first or we already have them
      throw new Error('Please sign in with your email/password first to link this account.');
    } else {
      throw new Error(`Unsupported provider: ${existingProviderId}`);
    }

    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // 2. Link the pending credential to the signed-in user
    await linkWithCredential(user, pendingCredential);
    await this.syncUserToFirestore(user);
    return user;
  }

  static async syncUserToFirestore(user: any) {
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    const providers = user.providerData.map((p: any) => p.providerId);

    if (!userDoc.exists()) {
      const baseUsername = user.email?.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
      const userData = {
        uid: user.uid,
        email: user.email || user.providerData?.[0]?.email || null,
        username: baseUsername.slice(0, 30) + Math.floor(Math.random() * 1000),
        displayName: user.displayName || user.providerData?.[0]?.displayName || null,
        photoURL: user.photoURL || user.providerData?.[0]?.photoURL || null,
        onboardingCompleted: false,
        xp: 100,
        providers,
        totalSales: 0,
        totalImpressions: 0,
        dailyGiftingRemaining: 100,
        lastGiftingReset: new Date().toISOString(),
        createdAt: serverTimestamp()
      };
      await setDoc(userRef, userData);
    } else {
      const existingData = userDoc.data();
      const baseUsername = user.email?.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
      await setDoc(userRef, {
        email: user.email || user.providerData?.[0]?.email || existingData?.email || null,
        displayName: user.displayName || user.providerData?.[0]?.displayName || existingData?.displayName || null,
        photoURL: user.photoURL || user.providerData?.[0]?.photoURL || existingData?.photoURL || null,
        providers,
        // Ensure mandatory fields exist for legacy users to pass security rules
        xp: existingData?.xp ?? 100,
        totalSales: existingData?.totalSales ?? 0,
        totalImpressions: existingData?.totalImpressions ?? 0,
        dailyGiftingRemaining: existingData?.dailyGiftingRemaining ?? 100,
        lastGiftingReset: existingData?.lastGiftingReset ?? new Date().toISOString(),
        onboardingCompleted: existingData?.onboardingCompleted ?? false,
        createdAt: existingData?.createdAt ?? serverTimestamp(),
        username: existingData?.username || (baseUsername.slice(0, 30) + Math.floor(Math.random() * 1000)),
        uid: user.uid
      }, { merge: true });
    }
  }

  static async completeOnboarding(uid: string, data: { username: string; interests: string[] }) {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
      ...data,
      onboardingCompleted: true,
      xp: 250 // Bonus XP for completing onboarding
    }, { merge: true });
  }
}
