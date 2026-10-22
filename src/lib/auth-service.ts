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
  GoogleAuthProvider,
  GithubAuthProvider,
} from 'firebase/auth';
import { auth, googleProvider, githubProvider } from '../firebase';
import { usersRepository } from '../services/db/usersRepository';

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
      await this.syncUser(result.user);
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
    await this.syncUser(result.user);
    return result.user;
  }

  static async loginWithEmail(email: string, pass: string) {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    await this.syncUser(result.user);
    return result.user;
  }

  static async linkAccounts(email: string, existingProviderId: string, pendingCredential: AuthCredential) {
    let provider: AuthProvider;
    if (existingProviderId.includes('google')) provider = googleProvider;
    else if (existingProviderId.includes('github')) provider = githubProvider;
    else if (existingProviderId.includes('password')) {
      throw new Error('Please sign in with your email/password first to link this account.');
    } else {
      throw new Error(`Unsupported provider: ${existingProviderId}`);
    }

    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    await linkWithCredential(user, pendingCredential);
    await this.syncUser(user);
    return user;
  }

  /** Sync user profile to database (dual-write: Firestore + Supabase) */
  static async syncUser(user: any) {
    await usersRepository.syncUser({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      providerData: user.providerData,
    });
  }
}
