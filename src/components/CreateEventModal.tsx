import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, deleteField, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from '../lib/storage';
import { ArrowLeft, Camera, Check, Globe, Lock, MapPin, Users, Video, X } from 'lucide-react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { toast } from 'react-hot-toast';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { EVENT_CATEGORIES } from '../lib/eventCategories';
import { EVENT_THEMES, themeOf } from '../lib/eventTheme';
import EventCard from './EventCard';
import ModalShell, { fieldInput, fieldLabel, ghostBtn, primaryBtn } from './ui/ModalShell';
import { normalizeSettings } from '../features/settings/preferences';

const TITLE_MAX = 100;
const ABOUT_MAX = 1000;
const IMAGE_MAX_MB = 5;
const STEPS = [
  { emoji: '✍️', heading: 'Basics' },
  { emoji: '🎨', heading: 'Look' },
  { emoji: '📍', heading: 'When & where' },
  { emoji: '🎟️', heading: 'Tickets' },
] as const;
const SUNSET = `linear-gradient(90deg, ${EVENT_THEMES[0].from}, ${EVENT_THEMES[0].to})`;
const PLATFORMS = ['zoom', 'meet', 'teams', 'other'];

const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const blank = (communityId?: string) => ({
  title: '', description: '', category: 'Tech', banner: '',
  hostType: communityId ? 'community' : 'user', selectedCommunityId: communityId || '',
  visibility: 'public', isPaid: false, price: 0, currency: 'USD' as 'NGN' | 'USD', theme: '',
  startDate: '', startTime: '18:00', endDate: '', endTime: '20:00', timezone: localTz(),
  isOffline: false, locationName: '', locationAddress: '', locationCoords: null as { lat: number; lng: number } | null,
  onlineType: 'internal', externalPlatform: 'zoom', externalUrl: '', maxAttendees: 0,
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  communityId?: string; // set when opened from a community page
  eventId?: string; // set when editing
}

/** Four short steps (basics, look, when & where, tickets) with a live preview of the event card. */
export default function CreateEventModal({ isOpen, onClose, communityId, eventId }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => blank(communityId));
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState('');
  const [myCommunities, setMyCommunities] = useState<any[]>([]);
  const [mapsReady, setMapsReady] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const placeInput = useRef<HTMLInputElement>(null);
  const timezones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);
  const set = (patch: Partial<ReturnType<typeof blank>>) => setForm(f => ({ ...f, ...patch }));

  // Local preview of a picked banner.
  useEffect(() => {
    if (!bannerFile) { setBannerUrl(''); return; }
    const u = URL.createObjectURL(bannerFile);
    setBannerUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bannerFile]);

  // Maps (optional: without a key, location is typed by hand).
  useEffect(() => {
    const key = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
    if (!isOpen || !key) return;
    setOptions({ key });
    importLibrary('places').then(() => setMapsReady(true)).catch(() => undefined);
  }, [isOpen]);

  // Load the event when editing, or the user's communities when creating.
  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    if (eventId) {
      getDoc(doc(db, 'events', eventId)).then(snap => {
        const d = snap.data();
        if (!d) return;
        setForm({
          ...blank(),
          title: d.title || '', description: d.description || '', category: d.category || 'Tech', banner: d.banner || '',
          hostType: d.eventType || 'user', selectedCommunityId: d.communityId || '', visibility: d.visibility || 'public',
          isPaid: !!d.isPaid, price: d.price || 0, currency: d.currency === 'NGN' ? 'NGN' as const : 'USD' as const, theme: d.theme || '',
          startDate: d.startDate?.split('T')[0] || '', startTime: d.startDate?.split('T')[1]?.slice(0, 5) || '18:00',
          endDate: d.endDate?.split('T')[0] || '', endTime: d.endDate?.split('T')[1]?.slice(0, 5) || '20:00',
          timezone: d.timezone || localTz(), isOffline: !!d.isOffline, locationName: d.locationName || '',
          locationAddress: d.locationAddress || '', locationCoords: d.locationCoords || null,
          onlineType: d.onlineType || 'internal', externalPlatform: d.externalPlatform || 'zoom',
          externalUrl: d.externalUrl || '', maxAttendees: d.maxAttendees || 0,
        });
      });
    } else if (!communityId && auth.currentUser) {
      Promise.all([
        getDocs(query(collection(db, 'communities'), where('creatorId', '==', auth.currentUser.uid))),
        getDoc(doc(db, 'users', auth.currentUser.uid)),
      ])
        .then(([s, userSnap]) => {
          setMyCommunities(s.docs.map(d => ({ id: d.id, ...d.data() })));
          const preferred = normalizeSettings(userSnap.data()).events.defaultVisibility;
          set({ visibility: preferred === 'followers' ? 'followers' : 'public' });
        })
        .catch(() => undefined);
    }
  }, [isOpen, eventId, communityId]);

  // Places autocomplete on the location field.
  useEffect(() => {
    if (!mapsReady || !isOpen || step !== 2 || !form.isOffline || !placeInput.current) return;
    const ac = new google.maps.places.Autocomplete(placeInput.current, { fields: ['name', 'formatted_address', 'geometry'] });
    const listener = ac.addListener('place_changed', async () => {
      const p = ac.getPlace();
      const loc = p.geometry?.location;
      set({
        locationName: p.name || '',
        locationAddress: p.formatted_address || p.name || '',
        locationCoords: loc ? { lat: loc.lat(), lng: loc.lng() } : null,
      });
      if (!loc) return;
      try { // use the venue's timezone
        const key = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
        const r = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${loc.lat()},${loc.lng()}&timestamp=${Math.floor(Date.now() / 1000)}&key=${key}`);
        const t = await r.json();
        if (t.status === 'OK') set({ timezone: t.timeZoneId });
      } catch { /* keep current timezone */ }
    });
    return () => listener.remove();
  }, [mapsReady, isOpen, step, form.isOffline]);

  if (!isOpen) return null;

  const startIso = form.startDate ? `${form.startDate}T${form.startTime}:00` : '';
  const endIso = form.endDate ? `${form.endDate}T${form.endTime}:00` : '';
  const title = form.title.trim();

  const stepError = [
    form.hostType === 'community' && !form.selectedCommunityId ? 'Pick a community to host under.'
      : title.length < 3 ? 'Give your event a title (at least 3 characters).' : null,
    null,
    !form.startDate || !form.endDate ? 'Choose when it starts and ends.'
      : new Date(endIso) <= new Date(startIso) ? 'The end must be after the start.'
      : form.isOffline && !form.locationName.trim() ? 'Add where it is happening.'
      : !form.isOffline && form.onlineType === 'external' && !/^https?:\/\//i.test(form.externalUrl.trim()) ? 'Add the full link people should join (https://…).'
      : null,
    form.isPaid && !(Number(form.price) > 0) ? 'Set a ticket price above zero, or choose Free.' : null,
  ][step];

  const pickBanner = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('Choose an image');
    if (f.size > IMAGE_MAX_MB * 1024 * 1024) return toast.error(`Images must be under ${IMAGE_MAX_MB} MB`);
    setBannerFile(f);
  };

  const close = () => {
    if (saving) return;
    if (!eventId) { setForm(blank(communityId)); setBannerFile(null); }
    onClose();
  };

  const submit = async () => {
    const user = auth.currentUser;
    if (!user || stepError) return;
    try {
      setSaving(bannerFile ? 'Uploading banner…' : 'Saving…');
      let banner = form.banner;
      if (bannerFile) {
        const r = ref(null, `events/${user.uid}/${Date.now()}_${bannerFile.name.replace(/[^\w.-]/g, '_')}`);
        await uploadBytes(r, bannerFile, { contentType: bannerFile.type });
        banner = await getDownloadURL(r);
      }
      setSaving(eventId ? 'Saving changes…' : 'Creating your event…');

      const data: any = {
        title, description: form.description.trim(), category: form.category,
        hostId: user.uid, eventType: form.hostType, visibility: form.visibility,
        isPaid: form.isPaid, price: form.isPaid ? Number(form.price) : 0, currency: form.currency, ...(form.theme ? { theme: form.theme } : {}),
        startDate: startIso, endDate: endIso, timezone: form.timezone, isOffline: form.isOffline,
        status: 'upcoming', attendeeCount: 0, createdAt: new Date().toISOString(),
      };
      if (banner) data.banner = banner;
      if (form.hostType === 'community') data.communityId = form.selectedCommunityId;
      if (form.isOffline) {
        data.locationName = form.locationName.trim();
        data.locationAddress = form.locationAddress.trim() || form.locationName.trim();
        if (form.locationCoords) data.locationCoords = form.locationCoords;
      } else {
        data.onlineType = form.onlineType;
        if (form.onlineType === 'external') { data.externalPlatform = form.externalPlatform; data.externalUrl = form.externalUrl.trim(); }
      }
      if (form.maxAttendees > 0) data.maxAttendees = Number(form.maxAttendees);

      if (eventId) {
        const before = (await getDoc(doc(db, 'events', eventId))).data();
        const { attendeeCount, status, createdAt, ...update } = data;
        // Rescheduling is also the repair path for an event that a room ending
        // marked ended early. Recompute the status from the new dates and clear
        // the stale end marker so the event returns to discovery.
        const nextEnd = endIso ? new Date(endIso).getTime() : NaN;
        const nextStatus = Number.isFinite(nextEnd) && nextEnd <= Date.now()
          ? 'ended'
          : before?.status === 'live'
            ? 'live'
            : 'upcoming';
        await updateDoc(doc(db, 'events', eventId), {
          ...update,
          status: nextStatus,
          endedAt: deleteField(),
        });
        const moved = before && (before.locationAddress !== update.locationAddress || before.locationName !== update.locationName);
        const retimed = before && (before.startDate !== update.startDate || before.endDate !== update.endDate);
        if (moved || retimed) {
          const regs = await getDocs(collection(db, 'events', eventId, 'registrations'));
          const what = [moved && 'location', retimed && 'date/time'].filter(Boolean).join(' and ');
          await Promise.all(regs.docs.map(d => addDoc(collection(db, 'notifications'), {
            recipientId: d.id,
            senderId: auth.currentUser?.uid,
            senderName: auth.currentUser?.displayName || 'Kith',
            senderPhoto: auth.currentUser?.photoURL || '',
            type: 'event_reminder',
            category: 'events',
            relatedId: eventId,
            read: false,
            content: `Event "${update.title}" has been updated. Please check the new ${what}.`,
            createdAt: serverTimestamp(),
          })));
        }
        toast.success('Event updated');
        onClose();
      } else {
        const created = await addDoc(collection(db, 'events'), data);
        toast.success(`${title} is live on Kith`);
        setForm(blank(communityId)); setBannerFile(null);
        onClose();
        if (!communityId) navigate(`/events/${created.id}`);
      }
    } catch (error) {
      handleFirestoreError(error, eventId ? OperationType.UPDATE : OperationType.CREATE, 'events');
      toast.error("Couldn't save the event. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  const next = () => {
    if (stepError) return toast.error(stepError);
    if (step < STEPS.length - 1) setStep(step + 1); else submit();
  };

  const me = auth.currentUser;
  const preview = {
    id: title || 'preview', title: title || 'Your event title', category: form.category,
    banner: bannerUrl || form.banner, startDate: startIso || new Date(Date.now() + 2 * 86_400_000).toISOString(),
    isOffline: form.isOffline, locationName: form.locationName, isPaid: form.isPaid, price: form.price, currency: form.currency,
    status: 'upcoming', attendeeCount: 0, hostName: me?.displayName, maxAttendees: form.maxAttendees,
  };
  const chip = (active: boolean) => `px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${active ? 'bg-pink-500 text-white' : 'bg-black/5 dark:bg-white/[0.07] hover:bg-black/10 dark:hover:bg-white/10'}`;

  const theme = themeOf({ id: 'preview', theme: form.theme });
  const quick = (kind: 'tonight' | 'tomorrow' | 'weekend') => {
    const d = new Date();
    if (kind === 'tomorrow') d.setDate(d.getDate() + 1);
    if (kind === 'weekend') d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    const day = dayStr(d);
    const [st, en] = kind === 'tonight' ? ['19:00', '22:00'] : kind === 'tomorrow' ? ['18:00', '21:00'] : ['14:00', '18:00'];
    set({ startDate: day, endDate: day, startTime: st, endTime: en });
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label={eventId ? 'Edit event' : 'Create an event'} className="w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-4xl flex bg-background text-black dark:text-white sm:rounded-3xl sm:border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden">
        {/* Poster studio */}
        <div className="hidden lg:flex w-[340px] shrink-0 flex-col items-center justify-center p-8 relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${theme.from}, ${theme.to})`, color: '#fff' }}>
          <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-20 -right-10 w-64 h-64 rounded-full bg-black/20 blur-3xl" />
          <p className="relative text-xs font-bold uppercase tracking-widest text-white/80 mb-4">Live preview</p>
          <div className="relative w-full -rotate-2 hover:rotate-0 transition-transform duration-300 shadow-2xl rounded-3xl"><EventCard event={preview} preview /></div>
          <p className="relative mt-5 text-sm text-white/85 text-center">This is how your event shows up on Kith.</p>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-black/10 dark:border-white/10">
            <button onClick={step > 0 ? () => setStep(step - 1) : close} disabled={!!saving} aria-label={step > 0 ? 'Back' : 'Close'} className="p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40">{step > 0 ? <ArrowLeft size={20} /> : <X size={20} />}</button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-black/50 dark:text-white/50">{eventId ? 'Edit event' : 'New event'} · Step {step + 1} of {STEPS.length}</p>
              <h2 className="font-display font-extrabold text-xl truncate">{STEPS[step].emoji} {STEPS[step].heading}</h2>
            </div>
            <button onClick={close} disabled={!!saving} aria-label="Close" className="hidden sm:block p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={20} /></button>
          </div>
          <div className="h-1 bg-black/5 dark:bg-white/10"><div className="h-full transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: SUNSET }} /></div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
      {step === 0 && (<>
        {!eventId && !communityId && (
          <div>
            <p className={fieldLabel}>Hosting as</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Choice active={form.hostType === 'user'} onClick={() => set({ hostType: 'user', selectedCommunityId: '' })} icon={Users} title="You" body="Appears on your profile." />
              <Choice active={form.hostType === 'community'} onClick={() => set({ hostType: 'community' })} icon={Globe} title="A community" body="Shared with its members." />
            </div>
            {form.hostType === 'community' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {myCommunities.length === 0 && <p className="text-sm text-black/50 dark:text-white/50">You don't own a community yet.</p>}
                {myCommunities.map(c => <button key={c.id} type="button" onClick={() => set({ selectedCommunityId: c.id })} aria-pressed={form.selectedCommunityId === c.id} className={chip(form.selectedCommunityId === c.id)}>{c.name}</button>)}
              </div>
            )}
          </div>
        )}
        <div>
          <div className="flex justify-between"><label htmlFor="ev-title" className={fieldLabel}>Title</label><span className="text-xs text-black/40 dark:text-white/40">{form.title.length}/{TITLE_MAX}</span></div>
          <input id="ev-title" autoFocus value={form.title} maxLength={TITLE_MAX} onChange={e => set({ title: e.target.value })} placeholder="Name your event" className="mt-1 w-full bg-transparent border-0 border-b-2 border-black/10 dark:border-white/15 focus:border-pink-500 outline-none py-2 font-display font-extrabold text-2xl sm:text-3xl placeholder:text-black/25 dark:placeholder:text-white/25 transition-colors" />
        </div>
        <div>
          <div className="flex justify-between"><label htmlFor="ev-about" className={fieldLabel}>What's it about?</label><span className="text-xs text-black/40 dark:text-white/40">{form.description.length}/{ABOUT_MAX}</span></div>
          <textarea id="ev-about" value={form.description} maxLength={ABOUT_MAX} onChange={e => set({ description: e.target.value })} rows={4} placeholder="What will happen, and who should come?" className={`${fieldInput} resize-none`} />
        </div>
        <div>
          <p className={fieldLabel}>What kind of event?</p>
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {EVENT_CATEGORIES.map((c, i) => {
              const on = form.category === c.name;
              return (
                <button key={c.name} type="button" onClick={() => set({ category: c.name })} aria-pressed={on} className={`flex flex-col items-center gap-1 py-3 rounded-2xl text-xs font-bold transition-all ${on ? 'ring-2 ring-pink-500 scale-105' : 'hover:scale-105'}`} style={{ background: `hsl(${(i * 47) % 360} 85% 60% / ${on ? 0.28 : 0.12})` }}>
                  <span className="text-2xl">{c.emoji}</span><span className="truncate max-w-full px-1">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </>)}

      {step === 1 && (<>
        <div>
          <p className={fieldLabel}>Banner</p>
          <p className="text-xs text-black/50 dark:text-white/50">Wide images (16:9) look best. Without one, we use a colour from your title.</p>
          <button type="button" onClick={() => bannerInput.current?.click()} className="mt-2 w-full aspect-[16/7] rounded-2xl border-2 border-dashed border-black/15 dark:border-white/20 flex items-center justify-center overflow-hidden hover:border-primary transition-colors">
            {bannerUrl || form.banner ? <img src={bannerUrl || form.banner} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center gap-2 text-sm text-black/45 dark:text-white/45"><Camera size={18} /> Add a banner</span>}
          </button>
          {(bannerFile || form.banner) && <button type="button" onClick={() => { setBannerFile(null); set({ banner: '' }); }} className="mt-1.5 text-sm text-black/55 dark:text-white/55 hover:text-red-500">Remove banner</button>}
          <input ref={bannerInput} type="file" accept="image/*" hidden onChange={pickBanner} />
        </div>
        <div>
          <p className={fieldLabel}>Pick a vibe</p>
          <p className="text-xs text-black/50 dark:text-white/50">Colours your poster when there's no banner.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {EVENT_THEMES.map(t => (
              <button key={t.id} type="button" onClick={() => set({ theme: t.id })} aria-pressed={form.theme === t.id} aria-label={t.name} title={t.name} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform ${form.theme === t.id ? 'ring-2 ring-offset-2 ring-offset-background ring-pink-500 scale-110' : 'hover:scale-110'}`} style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})`, color: '#fff' }}>
                {form.theme === t.id && <Check size={18} />}
              </button>
            ))}
          </div>
        </div>
        <div className="lg:hidden max-w-[260px]"><EventCard event={preview} preview /></div>
      </>)}

      {step === 2 && (<>
        <div className="flex flex-wrap gap-2">
          {([['tonight', '🌙 Tonight'], ['tomorrow', '☀️ Tomorrow'], ['weekend', '🎉 This weekend']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => quick(k)} className={chip(false)}>{l}</button>)}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="ev-sd" className={fieldLabel}>Starts</label>
            <div className="flex gap-2"><input id="ev-sd" type="date" min={dayStr(new Date())} value={form.startDate} onChange={e => set({ startDate: e.target.value, endDate: form.endDate || e.target.value })} className={fieldInput} /><input aria-label="Start time" type="time" value={form.startTime} onChange={e => set({ startTime: e.target.value })} className={`${fieldInput} w-32`} /></div></div>
          <div><label htmlFor="ev-ed" className={fieldLabel}>Ends</label>
            <div className="flex gap-2"><input id="ev-ed" type="date" min={form.startDate} value={form.endDate} onChange={e => set({ endDate: e.target.value })} className={fieldInput} /><input aria-label="End time" type="time" value={form.endTime} onChange={e => set({ endTime: e.target.value })} className={`${fieldInput} w-32`} /></div></div>
        </div>
        <div>
          <label htmlFor="ev-tz" className={fieldLabel}>Time zone</label>
          <select id="ev-tz" value={form.timezone} onChange={e => set({ timezone: e.target.value })} className={fieldInput}>
            {(timezones.includes(form.timezone) ? timezones : [form.timezone, ...timezones]).map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <p className={fieldLabel}>Format</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Choice active={!form.isOffline} onClick={() => set({ isOffline: false })} icon={Video} title="Online" body="Join from anywhere." />
            <Choice active={form.isOffline} onClick={() => set({ isOffline: true })} icon={MapPin} title="In person" body="At a place you choose." />
          </div>
        </div>
        {form.isOffline ? (
          <div>
            <label htmlFor="ev-place" className={fieldLabel}>Location</label>
            <input id="ev-place" ref={placeInput} defaultValue={form.locationName} onChange={e => !mapsReady && set({ locationName: e.target.value, locationAddress: e.target.value })} placeholder={mapsReady ? 'Search for a venue or address' : 'Venue or address'} className={fieldInput} />
            {form.locationAddress && <p className="mt-1.5 text-xs text-black/55 dark:text-white/55 flex items-center gap-1"><MapPin size={12} /> {form.locationName}{form.locationAddress !== form.locationName && ` · ${form.locationAddress}`}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Choice active={form.onlineType === 'internal'} onClick={() => set({ onlineType: 'internal' })} icon={Video} title="On Kith" body="A live room, built in." />
              <Choice active={form.onlineType === 'external'} onClick={() => set({ onlineType: 'external' })} icon={Globe} title="Other platform" body="Zoom, Meet and so on." />
            </div>
            {form.onlineType === 'external' && (
              <div className="flex gap-2">
                <select aria-label="Platform" value={form.externalPlatform} onChange={e => set({ externalPlatform: e.target.value })} className={`${fieldInput} w-32 mt-0`}>{PLATFORMS.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select>
                <input aria-label="Meeting link" value={form.externalUrl} onChange={e => set({ externalUrl: e.target.value })} placeholder="https://…" className={`${fieldInput} mt-0`} />
              </div>
            )}
          </div>
        )}
      </>)}

      {step === 3 && (<>
        <div>
          <p className={fieldLabel}>Who can see it?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Choice active={form.visibility === 'public'} onClick={() => set({ visibility: 'public' })} icon={Globe} title="Public" body="Listed for everyone." />
            <Choice active={form.visibility === 'followers'} onClick={() => set({ visibility: 'followers' })} icon={Users} title="Followers" body="Only people who follow you." />
            <Choice active={form.visibility === 'community'} onClick={() => form.hostType === 'community' ? set({ visibility: 'community' }) : toast('Community-only needs a community host')} icon={Lock} title="Members only" body="Only your community's members." />
          </div>
        </div>
        <div>
          <p className={fieldLabel}>Tickets</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Choice active={!form.isPaid} onClick={() => set({ isPaid: false })} icon={Users} title="Free" body="Anyone can RSVP." />
            <Choice active={form.isPaid} onClick={() => set({ isPaid: true })} icon={Lock} title="Paid" body="Charge per ticket." />
          </div>
          {form.isPaid && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-black/10 p-0.5 dark:border-white/10">
                  {(['USD', 'NGN'] as const).map(code => (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={form.currency === code}
                      onClick={() => set({ currency: code })}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        form.currency === code
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'text-black/55 hover:text-black dark:text-white/55 dark:hover:text-white'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Ticket price"
                  type="number"
                  min={1}
                  step={form.currency === 'NGN' ? 100 : 1}
                  value={form.price || ''}
                  onChange={e => set({ price: Number(e.target.value) })}
                  placeholder={form.currency === 'NGN' ? '5000' : '10'}
                  className={`${fieldInput} mt-0 w-32`}
                />
              </div>
              <p className="text-xs text-black/50 dark:text-white/50">
                {form.currency === 'NGN'
                  ? 'Charged in naira with Paystack. Prices are never converted from USD.'
                  : 'Charged in US dollars with Paystack. Prices are never converted from NGN.'}
              </p>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="ev-cap" className={fieldLabel}>Capacity</label>
          <p className="text-xs text-black/50 dark:text-white/50">Leave empty for unlimited. We'll show "spots left" when it's nearly full.</p>
          <input id="ev-cap" type="number" min={0} value={form.maxAttendees || ''} onChange={e => set({ maxAttendees: Math.max(0, Number(e.target.value)) })} placeholder="Unlimited" className={`${fieldInput} w-40`} />
        </div>
      </>)}
          </div>

          <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-black/10 dark:border-white/10 pb-[max(12px,env(safe-area-inset-bottom))]">
            <p className="text-xs text-black/50 dark:text-white/50 min-w-0 truncate">{saving ?? (stepError && step === 0 && title ? stepError : '')}</p>
            <div className="flex gap-2 shrink-0">
              {step > 0 && <button onClick={() => setStep(step - 1)} disabled={!!saving} className={ghostBtn}>Back</button>}
              <button onClick={next} disabled={!!saving || !!stepError} className="px-6 py-2.5 rounded-full text-white text-sm font-bold hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 transition-transform shadow-lg shadow-pink-500/20" style={{ background: SUNSET }}>
                {saving ? 'Saving…' : step < STEPS.length - 1 ? 'Next' : eventId ? 'Save changes' : 'Publish event 🚀'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Choice({ active, onClick, icon: Icon, title, body }: { active: boolean; onClick: () => void; icon: typeof Globe; title: string; body: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`p-3.5 rounded-2xl border text-left transition-colors ${active ? 'border-pink-500 bg-pink-500/5' : 'border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}>
      <Icon size={18} className={active ? 'text-pink-500' : 'text-black/45 dark:text-white/45'} />
      <p className="mt-1.5 text-sm font-semibold">{title}</p>
      <p className="text-xs text-black/55 dark:text-white/55">{body}</p>
    </button>
  );
}
