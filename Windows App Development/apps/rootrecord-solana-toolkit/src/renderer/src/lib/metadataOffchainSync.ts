/**
 * Helpers for keeping Metaplex `uri` JSON aligned with on-chain name/symbol updates.
 */

/** Max JSON payload we will pull from a metadata URI (bytes). */
export const METADATA_JSON_FETCH_MAX_BYTES = 600_000;

/**
 * Turn `ipfs://…` into an HTTPS gateway URL suitable for server-side fetch.
 */
export function resolveMetadataJsonHttpUrl(uri: string): string {
  const t = uri.trim();
  if (!t) return '';
  if (/^ipfs:\/\//i.test(t)) {
    const path = t.slice('ipfs://'.length).replace(/^ipfs\//, '');
    return `https://ipfs.io/ipfs/${path}`;
  }
  return t;
}

/**
 * Conservative allowlist for metadata JSON fetch (SSRF mitigation).
 */
export function isAllowedPublicMetadataUrl(urlStr: string): boolean {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local')
  ) {
    return false;
  }
  if (host === 'arweave.net') return u.pathname.length > 1;
  if (host === 'ipfs.io' && u.pathname.startsWith('/ipfs/')) return true;
  if (host === 'cloudflare-ipfs.com' && u.pathname.startsWith('/ipfs/')) return true;
  if (host.endsWith('dweb.link') && u.pathname.startsWith('/ipfs/')) return true;
  if (host.endsWith('pinata.cloud') && u.pathname.includes('/ipfs/')) return true;
  if (host.endsWith('ipfs.nftstorage.link') || host.endsWith('ipfs.w3s.link')) return true;
  if (host === 'gateway.irys.xyz' || host.endsWith('.irys.xyz')) return true;
  if (u.pathname.includes('/ipfs/')) return true;
  return false;
}

/** Fields mirrored from the create-token listing JSON shape. */
export type ListingFormValues = {
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
};

export function parseListingFieldsFromJson(json: Record<string, unknown>): ListingFormValues {
  const description = typeof json.description === 'string' ? json.description : '';
  const ext =
    json.extensions && typeof json.extensions === 'object' && !Array.isArray(json.extensions)
      ? (json.extensions as Record<string, unknown>)
      : {};
  const external = typeof json.external_url === 'string' ? json.external_url.trim() : '';
  const extWeb = typeof ext.website === 'string' ? ext.website.trim() : '';
  const website = external || extWeb;
  const twitter = typeof ext.twitter === 'string' ? ext.twitter : '';
  const telegram = typeof ext.telegram === 'string' ? ext.telegram : '';
  const discord = typeof ext.discord === 'string' ? ext.discord : '';
  return { description, website, twitter, telegram, discord };
}

export type ListingImageMerge =
  | { mode: 'keep' }
  | { mode: 'set'; url: string }
  | { mode: 'remove' };

/**
 * Merge listing JSON like the create-token tool: name, symbol, description, external_url,
 * extensions (website / twitter / telegram / discord), and optional image (omit empty image like create).
 */
export function mergeFullTokenListingJson(
  base: Record<string, unknown>,
  name: string,
  symbol: string,
  listing: ListingFormValues,
  image: ListingImageMerge,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  out.name = name.slice(0, 32);
  out.symbol = symbol.slice(0, 10);
  out.description = listing.description.slice(0, 500);
  const web = listing.website.trim();
  out.external_url = web;
  const ext: Record<string, unknown> = {};
  if (web) ext.website = web;
  const tw = listing.twitter.trim();
  const tg = listing.telegram.trim();
  const dc = listing.discord.trim();
  if (tw) ext.twitter = tw;
  if (tg) ext.telegram = tg;
  if (dc) ext.discord = dc;
  out.extensions = ext;

  if (image.mode === 'remove') {
    delete out.image;
  } else if (image.mode === 'set' && image.url.trim()) {
    out.image = image.url.trim();
  } else {
    const prev =
      typeof base.image === 'string' && base.image.trim() ? base.image.trim() : undefined;
    if (prev) out.image = prev;
    else delete out.image;
  }
  return out;
}
