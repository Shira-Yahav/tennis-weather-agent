import { NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getConfig();
  return NextResponse.json(config);
}

// Israel time (IST = UTC+2, IDT = UTC+3 in summer).
// We use a fixed offset of UTC+2 (conservative) — cron fires at the right hour ±1h due to DST.
function israelHourToUtc(hour: number): number {
  const now = new Date();
  const israelDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetHours = israelDate.getHours() - utcDate.getHours();
  return ((hour - offsetHours) + 24) % 24;
}

async function pushVercelTs(scheduleHour: number): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return;

  const utcHour = israelHourToUtc(scheduleHour);
  const newContent =
    `import type { VercelConfig } from "@vercel/config/v1";\n\nexport const config: VercelConfig = {\n  crons: [\n    {\n      path: "/api/cron",\n      schedule: "0 ${utcHour} * * *", // ${utcHour}:00 UTC = ${scheduleHour}:00 Israel time\n    },\n  ],\n};\n`;

  // Get current file SHA
  const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/vercel.ts`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!getRes.ok) return;
  const { sha } = await getRes.json();

  // Commit updated file
  await fetch(`https://api.github.com/repos/${repo}/contents/vercel.ts`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `chore: update cron schedule to ${scheduleHour}:00 Israel time`,
      content: Buffer.from(newContent).toString("base64"),
      sha,
    }),
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const current = await getConfig();
    const updated = { ...current, ...body, template: { ...current.template, ...(body.template ?? {}) } };
    await saveConfig(updated);

    if (body.scheduleHour !== undefined && body.scheduleHour !== current.scheduleHour) {
      await pushVercelTs(body.scheduleHour);
    }

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
