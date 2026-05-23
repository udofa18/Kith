import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Calendar, Users, Globe, Shield, Info, 
  ArrowRight, ArrowLeft, Check, Image as ImageIcon,
  Link as LinkIcon, MapPin, Clock, DollarSign, LayoutGrid,
  Search, Map as MapIcon
} from 'lucide-react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId?: string; // Optional: if opened from a community page
  eventId?: string; // Optional: for editing
}

export default function CreateEventModal({ isOpen, onClose, communityId, eventId }: CreateEventModalProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [step, setStep] = useState(1);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 0, lng: 0 });
  const [showMap, setShowMap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [myCommunities, setMyCommunities] = useState<any[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    const initMaps = async () => {
      const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) return;

      try {
        setOptions({
          key: apiKey
        });
        
        await importLibrary("places");
        await importLibrary("maps");
        await importLibrary("marker");
        
        setIsLoaded(true);
      } catch (err) {
        console.error("Maps load error in modal:", err);
      }
    };

    if (isOpen) {
      initMaps();
    }
  }, [isOpen]);
  
  const categories = [
    { id: 'Festival', name: 'Festival', icon: '🥳' },
    { id: 'Tech', name: 'Tech', icon: '💻' },
    { id: 'AI', name: 'AI', icon: '🧠' },
    { id: 'Arts', name: 'Arts', icon: '🎨' },
    { id: 'Educational', name: 'Educational', icon: '🎓' },
    { id: 'Pop culture', name: 'Pop culture', icon: '❤️' },
    { id: 'Food & Drinks', name: 'Food & Drinks', icon: '🍸' },
    { id: 'Convention', name: 'Convention', icon: '🏅' },
    { id: 'Community', name: 'Community', icon: '👥' },
    { id: 'Holiday', name: 'Holiday', icon: '🍃' },
    { id: 'Markets', name: 'Markets', icon: '🥕' },
    { id: 'Fair', name: 'Fair', icon: '🎪' },
    { id: 'Fintech', name: 'Fintech', icon: '💳' },
    { id: 'Fashion', name: 'Fashion', icon: '👗' },
    { id: 'Leadership', name: 'Leadership', icon: '👑' },
    { id: 'Coaching', name: 'Coaching', icon: '💡' },
  ];

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Festival',
    banner: '',
    hostType: communityId ? 'community' : 'user',
    selectedCommunityId: communityId || '',
    visibility: 'public',
    isPaid: false,
    price: 0,
    startDate: '',
    startTime: '12:00',
    endDate: '',
    endTime: '13:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isOffline: false,
    locationName: '',
    locationAddress: '',
    locationCoords: null as { lat: number, lng: number } | null,
    onlineType: 'internal',
    externalPlatform: 'zoom',
    externalUrl: '',
    maxAttendees: 0
  });

  const [timezoneSearch, setTimezoneSearch] = useState('');
  const [showTimezoneList, setShowTimezoneList] = useState(false);
  const timezones = Intl.supportedValuesOf('timeZone');
  const filteredTimezones = timezones.filter(tz => 
    tz.toLowerCase().includes(timezoneSearch.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      if (eventId) {
        fetchEventData();
      } else if (!communityId) {
        fetchMyCommunities();
      }
    }
  }, [isOpen, eventId]);

  const fetchEventData = async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'events', eventId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFormData({
          title: data.title || '',
          description: data.description || '',
          category: data.category || 'Festival',
          banner: data.banner || '',
          hostType: data.eventType || 'user',
          selectedCommunityId: data.communityId || '',
          visibility: data.visibility || 'public',
          isPaid: data.isPaid || false,
          price: data.price || 0,
          startDate: data.startDate ? data.startDate.split('T')[0] : '',
          startTime: data.startDate ? data.startDate.split('T')[1]?.slice(0, 5) : '12:00',
          endDate: data.endDate ? data.endDate.split('T')[0] : '',
          endTime: data.endDate ? data.endDate.split('T')[1]?.slice(0, 5) : '13:00',
          timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          isOffline: data.isOffline || false,
          locationName: data.locationName || '',
          locationAddress: data.locationAddress || '',
          locationCoords: data.locationCoords || null,
          onlineType: data.onlineType || 'internal',
          externalPlatform: data.externalPlatform || 'zoom',
          externalUrl: data.externalUrl || '',
          maxAttendees: data.maxAttendees || 0
        });
        if (data.banner) setImagePreview(data.banner);
        if (data.locationCoords) {
          setMapCenter(data.locationCoords);
          setShowMap(true);
        }
      }
    } catch (error) {
      console.error("Error fetching event:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      const containers = document.querySelectorAll('.pac-container');
      containers.forEach(container => (container as HTMLElement).style.display = 'none');
    }
  }, [isOpen]);

  const fetchMyCommunities = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'communities'),
        where('creatorId', '==', auth.currentUser.uid)
      );
      const snapshot = await getDocs(q);
      setMyCommunities(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching communities:", error);
    }
  };

  const handlePlaceChanged = async () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        
        setFormData(prev => ({
          ...prev,
          locationName: place.name || '',
          locationAddress: place.formatted_address || '',
          locationCoords: { lat, lng }
        }));
        
        setMapCenter({ lat, lng });
        setShowMap(true);

        // Fetch Timezone based on coordinates
        try {
          const timestamp = Math.floor(Date.now() / 1000);
          const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${apiKey}`
          );
          const tzData = await response.json();
          if (tzData.status === 'OK') {
            setFormData(prev => ({ ...prev, timezone: tzData.timeZoneId }));
          }
        } catch (error) {
          console.error("Error fetching timezone:", error);
        }
        
        // Force hide the autocomplete dropdown after selection
        const containers = document.querySelectorAll('.pac-container');
        containers.forEach(container => (container as HTMLElement).style.display = 'none');
      } else {
        // Fallback for custom address if no geometry (e.g. "Use {text}")
        setFormData(prev => ({
          ...prev,
          locationName: place.name || '',
          locationAddress: place.formatted_address || place.name || ''
        }));
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImagePreview(base64String);
        setFormData(prev => ({ ...prev, banner: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const fullStartDate = `${formData.startDate}T${formData.startTime}:00`;
      const fullEndDate = `${formData.endDate}T${formData.endTime}:00`;

      const eventData: any = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        banner: formData.banner || `https://picsum.photos/seed/${formData.category}/1200/600`,
        hostId: auth.currentUser.uid,
        eventType: formData.hostType,
        visibility: formData.visibility,
        isPaid: formData.isPaid,
        price: formData.isPaid ? Number(formData.price) : 0,
        startDate: fullStartDate,
        endDate: fullEndDate,
        timezone: formData.timezone,
        isOffline: formData.isOffline,
        status: 'upcoming',
        attendeeCount: 0,
        createdAt: new Date().toISOString()
      };

      if (formData.hostType === 'community') {
        eventData.communityId = formData.selectedCommunityId;
      }

      if (formData.isOffline) {
        eventData.locationName = formData.locationName;
        eventData.locationAddress = formData.locationAddress;
        if (formData.locationCoords) {
          eventData.locationCoords = formData.locationCoords;
        }
      } else {
        eventData.onlineType = formData.onlineType;
        if (formData.onlineType === 'external') {
          eventData.externalPlatform = formData.externalPlatform;
          eventData.externalUrl = formData.externalUrl;
        }
      }

      if (formData.maxAttendees > 0) {
        eventData.maxAttendees = Number(formData.maxAttendees);
      }

      if (eventId) {
        // Fetch existing event to compare
        const existingDoc = await getDoc(doc(db, 'events', eventId));
        const existingData = existingDoc.data();
        
        // Update existing event
        const { attendeeCount, status, createdAt, ...updateData } = eventData;
        await updateDoc(doc(db, 'events', eventId), updateData);

        // Check for relevant changes to notify participants
        if (existingData) {
          const locationChanged = existingData.locationAddress !== updateData.locationAddress || 
                                existingData.locationName !== updateData.locationName;
          const timeChanged = existingData.startDate !== updateData.startDate || 
                            existingData.endDate !== updateData.endDate;
          
          if (locationChanged || timeChanged) {
            // Notify all registered participants
            const registrationsSnap = await getDocs(collection(db, 'events', eventId, 'registrations'));
            const participants = registrationsSnap.docs.map(d => d.id);
            
            const notificationPromises = participants.map(participantId => {
              return addDoc(collection(db, 'notifications'), {
                recipientId: participantId,
                type: 'system',
                category: 'events',
                content: `Event "${updateData.title}" has been updated. Please check the new ${locationChanged ? 'location' : ''} ${locationChanged && timeChanged ? 'and' : ''} ${timeChanged ? 'date/time' : ''}.`,
                relatedId: eventId,
                read: false,
                createdAt: new Date().toISOString()
              });
            });
            await Promise.all(notificationPromises);
          }
        }
      } else {
        // Create new event
        await addDoc(collection(db, 'events'), eventData);
      }
      
      onClose();
      // Reset form
      setStep(1);
      setImagePreview(null);
      setFormData({
        title: '',
        description: '',
    category: 'Festival',
        banner: '',
        hostType: communityId ? 'community' : 'user',
        selectedCommunityId: communityId || '',
        visibility: 'public',
        isPaid: false,
        price: 0,
        startDate: '',
        startTime: '12:00',
        endDate: '',
        endTime: '13:00',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isOffline: false,
        locationName: '',
        locationAddress: '',
        locationCoords: null,
        onlineType: 'internal',
        externalPlatform: 'zoom',
        externalUrl: '',
        maxAttendees: 0
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-2xl bg-background border border-foreground/10 rounded-[32px] overflow-hidden shadow-2xl"
      >
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-foreground/5">
          <motion.div 
            className="h-full bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: `${(step / 5) * 100}%` }}
          />
        </div>

        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Create Event</h2>
              <p className="text-foreground/40 text-sm">Step {step} of 5</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-foreground/5 rounded-full transition-colors text-foreground">
              <X size={24} />
            </button>
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <label className="text-xs font-bold text-foreground/30 uppercase tracking-widest">Who is hosting?</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button 
                      onClick={() => setFormData(prev => ({ ...prev, hostType: 'user' }))}
                      className={`p-6 rounded-2xl border-2 transition-all text-left group ${
                        formData.hostType === 'user' ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                        formData.hostType === 'user' ? 'bg-primary text-primary-foreground' : 'bg-foreground/10 text-foreground/50'
                      }`}>
                        <Users size={24} />
                      </div>
                      <h3 className="font-bold text-lg mb-1 text-foreground">Personal</h3>
                      <p className="text-sm text-foreground/40">Host as yourself.</p>
                    </button>

                    <button 
                      onClick={() => setFormData(prev => ({ ...prev, hostType: 'community' }))}
                      className={`p-6 rounded-2xl border-2 transition-all text-left group ${
                        formData.hostType === 'community' ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                        formData.hostType === 'community' ? 'bg-primary text-primary-foreground' : 'bg-foreground/10 text-foreground/50'
                      }`}>
                        <Globe size={24} />
                      </div>
                      <h3 className="font-bold text-lg mb-1 text-foreground">Community</h3>
                      <p className="text-sm text-foreground/40">Host for a community.</p>
                    </button>
                  </div>
                </div>

                {formData.hostType === 'community' && !communityId && (
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-foreground/30 uppercase tracking-widest">Select Community</label>
                    <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2">
                      {myCommunities.map(comm => (
                        <button
                          key={comm.id}
                          onClick={() => setFormData(prev => ({ ...prev, selectedCommunityId: comm.id }))}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            formData.selectedCommunityId === comm.id ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:bg-foreground/10'
                          }`}
                        >
                          {comm.image && comm.image.trim() !== '' ? (
                            <img src={comm.image} className="w-8 h-8 rounded-lg object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center">
                              <Globe size={14} className="text-foreground/30" />
                            </div>
                          )}
                          <span className="font-bold text-sm text-foreground">{comm.name}</span>
                        </button>
                      ))}
                      {myCommunities.length === 0 && (
                        <p className="text-xs text-red-400">You don't manage any communities yet.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <label className="text-xs font-bold text-foreground/30 uppercase tracking-widest">Visibility</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button 
                      onClick={() => setFormData(prev => ({ ...prev, visibility: 'public' }))}
                      className={`p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${
                        formData.visibility === 'public' ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        formData.visibility === 'public' ? 'bg-primary text-primary-foreground' : 'bg-foreground/10 text-foreground/50'
                      }`}>
                        <Globe size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-foreground">Public</h3>
                        <p className="text-xs text-foreground/40">Visible to everyone.</p>
                      </div>
                    </button>

                    <button 
                      disabled={formData.hostType === 'user'}
                      onClick={() => setFormData(prev => ({ ...prev, visibility: 'community' }))}
                      className={`p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${
                        formData.visibility === 'community' ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                      } ${formData.hostType === 'user' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        formData.visibility === 'community' ? 'bg-primary text-primary-foreground' : 'bg-foreground/10 text-foreground/50'
                      }`}>
                        <Shield size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-foreground">Community Only</h3>
                        <p className="text-xs text-foreground/40">Only for members.</p>
                      </div>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar"
              >
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest mb-4">Event Category</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setFormData(prev => ({ ...prev, category: cat.id }))}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            formData.category === cat.id ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                          }`}
                        >
                          <span className="text-xl">{cat.icon}</span>
                          <span className="text-xs font-bold text-foreground">{cat.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest mb-2">Event Banner</label>
                    <div className="relative group">
                      <div className={`w-full h-48 rounded-2xl border-2 border-dashed border-foreground/10 flex flex-col items-center justify-center overflow-hidden transition-all ${imagePreview ? 'border-solid border-primary/50' : 'hover:border-foreground/20'}`}>
                        {(imagePreview && imagePreview.trim() !== '') ? (
                          <>
                            <img src={imagePreview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <button 
                                onClick={() => {
                                  setImagePreview(null);
                                  setFormData(prev => ({ ...prev, banner: '' }));
                                }}
                                className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-bold"
                              >
                                Remove Image
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-6 w-full">
                            <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center mx-auto mb-3">
                              <ImageIcon size={24} className="text-foreground/30" />
                            </div>
                            <p className="text-sm text-foreground/40 mb-4">Upload an image for your event</p>
                            <label className="cursor-pointer bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 px-6 py-3 rounded-xl text-sm font-bold transition-all inline-block text-foreground">
                              Choose File
                              <input 
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                            <p className="text-[10px] text-foreground/20 mt-4 uppercase tracking-widest">Or we'll use a placeholder based on category</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest mb-2">Event Title</label>
                    <input 
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. React Workshop 2024"
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-4 outline-none focus:border-primary transition-all text-lg font-bold text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest mb-2">Description</label>
                    <textarea 
                      rows={1}
                      value={formData.description}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, description: e.target.value }));
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 300)}px`;
                      }}
                      placeholder="What is this event about?"
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-4 outline-none focus:border-primary transition-all resize-none overflow-y-auto custom-scrollbar min-h-[120px] text-foreground"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div 
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="space-y-6">
                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest">Start Date & Time</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative">
                        <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30" />
                        <input 
                          type="date"
                          value={formData.startDate}
                          onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                          className="w-full bg-foreground/5 border border-foreground/10 rounded-xl pl-12 pr-4 py-4 outline-none focus:border-primary transition-all [color-scheme:dark] text-foreground"
                        />
                      </div>
                      <div className="relative">
                        <Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30" />
                        <input 
                          type="time"
                          value={formData.startTime}
                          onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                          className="w-full bg-foreground/5 border border-foreground/10 rounded-xl pl-12 pr-4 py-4 outline-none focus:border-primary transition-all [color-scheme:dark] text-foreground"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest">End Date & Time</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative">
                        <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30" />
                        <input 
                          type="date"
                          value={formData.endDate}
                          onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                          className="w-full bg-foreground/5 border border-foreground/10 rounded-xl pl-12 pr-4 py-4 outline-none focus:border-primary transition-all [color-scheme:dark] text-foreground"
                        />
                      </div>
                      <div className="relative">
                        <Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30" />
                        <input 
                          type="time"
                          value={formData.endTime}
                          onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                          className="w-full bg-foreground/5 border border-foreground/10 rounded-xl pl-12 pr-4 py-4 outline-none focus:border-primary transition-all [color-scheme:dark] text-foreground"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest">Time Zone</label>
                  <div className="relative">
                    <Globe size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30" />
                    <input 
                      type="text"
                      placeholder="Search timezone (e.g. London, Lagos, New York)..."
                      value={timezoneSearch}
                      onFocus={() => setShowTimezoneList(true)}
                      onChange={(e) => {
                        setTimezoneSearch(e.target.value);
                        setShowTimezoneList(true);
                      }}
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-xl pl-12 pr-4 py-4 outline-none focus:border-primary transition-all text-foreground"
                    />
                    
                    {showTimezoneList && (
                      <div className="absolute z-50 left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-background border border-foreground/10 rounded-2xl shadow-2xl custom-scrollbar">
                        {filteredTimezones.map(tz => (
                          <button
                            key={tz}
                            onClick={() => {
                              setFormData(prev => ({ ...prev, timezone: tz }));
                              setTimezoneSearch(tz.replace(/_/g, ' '));
                              setShowTimezoneList(false);
                            }}
                            className={`w-full text-left px-6 py-3 text-sm hover:bg-primary/10 transition-colors ${
                              formData.timezone === tz ? 'text-primary bg-primary/5' : 'text-foreground/60'
                            }`}
                          >
                            {tz.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-foreground/20 px-1">Current: <span className="text-primary">{formData.timezone.replace(/_/g, ' ')}</span></p>
                </div>

                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex items-start gap-3">
                  <Info size={18} className="text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground/60 leading-relaxed">
                    We use the Google Time Zone API to ensure your event time is accurate for all participants globally.
                  </p>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div 
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setFormData(prev => ({ ...prev, isOffline: false }))}
                    className={`p-6 rounded-2xl border-2 transition-all text-center ${
                      !formData.isOffline ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                    }`}
                  >
                    <Globe size={32} className={`mx-auto mb-3 ${!formData.isOffline ? 'text-primary' : 'text-foreground/30'}`} />
                    <h3 className="font-bold text-foreground">Online</h3>
                  </button>

                  <button 
                    onClick={() => setFormData(prev => ({ ...prev, isOffline: true }))}
                    className={`p-6 rounded-2xl border-2 transition-all text-center ${
                      formData.isOffline ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                    }`}
                  >
                    <MapPin size={32} className={`mx-auto mb-3 ${formData.isOffline ? 'text-primary' : 'text-foreground/30'}`} />
                    <h3 className="font-bold text-foreground">Offline</h3>
                  </button>
                </div>

                {!formData.isOffline ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => setFormData(prev => ({ ...prev, onlineType: 'internal' }))}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          formData.onlineType === 'internal' ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                        }`}
                      >
                        <LayoutGrid size={20} className="mb-2 text-foreground" />
                        <h4 className="font-bold text-sm text-foreground">Internal</h4>
                        <p className="text-[10px] text-foreground/40">In-app video tools</p>
                      </button>
                      <button 
                        onClick={() => setFormData(prev => ({ ...prev, onlineType: 'external' }))}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          formData.onlineType === 'external' ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                        }`}
                      >
                        <LinkIcon size={20} className="mb-2 text-foreground" />
                        <h4 className="font-bold text-sm text-foreground">External</h4>
                        <p className="text-[10px] text-foreground/40">Zoom, Google Meet, etc.</p>
                      </button>
                    </div>

                    {formData.onlineType === 'external' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                          {['zoom', 'google_meet', 'discord', 'other'].map(platform => (
                            <button
                              key={platform}
                              onClick={() => setFormData(prev => ({ ...prev, externalPlatform: platform }))}
                              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${
                                formData.externalPlatform === platform ? 'border-primary bg-primary/10 text-primary' : 'border-foreground/5 bg-foreground/5 text-foreground/40'
                              }`}
                            >
                              {platform.replace('_', ' ')}
                            </button>
                          ))}
                        </div>
                        <input 
                          type="url"
                          value={formData.externalUrl}
                          onChange={(e) => setFormData(prev => ({ ...prev, externalUrl: e.target.value }))}
                          placeholder="Meeting link (https://...)"
                          className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all text-foreground"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest mb-2">Add Location</label>
                    {isLoaded ? (
                      <div className="relative">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30" />
                        <input 
                          type="text"
                          placeholder="Search for a venue or address..."
                          className="w-full bg-foreground/5 border border-foreground/10 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-primary transition-all text-foreground"
                          ref={(el) => {
                            if (el && !autocomplete) {
                              const ac = new google.maps.places.Autocomplete(el, {
                                types: ['geocode', 'establishment'],
                                fields: ['formatted_address', 'geometry', 'name']
                              });
                              ac.addListener('place_changed', () => {
                                const place = ac.getPlace();
                                if (place.geometry && place.geometry.location) {
                                  const lat = place.geometry.location.lat();
                                  const lng = place.geometry.location.lng();
                                  
                                  setFormData(prev => ({
                                    ...prev,
                                    locationName: place.name || '',
                                    locationAddress: place.formatted_address || '',
                                    locationCoords: { lat, lng }
                                  }));
                                  
                                  setMapCenter({ lat, lng });
                                  setShowMap(true);
                                  
                                  // Fetch Timezone
                                  (async () => {
                                    try {
                                      const timestamp = Math.floor(Date.now() / 1000);
                                      const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
                                      const response = await fetch(
                                        `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${apiKey}`
                                      );
                                      const tzData = await response.json();
                                      if (tzData.status === 'OK') {
                                        setFormData(prev => ({ ...prev, timezone: tzData.timeZoneId }));
                                      }
                                    } catch (error) {
                                      console.error("Error fetching timezone:", error);
                                    }
                                  })();
                                }
                              });
                              setAutocomplete(ac);
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-foreground/30 italic text-sm">
                        Loading Google Maps...
                      </div>
                    )}
                  </div>

                    {formData.locationName && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-2xl bg-foreground/5 border border-foreground/10 space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0">
                              <MapPin size={16} />
                            </div>
                            <div>
                              <h4 className="font-bold text-sm text-foreground">{formData.locationName}</h4>
                              <p className="text-[10px] text-foreground/40">{formData.locationAddress}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              setFormData(prev => ({ ...prev, locationName: '', locationAddress: '', locationCoords: null }));
                              setShowMap(false);
                            }}
                            className="text-foreground/20 hover:text-red-400 transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        {showMap && isLoaded && formData.locationCoords && (
                          <div className="w-full h-32 rounded-xl overflow-hidden border border-foreground/5 relative group">
                            <div 
                              className="w-full h-full"
                              ref={(el) => {
                                if (el && isLoaded && formData.locationCoords) {
                                  const map = new google.maps.Map(el, {
                                    center: formData.locationCoords,
                                    zoom: 15,
                                    disableDefaultUI: true,
                                    styles: [
                                      { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
                                      { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
                                      { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
                                      { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
                                      { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
                                      { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
                                      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
                                      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
                                    ]
                                  });
                                  new google.maps.Marker({
                                    position: formData.locationCoords,
                                    map
                                  });
                                }
                              }}
                            />
                            <div className="absolute inset-0 bg-transparent group-hover:bg-background/20 transition-all pointer-events-none" />
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {step === 5 && (
              <motion.div 
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest">Ticket Pricing</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setFormData(prev => ({ ...prev, isPaid: false }))}
                      className={`p-6 rounded-2xl border-2 transition-all text-center ${
                        !formData.isPaid ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                      }`}
                    >
                      <Check size={32} className={`mx-auto mb-3 ${!formData.isPaid ? 'text-primary' : 'text-foreground/30'}`} />
                      <h3 className="font-bold text-foreground">Free</h3>
                    </button>

                    <button 
                      onClick={() => setFormData(prev => ({ ...prev, isPaid: true }))}
                      className={`p-6 rounded-2xl border-2 transition-all text-center ${
                        formData.isPaid ? 'border-primary bg-primary/5' : 'border-foreground/5 bg-foreground/5 hover:border-foreground/20'
                      }`}
                    >
                      <DollarSign size={32} className={`mx-auto mb-3 ${formData.isPaid ? 'text-primary' : 'text-foreground/30'}`} />
                      <h3 className="font-bold text-foreground">Paid</h3>
                    </button>
                  </div>

                  {formData.isPaid && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative"
                    >
                      <DollarSign size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30" />
                      <input 
                        type="number"
                        value={formData.price}
                        onChange={(e) => setFormData(prev => ({ ...prev, price: Number(e.target.value) }))}
                        placeholder="0.00"
                        className="w-full bg-foreground/5 border border-primary/30 rounded-xl pl-12 pr-4 py-4 text-xl font-bold outline-none focus:border-primary transition-all text-foreground"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-foreground/20 uppercase tracking-widest">USD</span>
                    </motion.div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest">Max Attendees</label>
                    <span className="text-xs font-bold text-foreground/40">{formData.maxAttendees === 0 ? 'Unlimited' : formData.maxAttendees}</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="1000"
                    step="10"
                    value={formData.maxAttendees}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxAttendees: Number(e.target.value) }))}
                    className="w-full h-2 bg-foreground/5 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-foreground/20 font-bold uppercase tracking-widest">
                    <span>Unlimited</span>
                    <span>1000+</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between mt-12 pt-8 border-t border-foreground/5">
            <button 
              onClick={() => step > 1 && setStep(step - 1)}
              disabled={step === 1}
              className={`flex items-center gap-2 font-bold transition-all ${
                step === 1 ? 'text-foreground/10 cursor-not-allowed' : 'text-foreground/50 hover:text-foreground'
              }`}
            >
              <ArrowLeft size={20} /> Back
            </button>
            
            {step < 5 ? (
              <button 
                onClick={() => setStep(step + 1)}
                disabled={formData.hostType === 'community' && !formData.selectedCommunityId && step === 1}
                className="flex items-center gap-2 bg-foreground text-background px-8 py-3 rounded-2xl font-bold hover:scale-105 transition-all disabled:opacity-50"
              >
                Next Step <ArrowRight size={20} />
              </button>
            ) : (
              <button 
                onClick={handleSubmit}
                disabled={loading || !formData.title || !formData.startDate || !formData.endDate}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3 rounded-2xl font-bold shadow-[0_0_20px_rgba(0,242,255,0.2)] hover:scale-105 transition-all disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Launch Event'} <Check size={20} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
