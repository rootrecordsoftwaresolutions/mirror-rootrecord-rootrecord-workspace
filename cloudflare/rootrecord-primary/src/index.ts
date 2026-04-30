import type { Env } from "./router";
import { handleRequest } from "./router";
import { runNoaaAlertCron } from "./noaa-alert-cron";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runNoaaAlertCron(env);
  },
};
