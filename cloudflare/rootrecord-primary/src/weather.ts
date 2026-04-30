import type { D1Database } from "@cloudflare/workers-types";
import { NWS_USER_AGENT } from "./cors";
import { bumpUsageMetric } from "./usage";

const ACCU_BASE = "https://dataservice.accuweather.com";

async function nwsFetch(url: string): Promise<Record<string, unknown>> {
  const r = await fetch(url, {
    headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
  });
  if (!r.ok) throw new Error(`NWS ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

function haversineMiles(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = 3958.7613;
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dphi = ((bLat - aLat) * Math.PI) / 180;
  const dlmb = ((bLon - aLon) * Math.PI) / 180;
  const h = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlmb / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function nwsQuantValue(node: unknown): number | null {
  if (node == null) return null;
  if (typeof node === "number") {
    if (!Number.isFinite(node)) return null;
    return node;
  }
  if (typeof node === "object" && node !== null && "value" in node) {
    const v = (node as { value: unknown }).value;
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function observationMetricScore(props: Record<string, unknown>): number {
  const keys = ["temperature", "relativeHumidity", "windSpeed", "barometricPressure"] as const;
  let s = 0;
  for (const k of keys) {
    if (nwsQuantValue(props[k]) != null) s += 1;
  }
  return s;
}

function parseHourlyWindSpeedToKmh(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const text = String(raw).trim().toLowerCase();
  if (!text) return null;
  const nums = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]!));
  if (nums.length === 0) return null;
  const n = Math.max(...nums);
  if (text.includes("km/h") || text.includes("kmh")) return n;
  if (text.includes("knot") || /\bkt\b/.test(text)) return n * 1.852;
  if (text.includes("m/s") || text.includes("mps")) return n * 3.6;
  if (text.includes("mph")) return n * 1.60934;
  return n * 1.60934;
}

function mergeHourlyIntoObservation(
  observation: Record<string, unknown>,
  hourly: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...observation };
  if (!hourly || Object.keys(hourly).length === 0) return out;
  if (nwsQuantValue(out.relativeHumidity) == null) {
    const rh = hourly.relativeHumidity as Record<string, unknown> | undefined;
    if (rh && rh.value != null) {
      out.relativeHumidity = {
        unitCode: (rh.unitCode as string) || "wmoUnit:percent",
        value: Number(rh.value),
      };
    }
  }
  if (nwsQuantValue(out.windSpeed) == null) {
    const kmh = parseHourlyWindSpeedToKmh(hourly.windSpeed);
    if (kmh != null) {
      out.windSpeed = { unitCode: "wmoUnit:km_h-1", value: kmh };
    }
  }
  if (nwsQuantValue(out.windDirection) == null) {
    const wd = hourly.windDirection;
    if (typeof wd === "string" && wd.trim()) {
      out.windDirectionCardinal = wd.trim();
    }
  }
  if (nwsQuantValue(out.temperature) == null && hourly.temperature != null) {
    let t = Number(hourly.temperature);
    if (Number.isFinite(t)) {
      let unit = String(hourly.temperatureUnit || "")
        .trim()
        .toUpperCase();
      if (unit !== "F" && unit !== "C") unit = "F";
      // Hourly grid uses letter F|C; default F matches US "units":"us". SI grids use Celsius numbers + "C".
      if (unit === "F") t = ((t - 32) * 5) / 9;
      out.temperature = { unitCode: "wmoUnit:degC", value: t };
    }
  }
  return out;
}

async function bestObservationFromStations(
  features: Array<Record<string, unknown>>,
  maxStations = 8
): Promise<Record<string, unknown>> {
  let best: Record<string, unknown> = {};
  let bestScore = -1;
  for (const feat of features.slice(0, maxStations)) {
    const sid = ((feat.properties as Record<string, unknown>) || {}).stationIdentifier as string | undefined;
    if (!sid) continue;
    try {
      const obs = await nwsFetch(`https://api.weather.gov/stations/${sid}/observations/latest`);
      const props = ((obs.properties as Record<string, unknown>) || {}) as Record<string, unknown>;
      const score = observationMetricScore(props);
      if (score > bestScore) {
        bestScore = score;
        best = props;
      }
      if (score >= 4) break;
    } catch {
      /* try next station */
    }
  }
  return best;
}

function weatherGridKey(lat: number, lon: number): string {
  return `${Math.round(lat * 1000) / 1000},${Math.round(lon * 1000) / 1000}`;
}

function isoAgeSeconds(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 1000;
}

function weatherDataTtlSec(env: { WEATHER_DATA_TTL_SEC?: string }): number {
  const n = parseInt(String(env.WEATHER_DATA_TTL_SEC ?? "600"), 10);
  return Number.isFinite(n) && n > 0 ? n : 600;
}

interface AccuEnv {
  ACCUWEATHER_API_KEY?: string;
  ACCUWEATHER_LANGUAGE?: string;
}

function accuEnabled(env?: AccuEnv): boolean {
  return Boolean(String(env?.ACCUWEATHER_API_KEY || "").trim());
}

async function accuFetchJson<T>(
  env: AccuEnv,
  path: string,
  params: Record<string, string>,
  opts?: { db?: D1Database; metric?: string }
): Promise<T> {
  const apiKey = String(env.ACCUWEATHER_API_KEY || "").trim();
  if (!apiKey) throw new Error("accuweather_not_configured");
  const u = new URL(`${ACCU_BASE}${path}`);
  u.searchParams.set("apikey", apiKey);
  u.searchParams.set("language", String(env.ACCUWEATHER_LANGUAGE || "en-us"));
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  const r = await fetch(u.toString(), { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`ACCU ${r.status}`);
  await bumpUsageMetric(opts?.db, opts?.metric || "accu.call.unknown", 1);
  return (await r.json()) as T;
}

async function accuLocationKey(
  env: AccuEnv,
  db: D1Database | undefined,
  lat: number,
  lon: number
): Promise<{ key: string; city?: string; state?: string }> {
  const row = await accuFetchJson<Record<string, unknown>>(
    env,
    "/locations/v1/cities/geoposition/search",
    {
      q: `${lat.toFixed(4)},${lon.toFixed(4)}`,
      details: "false",
    },
    { db, metric: "accu.call.location_lookup" }
  );
  const key = String(row?.Key || "").trim();
  if (!key) throw new Error("accuweather_location_missing");
  const city = typeof row?.LocalizedName === "string" ? row.LocalizedName : undefined;
  const admin = (row?.AdministrativeArea as Record<string, unknown>) || {};
  const state = typeof admin.ID === "string" ? admin.ID : undefined;
  return { key, city, state };
}

type AccuLoc = { key: string; city?: string; state?: string };

export async function weatherCurrent(
  lat: number,
  lon: number,
  env?: AccuEnv,
  db?: D1Database,
  precomputedLoc?: AccuLoc
): Promise<Record<string, unknown>> {
  if (accuEnabled(env)) {
    try {
      const loc = precomputedLoc || (await accuLocationKey(env || {}, db, lat, lon));
      const current = await accuFetchJson<Array<Record<string, unknown>>>(
        env || {},
        `/currentconditions/v1/${encodeURIComponent(loc.key)}`,
        { details: "true" },
        { db, metric: "accu.call.current_conditions" }
      );
      const c = (Array.isArray(current) ? current[0] : null) || {};
      const icon = Number((c as Record<string, unknown>)?.WeatherIcon);
      const tempC = Number(((c.Temperature as Record<string, unknown>)?.Metric as Record<string, unknown>)?.Value);
      const humidity = Number(c.RelativeHumidity);
      const windKmh = Number(
        ((((c.Wind as Record<string, unknown>)?.Speed as Record<string, unknown>)?.Metric as Record<string, unknown>) || {})
          .Value
      );
      const pressureMb = Number(((c.Pressure as Record<string, unknown>)?.Metric as Record<string, unknown>)?.Value);
      const phrase = typeof c.WeatherText === "string" ? c.WeatherText : "";
      const visKm = Number(
        ((((c as Record<string, unknown>)?.Visibility as Record<string, unknown>)?.Metric as Record<string, unknown>) || {})
          .Value
      );
      const cloudPct = Number((c as Record<string, unknown>)?.CloudCover);
      const uv = Number((c as Record<string, unknown>)?.UVIndex);
      const gustKmh = Number(
        ((((c as Record<string, unknown>)?.WindGust as Record<string, unknown>)?.Speed as Record<string, unknown>)?.Metric as Record<string, unknown>)?.Value
      );
      const feelsLikeC = Number(
        ((((c as Record<string, unknown>)?.RealFeelTemperature as Record<string, unknown>)?.Metric as Record<string, unknown>) || {})
          .Value
      );
      const dewPointC = Number(
        ((((c as Record<string, unknown>)?.DewPoint as Record<string, unknown>)?.Metric as Record<string, unknown>) || {})
          .Value
      );
      const wetBulbC = Number(
        ((((c as Record<string, unknown>)?.WetBulbTemperature as Record<string, unknown>)?.Metric as Record<string, unknown>) || {})
          .Value
      );
      const ceilingM = Number(
        ((((c as Record<string, unknown>)?.Ceiling as Record<string, unknown>)?.Metric as Record<string, unknown>) || {})
          .Value
      );
      const precip1hMm = Number(
        ((((c as Record<string, unknown>)?.Precip1hr as Record<string, unknown>)?.Metric as Record<string, unknown>) || {})
          .Value
      );
      const precipSum = ((c as Record<string, unknown>)?.PrecipitationSummary as Record<string, unknown>) || {};
      const past3hMm = Number(
        ((((precipSum as Record<string, unknown>)?.Past3Hours as Record<string, unknown>)?.Metric as Record<string, unknown>) || {})
          .Value
      );
      const past6hMm = Number(
        ((((precipSum as Record<string, unknown>)?.Past6Hours as Record<string, unknown>)?.Metric as Record<string, unknown>) || {})
          .Value
      );
      const pressureTrend =
        typeof ((c as Record<string, unknown>)?.PressureTendency as Record<string, unknown>)?.LocalizedText === "string"
          ? (((c as Record<string, unknown>)?.PressureTendency as Record<string, unknown>)?.LocalizedText as string)
          : "";
      const outObs: Record<string, unknown> = {
        temperature: Number.isFinite(tempC) ? { unitCode: "wmoUnit:degC", value: tempC } : null,
        feelsLike: Number.isFinite(feelsLikeC) ? { unitCode: "wmoUnit:degC", value: feelsLikeC } : null,
        dewpoint: Number.isFinite(dewPointC) ? { unitCode: "wmoUnit:degC", value: dewPointC } : null,
        wetBulbTemperature: Number.isFinite(wetBulbC) ? { unitCode: "wmoUnit:degC", value: wetBulbC } : null,
        relativeHumidity: Number.isFinite(humidity) ? { unitCode: "wmoUnit:percent", value: humidity } : null,
        windSpeed: Number.isFinite(windKmh) ? { unitCode: "wmoUnit:km_h-1", value: windKmh } : null,
        windGust: Number.isFinite(gustKmh) ? { unitCode: "wmoUnit:km_h-1", value: gustKmh } : null,
        barometricPressure: Number.isFinite(pressureMb) ? { unitCode: "wmoUnit:Pa", value: pressureMb * 100 } : null,
        visibility: Number.isFinite(visKm) ? { unitCode: "wmoUnit:m", value: visKm * 1000 } : null,
        ceiling: Number.isFinite(ceilingM) ? { unitCode: "wmoUnit:m", value: ceilingM } : null,
        cloudCover: Number.isFinite(cloudPct) ? { unitCode: "wmoUnit:percent", value: cloudPct } : null,
        uvIndex: Number.isFinite(uv) ? uv : null,
        precip1h: Number.isFinite(precip1hMm) ? { unitCode: "wmoUnit:mm", value: precip1hMm } : null,
        precipPast3h: Number.isFinite(past3hMm) ? { unitCode: "wmoUnit:mm", value: past3hMm } : null,
        precipPast6h: Number.isFinite(past6hMm) ? { unitCode: "wmoUnit:mm", value: past6hMm } : null,
        pressureTendency: pressureTrend || null,
        textDescription: phrase || null,
        windDirectionCardinal:
          typeof ((c.Wind as Record<string, unknown>)?.Direction as Record<string, unknown>)?.English === "string"
            ? (((c.Wind as Record<string, unknown>)?.Direction as Record<string, unknown>)?.English as string)
            : null,
      };
      return {
        available: true,
        source: "accuweather",
        attribution: "AccuWeather",
        raw: { location: loc, current: c },
        icon: Number.isFinite(icon) ? icon : null,
        observation: outObs,
        hourly_now: {
          shortForecast: phrase,
          icon: Number.isFinite(icon) ? icon : null,
          temperature: tempC,
          temperatureUnit: "C",
          feelsLike: Number.isFinite(feelsLikeC) ? feelsLikeC : null,
          dewPoint: Number.isFinite(dewPointC) ? dewPointC : null,
          wetBulb: Number.isFinite(wetBulbC) ? wetBulbC : null,
          relativeHumidity: { unitCode: "wmoUnit:percent", value: Number.isFinite(humidity) ? humidity : null },
          windSpeed: Number.isFinite(windKmh) ? `${Math.round(windKmh)} km/h` : null,
          windGust: Number.isFinite(gustKmh) ? `${Math.round(gustKmh)} km/h` : null,
          visibility: Number.isFinite(visKm) ? `${visKm.toFixed(1)} km` : null,
          cloudCover: Number.isFinite(cloudPct) ? `${Math.round(cloudPct)}%` : null,
          uvIndex: Number.isFinite(uv) ? uv : null,
          ceiling: Number.isFinite(ceilingM) ? `${Math.round(ceilingM)} m` : null,
          precip1h: Number.isFinite(precip1hMm) ? `${precip1hMm.toFixed(1)} mm` : null,
          precipPast3h: Number.isFinite(past3hMm) ? `${past3hMm.toFixed(1)} mm` : null,
          precipPast6h: Number.isFinite(past6hMm) ? `${past6hMm.toFixed(1)} mm` : null,
          pressureTendency: pressureTrend || null,
          windDirection:
            typeof ((c.Wind as Record<string, unknown>)?.Direction as Record<string, unknown>)?.English === "string"
              ? (((c.Wind as Record<string, unknown>)?.Direction as Record<string, unknown>)?.English as string)
              : null,
        },
        city: loc.city,
        state: loc.state,
      };
    } catch {
      return { available: false, source: "accuweather", reason: "accuweather_current_unavailable" };
    }
  }
  try {
    const points = await nwsFetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
    const props = (points.properties as Record<string, unknown>) || {};
    const stationsUrl = props.observationStations as string | undefined;
    const forecastUrl = props.forecast as string | undefined;
    const forecastHourlyUrl = props.forecastHourly as string | undefined;
    let observation: Record<string, unknown> = {};
    if (stationsUrl) {
      try {
        const stations = await nwsFetch(stationsUrl);
        const features = (stations.features as Array<Record<string, unknown>>) || [];
        if (features.length) {
          observation = await bestObservationFromStations(features);
        }
      } catch {
        /* ignore */
      }
    }
    let hourlyFirst: Record<string, unknown> = {};
    if (forecastHourlyUrl) {
      try {
        const hourly = await nwsFetch(forecastHourlyUrl);
        const periods = ((((hourly.properties as Record<string, unknown>) || {}).periods as unknown[]) ||
          []) as Array<Record<string, unknown>>;
        if (periods[0]) hourlyFirst = periods[0];
      } catch {
        /* ignore */
      }
    }
    observation = mergeHourlyIntoObservation(observation, hourlyFirst);
    const rel = (props.relativeLocation as Record<string, unknown>) || {};
    const relProps = (rel.properties as Record<string, unknown>) || {};
    return {
      available: true,
      observation,
      hourly_now: hourlyFirst,
      forecast_url: forecastUrl,
      forecast_hourly_url: forecastHourlyUrl,
      city: relProps.city,
      state: relProps.state,
    };
  } catch {
    return { available: false, reason: "nws_points_unavailable" };
  }
}

export async function weatherForecast(
  lat: number,
  lon: number,
  env?: AccuEnv,
  db?: D1Database,
  precomputedLoc?: AccuLoc
): Promise<Record<string, unknown>> {
  if (accuEnabled(env)) {
    try {
      const loc = precomputedLoc || (await accuLocationKey(env || {}, db, lat, lon));
      const [daily, hourly] = await Promise.all([
        accuFetchJson<Record<string, unknown>>(
          env || {},
          `/forecasts/v1/daily/5day/${encodeURIComponent(loc.key)}`,
          {
            details: "true",
            metric: "true",
          },
          { db, metric: "accu.call.forecast_daily_5day" }
        ),
        accuFetchJson<Array<Record<string, unknown>>>(
          env || {},
          `/forecasts/v1/hourly/12hour/${encodeURIComponent(loc.key)}`,
          { details: "true", metric: "true" },
          { db, metric: "accu.call.forecast_hourly_12hour" }
        ),
      ]);
      const dailyPeriods = (((daily?.DailyForecasts as unknown[]) || []) as Array<Record<string, unknown>>).flatMap((d, idx) => {
        const date = String(d.Date || "");
        const day = (d.Day as Record<string, unknown>) || {};
        const night = (d.Night as Record<string, unknown>) || {};
        const temp = (d.Temperature as Record<string, unknown>) || {};
        const min = Number(((temp.Minimum as Record<string, unknown>) || {}).Value);
        const max = Number(((temp.Maximum as Record<string, unknown>) || {}).Value);
        return [
          {
            number: idx * 2 + 1,
            name: `Day ${idx + 1}`,
            isDaytime: true,
            startTime: date,
            temperature: Number.isFinite(max) ? max : null,
            temperatureUnit: "C",
            shortForecast: typeof day.IconPhrase === "string" ? day.IconPhrase : "",
            icon: Number.isFinite(Number(day.Icon)) ? Number(day.Icon) : null,
          },
          {
            number: idx * 2 + 2,
            name: `Night ${idx + 1}`,
            isDaytime: false,
            startTime: date,
            temperature: Number.isFinite(min) ? min : null,
            temperatureUnit: "C",
            shortForecast: typeof night.IconPhrase === "string" ? night.IconPhrase : "",
            icon: Number.isFinite(Number(night.Icon)) ? Number(night.Icon) : null,
          },
        ];
      });
      const hourlyPeriods = (((hourly as unknown[]) || []) as Array<Record<string, unknown>>).map((h, idx) => {
        const hTemp = (h.Temperature as Record<string, unknown>) || {};
        const hWind = (h.Wind as Record<string, unknown>) || {};
        const hWindSpeed = (hWind.Speed as Record<string, unknown>) || {};
        const hWindDir = (hWind.Direction as Record<string, unknown>) || {};
        const t = Number(hTemp.Value);
        const rh = Number(h.RelativeHumidity);
        const wind = Number(hWindSpeed.Value);
        const icon = Number((h as Record<string, unknown>)?.WeatherIcon);
        return {
          number: idx + 1,
          startTime: h.DateTime,
          temperature: Number.isFinite(t) ? t : null,
          temperatureUnit: "C",
          shortForecast: typeof h.IconPhrase === "string" ? h.IconPhrase : "",
          icon: Number.isFinite(icon) ? icon : null,
          windSpeed: Number.isFinite(wind) ? `${Math.round(wind)} km/h` : null,
          windDirection: typeof hWindDir.English === "string" ? hWindDir.English : null,
          relativeHumidity: Number.isFinite(rh) ? { unitCode: "wmoUnit:percent", value: rh } : null,
        };
      });
      return {
        available: true,
        source: "accuweather",
        attribution: "AccuWeather",
        raw: { location: loc, daily, hourly },
        periods: dailyPeriods,
        hourly: hourlyPeriods,
        hourly_grid_units: "si",
      };
    } catch {
      return { available: false, source: "accuweather", periods: [], hourly: [] };
    }
  }
  try {
    const points = await nwsFetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
    const props = (points.properties as Record<string, unknown>) || {};
    const forecastUrl = props.forecast as string | undefined;
    const forecastHourlyUrl = props.forecastHourly as string | undefined;
    let periods: unknown[] = [];
    let hourly: unknown[] = [];
    let hourly_grid_units = "us";
    if (forecastUrl) {
      try {
        const fc = await nwsFetch(forecastUrl);
        periods = (((fc.properties as Record<string, unknown>) || {}).periods as unknown[]) || [];
      } catch {
        /* ignore */
      }
    }
    if (forecastHourlyUrl) {
      try {
        const fh = await nwsFetch(forecastHourlyUrl);
        const fhProps = (fh.properties as Record<string, unknown>) || {};
        hourly = ((fhProps.periods as unknown[]) || []).slice(0, 24);
        hourly_grid_units = String(fhProps.units || "us");
      } catch {
        /* ignore */
      }
    }
    return { available: true, periods, hourly, hourly_grid_units };
  } catch {
    return { available: false, periods: [], hourly: [] };
  }
}

export async function weatherAlerts(
  lat: number,
  lon: number,
  env?: AccuEnv,
  db?: D1Database,
  precomputedLoc?: AccuLoc
): Promise<Record<string, unknown>> {
  if (accuEnabled(env)) {
    try {
      const loc = precomputedLoc || (await accuLocationKey(env || {}, db, lat, lon));
      // AccuWeather alerts endpoint availability is plan-dependent; this path supports configured plans.
      const rows = await accuFetchJson<Array<Record<string, unknown>>>(
        env || {},
        `/alerts/v1/${encodeURIComponent(loc.key)}`,
        { details: "true" },
        { db, metric: "accu.call.alerts" }
      );
      const alerts = (((rows as unknown[]) || []) as Array<Record<string, unknown>>).map((a, i) => ({
        id: a.AlertID || a.ID || `${loc.key}-${i}`,
        event: a.Type || a.Category || a.Description || "Alert",
        headline: a.Description || a.Type || "Alert",
        description: a.Text || a.Description || "",
        instruction: a.Action || "",
        severity: a.Priority || a.Severity || "",
        urgency: a.Action || "",
        certainty: "",
        areaDesc: a.Area || a.Source || "",
        sent: a.Effective || a.Date || null,
        effective: a.Effective || a.Date || null,
        ends: a.Expires || null,
        senderName: a.Source || "AccuWeather",
      }));
      return { available: true, source: "accuweather", attribution: "AccuWeather", raw: { location: loc, alerts: rows }, alerts };
    } catch {
      return { available: false, source: "accuweather", alerts: [] };
    }
  }
  try {
    const r = await fetch(
      `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" } }
    );
    if (!r.ok) return { available: false, alerts: [] };
    const data = (await r.json()) as Record<string, unknown>;
    const features = (data.features as Array<Record<string, unknown>>) || [];
    const out = features.map((f) => {
      const p = (f.properties as Record<string, unknown>) || {};
      return {
        id: f.id,
        event: p.event,
        headline: p.headline,
        description: p.description,
        instruction: p.instruction,
        severity: p.severity,
        urgency: p.urgency,
        certainty: p.certainty,
        areaDesc: p.areaDesc,
        sent: p.sent,
        effective: p.effective,
        ends: p.ends || p.expires,
        senderName: p.senderName,
      };
    });
    return { available: true, alerts: out };
  } catch {
    return { available: false, alerts: [] };
  }
}

export async function canadaAlerts(lat: number, lon: number, radiusKm = 150): Promise<Record<string, unknown>> {
  const bboxLon = radiusKm / 80.0;
  const bboxLat = radiusKm / 110.0;
  const bbox = `${lon - bboxLon},${lat - bboxLat},${lon + bboxLon},${lat + bboxLat}`;
  const url = `https://geo.weather.gc.ca/geomet/features/collections/ALERTS/items?f=json&bbox=${bbox}&limit=50`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": NWS_USER_AGENT } });
    if (!r.ok) return { available: false, alerts: [] };
    const data = (await r.json()) as Record<string, unknown>;
    const feats = (data.features as Array<Record<string, unknown>>) || [];
    const out = feats.map((f) => {
      const p = (f.properties as Record<string, unknown>) || {};
      return {
        id: f.id || p.identifier,
        event: p.headline || p.alert_type,
        headline: p.headline,
        description: p.descrip_en || p.description,
        severity: p.severity,
        urgency: p.urgency,
        areaDesc: p.area || p.location,
        sent: p.sent || p.effective,
        effective: p.effective,
        ends: p.expires,
      };
    });
    return { available: true, alerts: out };
  } catch {
    return { available: false, alerts: [] };
  }
}

export async function usgsEarthquakes(
  lat: number | null,
  lon: number | null,
  radiusMiles = 2000,
  period: "hour" | "day" | "week" | "month" = "day",
  minMagnitude = 0
): Promise<Record<string, unknown>> {
  const feedMap: Record<string, string> = {
    hour: "all_hour",
    day: "all_day",
    week: "all_week",
    month: "all_month",
  };
  const feed = feedMap[period] || "all_day";
  const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": NWS_USER_AGENT } });
    if (!r.ok) return { available: false, events: [] };
    const data = (await r.json()) as Record<string, unknown>;
    const feats = (data.features as Array<Record<string, unknown>>) || [];
    const out: Array<Record<string, unknown>> = [];
    for (const f of feats) {
      const p = (f.properties as Record<string, unknown>) || {};
      const coords = ((f.geometry as Record<string, unknown>) || {}).coordinates as number[] | undefined;
      const eLon = coords?.[0];
      const eLat = coords?.[1];
      const eDepth = coords && coords.length > 2 ? coords[2] : null;
      const mag = p.mag as number | undefined;
      if (mag === undefined || mag === null || mag < minMagnitude) continue;
      let distance: number | null = null;
      if (lat != null && lon != null && eLat != null && eLon != null) {
        distance = haversineMiles(lat, lon, eLat, eLon);
        if (distance > radiusMiles) continue;
      }
      out.push({
        id: f.id,
        magnitude: mag,
        place: p.place,
        time: p.time,
        updated: p.updated,
        url: p.url,
        tsunami: Boolean(p.tsunami),
        alert: p.alert,
        depth_km: eDepth,
        lat: eLat,
        lon: eLon,
        distance_miles: distance,
      });
    }
    out.sort((a, b) => Number(b.time) - Number(a.time));
    return { available: true, events: out };
  } catch {
    return { available: false, events: [] };
  }
}

export async function tsunamiBulletins(): Promise<Record<string, unknown>> {
  const url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson";
  try {
    const r = await fetch(url, { headers: { "User-Agent": NWS_USER_AGENT } });
    if (!r.ok) return { available: false, bulletins: [] };
    const data = (await r.json()) as Record<string, unknown>;
    const out: Array<Record<string, unknown>> = [];
    for (const f of (data.features as Array<Record<string, unknown>>) || []) {
      const p = (f.properties as Record<string, unknown>) || {};
      if (!p.tsunami) continue;
      out.push({
        id: f.id,
        title: p.title,
        place: p.place,
        magnitude: p.mag,
        time: p.time,
        url: p.url,
        alert: p.alert,
      });
    }
    return { available: true, bulletins: out };
  } catch {
    return { available: false, bulletins: [] };
  }
}

async function eonetEvents(category: string, days = 30): Promise<Array<Record<string, unknown>>> {
  const url = `https://eonet.gsfc.nasa.gov/api/v3/events?category=${category}&status=open&days=${days}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": NWS_USER_AGENT } });
    if (!r.ok) return [];
    const data = (await r.json()) as Record<string, unknown>;
    const out: Array<Record<string, unknown>> = [];
    for (const ev of (data.events as Array<Record<string, unknown>>) || []) {
      const geoms = (ev.geometry as Array<Record<string, unknown>>) || [];
      const last = geoms[geoms.length - 1] || {};
      const coords = (last.coordinates as number[]) || [null, null];
      out.push({
        id: ev.id,
        title: ev.title,
        description: ev.description,
        categories: ((ev.categories as Array<Record<string, unknown>>) || []).map((c) => c.title),
        sources: ((ev.sources as Array<Record<string, unknown>>) || []).map((s) => s.url),
        lat: coords.length > 1 ? coords[1] : null,
        lon: coords.length ? coords[0] : null,
        date: last.date,
        magnitudeValue: last.magnitudeValue,
        magnitudeUnit: last.magnitudeUnit,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function eonetCyclones(): Promise<Record<string, unknown>> {
  return { available: true, events: await eonetEvents("severeStorms", 30) };
}

export async function eonetWildfires(): Promise<Record<string, unknown>> {
  return { available: true, events: await eonetEvents("wildfires", 30) };
}

function safe<T>(v: unknown, d: T): T {
  return v instanceof Error ? d : (v as T);
}

export interface DashboardEnv {
  WEATHER_DATA_TTL_SEC?: string;
  ACCUWEATHER_API_KEY?: string;
  ACCUWEATHER_LANGUAGE?: string;
  ACCUWEATHER_REUSE_RADIUS_MILES?: string;
}

function weatherReuseRadiusMiles(env: DashboardEnv): number {
  const n = Number(env.ACCUWEATHER_REUSE_RADIUS_MILES ?? "25");
  return Number.isFinite(n) && n > 0 ? n : 25;
}

function bundleWeatherSource(bundle: Record<string, unknown>): string {
  const cur = (bundle.current as Record<string, unknown>) || {};
  const src = String(cur.source || "").trim().toLowerCase();
  return src || "unknown";
}

async function sharedRecentBundle(
  db: D1Database,
  lat: number,
  lon: number,
  ttlSec: number,
  radiusMiles: number,
  opts: { requireSource?: string }
): Promise<Record<string, unknown> | null> {
  const latPad = radiusMiles / 69.0;
  const lonPad = radiusMiles / Math.max(8, 69.0 * Math.cos((lat * Math.PI) / 180));
  const cutoffIso = new Date(Date.now() - ttlSec * 1000).toISOString();
  const rows = await db
    .prepare(
      `SELECT lat, lon, fetched_at, bundle_json
       FROM weather_data
       WHERE fetched_at >= ?
         AND lat BETWEEN ? AND ?
         AND lon BETWEEN ? AND ?
       ORDER BY fetched_at DESC
       LIMIT 40`
    )
    .bind(cutoffIso, lat - latPad, lat + latPad, lon - lonPad, lon + lonPad)
    .all<{ lat: number; lon: number; fetched_at: string; bundle_json: string }>();
  const list = (rows.results || []) as Array<{ lat: number; lon: number; fetched_at: string; bundle_json: string }>;
  let best: { dist: number; bundle: Record<string, unknown> } | null = null;
  for (const row of list) {
    const dist = haversineMiles(lat, lon, Number(row.lat), Number(row.lon));
    if (!Number.isFinite(dist) || dist > radiusMiles) continue;
    try {
      const bundle = JSON.parse(row.bundle_json) as Record<string, unknown>;
      const age = isoAgeSeconds(String(bundle.fetched_at || row.fetched_at || ""));
      if (age == null || age < 0 || age >= ttlSec) continue;
      if (opts.requireSource) {
        if (bundleWeatherSource(bundle) !== opts.requireSource.toLowerCase()) continue;
      }
      if (!best || dist < best.dist) best = { dist, bundle };
    } catch {
      /* ignore bad cache rows */
    }
  }
  return best?.bundle || null;
}

export async function dashboardBundle(
  db: D1Database,
  env: DashboardEnv,
  userId: string,
  lat: number,
  lon: number,
  opts: { refresh: boolean; locationId: string | null }
): Promise<Record<string, unknown>> {
  const gridKey = weatherGridKey(lat, lon);
  const ttlSec = weatherDataTtlSec(env);
  const reuseRadiusMiles = weatherReuseRadiusMiles(env);
  const useAccu = accuEnabled(env);
  let accuLoc: AccuLoc | null = null;

  if (!opts.refresh) {
    const row = await db
      .prepare(
        `SELECT bundle_json, fetched_at FROM weather_data
         WHERE user_id = ? AND grid_key = ?
         ORDER BY fetched_at DESC LIMIT 1`
      )
      .bind(userId, gridKey)
      .first<{ bundle_json: string; fetched_at: string }>();
    if (row?.bundle_json && row.fetched_at) {
      const age = isoAgeSeconds(row.fetched_at);
      if (age != null && age >= 0 && age < ttlSec) {
        try {
          await bumpUsageMetric(db, "cache.hit.user_grid", 1);
          return JSON.parse(row.bundle_json) as Record<string, unknown>;
        } catch {
          /* fetch fresh */
        }
      }
    }
    const shared = await sharedRecentBundle(db, lat, lon, ttlSec, reuseRadiusMiles, {
      requireSource: useAccu ? "accuweather" : undefined,
    });
    if (shared) {
      await bumpUsageMetric(db, "cache.hit.radius", 1);
      // Persist the reused bundle for this user/grid so `bundle_json` always reflects what we served.
      try {
        const fetchedAt = String(shared.fetched_at || new Date().toISOString());
        await db
          .prepare(
            `INSERT INTO weather_data (user_id, location_id, grid_key, lat, lon, fetched_at, bundle_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(userId, opts.locationId, gridKey, lat, lon, fetchedAt, JSON.stringify(shared))
          .run();
      } catch {
        /* ignore */
      }
      return shared;
    }
  }

  await bumpUsageMetric(db, "cache.miss.dashboard", 1);

  if (useAccu) {
    accuLoc = await accuLocationKey(env, db, lat, lon);
  }

  const settled = await Promise.allSettled([
    weatherCurrent(lat, lon, env, db, accuLoc || undefined),
    weatherAlerts(lat, lon, env, db, accuLoc || undefined),
    useAccu ? Promise.resolve({ available: false, alerts: [], source: "disabled_under_accuweather_tos" }) : canadaAlerts(lat, lon),
    usgsEarthquakes(lat, lon, 300, "day", 2.5),
    weatherForecast(lat, lon, env, db, accuLoc || undefined),
  ]);
  const vals = settled.map((s) => (s.status === "fulfilled" ? s.value : s.reason));
  const [current, alerts, canada, usgs, forecast] = vals;

  const bundle: Record<string, unknown> = {
    current: safe(current, { available: false }),
    alerts: safe(alerts, { available: false, alerts: [] }),
    canada_alerts: safe(canada, { available: false, alerts: [] }),
    usgs: safe(usgs, { available: false, events: [] }),
    forecast: safe(forecast, { available: false, periods: [], hourly: [] }),
    fetched_at: new Date().toISOString(),
  };

  const fetchedAt = bundle.fetched_at as string;
  try {
    await db
      .prepare(
        `INSERT INTO weather_data (user_id, location_id, grid_key, lat, lon, fetched_at, bundle_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        userId,
        opts.locationId,
        gridKey,
        lat,
        lon,
        fetchedAt,
        JSON.stringify(bundle)
      )
      .run();
  } catch {
    /* D1 insert failure should not block response */
  }

  return bundle;
}
