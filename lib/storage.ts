import { DEFAULT_TEMPLATE, type MessageTemplate } from "./formatter";

export interface AppConfig {
  messageDaysForward: number;
  scheduleHour: number;
  scheduleMinute: number;
  template: MessageTemplate;
  windThreshold: number;  // km/h — default 20
  rainThreshold: number;  // % — default 30
}

export const DEFAULT_CONFIG: AppConfig = {
  messageDaysForward: 1,
  scheduleHour: 16,
  scheduleMinute: 0,
  template: DEFAULT_TEMPLATE,
  windThreshold: 20,
  rainThreshold: 30,
};

export interface LogEntry {
  id: string;
  timestamp: string;        // ISO
  manual: boolean;
  status: "success" | "failure";
  eventsCount: number;
  selectedEvents: number;   // events actually sent (may differ from total if picker was used)
  daysForward: number;
  scheduleHour: number;
  scheduleMinute: number;
  events: Array<{
    title: string;
    startTime: string;
    location: string;
    weather: { temp: number; rain: number; wind: number; isBad: boolean };
  }>;
  message: string;
  error?: string;
}

// ── GitHub-backed log storage ────────────────────────────────────────────────
// Stores logs as data/logs.json in the GitHub repo. Requires GITHUB_TOKEN + GITHUB_REPO env vars.

const LOGS_PATH = "data/logs.json";

async function githubGet(path: string): Promise<{ content: string; sha: string } | null> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function githubPut(path: string, content: string, sha?: string, message?: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return;
  await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({
      message: message ?? `chore: update ${path}`,
      content: Buffer.from(content).toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
}

// ── Config (GitHub-backed, Upstash optional) ─────────────────────────────────

const CONFIG_PATH = "data/config.json";

function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis } = require("@upstash/redis");
  return Redis.fromEnv() as import("@upstash/redis").Redis;
}

export async function getConfig(): Promise<AppConfig> {
  // Try Upstash first if available
  const redis = getRedis();
  if (redis) {
    try {
      const stored = await redis.get<AppConfig>("tennis:config");
      if (stored) return { ...DEFAULT_CONFIG, ...stored, template: { ...DEFAULT_CONFIG.template, ...(stored.template ?? {}) } };
    } catch {}
  }

  // Fall back to GitHub-stored config
  const file = await githubGet(CONFIG_PATH);
  if (file) {
    try {
      const parsed = JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));
      return { ...DEFAULT_CONFIG, ...parsed, template: { ...DEFAULT_CONFIG.template, ...(parsed.template ?? {}) } };
    } catch {}
  }

  return DEFAULT_CONFIG;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  // Save to Upstash if available
  const redis = getRedis();
  if (redis) { try { await redis.set("tennis:config", config); } catch {} }

  // Always save to GitHub for persistence
  const file = await githubGet(CONFIG_PATH);
  await githubPut(
    CONFIG_PATH,
    JSON.stringify(config, null, 2),
    file?.sha,
    "chore: update config",
  );
}

// ── Logs (GitHub-backed) ─────────────────────────────────────────────────────

export async function getLogs(): Promise<LogEntry[]> {
  const file = await githubGet(LOGS_PATH);
  if (!file) return [];
  try {
    return JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));
  } catch { return []; }
}

export async function appendLog(entry: LogEntry): Promise<void> {
  const file = await githubGet(LOGS_PATH);
  let logs: LogEntry[] = [];
  let sha: string | undefined;

  if (file) {
    try {
      logs = JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));
      sha = file.sha;
    } catch {}
  }

  logs.unshift(entry);
  logs = logs.slice(0, 200);

  await githubPut(
    LOGS_PATH,
    JSON.stringify(logs, null, 2),
    sha,
    `log: ${entry.manual ? "manual" : "scheduled"} run — ${entry.eventsCount} event(s) [${entry.status}]`
  );
}
