import { NextResponse } from "next/server";
import { getNextDayTennisEvents } from "@/lib/calendar";
import { getWeatherForEvent } from "@/lib/weather";
import { formatMessage } from "@/lib/formatter";
import { sendTelegramMessage } from "@/lib/telegram";
import { getConfig, appendLog } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getConfig();
  const events = await getNextDayTennisEvents();

  if (events.length === 0) {
    return NextResponse.json({ message: "No tennis events tomorrow" });
  }

  const items = await Promise.all(
    events.map(async (event) => ({
      event,
      weather: await getWeatherForEvent(event.location, event.startTime),
    }))
  );

  const israelHour = new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", hour12: false });
  if (parseInt(israelHour) !== config.scheduleHour) {
    return NextResponse.json({ message: `Not send time yet (configured: ${config.scheduleHour}:00 IL)` });
  }

  const message = formatMessage(items, config.template);

  await sendTelegramMessage(message);

  await appendLog({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    manual: false,
    eventsCount: events.length,
    events: items.map(({ event, weather }) => ({
      title: event.title,
      startTime: event.startTime.toISOString(),
      location: event.location.label,
      weather: {
        temp: weather.temperature,
        rain: weather.rainProbability,
        wind: weather.windSpeed,
        isBad: weather.isBad,
      },
    })),
    message,
  });

  return NextResponse.json({ message: "Notification sent", events: events.length });
}
