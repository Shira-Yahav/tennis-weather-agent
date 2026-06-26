import { DEFAULT_TEMPLATE, type MessageTemplate } from "./formatter";

export interface AppConfig {
  daysForward: number;
  scheduleHour: number;
  template: MessageTemplate;
}

export const DEFAULT_CONFIG: AppConfig = {
  daysForward: 7,
  scheduleHour: 16,
  template: DEFAULT_TEMPLATE,
};

export interface LogEntry {
  id: string;
  timestamp: string;
  manual: boolean;
  eventsCount: number;
  events: Array<{
    title: string;
    startTime: string;
    location: string;
    weather: { temp: number; rain: number; wind: number; isBad: boolean };
  }>;
  message: string;
}

function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = require("@upstash/redis");
  return Redis.fromEnv() as import("@upstash/redis").Redis;
}

export async function getConfig(): Promise<AppConfig> {
  const redis = getRedis();
  if (!redis) return DEFAULT_CONFIG;
  try {
    const stored = await redis.get<AppConfig>("tennis:config");
    if (!stored) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...stored, template: { ...DEFAULT_CONFIG.template, ...(stored.template ?? {}) } };
  } catch { return DEFAULT_CONFIG; }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set("tennis:config", config);
}

export async function getLogs(): Promise<LogEntry[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const logs = await redis.lrange<LogEntry>("tennis:logs", 0, 99);
    return logs ?? [];
  } catch { return []; }
}

export async function appendLog(entry: LogEntry): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.lpush("tennis:logs", entry);
  await redis.ltrim("tennis:logs", 0, 99);
}
