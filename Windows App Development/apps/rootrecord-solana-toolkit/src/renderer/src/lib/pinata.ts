/**
 * Pinata IPFS — direct JWT uploads (desktop). Set VITE_PINATA_JWT in .env.local
 * (keep this machine private).
 */

export interface PinataUploadResult {
  cid: string;
  uri: string;
  gatewayUrl: string;
}

const V = import.meta.env;

function pinataGatewayHost(): string {
  const raw = (V.VITE_PINATA_GATEWAY as string | undefined)?.trim() || 'gateway.pinata.cloud';
  const s = raw.replace(/\/$/, '');
  if (!s) return 'gateway.pinata.cloud';
  try {
    if (s.includes('://')) {
      return new URL(s).hostname || 'gateway.pinata.cloud';
    }
    return s.split('/')[0] || 'gateway.pinata.cloud';
  } catch {
    return 'gateway.pinata.cloud';
  }
}

function gatewayUrlFromCid(cid: string): string {
  return `https://${pinataGatewayHost()}/ipfs/${cid}`;
}

let cachedConfigured: boolean | null = null;

function jwt(): string {
  return (V.VITE_PINATA_JWT as string | undefined)?.trim() || '';
}

export async function isPinataConfigured(): Promise<boolean> {
  if (cachedConfigured !== null) return cachedConfigured;
  cachedConfigured = jwt().length > 0;
  return cachedConfigured;
}

function extractCid(j: Record<string, unknown>): string {
  const h = j.IpfsHash || j.cid;
  if (typeof h === 'string' && h) return h;
  throw new Error('Pinata response missing IPFS hash');
}

export async function uploadFileToPinata(file: File): Promise<PinataUploadResult> {
  const token = jwt();
  if (!token) {
    throw new Error('VITE_PINATA_JWT is not set — add it in .env.local for IPFS uploads');
  }
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Pinata file pin failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const j = (await res.json()) as Record<string, unknown>;
  const cid = extractCid(j);
  return {
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: gatewayUrlFromCid(cid),
  };
}

export async function uploadJsonToPinata(
  content: Record<string, unknown>,
  name = 'metadata.json',
): Promise<PinataUploadResult> {
  const token = jwt();
  if (!token) {
    throw new Error('VITE_PINATA_JWT is not set — add it in .env.local for IPFS uploads');
  }
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      pinataContent: content,
      pinataOptions: { cidVersion: 1 },
      pinataMetadata: { name },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Pinata JSON pin failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const j = (await res.json()) as Record<string, unknown>;
  const cid = extractCid(j);
  return {
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: gatewayUrlFromCid(cid),
  };
}
