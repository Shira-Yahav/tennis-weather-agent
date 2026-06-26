import type { TennisEvent } from "./calendar";
import type { WeatherConditions } from "./weather";

export interface EventWithWeather {
  event: TennisEvent;
  weather: WeatherConditions;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatMessage(items: EventWithWeather[]): string {
  const date = formatDate(items[0].event.startTime);
  const anyBad = items.some((i) => i.weather.isBad);

  const lines: string[] = [];
  lines.push(`🎾 <b>Tennis Tomorrow — ${date}</b>\n`);

  for (const { event, weather } of items) {
    const time = `${formatTime(event.startTime)}–${formatTime(event.endTime)}`;
    const weatherStatus = weather.isBad ? "⚠️ Bad conditions" : "✅ Good conditions";
    lines.push(`<b>${event.title}</b>`);
    lines.push(`🕐 ${time}`);
    lines.push(`📍 ${event.location.label}`);
    lines.push(`🌡 Temp: ${weather.temperature}°C  🌧 Rain: ${weather.rainProbability}%  💨 Wind: ${weather.windSpeed} km/h`);
    lines.push(weatherStatus);
    lines.push("");
  }

  if (anyBad) {
    lines.push("⚠️ <b>Weather conditions are not ideal for tennis. Consider cancelling or rescheduling.</b>");
  } else {
    lines.push("All clear — enjoy your game! 🎾");
  }

  return lines.join("\n");
}
