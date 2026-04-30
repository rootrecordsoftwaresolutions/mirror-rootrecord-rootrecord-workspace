export const NWS_USER_AGENT = "RootRecordWeatherManagerMobile/1.0 (contact: root@rootrecord.info)";

export function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, X-Guest-Id, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors(), ...extra },
  });
}
