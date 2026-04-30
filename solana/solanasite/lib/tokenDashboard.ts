import { Metadata as MetaplexMetadata } from '@metaplex-foundation/mpl-token-metadata';
import {
  getMint,
  getTokenMetadata,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import type { Commitment, Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { cache } from 'react';

import { getConnection, metadataPda } from '@/lib/solana';

export type TokenHolderRow = {
  tokenAccount: string;
  /** Raw amount string from RPC */
  amountRaw: string;
  uiAmount: string;
  percentOfSupply: string;
};

export type RecentMintTx = {
  signature: string;
  blockTime: number | null;
  slot: number;
  err: string | null;
};

export type TokenDashboardData = {
  mint: string;
  tokenProgram: 'spl-token' | 'token-2022';
  decimals: number;
  supplyRaw: string;
  supplyUi: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  name: string | null;
  symbol: string | null;
  metadataUri: string | null;
  /** Metaplex metadata update authority, if metadata exists */
  updateAuthority: string | null;
  priceUsd: number | null;
  topHolders: TokenHolderRow[];
  recentTxs: RecentMintTx[];
};

function formatUiAmount(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  const s = fracStr.length ? `${whole}.${fracStr}` : whole.toString();
  return neg ? `-${s}` : s;
}

function percentOfSupply(holderRaw: bigint, supply: bigint): string {
  if (supply === 0n) return '0';
  const bps = (holderRaw * 10000n) / supply;
  return (Number(bps) / 100).toFixed(2);
}

async function fetchJupiterPriceUsd(mint: string): Promise<number | null> {
  const urls = [
    `https://lite-api.jup.ag/price/v2?ids=${encodeURIComponent(mint)}`,
    `https://api.jup.ag/price/v2?ids=${encodeURIComponent(mint)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { next: { revalidate: 45 } });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        data?: Record<string, { price?: string | number }>;
      };
      const p = json.data?.[mint]?.price;
      const n = typeof p === 'number' ? p : parseFloat(String(p ?? ''));
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      /* try next */
    }
  }
  return null;
}

type DexPair = {
  priceUsd?: string;
  liquidity?: { usd?: number };
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
};

async function fetchDexScreenerSnapshot(mint: string): Promise<{
  priceUsd: number | null;
  name: string | null;
  symbol: string | null;
}> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return { priceUsd: null, name: null, symbol: null };
    const json = (await res.json()) as { pairs?: DexPair[] };
    const pairs = json.pairs ?? [];
    const hit = pairs.filter(
      (p) => p.baseToken?.address === mint || p.quoteToken?.address === mint,
    );
    const pool = hit.length ? hit : pairs;
    const sorted = [...pool].sort((a, b) => {
      const la = a.liquidity?.usd ?? 0;
      const lb = b.liquidity?.usd ?? 0;
      return lb - la;
    });
    const pick = sorted[0];
    if (!pick) return { priceUsd: null, name: null, symbol: null };
    const rawPx = pick.priceUsd != null ? parseFloat(String(pick.priceUsd)) : NaN;
    const priceUsd = Number.isFinite(rawPx) && rawPx > 0 ? rawPx : null;
    const side =
      pick.baseToken?.address === mint
        ? pick.baseToken
        : pick.quoteToken?.address === mint
          ? pick.quoteToken
          : pick.baseToken;
    return {
      priceUsd,
      name: side?.name?.trim() || null,
      symbol: side?.symbol?.trim() || null,
    };
  } catch {
    return { priceUsd: null, name: null, symbol: null };
  }
}

async function fetchCoinGeckoPriceUsd(mint: string): Promise<number | null> {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${encodeURIComponent(mint)}&vs_currencies=usd`;
    const res = await fetch(url, { next: { revalidate: 120 } });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, { usd?: number } | undefined>;
    const key = Object.keys(json).find((k) => k.toLowerCase() === mint.toLowerCase());
    const row = key ? json[key] : undefined;
    const u = row?.usd;
    return typeof u === 'number' && Number.isFinite(u) && u > 0 ? u : null;
  } catch {
    return null;
  }
}

async function resolvePriceUsd(mint: string, dexPrice: number | null): Promise<number | null> {
  const j = await fetchJupiterPriceUsd(mint);
  if (j != null) return j;
  if (dexPrice != null) return dexPrice;
  return fetchCoinGeckoPriceUsd(mint);
}

async function enrichMetadataFromOffchainJson(meta: {
  name: string | null;
  symbol: string | null;
  uri: string | null;
  updateAuthority: string | null;
}): Promise<typeof meta> {
  if ((meta.name && meta.symbol) || !meta.uri) return meta;
  const u = meta.uri.trim();
  if (!/^https?:\/\//i.test(u)) return meta;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(u, { signal: ctrl.signal, next: { revalidate: 300 } });
    clearTimeout(t);
    if (!res.ok) return meta;
    const j = (await res.json()) as Record<string, unknown>;
    const jn = typeof j.name === 'string' ? j.name.trim() : null;
    const js = typeof j.symbol === 'string' ? j.symbol.trim() : null;
    return {
      ...meta,
      name: meta.name || (jn || null),
      symbol: meta.symbol || (js || null),
    };
  } catch {
    return meta;
  }
}

async function readMetaplexMetadata(mint: PublicKey): Promise<{
  name: string | null;
  symbol: string | null;
  uri: string | null;
  updateAuthority: string | null;
}> {
  try {
    const connection = getConnection();
    const meta = await MetaplexMetadata.fromAccountAddress(
      connection,
      metadataPda(mint),
      'confirmed',
    );
    const { name, symbol, uri } = meta.data;
    const ua = meta.updateAuthority;
    const uaStr =
      ua && !ua.equals(PublicKey.default)
        ? ua.toBase58()
        : null;
    return {
      name: name.replace(/\0/g, '').trim() || null,
      symbol: symbol.replace(/\0/g, '').trim() || null,
      uri: uri.replace(/\0/g, '').trim() || null,
      updateAuthority: uaStr,
    };
  } catch {
    return { name: null, symbol: null, uri: null, updateAuthority: null };
  }
}

async function readToken2022MintMetadataFull(
  connection: Connection,
  mint: PublicKey,
  commitment: Commitment,
): Promise<{
  name: string | null;
  symbol: string | null;
  uri: string | null;
  updateAuthority: string | null;
}> {
  try {
    const tm = await getTokenMetadata(connection, mint, commitment, TOKEN_2022_PROGRAM_ID);
    if (!tm) return { name: null, symbol: null, uri: null, updateAuthority: null };
    const ua =
      tm.updateAuthority && !tm.updateAuthority.equals(PublicKey.default)
        ? tm.updateAuthority.toBase58()
        : null;
    return {
      name: tm.name?.replace(/\0/g, '').trim() || null,
      symbol: tm.symbol?.replace(/\0/g, '').trim() || null,
      uri: tm.uri?.replace(/\0/g, '').trim() || null,
      updateAuthority: ua,
    };
  } catch {
    return { name: null, symbol: null, uri: null, updateAuthority: null };
  }
}

function mergeMeta(
  a: { name: string | null; symbol: string | null; uri: string | null; updateAuthority: string | null },
  b: { name: string | null; symbol: string | null; uri: string | null },
  t202Ua: string | null,
): typeof a {
  return {
    name: a.name || b.name,
    symbol: a.symbol || b.symbol,
    uri: a.uri || b.uri,
    updateAuthority: a.updateAuthority || t202Ua,
  };
}

async function fetchRecentMintSignatures(
  connection: Connection,
  mint: PublicKey,
  limit = 20,
): Promise<RecentMintTx[]> {
  try {
    const sigs = await connection.getSignaturesForAddress(mint, { limit });
    return sigs.map((s) => ({
      signature: s.signature,
      blockTime: s.blockTime ?? null,
      slot: s.slot,
      err: s.err ? JSON.stringify(s.err) : null,
    }));
  } catch {
    return [];
  }
}

async function loadTokenDashboardUncached(
  mintStr: string,
): Promise<{ ok: true; data: TokenDashboardData } | { ok: false; error: string }> {
  let mint: PublicKey;
  try {
    mint = new PublicKey(mintStr.trim());
  } catch {
    return { ok: false, error: 'Invalid mint address' };
  }

  const connection = getConnection();
  const info = await connection.getAccountInfo(mint, 'confirmed');
  if (!info) {
    return { ok: false, error: 'Mint account not found on this cluster' };
  }

  const programId = info.owner;
  const isLegacy = programId.equals(TOKEN_PROGRAM_ID);
  const is2022 = programId.equals(TOKEN_2022_PROGRAM_ID);
  if (!isLegacy && !is2022) {
    return { ok: false, error: 'Not an SPL Token or Token-2022 mint' };
  }

  let mintData: Awaited<ReturnType<typeof getMint>>;
  try {
    mintData = await getMint(
      connection,
      mint,
      'confirmed',
      is2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    );
  } catch {
    return { ok: false, error: 'Could not read mint account' };
  }

  const supply = mintData.supply;
  const decimals = mintData.decimals;

  const metaplex = await readMetaplexMetadata(mint);
  const t202 = is2022 ? await readToken2022MintMetadataFull(connection, mint, 'confirmed') : null;
  let merged = mergeMeta(
    metaplex,
    {
      name: t202?.name ?? null,
      symbol: t202?.symbol ?? null,
      uri: t202?.uri ?? null,
    },
    t202?.updateAuthority ?? null,
  );
  merged = await enrichMetadataFromOffchainJson(merged);

  const [dexSnap, largestRes, recentTxs] = await Promise.all([
    fetchDexScreenerSnapshot(mint.toBase58()),
    connection.getTokenLargestAccounts(mint, 'confirmed'),
    fetchRecentMintSignatures(connection, mint, 20),
  ]);

  const priceUsd = await resolvePriceUsd(mint.toBase58(), dexSnap.priceUsd);

  if (!merged.name && dexSnap.name) merged = { ...merged, name: dexSnap.name };
  if (!merged.symbol && dexSnap.symbol) merged = { ...merged, symbol: dexSnap.symbol };

  const top = largestRes.value.slice(0, 10);
  const topHolders: TokenHolderRow[] = top.map((row) => {
    const raw = BigInt(row.amount);
    return {
      tokenAccount: row.address.toBase58(),
      amountRaw: row.amount,
      uiAmount: row.uiAmountString ?? formatUiAmount(raw, row.decimals),
      percentOfSupply: percentOfSupply(raw, supply),
    };
  });

  return {
    ok: true,
    data: {
      mint: mint.toBase58(),
      tokenProgram: is2022 ? 'token-2022' : 'spl-token',
      decimals,
      supplyRaw: supply.toString(),
      supplyUi: formatUiAmount(supply, decimals),
      mintAuthority: mintData.mintAuthority ? mintData.mintAuthority.toBase58() : null,
      freezeAuthority: mintData.freezeAuthority
        ? mintData.freezeAuthority.toBase58()
        : null,
      name: merged.name,
      symbol: merged.symbol,
      metadataUri: merged.uri,
      updateAuthority: merged.updateAuthority,
      priceUsd,
      topHolders,
      recentTxs,
    },
  };
}

/** Dedupes RPC + Jupiter work when the same mint is loaded from `generateMetadata` and the page. */
export const loadTokenDashboard = cache(loadTokenDashboardUncached);
