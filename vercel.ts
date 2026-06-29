import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [
    {
      path: "/api/cron",
      schedule: "0 14 * * *", // 14:00 UTC = 17:00 Israel time (IDT/UTC+3) — updated automatically when schedule changes in dashboard
    },
  ],
};
