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

  let message = formatMessage(items);
  if (config.messagePrefix) message = `${config.messagePrefix}\n\n${message}`;
  if (config.messageSuffix) message = `${message}\n\n${config.messageSuffix}`;

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
