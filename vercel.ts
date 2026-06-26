import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [
    {
      path: "/api/cron",
      schedule: "0 14 * * *", // 14:00 UTC = 16:00 Israel time — updated automatically when schedule changes in dashboard
    },
  ],
};
