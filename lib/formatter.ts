import type { TennisEvent } from "./calendar";
import type { WeatherConditions } from "./weather";

export interface EventWithWeather {
  event: TennisEvent;
  weather: WeatherConditions;
}

export interface MessageTemplate {
  header: string;
  eventBlock: string;
  footerGood: string;
  footerBad: string;
}

export const DEFAULT_TEMPLATE: MessageTemplate = {
  header: "🎾 <b>Tennis — {date}</b>",
  eventBlock: "<b>{title}</b>\n🕐 {time}\n📍 {venue}\n🌡 {temp}°C  🌧 Rain: {rain}%  💨 Wind: {wind} km/h\n{condition}",
  footerGood: "All clear — enjoy your game! 🎾",
  footerBad: "⚠️ <b>Weather is not ideal. Consider cancelling or rescheduling.</b>",
};

export const TEMPLATE_VARIABLES = [
  { key: "{date}", description: "Event date (e.g. Friday, 27 June 2025)" },
  { key: "{title}", description: "Event title from calendar" },
  { key: "{time}", description: "Start–end time (e.g. 17:00–18:30)" },
  { key: "{venue}", description: "Resolved venue/location name" },
  { key: "{temp}", description: "Temperature in °C" },
  { key: "{rain}", description: "Rain probability in %" },
  { key: "{wind}", description: "Wind speed in km/h" },
  { key: "{condition}", description: "✅ Good conditions / ⚠️ Bad conditions" },
];

function fmtTime(date: Date) {
  return date.toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(date: Date) {
  return date.toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function applyEventBlock(tpl: string, event: TennisEvent, weather: WeatherConditions): string {
  return tpl
    .replace(/{date}/g, fmtDate(event.startTime))
    .replace(/{title}/g, event.title)
    .replace(/{time}/g, `${fmtTime(event.startTime)}–${fmtTime(event.endTime)}`)
    .replace(/{venue}/g, event.location.label)
    .replace(/{temp}/g, String(weather.temperature))
    .replace(/{rain}/g, String(weather.rainProbability))
    .replace(/{wind}/g, String(weather.windSpeed))
    .replace(/{condition}/g, weather.isBad ? "⚠️ Bad conditions" : "✅ Good conditions");
}

export function formatMessage(items: EventWithWeather[], template: MessageTemplate = DEFAULT_TEMPLATE): string {
  if (items.length === 0) return "";

  const anyBad = items.some((i) => i.weather.isBad);
  const allBad = items.every((i) => i.weather.isBad);

  // Detect multi-date: if events span more than one calendar day, show a date label per event
  const uniqueDates = new Set(items.map((i) => fmtDate(i.event.startTime)));
  const multipleDate = uniqueDates.size > 1;

  const headerDate = multipleDate
    ? `${fmtDate(items[0].event.startTime)} – ${fmtDate(items[items.length - 1].event.startTime)}`
    : fmtDate(items[0].event.startTime);

  const lines: string[] = [];
  lines.push(template.header.replace(/{date}/g, headerDate));
  lines.push("");

  for (const { event, weather } of items) {
    if (multipleDate) {
      lines.push(`📅 <b>${fmtDate(event.startTime)}</b>`);
    }
    lines.push(applyEventBlock(template.eventBlock, event, weather));
    lines.push("");
  }

  let footer: string;
  if (!anyBad) {
    footer = template.footerGood;
  } else if (allBad) {
    footer = template.footerBad;
  } else {
    // Mixed: name the specific bad sessions
    const badTitles = items
      .filter((i) => i.weather.isBad)
      .map((i) => i.event.title)
      .join(", ");
    footer = `⚠️ <b>Poor weather for: ${badTitles}. Consider rescheduling those sessions.</b>`;
  }
  lines.push(footer);

  return lines.join("\n");
}
