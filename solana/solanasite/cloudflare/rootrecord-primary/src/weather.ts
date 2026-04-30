import type { D1Database } from "@cloudflare/workers-types";
import { NWS_USER_AGENT } from "./cors";

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

export async function weatherCurrent(lat: number, lon: number): Promise<Record<string, unknown>> {
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

export async function weatherForecast(lat: number, lon: number): Promise<Record<string, unknown>> {
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

export async function weatherAlerts(lat: number, lon: number): Promise<Record<string, unknown>> {
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
          return JSON.parse(row.bundle_json) as Record<string, unknown>;
        } catch {
          /* fetch fresh */
        }
      }
    }
  }

  const settled = await Promise.allSettled([
    weatherCurrent(lat, lon),
    weatherAlerts(lat, lon),
    canadaAlerts(lat, lon),
    usgsEarthquakes(lat, lon, 300, "day", 2.5),
    weatherForecast(lat, lon),
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
