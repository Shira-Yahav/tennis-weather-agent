import { NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getConfig();
  return NextResponse.json(config);
}

function israelToUtc(hour: number, minute: number): { utcHour: number; utcMinute: number } {
  const now = new Date();
  const israelStr = now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", minute: "numeric", hour12: false });
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC", hour: "numeric", minute: "numeric", hour12: false });
  const [ih] = israelStr.split(":").map(Number);
  const [uh] = utcStr.split(":").map(Number);
  const offsetHours = ih - uh;
  const utcHour = ((hour - offsetHours) + 24) % 24;
  return { utcHour, utcMinute: minute };
}

async function pushVercelTs(hour: number, minute: number): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return;

  const { utcHour, utcMinute } = israelToUtc(hour, minute);
  const pad = (n: number) => String(n).padStart(2, "0");

  const content = `import type { VercelConfig } from "@vercel/config/v1";\n\nexport const config: VercelConfig = {\n  crons: [\n    {\n      path: "/api/cron",\n      schedule: "${utcMinute} ${utcHour} * * *", // ${pad(utcHour)}:${pad(utcMinute)} UTC = ${pad(hour)}:${pad(minute)} Israel time\n    },\n  ],\n};\n`;

  const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/vercel.ts`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!getRes.ok) return;
  const { sha } = await getRes.json();

  await fetch(`https://api.github.com/repos/${repo}/contents/vercel.ts`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `chore: update cron to ${pad(hour)}:${pad(minute)} Israel time`,
      content: Buffer.from(content).toString("base64"),
      sha,
    }),
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const current = await getConfig();
    const updated = {
      ...current,
      ...body,
      template: { ...current.template, ...(body.template ?? {}) },
    };
    await saveConfig(updated);

    const hourChanged = body.scheduleHour !== undefined && body.scheduleHour !== current.scheduleHour;
    const minuteChanged = body.scheduleMinute !== undefined && body.scheduleMinute !== current.scheduleMinute;
    if (hourChanged || minuteChanged) {
      await pushVercelTs(updated.scheduleHour, updated.scheduleMinute);
    }

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
