import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { ShieldCheck } from 'lucide-react';

// Cache for user verification status (userId -> verified boolean)
const verifiedCache = new Map<string, boolean>();
// Cache for active onSnapshot unsub functions or listeners to avoid duplicates
const activeListeners = new Map<string, Set<(val: boolean) => void>>();

export function useUserVerification(userId?: string) {
  const [verified, setVerified] = useState<boolean>(() => {
    if (!userId) return false;
    return verifiedCache.get(userId) || false;
  });

  useEffect(() => {
    if (!userId) {
      setVerified(false);
      return;
    }

    if (verifiedCache.has(userId)) {
      setVerified(verifiedCache.get(userId)!);
    }

    let listeners = activeListeners.get(userId);
    const callback = (val: boolean) => {
      setVerified(val);
    };

    if (!listeners) {
      listeners = new Set();
      activeListeners.set(userId, listeners);

      const unsub = onSnapshot(doc(db, 'users', userId), (snapshot) => {
        const isVerified = snapshot.exists() && !!snapshot.data()?.verified;
        verifiedCache.set(userId, isVerified);
        
        const currentListeners = activeListeners.get(userId);
        if (currentListeners) {
          currentListeners.forEach(cb => cb(isVerified));
        }
      }, (err) => {
        console.error("Error listening to user verification", userId, err);
      });

      (listeners as any)._unsub = unsub;
    }

    listeners.add(callback);

    return () => {
      const currentListeners = activeListeners.get(userId);
      if (currentListeners) {
        currentListeners.delete(callback);
        if (currentListeners.size === 0) {
          const unsub = (currentListeners as any)._unsub;
          if (typeof unsub === 'function') {
            unsub();
          }
          activeListeners.delete(userId);
        }
      }
    };
  }, [userId]);

  return verified;
}

interface VerifiedBadgeProps {
  verified?: boolean;
  userId?: string;
  size?: number;
  className?: string;
}

export default function VerifiedBadge({ verified, userId, size = 14, className = 'text-teal-400 shrink-0' }: VerifiedBadgeProps) {
  const isFetchedVerified = useUserVerification(userId);
  const isVerified = verified !== undefined ? verified : isFetchedVerified;

  if (!isVerified) return null;

  return (
    <span title="Verified User" className="inline-flex items-center shrink-0">
      <ShieldCheck 
        size={size} 
        className={`${className} inline-block ml-1 align-middle`} 
      />
    </span>
  );
}

