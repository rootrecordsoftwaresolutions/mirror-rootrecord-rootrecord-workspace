/**
 * Pinata IPFS uploader — client SDK that proxies through our own
 * server routes so the JWT never leaves the server.
 */

export interface PinataUploadResult {
  cid: string;
  uri: string;
  gatewayUrl: string;
}

function pinataGatewayHost(): string {
  const raw = (process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'gateway.pinata.cloud')
    .trim()
    .replace(/\/$/, '');
  if (!raw) return 'gateway.pinata.cloud';
  try {
    if (raw.includes('://')) {
      const u = new URL(raw);
      return u.hostname || 'gateway.pinata.cloud';
    }
    const slash = raw.indexOf('/');
    const host = slash === -1 ? raw : raw.slice(0, slash);
    return host || 'gateway.pinata.cloud';
  } catch {
    return 'gateway.pinata.cloud';
  }
}

function gatewayUrl(cid: string): string {
  return `https://${pinataGatewayHost()}/ipfs/${cid}`;
}

let cachedConfigured: boolean | null = null;

/**
 * Hits our server status endpoint to learn whether the server has a Pinata JWT.
 * Cached for the lifetime of the page so it doesn't fire on every form change.
 */
export async function isPinataConfigured(): Promise<boolean> {
  if (cachedConfigured !== null) return cachedConfigured;
  try {
    const r = await fetch('/api/pin/status', { cache: 'no-store' });
    const j = (await r.json()) as { configured: boolean };
    cachedConfigured = !!j.configured;
  } catch {
    cachedConfigured = false;
  }
  return cachedConfigured;
}

export async function uploadFileToPinata(file: File): Promise<PinataUploadResult> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/pin/file', { method: 'POST', body: fd });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Upload failed: ${res.status}`);
  }
  const j = (await res.json()) as { cid: string };
  return {
    cid: j.cid,
    uri: `ipfs://${j.cid}`,
    gatewayUrl: gatewayUrl(j.cid),
  };
}

export async function uploadJsonToPinata(
  content: Record<string, unknown>,
  name = 'metadata.json',
): Promise<PinataUploadResult> {
  const res = await fetch('/api/pin/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Upload failed: ${res.status}`);
  }
  const j = (await res.json()) as { cid: string };
  return {
    cid: j.cid,
    uri: `ipfs://${j.cid}`,
    gatewayUrl: gatewayUrl(j.cid),
  };
}
