import type { Env } from "./router";
import { handleRequest } from "./router";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
