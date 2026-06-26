import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [
    {
      path: "/api/cron",
      schedule: "0 * * * *", // every hour — actual send time controlled via config (scheduleHour in Israel time)
    },
  ],
};
