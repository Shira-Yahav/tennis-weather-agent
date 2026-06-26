import { google } from "googleapis";
import { DEFAULT_LOCATION, extractVenueFromHebrewTitle, resolveLocation } from "./locations";
import type { LatLng } from "./locations";

export interface TennisEvent {
  title: string;
  startTime: Date;
  endTime: Date;
  location: LatLng;
}

const TENNIS_KEYWORDS = ["tennis", "טניס"];

function isTennisEvent(title: string): boolean {
  const lower = title.toLowerCase();
  return TENNIS_KEYWORDS.some((kw) => lower.includes(kw));
}

function isHebrewVenueFormat(title: string): boolean {
  return title.includes("מגרש");
}

async function getLocationForEvent(title: string, locationField: string | null): Promise<LatLng> {
  if (isTennisEvent(title)) {
    if (locationField && locationField.trim()) {
      const { geocodeVenue } = await import("./locations");
      const result = await geocodeVenue(locationField.trim());
      return result ?? DEFAULT_LOCATION;
    }
    return DEFAULT_LOCATION;
  }

  if (isHebrewVenueFormat(title)) {
    const venueName = extractVenueFromHebrewTitle(title);
    return resolveLocation(venueName);
  }

  return DEFAULT_LOCATION;
}

function getNextDayRange(): { start: string; end: string } {
  const now = new Date();
  // Convert to Israel time (UTC+3 in summer / UTC+2 in winter — use Intl to get the offset)
  const israelNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const tomorrow = new Date(israelNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);

  return {
    start: tomorrow.toISOString(),
    end: tomorrowEnd.toISOString(),
  };
}

export async function getNextDayTennisEvents(): Promise<TennisEvent[]> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
  const credentials = JSON.parse(
    raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8")
  );
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });

  const calendar = google.calendar({ version: "v3", auth });
  const { start, end } = getNextDayRange();

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID!,
    timeMin: start,
    timeMax: end,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = response.data.items ?? [];
  const tennisEvents: TennisEvent[] = [];

  for (const event of events) {
    const title = event.summary ?? "";
    if (!isTennisEvent(title) && !isHebrewVenueFormat(title)) continue;

    const startTime = new Date(event.start?.dateTime ?? event.start?.date ?? "");
    const endTime = new Date(event.end?.dateTime ?? event.end?.date ?? "");
    const locationField = event.location ?? null;

    const location = await getLocationForEvent(title, locationField);
    tennisEvents.push({ title, startTime, endTime, location });
  }

  return tennisEvents;
}
