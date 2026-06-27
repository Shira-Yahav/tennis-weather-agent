import { NextResponse } from "next/server";
import { getTennisEvents } from "@/lib/calendar";
import { getWeatherForEvent } from "@/lib/weather";
import { formatMessage } from "@/lib/formatter";
import { sendTelegramMessage } from "@/lib/telegram";
import { getConfig, appendLog } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = await getConfig();
  let selectedIndices: number[] | null = null;

  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body.selectedIndices)) selectedIndices = body.selectedIndices;
  } catch {}

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
    const allEvents = await getTennisEvents(config.messageDaysForward);
    entry.eventsCount = allEvents.length;

    if (allEvents.length === 0) {
      await appendLog({ ...entry, message: "No events found" });
      return NextResponse.json({ message: "No tennis events found" });
    }

    // Filter to selected indices if provided, else send all
    const events = selectedIndices !== null
      ? allEvents.filter((_, i) => selectedIndices!.includes(i))
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
