import { NextResponse } from "next/server";
import { getWeatherForEvent } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const dateStr = searchParams.get("date");

  if (isNaN(lat) || isNaN(lng) || !dateStr) {
    return NextResponse.json({ error: "Missing lat, lng, or date" }, { status: 400 });
  }

  try {
    const date = new Date(dateStr);
    const weather = await getWeatherForEvent({ lat, lng, label: "" }, date);
    return NextResponse.json(weather);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
