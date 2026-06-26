import { NextResponse } from "next/server";
import { getTennisEvents } from "@/lib/calendar";
import { getWeatherForEvent } from "@/lib/weather";
import { getConfig } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getConfig();
    const events = await getTennisEvents(config.daysForward);

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
