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

export async function geocodeVenue(query: string): Promise<LatLng | null> {
  const key = process.env.GOOGLE_GEOCODING_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&language=en&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" || !data.results[0]) return null;
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng, label: data.results[0].formatted_address };
}

export async function resolveLocation(venueName: string): Promise<LatLng> {
  const known = lookupKnownVenue(venueName);
  if (known) return known;
  const geocoded = await geocodeVenue(venueName);
  return geocoded ?? DEFAULT_LOCATION;
}
