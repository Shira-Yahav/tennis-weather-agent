import { NextResponse } from "next/server";
import { getTennisEvents } from "@/lib/calendar";
import { getWeatherForEvent } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "7"), 1), 30);
    const events = await getTennisEvents(days);

    const withWeather = await Promise.all(
      events.map(async (event) => {
        let weather = null;
        try {
          const w = await getWeatherForEvent(event.location, event.startTime);
          weather = {
            temp: w.temperature,
            rain: w.rainProbability,
            wind: w.windSpeed,
            isBad: w.isBad,
          };
        } catch {}
        return {
          title: event.title,
          startTime: event.startTime.toISOString(),
          endTime: event.endTime.toISOString(),
          location: event.location,
          weather,
        };
      })
    );

    return NextResponse.json(withWeather);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
