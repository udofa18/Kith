import { useEffect, useRef, useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Building2, Camera, Check, Loader2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { storage } from '../../firebase';
import { usersRepository, type OnboardingProfile } from '../../services/db/usersRepository';
import StepLayout from './StepLayout';

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'unknown';

const USERNAME_HINT: Record<UsernameStatus, string> = {
  idle: '3–30 characters: letters, numbers, underscores.',
  invalid: '3–30 characters: letters, numbers, underscores.',
  checking: 'Checking availability…',
  available: 'Available',
  taken: 'That username is taken.',
  unknown: "Couldn't check availability. You can still continue.",
};

interface ProfileStepProps {
  uid: string;
  initial: OnboardingProfile;
  onNext: (profile: OnboardingProfile) => Promise<void>;
}

export default function ProfileStep({ uid, initial, onNext }: ProfileStepProps) {
  const [profile, setProfile] = useState(initial);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const touched = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // New sign-ups can land here before their user doc syncs; adopt it if the form is untouched.
  useEffect(() => {
    if (!touched.current) setProfile(initial);
  }, [initial.username, initial.displayName, initial.profileImage]);

  useEffect(() => {
    const name = profile.username;
    if (!USERNAME_RE.test(name)) {
      setUsernameStatus(name ? 'invalid' : 'idle');
      return;
    }
    setUsernameStatus('checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const available = await usersRepository.isUsernameAvailable(name, uid);
        if (!cancelled) setUsernameStatus(available ? 'available' : 'taken');
      } catch (err) {
        console.error('Username check failed:', err);
        if (!cancelled) setUsernameStatus('unknown');
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profile.username, uid]);

  const update = (patch: Partial<OnboardingProfile>) => {
    touched.current = true;
    setProfile(prev => ({ ...prev, ...patch }));
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Image must be under 5 MB');
      return;
    }
    setUploading(true);
    try {
      const snapshot = await uploadBytes(ref(storage, `avatars/${uid}/${Date.now()}_${file.name}`), file);
      update({ profileImage: await getDownloadURL(snapshot.ref) });
    } catch (err: any) {
      console.error('Avatar upload failed:', err);
      toast.error(err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleNext = async () => {
    setSaving(true);
    try {
      await onNext({ ...profile, displayName: profile.displayName.trim(), bio: profile.bio.trim() });
    } finally {
      setSaving(false);
    }
  };

  const canContinue =
    profile.displayName.trim().length > 0 &&
    (usernameStatus === 'available' || usernameStatus === 'unknown') &&
    !uploading;

  const avatar = profile.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`;
  const hintColor =
    usernameStatus === 'available' ? 'text-emerald-400' :
    usernameStatus === 'taken' || (usernameStatus === 'invalid' && profile.username) ? 'text-red-400' :
    'text-white/40';

  return (
    <StepLayout
      title="Set up your profile"
      subtitle="This is how other people on Kith will see you."
      primaryLabel="Continue"
      onPrimary={handleNext}
      primaryDisabled={!canContinue}
      busy={saving}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="relative w-20 h-20 shrink-0 rounded-full overflow-hidden border border-white/10 group"
            aria-label="Change profile photo"
          >
            <img src={avatar} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            <span className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              {uploading ? <Loader2 size={20} className="animate-spin text-white" /> : <Camera size={20} className="text-white" />}
            </span>
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          <div className="text-sm">
            <button type="button" onClick={() => fileInput.current?.click()} className="font-semibold text-primary hover:underline">
              Upload a photo
            </button>
            <p className="text-white/40 mt-1">JPG or PNG, up to 5 MB.</p>
          </div>
        </div>

        <Field label="Display name">
          <input
            value={profile.displayName}
            onChange={e => update({ displayName: e.target.value })}
            maxLength={60}
            placeholder="Ada Lovelace"
            className={inputClass}
          />
        </Field>

        <Field label="Username">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">@</span>
            <input
              value={profile.username}
              onChange={e => update({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
              maxLength={30}
              placeholder="ada_builds"
              className={`${inputClass} pl-9 pr-10`}
              aria-describedby="username-hint"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2">
              {usernameStatus === 'checking' && <Loader2 size={16} className="animate-spin text-white/40" />}
              {usernameStatus === 'available' && <Check size={16} className="text-emerald-400" />}
              {usernameStatus === 'taken' && <X size={16} className="text-red-400" />}
            </span>
          </div>
          <p id="username-hint" className={`text-xs mt-2 ${hintColor}`}>{USERNAME_HINT[usernameStatus]}</p>
        </Field>

        <Field label="Bio" optional>
          <textarea
            value={profile.bio}
            onChange={e => update({ bio: e.target.value })}
            maxLength={160}
            rows={3}
            placeholder="A line or two about you"
            className={`${inputClass} resize-none`}
          />
          <p className="text-xs mt-2 text-white/30 text-right">{profile.bio.length}/160</p>
        </Field>

        <label className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/[0.03] cursor-pointer hover:border-white/20 transition-colors">
          <Building2 size={20} className="text-white/50 shrink-0" />
          <span className="flex-1">
            <span className="block text-sm font-semibold">I'm representing a brand or company</span>
            <span className="block text-xs text-white/40">Adds a Brand badge to your profile.</span>
          </span>
          <input
            type="checkbox"
            checked={profile.accountType === 'brand'}
            onChange={e => update({ accountType: e.target.checked ? 'brand' : 'personal' })}
            className="peer sr-only"
          />
          <span className="relative w-10 h-6 rounded-full bg-white/10 peer-checked:bg-primary transition-colors after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50" />
        </label>
      </div>
    </StepLayout>
  );
}

const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary focus:bg-white/[0.07] transition-colors placeholder:text-white/20';

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-2">
        {label} {optional && <span className="font-normal text-white/30">(optional)</span>}
      </span>
      {children}
    </label>
  );
}
