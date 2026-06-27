export interface LatLng {
  lat: number;
  lng: number;
  label: string;
}

const KNOWN_VENUES: Record<string, LatLng> = {
  "רוקח 4": { lat: 32.1004, lng: 34.7846, label: "Rokach 4, Tel Aviv" },
  "רוקח": { lat: 32.1004, lng: 34.7846, label: "Rokach 4, Tel Aviv" },
  "מרכז הטניס העירוני רעננה לב הפארק": { lat: 32.1836, lng: 34.8709, label: "Raanana Municipal Tennis Center" },
  "רעננה לב הפארק": { lat: 32.1836, lng: 34.8709, label: "Raanana Municipal Tennis Center" },
};

// Default location when event title is "Tennis" with no location field
export const DEFAULT_LOCATION: LatLng = {
  lat: 32.1004,
  lng: 34.7846,
  label: "Rokach 4, Tel Aviv",
};

export function extractVenueFromHebrewTitle(title: string): string {
  // Remove "מגרש X" and trailing/leading whitespace
  return title.replace(/[-–]\s*מגרש\s*\d+/g, "").replace(/מגרש\s*\d+/g, "").trim();
}

export function lookupKnownVenue(venueName: string): LatLng | null {
  for (const [key, coords] of Object.entries(KNOWN_VENUES)) {
    if (venueName.includes(key)) return coords;
  }
  return null;
}

function hasHebrew(str: string): boolean {
  return /[֐-׿]/.test(str);
}

function buildEnglishLabel(result: { formatted_address: string; address_components: Array<{ long_name: string; types: string[] }> }): string {
  // Prefer formatted_address if it's already in English
  if (!hasHebrew(result.formatted_address)) return result.formatted_address;

  // Otherwise build from address_components (returned in English with language=en)
  const get = (...types: string[]) =>
    result.address_components.find(c => types.some(t => c.types.includes(t)))?.long_name ?? "";

  const parts = [
    get("premise", "point_of_interest", "establishment"),
    get("route", "neighborhood", "sublocality"),
    get("locality", "administrative_area_level_2"),
    get("administrative_area_level_1"),
  ].filter(p => p && !hasHebrew(p));

  return parts.length > 0 ? parts.join(", ") : "Israel";
}

export async function geocodeVenue(query: string): Promise<LatLng | null> {
  const key = process.env.GOOGLE_GEOCODING_KEY;
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&language=en&region=il&key=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (data.status !== "OK" || !data.results[0]) return null;
  const { lat, lng } = data.results[0].geometry.location;
  const label = buildEnglishLabel(data.results[0]);
  return { lat, lng, label };
}

export async function resolveLocation(venueName: string): Promise<LatLng> {
  const known = lookupKnownVenue(venueName);
  if (known) return known;
  const geocoded = await geocodeVenue(venueName);
  return geocoded ?? DEFAULT_LOCATION;
}
