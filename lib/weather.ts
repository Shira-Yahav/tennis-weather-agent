import type { LatLng } from "./locations";

export interface WeatherConditions {
  rainProbability: number; // percent
  windSpeed: number;       // km/h
  temperature: number;     // °C
  isBad: boolean;
}

export async function getWeatherForEvent(
  location: LatLng,
  eventTime: Date,
  windThreshold = 20,
  rainThreshold = 30,
): Promise<WeatherConditions> {
  const date = eventTime.toISOString().split("T")[0];
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", location.lat.toString());
  url.searchParams.set("longitude", location.lng.toString());
  url.searchParams.set("hourly", "precipitation_probability,windspeed_10m,temperature_2m");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set("timezone", "Asia/Jerusalem");
  url.searchParams.set("windspeed_unit", "kmh");

  const res = await fetch(url.toString());
  const data = await res.json();

  const hours: string[] = data.hourly.time;
  const rainProbs: number[] = data.hourly.precipitation_probability;
  const windSpeeds: number[] = data.hourly.windspeed_10m;
  const temperatures: number[] = data.hourly.temperature_2m;

  // Find the hour closest to the event start time
  const eventHour = eventTime.getHours();
  const idx = hours.findIndex((t) => new Date(t).getHours() === eventHour);
  const safeIdx = idx >= 0 ? idx : 0;

  const rainProbability = rainProbs[safeIdx] ?? 0;
  const windSpeed = windSpeeds[safeIdx] ?? 0;
  const temperature = temperatures[safeIdx] ?? 0;
  const isBad = windSpeed >= windThreshold || rainProbability >= rainThreshold;

  return { rainProbability, windSpeed, temperature, isBad };
}
