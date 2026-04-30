/**
 * RootRecord portal session (email/password) against rootrecord-primary `/v1/*`.
 * Used for custodial "web wallet" signing on the Solana tools site.
 */
export const PORTAL_TOKEN_KEY = 'rootrecord_portal_token';
const DEVICE_ID_KEY = 'rootrecord_device_id';

export function getRootRecordApiBase(): string {
  const b = process.env.NEXT_PUBLIC_ROOTRECORD_API_BASE?.trim() || '';
  return b.replace(/\/+$/, '');
}

export function getPortalToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function setPortalToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(PORTAL_TOKEN_KEY, token);
  else localStorage.removeItem(PORTAL_TOKEN_KEY);
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function u8ToB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function b64ToU8(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function rootrecordLogin(
  email: string,
  password: string,
): Promise<{ ok: true; access_token: string } | { ok: false; detail: string }> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, detail: 'Account API is not configured (NEXT_PUBLIC_ROOTRECORD_API_BASE).' };
  const res = await fetch(`${base}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      device_id: getOrCreateDeviceId(),
    }),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const d = j.detail;
    return { ok: false, detail: typeof d === 'string' ? d : res.status === 401 ? 'Incorrect email or password.' : `HTTP ${res.status}` };
  }
  const access_token = j.access_token;
  if (typeof access_token !== 'string' || !access_token) {
    return { ok: false, detail: 'No access token in response' };
  }
  setPortalToken(access_token);
  return { ok: true, access_token };
}

export type CustodialInfo = {
  has_wallet: boolean;
  public_key: string | null;
  custodial_enabled: boolean;
};

export async function fetchCustodialInfo(token: string): Promise<CustodialInfo | null> {
  const base = getRootRecordApiBase();
  if (!base) return null;
  const res = await fetch(`${base}/v1/me/custodial-sol-wallet`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (j.ok !== true) return null;
  return {
    has_wallet: Boolean(j.has_wallet),
    public_key: typeof j.public_key === 'string' ? j.public_key : null,
    custodial_enabled: Boolean(j.custodial_enabled),
  };
}

export function emitCustodialNeedsAuth(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('rootrecord-custodial-needs-auth'));
}
