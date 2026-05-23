import { useRef, useEffect, useState } from 'react';
import { Globe2, Loader2 } from 'lucide-react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

interface LocationInputProps {
  defaultValue?: string;
  onLocationSelect: (location: string, lat?: number, lng?: number) => void;
  placeholder?: string;
}

export default function LocationInput({ defaultValue, onLocationSelect, placeholder }: LocationInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let autocomplete: google.maps.places.Autocomplete | null = null;

    const initAutocomplete = async () => {
      try {
        const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
          setError("Maps API Key missing");
          return;
        }

        // Use new functional API
        setOptions({
          key: apiKey
        });

        const { Autocomplete } = await importLibrary("places") as google.maps.PlacesLibrary;

        if (inputRef.current) {
          autocomplete = new Autocomplete(inputRef.current, {
            types: ['(cities)'],
            fields: ['formatted_address', 'geometry']
          });

          autocomplete.addListener('place_changed', () => {
            const place = autocomplete?.getPlace();
            if (place?.formatted_address) {
              const lat = place.geometry?.location?.lat();
              const lng = place.geometry?.location?.lng();
              onLocationSelect(place.formatted_address, lat, lng);
            }
          });
          setIsLoaded(true);
        }
      } catch (err) {
        console.error("Maps load error:", err);
        setError("Failed to load maps");
      }
    };

    initAutocomplete();

    return () => {
      if (autocomplete) {
        google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, []);

  return (
    <div className="relative">
      <Globe2 className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
      <input
        ref={inputRef}
        type="text"
        defaultValue={defaultValue}
        className={`w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:border-primary outline-none transition-all ${
          !isLoaded ? 'opacity-50' : ''
        }`}
        placeholder={error || (isLoaded ? (placeholder || "City, Country") : "Initializing maps...")}
      />
      {!isLoaded && !error && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <Loader2 size={14} className="animate-spin text-white/20" />
        </div>
      )}
    </div>
  );
}
