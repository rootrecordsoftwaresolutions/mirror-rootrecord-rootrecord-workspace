import { json } from "./cors";
import { sessionFromBearer, type AuthEnv } from "./primary-auth";

export async function resolveUserId(request: Request, env: AuthEnv): Promise<string | Response> {
  const auth = request.headers.get("Authorization") || "";
  const guest = request.headers.get("X-Guest-Id") || "";

  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    const sess = await sessionFromBearer(env, token);
    if (sess) return `user:${sess.email.toLowerCase()}`;
    return json({ detail: "Invalid or expired session." }, 401);
  }
  if (guest) {
    const gid = guest.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (gid) return `guest:${gid}`;
  }
  return json({ detail: "Sign in or provide a guest id." }, 401);
}
