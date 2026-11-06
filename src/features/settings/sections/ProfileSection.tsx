import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ExternalLink,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  UserRound,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth } from '../../../firebase';
import { getDownloadURL, ref, uploadBytesResumable } from '../../../lib/storage';
import { usersRepository } from '../../../services/db/usersRepository';
import { Button } from '../../../components/ui/Button';
import { Field, Input, Textarea } from '../../../components/ui/Input';
import LocationInput from '../../../components/LocationInput';
import {
  Segmented,
  SettingNote,
  SettingRow,
  SettingsSection,
  Subheading,
  Switch,
} from '../components/controls';
import type { SectionProps } from './types';

const SOCIAL_LINKS = [
  { icon: Github, label: 'GitHub', key: 'githubUrl', placeholder: 'github.com/username' },
  { icon: Globe, label: 'Twitter / X', key: 'twitterUrl', placeholder: 'x.com/username' },
  { icon: Instagram, label: 'Instagram', key: 'instagramUrl', placeholder: 'instagram.com/username' },
  { icon: Linkedin, label: 'LinkedIn', key: 'linkedinUrl', placeholder: 'linkedin.com/username' },
] as const;

const avatarFallback = (seed?: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || 'kith')}`;

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export default function ProfileSection({ settings, update, profile, updateProfile, onNavigate }: SectionProps) {
  const uid = auth.currentUser?.uid;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    displayName: '',
    username: '',
    bio: '',
    websiteUrl: '',
    githubUrl: '',
    twitterUrl: '',
    instagramUrl: '',
    linkedinUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      displayName: profile.displayName || '',
      username: profile.username || '',
      bio: profile.bio || '',
      websiteUrl: profile.websiteUrl || '',
      githubUrl: profile.githubUrl || '',
      twitterUrl: profile.twitterUrl || '',
      instagramUrl: profile.instagramUrl || '',
      linkedinUrl: profile.linkedinUrl || '',
    });
  }, [profile]);

  const avatar = profile?.profileImage?.trim() ? profile.profileImage : avatarFallback(uid);
  const visibility = settings.profile.visibility;
  const showcase = settings.profile.showShowcase;

  const toggleShowcase = (key: keyof typeof showcase) =>
    update((current) => ({
      ...current,
      profile: {
        ...current.profile,
        showShowcase: { ...current.profile.showShowcase, [key]: !current.profile.showShowcase[key] },
      },
      ...(key === 'products'
        ? { commerce: { ...current.commerce, showProducts: !current.profile.showShowcase.products } }
        : {}),
    }));

  const saveIdentity = async () => {
    setError(null);
    const displayName = form.displayName.trim();
    const username = form.username.trim().replace(/^@/, '');
    const bio = form.bio.trim();

    if (displayName.length < 2) return setError('Display name must be at least 2 characters.');
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return setError('Username must be 3–30 characters: letters, numbers and underscores only.');
    }
    if (username !== profile?.username) {
      const available = await usersRepository.isUsernameAvailable(username, uid!);
      if (!available) return setError('That username is already taken.');
    }
    if (bio.length > 280) return setError('Bio must be 280 characters or fewer.');

    setSaving(true);
    const ok = await updateProfile(
      {
        displayName,
        username,
        bio,
        websiteUrl: normalizeUrl(form.websiteUrl),
      },
      { message: 'Profile saved' },
    );
    setSaving(false);
    if (ok) toast.success('Profile saved');
  };

  const saveSocials = async () => {
    setSaving(true);
    const ok = await updateProfile(
      Object.fromEntries(
        SOCIAL_LINKS.map((link) => [link.key, normalizeUrl(form[link.key])]),
      ) as Record<string, unknown>,
      { message: 'Social links saved' },
    );
    setSaving(false);
    if (ok) toast.success('Social links saved');
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !uid) return;
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file.');
    if (file.size > 5 * 1024 * 1024) return toast.error('Images must be 5 MB or smaller.');

    setUploading(true);
    setProgress(0);
    try {
      const target = ref(null, `avatars/${uid}/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`);
      const task = uploadBytesResumable(target, file, { contentType: file.type });
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snapshot) => setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
          reject,
          resolve,
        );
      });
      const url = await getDownloadURL(target);
      const ok = await updateProfile({ profileImage: url }, { silent: true });
      if (ok) toast.success('Profile picture updated');
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : 'Image upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Profile"
        description="This is what people see when they open your profile or hover your name."
        action={
          <Button
            variant="secondary"
            size="sm"
            rightIcon={<ExternalLink size={13} />}
            onClick={() => window.open(`/creators/${uid}`, '_blank', 'noopener')}
          >
            Preview
          </Button>
        }
      >
        <div className="flex flex-col gap-5 py-5 sm:flex-row sm:items-center">
          <div className="relative mx-auto shrink-0 sm:mx-0">
            <div className="h-24 w-24 overflow-hidden rounded-card border border-border-strong bg-muted">
              <img src={avatar} alt="Your profile" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change profile picture"
              className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-control bg-primary text-primary-foreground shadow-glow-primary transition-transform hover:scale-105 disabled:opacity-60"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="truncate font-display text-xl font-semibold tracking-[-0.035em]">
              {profile?.displayName || 'Your name'}
            </p>
            <p className="truncate text-sm text-muted-foreground">@{profile?.username || 'username'}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <span className="rounded-pill bg-primary/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                Level {Math.floor((profile?.xp || 0) / 100) + 1}
              </span>
              <span className="rounded-pill border border-border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {profile?.userType || 'Creator'}
              </span>
            </div>
            {uploading && (
              <div className="mx-auto mt-4 max-w-xs sm:mx-0">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-faint">Uploading… {progress}%</p>
              </div>
            )}
            <p className="mt-2 text-[11px] text-faint">JPG, PNG or WebP up to 5 MB.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Identity"
        description="Your name, handle and the short introduction shown across Kith."
      >
        <div className="space-y-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" hint="Shown on posts, events and messages.">
              <Input
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                placeholder="Ada Lovelace"
                maxLength={60}
              />
            </Field>
            <Field label="Username" hint="Letters, numbers and underscores. 3–30 characters.">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-faint">@</span>
                <Input
                  className="pl-9"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value.replace(/^@/, '') })}
                  placeholder="ada"
                  maxLength={30}
                  autoCapitalize="none"
                />
              </div>
            </Field>
          </div>

          <Field
            label="Bio"
            hint={`${form.bio.length}/280 characters`}
          >
            <Textarea
              className="min-h-[104px]"
              value={form.bio}
              onChange={(event) => setForm({ ...form, bio: event.target.value })}
              placeholder="What are you building?"
              maxLength={280}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" hint="Used for local events and your timezone.">
              <LocationInput
                defaultValue={profile?.location}
                onLocationSelect={async (location, lat, lng) => {
                  const updates: Record<string, unknown> = { location };
                  const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
                  if (lat !== undefined && lng !== undefined && apiKey) {
                    try {
                      const timestamp = Math.floor(Date.now() / 1000);
                      const response = await fetch(
                        `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${apiKey}`,
                      );
                      const data = await response.json();
                      if (data.status === 'OK') updates.timezone = data.timeZoneId;
                    } catch {
                      /* timezone is a nice-to-have */
                    }
                  }
                  await updateProfile(updates, { silent: true });
                }}
              />
            </Field>
            <Field label="Website" hint="Your portfolio, studio or project.">
              <div className="relative">
                <Globe size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                <Input
                  className="pl-10"
                  type="url"
                  value={form.websiteUrl}
                  onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })}
                  placeholder="https://example.com"
                />
              </div>
            </Field>
          </div>

          {error && (
            <p role="alert" className="rounded-control border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-[11px] text-faint">Changes appear everywhere immediately.</p>
            <Button onClick={saveIdentity} loading={saving} leftIcon={<Check size={14} />}>
              Save profile
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Profile visibility"
        description="Control how discoverable your profile is. Audience rules for posts live under Audience & content."
      >
        <SettingRow
          title="Who can open your profile"
          description="Hidden profiles still appear as a minimal card in communities and events so context isn't broken."
          stacked
        >
          <Segmented
            ariaLabel="Profile visibility"
            value={visibility}
            onChange={(value) =>
              update((current) => ({ ...current, profile: { ...current.profile, visibility: value } }))
            }
            options={[
              { value: 'public', label: 'Public' },
              { value: 'followers', label: 'Followers' },
              { value: 'hidden', label: 'Hidden' },
            ]}
            fullWidth
          />
        </SettingRow>

        <SettingRow
          title="Show my followers"
          description="Who can open the follower list on your profile."
          stacked
        >
          <Segmented
            ariaLabel="Show followers"
            size="sm"
            value={settings.profile.showFollowers}
            onChange={(value) =>
              update((current) => ({ ...current, profile: { ...current.profile, showFollowers: value } }))
            }
            options={[
              { value: 'everyone', label: 'Everyone' },
              { value: 'followers', label: 'Followers' },
              { value: 'mutuals', label: 'Mutuals' },
              { value: 'me', label: 'Only me' },
            ]}
            fullWidth
          />
        </SettingRow>

        <SettingRow
          title="Show who I follow"
          description="Who can open the following list on your profile."
          stacked
        >
          <Segmented
            ariaLabel="Show following"
            size="sm"
            value={settings.profile.showFollowing}
            onChange={(value) =>
              update((current) => ({ ...current, profile: { ...current.profile, showFollowing: value } }))
            }
            options={[
              { value: 'everyone', label: 'Everyone' },
              { value: 'followers', label: 'Followers' },
              { value: 'mutuals', label: 'Mutuals' },
              { value: 'me', label: 'Only me' },
            ]}
            fullWidth
          />
        </SettingRow>

        <SettingRow
          title="Show communities I'm a member of"
          description="Community membership on your profile. Direct links inside the community still work."
          stacked
        >
          <Segmented
            ariaLabel="Show communities"
            size="sm"
            value={settings.profile.showCommunities}
            onChange={(value) =>
              update((current) => ({ ...current, profile: { ...current.profile, showCommunities: value } }))
            }
            options={[
              { value: 'everyone', label: 'Everyone' },
              { value: 'followers', label: 'Followers' },
              { value: 'members', label: 'Members' },
              { value: 'me', label: 'Only me' },
            ]}
            fullWidth
          />
        </SettingRow>

        {visibility === 'hidden' && (
          <SettingNote tone="warning" title="Your profile is hidden">
            People can still see your posts inside communities and events, and direct links to your products keep
            working. Use Audience & content to restrict posts too.
          </SettingNote>
        )}

        <div className="flex justify-end py-4">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('privacy')} rightIcon={<ExternalLink size={13} />}>
            More privacy settings
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Profile showcase"
        description="Choose which sections and achievements appear on your public profile."
      >
        <Subheading>Content</Subheading>
        <SettingRow title="Products" description="Your marketplace storefront.">
          <Switch checked={showcase.products} onChange={() => toggleShowcase('products')} label="Show products" />
        </SettingRow>
        <SettingRow title="Articles" description="Stories from the Kith Journal.">
          <Switch checked={showcase.articles} onChange={() => toggleShowcase('articles')} label="Show articles" />
        </SettingRow>
        <SettingRow title="Communities" description="Circles you belong to.">
          <Switch checked={showcase.communities} onChange={() => toggleShowcase('communities')} label="Show communities" />
        </SettingRow>
        <SettingRow title="Events" description="Events you host or attend.">
          <Switch checked={showcase.events} onChange={() => toggleShowcase('events')} label="Show events" />
        </SettingRow>

        <Subheading>Achievements</Subheading>
        <SettingRow title="Badges" description="Earned badges from challenges and community activity.">
          <Switch checked={showcase.badges} onChange={() => toggleShowcase('badges')} label="Show badges" />
        </SettingRow>
        <SettingRow title="XP and level" description="Your level ring and total XP.">
          <Switch checked={showcase.xp} onChange={() => toggleShowcase('xp')} label="Show XP" />
        </SettingRow>
        <SettingRow title="Streak" description="Your active shipping streak.">
          <Switch checked={showcase.streak} onChange={() => toggleShowcase('streak')} label="Show streak" />
        </SettingRow>

        <SettingRow
          title="Available for work"
          description="Adds an availability badge to your profile. You can still receive DMs based on your messaging settings."
        >
          <Switch
            checked={settings.profile.availableForWork}
            onChange={(value) =>
              update((current) => ({
                ...current,
                profile: { ...current.profile, availableForWork: value },
                commerce: { ...current.commerce, availableForWork: value },
              }))
            }
            label="Available for work"
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Social links"
        description="Handles or full URLs are both fine. Links open in a new tab."
      >
        <div className="grid gap-4 py-5 sm:grid-cols-2">
          {SOCIAL_LINKS.map(({ icon: Icon, label, key, placeholder }) => (
            <Field key={key} label={label}>
              <div className="relative">
                <Icon size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                <Input
                  className="pl-10"
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  placeholder={placeholder}
                />
              </div>
            </Field>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border py-4">
          <p className="text-[11px] text-faint">Empty fields are hidden from your profile.</p>
          <Button variant="secondary" onClick={saveSocials} loading={saving} leftIcon={<Check size={14} />}>
            Save links
          </Button>
        </div>
      </SettingsSection>

      <div className="flex items-center gap-2 rounded-card border border-border bg-surface p-4 text-xs text-muted-foreground">
        <UserRound size={15} className="shrink-0 text-faint" />
        <p>
          Looking for username, bio or avatar changes? They live in <span className="font-semibold text-foreground">Identity</span> above.
        </p>
      </div>
    </div>
  );
}
