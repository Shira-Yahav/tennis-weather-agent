import { NextResponse } from "next/server";
import { getNextDayTennisEvents } from "@/lib/calendar";
import { getWeatherForEvent } from "@/lib/weather";
import { formatMessage } from "@/lib/formatter";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const message = formatMessage(items);
  await sendTelegramMessage(message);

  return NextResponse.json({ message: "Notification sent", events: events.length });
}
