import { put, list } from "@vercel/blob";

const CONFIG_PATH = "tennis-agent/config.json";
const LOGS_PATH = "tennis-agent/logs.json";

export interface AppConfig {
  daysForward: number;
  messagePrefix: string;
  messageSuffix: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  daysForward: 7,
  messagePrefix: "",
  messageSuffix: "",
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

const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function readBlob<T>(path: string, fallback: T): Promise<T> {
  if (!hasBlob()) return fallback;
  try {
    const { blobs } = await list({ prefix: path });
    if (!blobs.length) return fallback;
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    return await res.json();
  } catch {
    return fallback;
  }
}

async function writeBlob(path: string, data: unknown): Promise<void> {
  if (!hasBlob()) return;
  await put(path, JSON.stringify(data), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

export async function getConfig(): Promise<AppConfig> {
  return readBlob(CONFIG_PATH, DEFAULT_CONFIG);
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await writeBlob(CONFIG_PATH, config);
}

export async function getLogs(): Promise<LogEntry[]> {
  return readBlob(LOGS_PATH, []);
}

export async function appendLog(entry: LogEntry): Promise<void> {
  const logs = await getLogs();
  logs.unshift(entry);
  await writeBlob(LOGS_PATH, logs.slice(0, 100));
}
