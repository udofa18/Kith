/** City helpers. New events store `city`; older ones are parsed from the address. */
export function cityOf(e: { city?: string; isOffline?: boolean; locationAddress?: string }): string {
  if (!e.isOffline) return '';
  if (e.city?.trim()) return e.city.trim();
  const parts = (e.locationAddress || '').split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  let c = parts[parts.length - 2];
  // "TX 78701" / "Lagos 100001": drop region+postcode and take the part before it.
  if (/\d/.test(c) && parts.length >= 3) c = parts[parts.length - 3];
  return c.replace(/\s*\d+.*$/, '').trim();
}

const rad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** The city of the event closest to a point, if any event is within `maxKm`. */
export function nearestCity(point: { lat: number; lng: number }, events: any[], maxKm = 150): string | null {
  let best: { city: string; km: number } | null = null;
  for (const e of events) {
    if (!e.locationCoords || !cityOf(e)) continue;
    const km = distanceKm(point, e.locationCoords);
    if (km <= maxKm && (!best || km < best.km)) best = { city: cityOf(e), km };
  }
  return best?.city ?? null;
}
