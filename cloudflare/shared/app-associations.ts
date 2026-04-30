export type AppAssociationsPayload = {
  rootrecord_business_manager_windows: { associated: null; note: string };
  rootrecord_weather_manager_windows: { associated: boolean };
  rootrecord_weather_manager_android: { associated: boolean };
  signals: {
    mobile_push: boolean;
    saved_locations: boolean;
    weather_cache: boolean;
  };
};

/**
 * Best-effort signals from D1 for which RootRecord apps have used this account online.
 * Windows Business Manager is local-first; we do not receive install beacons.
 */
/** Accepts a Cloudflare D1Database binding (typed in each Worker package). */
export async function getAppAssociationsForEmail(
  db: { prepare: (sql: string) => { bind: (...args: unknown[]) => { first: <T>() => Promise<T | null> } } },
  email: string
): Promise<AppAssociationsPayload> {
  const userId = `user:${email.trim().toLowerCase()}`;
  const [pushRow, locRow, wxRow] = await Promise.all([
    db.prepare("SELECT 1 AS ok FROM rrwm_push_tokens WHERE user_id = ? LIMIT 1").bind(userId).first<{ ok: number }>(),
    db.prepare("SELECT 1 AS ok FROM rrwm_locations WHERE user_id = ? LIMIT 1").bind(userId).first<{ ok: number }>(),
    db.prepare("SELECT 1 AS ok FROM weather_data WHERE user_id = ? LIMIT 1").bind(userId).first<{ ok: number }>(),
  ]);
  const mobilePush = Boolean(pushRow);
  const savedLocations = Boolean(locRow);
  const weatherCache = Boolean(wxRow);
  return {
    rootrecord_business_manager_windows: {
      associated: null,
      note: "This app does not phone home for installs. Sign in inside Business Manager with this account where supported; your plan still applies.",
    },
    rootrecord_weather_manager_windows: {
      associated: savedLocations || weatherCache,
    },
    rootrecord_weather_manager_android: {
      associated: mobilePush,
    },
    signals: {
      mobile_push: mobilePush,
      saved_locations: savedLocations,
      weather_cache: weatherCache,
    },
  };
}
