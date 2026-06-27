import { NextResponse } from "next/server";
import { getTennisEvents } from "@/lib/calendar";
import { getWeatherForEvent } from "@/lib/weather";
import { formatMessage } from "@/lib/formatter";
import { sendTelegramMessage } from "@/lib/telegram";
import { getConfig, appendLog } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = await getConfig();
  const body = await request.json().catch(() => ({}));

  // Use template from request body if provided (client may have unsaved edits)
  if (body.template && typeof body.template === "object") {
    config.template = { ...config.template, ...body.template };
  }

  // selectedStartTimes: ISO strings of events to include (from the dashboard list)
  const selectedStartTimes: string[] | null = Array.isArray(body.selectedStartTimes) ? body.selectedStartTimes : null;
  // Fetch for the same range the dashboard is showing, not just messageDaysForward
  const daysToFetch: number = typeof body.daysToFetch === "number" ? body.daysToFetch : config.messageDaysForward;

  const entry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    manual: true,
    status: "success" as const,
    eventsCount: 0,
    selectedEvents: 0,
    daysForward: config.messageDaysForward,
    scheduleHour: config.scheduleHour,
    scheduleMinute: config.scheduleMinute,
    events: [] as Array<{ title: string; startTime: string; location: string; weather: { temp: number; rain: number; wind: number; isBad: boolean } }>,
    message: "",
  };

  try {
    const allEvents = await getTennisEvents(daysToFetch);
    entry.eventsCount = allEvents.length;

    if (allEvents.length === 0) {
      await appendLog({ ...entry, message: "No events found" });
      return NextResponse.json({ message: "No tennis events found" });
    }

    // Filter by start times if provided (more reliable than indices across different fetch ranges)
    const events = selectedStartTimes !== null
      ? allEvents.filter(e => selectedStartTimes.includes(e.startTime.toISOString()))
      : allEvents;

    if (events.length === 0) {
      return NextResponse.json({ message: "No events selected" });
    }

    const items = await Promise.all(
      events.map(async (event) => ({
        event,
        weather: await getWeatherForEvent(event.location, event.startTime),
      }))
    );

    const message = formatMessage(items, config.template);
    await sendTelegramMessage(message);

    entry.selectedEvents = events.length;
    entry.events = items.map(({ event, weather }) => ({
      title: event.title,
      startTime: event.startTime.toISOString(),
      location: event.location.label,
      weather: { temp: weather.temperature, rain: weather.rainProbability, wind: weather.windSpeed, isBad: weather.isBad },
    }));
    entry.message = message;

    await appendLog(entry);
    return NextResponse.json({ message: "Sent", events: events.length, allEvents: allEvents.length });
  } catch (err) {
    const failed = { ...entry, status: "failure" as const, error: String(err), message: "" };
    await appendLog(failed).catch(() => {});
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
