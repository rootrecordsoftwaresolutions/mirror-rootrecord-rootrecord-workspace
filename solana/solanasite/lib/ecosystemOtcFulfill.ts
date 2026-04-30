import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type ParsedTransactionWithMeta,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token';
import bs58 from 'bs58';

import {
  ECOSYSTEM_OTC_TOKEN_MINT,
  ecosystemOtcUsdcAutoLpEnabled,
  ecosystemOtcUsdcLpResumeLabel,
  ecosystemOtcUsdcMint,
} from '@/lib/ecosystemOtcConstants';
import { depositOtcPaymentToCpmmPool } from '@/lib/ecosystemOtcAutoLiquidity';
import { computeOtcPayAmounts } from '@/lib/ecosystemOtcCompute';
import { fetchJupiterSolUsdcUsd } from '@/lib/ecosystemJupUsd';
import { getConnection } from '@/lib/solana';
import { fetchSolanaWorker } from '@/lib/solanaSiteApi';

const QUOTE_MAX_AGE_MS = 120_000;

export function loadTreasuryKeypair(): Keypair {
  const raw =
    process.env.ECOSYSTEM_OTC_TREASURY_PRIVATE_KEY?.trim() ||
    process.env.ECOSYSTEM_OTC_TREASURY_SECRET_KEY?.trim();
  if (!raw) {
    throw new Error('ECOSYSTEM_OTC_TREASURY_PRIVATE_KEY is not set');
  }
  try {
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr) && arr.length === 64) {
      return Keypair.fromSecretKey(Uint8Array.from(arr as number[]));
    }
  } catch {
    /* base58 below */
  }
  const decoded = bs58.decode(raw);
  if (decoded.length === 64) {
    return Keypair.fromSecretKey(decoded);
  }
  if (decoded.length === 32) {
    return Keypair.fromSeed(decoded);
  }
  throw new Error('Treasury key: expected base58 32/64-byte secret or JSON [64] array');
}

function feePayerFromParsed(tx: ParsedTransactionWithMeta): PublicKey {
  const msg = tx.transaction.message as unknown as Record<string, unknown>;
  const staticK = msg.staticAccountKeys as PublicKey[] | undefined;
  if (staticK?.[0]) {
    return staticK[0] instanceof PublicKey ? staticK[0] : new PublicKey(String(staticK[0]));
  }
  const ak = msg.accountKeys as Array<{ pubkey: PublicKey | string } | string> | undefined;
  const first = ak?.[0];
  if (!first) {
    throw new Error('Missing fee payer');
  }
  if (typeof first === 'string') {
    return new PublicKey(first);
  }
  const p = first.pubkey;
  return p instanceof PublicKey ? p : new PublicKey(String(p));
}

function allAccountKeys(tx: ParsedTransactionWithMeta): PublicKey[] {
  const msg = tx.transaction.message as unknown as Record<string, unknown>;
  const meta = tx.meta;
  if (Array.isArray(msg.staticAccountKeys)) {
    const staticK = (msg.staticAccountKeys as PublicKey[]).map((k) =>
      k instanceof PublicKey ? k : new PublicKey(String(k)),
    );
    const lw = (meta?.loadedAddresses?.writable ?? []).map((s) => new PublicKey(s));
    const lr = (meta?.loadedAddresses?.readonly ?? []).map((s) => new PublicKey(s));
    return [...staticK, ...lw, ...lr];
  }
  const keys = msg.accountKeys as Array<{ pubkey: PublicKey | string } | string>;
  return keys.map((k) => {
    if (typeof k === 'string') {
      return new PublicKey(k);
    }
    const p = k.pubkey;
    return p instanceof PublicKey ? p : new PublicKey(String(p));
  });
}

function treasuryNativeReceived(tx: ParsedTransactionWithMeta, treasury: PublicKey): bigint {
  const keys = allAccountKeys(tx);
  const meta = tx.meta;
  if (!meta) return 0n;
  const idx = keys.findIndex((k) => k.equals(treasury));
  if (idx < 0) return 0n;
  return BigInt(meta.postBalances[idx]!) - BigInt(meta.preBalances[idx]!);
}

function treasuryUsdcRawReceived(
  tx: ParsedTransactionWithMeta,
  treasury: PublicKey,
  usdcMint: PublicKey,
): bigint {
  const treasuryStr = treasury.toBase58();
  const mintStr = usdcMint.toBase58();
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  const byIdx = new Map<number, { pre?: bigint; post?: bigint }>();
  for (const b of pre) {
    if (b.mint === mintStr && b.owner === treasuryStr) {
      const cur = byIdx.get(b.accountIndex) ?? {};
      cur.pre = BigInt(b.uiTokenAmount.amount);
      byIdx.set(b.accountIndex, cur);
    }
  }
  for (const b of post) {
    if (b.mint === mintStr && b.owner === treasuryStr) {
      const cur = byIdx.get(b.accountIndex) ?? {};
      cur.post = BigInt(b.uiTokenAmount.amount);
      byIdx.set(b.accountIndex, cur);
    }
  }
  let sum = 0n;
  for (const v of byIdx.values()) {
    if (v.pre != null && v.post != null) {
      sum += v.post - v.pre;
    } else if (v.post != null && v.pre == null) {
      sum += v.post;
    }
  }
  return sum;
}

export function verifyOtcPaymentTx(params: {
  tx: ParsedTransactionWithMeta;
  buyer: PublicKey;
  treasury: PublicKey;
  payWith: 'SOL' | 'USDC';
  minLamports: bigint;
  minUsdcMicro: bigint;
}):
  | { ok: true; receivedSol: bigint; receivedUsdc: bigint }
  | { ok: false; reason: string } {
  const { tx, buyer, treasury, payWith, minLamports, minUsdcMicro } = params;
  if (tx.meta?.err) {
    return { ok: false, reason: 'Payment transaction failed on-chain' };
  }
  let feePayer: PublicKey;
  try {
    feePayer = feePayerFromParsed(tx);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Could not read fee payer' };
  }
  if (!feePayer.equals(buyer)) {
    return { ok: false, reason: 'Payment tx fee payer must match your buyer wallet' };
  }
  if (payWith === 'SOL') {
    const got = treasuryNativeReceived(tx, treasury);
    if (got < minLamports) {
      return {
        ok: false,
        reason: `Insufficient SOL: treasury received ${got} lamports, need at least ${minLamports}`,
      };
    }
    return { ok: true, receivedSol: got, receivedUsdc: 0n };
  }
  const usdcMint = new PublicKey(ecosystemOtcUsdcMint());
  const got = treasuryUsdcRawReceived(tx, treasury, usdcMint);
  if (got < minUsdcMicro) {
    return {
      ok: false,
      reason: `Insufficient USDC: treasury received ${got} raw units, need at least ${minUsdcMicro}`,
    };
  }
  return { ok: true, receivedSol: 0n, receivedUsdc: got };
}

export async function workerOtcReserve(body: {
  payment_tx_signature: string;
  buyer: string;
  token_mint: string;
  amount_raw: string;
  pay_with: string;
  tokens_whole?: string;
  token_decimals?: string;
}): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const res = await fetchSolanaWorker('/api/solana-site/ecosystem-otc-reserve', body);
  const text = await res.text();
  let j: { ok?: boolean; detail?: string };
  try {
    j = JSON.parse(text) as { ok?: boolean; detail?: string };
  } catch {
    return { ok: false, status: res.status, detail: text.slice(0, 200) || `HTTP ${res.status}` };
  }
  if (!res.ok || !j.ok) {
    return { ok: false, status: res.status, detail: j.detail || `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function workerOtcRelease(payment_tx_signature: string): Promise<void> {
  try {
    await fetchSolanaWorker('/api/solana-site/ecosystem-otc-release', { payment_tx_signature });
  } catch {
    /* best-effort */
  }
}

export async function workerOtcComplete(payment_tx_signature: string, out_tx: string): Promise<void> {
  await fetchSolanaWorker('/api/solana-site/ecosystem-otc-complete', {
    payment_tx_signature,
    out_tx,
  });
}

/** Persist LP tx + treasury quote received for ecosystem transaction history (best-effort). */
export async function workerOtcLiquidityMeta(body: {
  payment_tx_signature: string;
  liquidity_tx: string | null;
  quote_received_raw: string;
}): Promise<void> {
  try {
    await fetchSolanaWorker('/api/solana-site/ecosystem-otc-liquidity-meta', {
      payment_tx_signature: body.payment_tx_signature,
      liquidity_tx: body.liquidity_tx,
      quote_received_raw: body.quote_received_raw,
    });
  } catch {
    /* optional */
  }
}

/** Ledger USDC for initial seed (D1 bot feed); best-effort. */
export async function logUsdcDeferredSeedLedger(params: {
  payment_tx: string;
  fulfill_tx: string;
  buyer: string;
  mint: string;
  usdc_micro: string;
}): Promise<void> {
  try {
    const res = await fetchSolanaWorker('/api/solana-site/ecosystem-bot-event', {
      bot_id: 'otc',
      event_type: 'usdc_deferred_seed',
      mint: params.mint,
      tx_signature: params.fulfill_tx,
      amount_quote_raw: params.usdc_micro,
      quote_currency: 'USDC',
      metadata: {
        payment_tx: params.payment_tx,
        buyer: params.buyer,
        programme: 'initial_seed_pre_lp',
      },
    });
    if (!res.ok) return;
  } catch {
    /* optional telemetry */
  }
}

/** Max relative drift between client-locked SOL/USD and live Jupiter (anti-gaming). */
const QUOTED_SOL_USD_MAX_REL_DRIFT = 0.05;

export type FulfillOtcInput = {
  buyer_wallet: string;
  pay_with: 'SOL' | 'USDC';
  tokens_whole: number;
  quoted_at_ms: number;
  /** SOL/USD shown when the user built the payment tx; used for min SOL/USDC (must track live within QUOTED_SOL_USD_MAX_REL_DRIFT). */
  quoted_sol_usd: number;
  payment_tx_signature: string;
};

export type FulfillOtcResult =
  | {
      ok: true;
      out_signature: string;
      liquidity_tx?: string | null;
      liquidity_error?: string | null;
      liquidity_notice?: string | null;
    }
  | { ok: false; status: number; detail: string }
  | {
      ok: false;
      status: 428;
      code: 'needs_ata';
      unsigned_tx_b64: string;
      detail: string;
    };

export async function fulfillOtcFromTreasury(input: FulfillOtcInput): Promise<FulfillOtcResult> {
  const age = Date.now() - input.quoted_at_ms;
  if (!Number.isFinite(input.quoted_at_ms) || age > QUOTE_MAX_AGE_MS || age < -60_000) {
    return { ok: false, status: 400, detail: 'Quote is stale or invalid; refresh prices and pay within 2 minutes.' };
  }
  if (!Number.isFinite(input.tokens_whole) || input.tokens_whole <= 0) {
    return { ok: false, status: 400, detail: 'Invalid token amount' };
  }

  let buyer: PublicKey;
  try {
    buyer = new PublicKey(input.buyer_wallet.trim());
  } catch {
    return { ok: false, status: 400, detail: 'Invalid buyer wallet' };
  }

  const sig = input.payment_tx_signature.trim();
  if (sig.length < 80 || sig.length > 128) {
    return { ok: false, status: 400, detail: 'Invalid payment transaction signature' };
  }

  let treasury: Keypair;
  try {
    treasury = loadTreasuryKeypair();
  } catch (e) {
    return {
      ok: false,
      status: 503,
      detail: e instanceof Error ? e.message : 'Treasury not configured',
    };
  }

  if (buyer.equals(treasury.publicKey)) {
    return {
      ok: false,
      status: 400,
      detail:
        'Connected wallet cannot be the deposit treasury. Use another wallet to pay and receive tokens.',
    };
  }

  const mintPk = new PublicKey(ECOSYSTEM_OTC_TOKEN_MINT);
  const connection = getConnection();

  let prices: Awaited<ReturnType<typeof fetchJupiterSolUsdcUsd>>;
  try {
    prices = await fetchJupiterSolUsdcUsd();
  } catch (e) {
    return {
      ok: false,
      status: 502,
      detail: e instanceof Error ? e.message : 'Could not fetch USD marks',
    };
  }

  const q = input.quoted_sol_usd;
  if (!Number.isFinite(q) || q <= 0) {
    return { ok: false, status: 400, detail: 'Missing or invalid quoted SOL mark.' };
  }
  const live = prices.solUsd;
  const drift = Math.abs(q - live) / live;
  if (drift > QUOTED_SOL_USD_MAX_REL_DRIFT) {
    return {
      ok: false,
      status: 400,
      detail: 'SOL mark moved vs your quote. Refresh prices and try again within the window.',
    };
  }

  const rounded = computeOtcPayAmounts(input.tokens_whole, q, prices.usdcUsd);
  const minLamports = rounded.solLamports;
  const minUsdcMicro = rounded.usdcMicro;

  const tx = await connection.getParsedTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });
  if (!tx) {
    return { ok: false, status: 400, detail: 'Payment transaction not found (confirm then retry)' };
  }

  const payCheck = verifyOtcPaymentTx({
    tx,
    buyer,
    treasury: treasury.publicKey,
    payWith: input.pay_with,
    minLamports,
    minUsdcMicro,
  });
  if (!payCheck.ok) {
    return { ok: false, status: 400, detail: payCheck.reason };
  }

  const receivedSol = payCheck.receivedSol;
  const receivedUsdc = payCheck.receivedUsdc;

  const mintAccount = await connection.getAccountInfo(mintPk);
  const tokenProgramId = mintAccount?.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;

  const mintData = await getMint(connection, mintPk, undefined, tokenProgramId);
  const decimals = mintData.decimals;
  const amountRaw = BigInt(rounded.tokensWhole) * 10n ** BigInt(decimals);

  const sourceAta = await getAssociatedTokenAddress(
    mintPk,
    treasury.publicKey,
    false,
    tokenProgramId,
  );
  const srcAcc = await connection.getTokenAccountBalance(sourceAta).catch(() => null);
  const srcUi = srcAcc?.value?.uiAmountString;
  if (!srcAcc?.value || BigInt(srcAcc.value.amount) < amountRaw) {
    return {
      ok: false,
      status: 503,
      detail: `Treasury token balance too low (have ${srcUi ?? '0'} tokens).`,
    };
  }

  const destAta = await getAssociatedTokenAddress(mintPk, buyer, false, tokenProgramId);
  const destInfo = await connection.getAccountInfo(destAta);
  if (!destInfo) {
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const ataIx = createAssociatedTokenAccountIdempotentInstruction(
      buyer,
      destAta,
      buyer,
      mintPk,
      tokenProgramId,
    );
    const msg = new TransactionMessage({
      payerKey: buyer,
      recentBlockhash: blockhash,
      instructions: [ataIx],
    }).compileToV0Message();
    const ataVtx = new VersionedTransaction(msg);
    const unsigned_tx_b64 = Buffer.from(ataVtx.serialize()).toString('base64');
    return {
      ok: false,
      status: 428,
      code: 'needs_ata',
      unsigned_tx_b64,
      detail:
        'Create your token account in your wallet first (you pay rent). Sign the transaction, wait for confirmation, then tap Claim again.',
    };
  }

  const reserve = await workerOtcReserve({
    payment_tx_signature: sig,
    buyer: buyer.toBase58(),
    token_mint: mintPk.toBase58(),
    amount_raw: amountRaw.toString(),
    pay_with: input.pay_with.toUpperCase(),
    tokens_whole: String(input.tokens_whole),
    token_decimals: String(decimals),
  });
  if (!reserve.ok) {
    const st = reserve.status === 409 ? 409 : 502;
    return {
      ok: false,
      status: st,
      detail:
        reserve.detail === 'payment_tx_already_used' || reserve.status === 409
          ? 'This payment transaction was already used for a treasury transfer fulfillment.'
          : reserve.detail,
    };
  }

  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const transferIx = createTransferCheckedInstruction(
      sourceAta,
      mintPk,
      destAta,
      treasury.publicKey,
      amountRaw,
      decimals,
      [],
      tokenProgramId,
    );

    const messageV0 = new TransactionMessage({
      payerKey: treasury.publicKey,
      recentBlockhash: blockhash,
      instructions: [transferIx],
    }).compileToV0Message();
    const vtx = new VersionedTransaction(messageV0);
    vtx.sign([treasury]);
    const outSig = await connection.sendTransaction(vtx, {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction({ signature: outSig, blockhash, lastValidBlockHeight }, 'confirmed');
    try {
      await workerOtcComplete(sig, outSig);
    } catch {
      /* transfer confirmed; D1 row may stay pending for manual reconcile */
    }

    let liquidity_tx: string | null = null;
    let liquidity_error: string | null = null;
    let liquidity_notice: string | null = null;
    const poolIdEnv =
      process.env.ECOSYSTEM_OTC_CPMM_POOL_ID?.trim() ||
      process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID?.trim();

    const skipUsdcLp = input.pay_with === 'USDC' && !ecosystemOtcUsdcAutoLpEnabled();
    if (skipUsdcLp) {
      liquidity_notice = `USDC auto-liquidity is paused until the USDC CPMM pair is live (target ${ecosystemOtcUsdcLpResumeLabel()}). This payment stays in treasury and is logged for the initial pool seed.`;
      void logUsdcDeferredSeedLedger({
        payment_tx: sig,
        fulfill_tx: outSig,
        buyer: buyer.toBase58(),
        mint: mintPk.toBase58(),
        usdc_micro: receivedUsdc.toString(),
      });
    } else if (poolIdEnv) {
      try {
        const lp = await depositOtcPaymentToCpmmPool({
          treasury,
          tokenMint: ECOSYSTEM_OTC_TOKEN_MINT,
          payWith: input.pay_with,
          receivedSol,
          receivedUsdc,
        });
        liquidity_tx = lp.txId;
      } catch (err) {
        liquidity_error = err instanceof Error ? err.message : 'add liquidity failed';
      }
    } else {
      liquidity_notice =
        'Auto pool deposit skipped: ECOSYSTEM_OTC_CPMM_POOL_ID (or NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID) is not set on the server. SOL/USDC from treasury transfers stays in the treasury until you configure the pool id.';
    }

    const quoteReceivedRaw =
      input.pay_with === 'SOL' ? receivedSol.toString() : receivedUsdc.toString();
    void workerOtcLiquidityMeta({
      payment_tx_signature: sig,
      liquidity_tx,
      quote_received_raw: quoteReceivedRaw,
    });

    return { ok: true, out_signature: outSig, liquidity_tx, liquidity_error, liquidity_notice };
  } catch (e) {
    await workerOtcRelease(sig);
    return {
      ok: false,
      status: 500,
      detail: e instanceof Error ? e.message : 'Transfer failed',
    };
  }
}
