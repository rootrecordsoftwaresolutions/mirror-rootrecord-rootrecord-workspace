import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type ParsedTransactionWithMeta,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createAssociatedTokenAccountIdempotentInstructionWithDerivation,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token';

import { ecosystemOtcMemoInstruction } from '@/lib/ecosystemOtcClientPayment';
import { computeOtcPayAmounts } from '@/lib/ecosystemOtcCompute';
import {
  ECOSYSTEM_OTC_TOKEN_MINT,
  ecosystemOtcUsdcAutoLpEnabled,
  ecosystemOtcUsdcLpResumeLabel,
  ecosystemOtcUsdcMint,
} from '@/lib/ecosystemOtcConstants';
import { depositOtcPaymentToCpmmPool } from '@/lib/ecosystemOtcAutoLiquidity';
import { fetchJupiterSolUsdcUsd } from '@/lib/ecosystemJupUsd';
import {
  loadTreasuryKeypair,
  logUsdcDeferredSeedLedger,
  verifyOtcPaymentTx,
  workerOtcComplete,
  workerOtcLiquidityMeta,
  workerOtcReserve,
} from '@/lib/ecosystemOtcFulfill';
import { getConnection } from '@/lib/solana';

const QUOTE_MAX_AGE_MS = 120_000;
const QUOTED_SOL_USD_MAX_REL_DRIFT = 0.05;

export type PrepareOtcCheckoutInput = {
  buyer_wallet: string;
  pay_with: 'SOL' | 'USDC';
  tokens_whole: number;
  quoted_at_ms: number;
  quoted_sol_usd: number;
  memo_utf8?: string;
};

export type PrepareOtcCheckoutOk = { ok: true; checkout_tx_b64: string };
export type PrepareOtcCheckoutNeedsAta = {
  ok: false;
  status: 428;
  code: 'needs_ata';
  unsigned_tx_b64: string;
  detail: string;
};
export type PrepareOtcCheckoutErr = { ok: false; status: number; detail: string };

export type FinalizeOtcCheckoutInput = PrepareOtcCheckoutInput & {
  checkout_tx_signature: string;
};

export type FinalizeOtcCheckoutOk = {
  ok: true;
  checkout_tx_signature: string;
  liquidity_tx: string | null;
  liquidity_error: string | null;
  liquidity_notice: string | null;
};
export type FinalizeOtcCheckoutErr = { ok: false; status: number; detail: string };

async function validateQuoteAndBuyer(input: PrepareOtcCheckoutInput): Promise<
  | {
      ok: true;
      buyer: PublicKey;
      treasury: Keypair;
      rounded: ReturnType<typeof computeOtcPayAmounts>;
      prices: Awaited<ReturnType<typeof fetchJupiterSolUsdcUsd>>;
    }
  | { ok: false; status: number; detail: string }
> {
  const age = Date.now() - input.quoted_at_ms;
  if (!Number.isFinite(input.quoted_at_ms) || age > QUOTE_MAX_AGE_MS || age < -60_000) {
    return { ok: false, status: 400, detail: 'Quote is stale or invalid; refresh and try again.' };
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
        'Buyer wallet cannot be the deposit treasury. Use another wallet to pay and receive tokens.',
    };
  }
  const q = input.quoted_sol_usd;
  if (!Number.isFinite(q) || q <= 0) {
    return { ok: false, status: 400, detail: 'Missing or invalid quoted SOL mark.' };
  }
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
  const live = prices.solUsd;
  const drift = Math.abs(q - live) / live;
  if (drift > QUOTED_SOL_USD_MAX_REL_DRIFT) {
    return {
      ok: false,
      status: 400,
      detail: 'SOL mark moved vs your quote. Refresh prices and try again.',
    };
  }
  const rounded = computeOtcPayAmounts(input.tokens_whole, q, prices.usdcUsd);
  return { ok: true, buyer, treasury, rounded, prices };
}

function buyerProjectTokenRawIncrease(
  tx: ParsedTransactionWithMeta,
  buyer: PublicKey,
  mintStr: string,
): bigint {
  const buyerStr = buyer.toBase58();
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  const byIdx = new Map<number, { pre?: bigint; post?: bigint }>();
  for (const b of pre) {
    if (b.mint === mintStr && b.owner === buyerStr) {
      const cur = byIdx.get(b.accountIndex) ?? {};
      cur.pre = BigInt(b.uiTokenAmount.amount);
      byIdx.set(b.accountIndex, cur);
    }
  }
  for (const b of post) {
    if (b.mint === mintStr && b.owner === buyerStr) {
      const cur = byIdx.get(b.accountIndex) ?? {};
      cur.post = BigInt(b.uiTokenAmount.amount);
      byIdx.set(b.accountIndex, cur);
    }
  }
  let sum = 0n;
  for (const v of byIdx.values()) {
    if (v.pre != null && v.post != null) sum += v.post - v.pre;
    else if (v.post != null && v.pre == null) sum += v.post;
  }
  return sum;
}

/**
 * Build a single v0 transaction: buyer pays quote to treasury + treasury sends SPL tokens to buyer.
 * Treasury partial-signs; buyer signs in wallet (Balance Changes show SOL/USDC out + tokens in).
 */
export async function prepareOtcAtomicCheckout(
  input: PrepareOtcCheckoutInput,
): Promise<PrepareOtcCheckoutOk | PrepareOtcCheckoutNeedsAta | PrepareOtcCheckoutErr> {
  const gate = await validateQuoteAndBuyer(input);
  if (!gate.ok) return gate;

  const { buyer, treasury, rounded } = gate;
  const connection = getConnection();
  const mintPk = new PublicKey(ECOSYSTEM_OTC_TOKEN_MINT);
  const mintAccount = await connection.getAccountInfo(mintPk);
  const tokenProgramId = mintAccount?.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  const mintData = await getMint(connection, mintPk, undefined, tokenProgramId);
  const decimals = mintData.decimals;
  const amountRaw = BigInt(rounded.tokensWhole) * 10n ** BigInt(decimals);

  const treasurySrcAta = await getAssociatedTokenAddress(
    mintPk,
    treasury.publicKey,
    false,
    tokenProgramId,
  );
  const srcAcc = await connection.getTokenAccountBalance(treasurySrcAta).catch(() => null);
  const srcUi = srcAcc?.value?.uiAmountString;
  if (!srcAcc?.value || BigInt(srcAcc.value.amount) < amountRaw) {
    return {
      ok: false,
      status: 503,
      detail: `Treasury token balance too low (have ${srcUi ?? '0'} tokens).`,
    };
  }

  const buyerDestAta = await getAssociatedTokenAddress(mintPk, buyer, false, tokenProgramId);
  const destInfo = await connection.getAccountInfo(buyerDestAta);
  if (!destInfo) {
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const ataIx = createAssociatedTokenAccountIdempotentInstruction(
      buyer,
      buyerDestAta,
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
    return {
      ok: false,
      status: 428,
      code: 'needs_ata',
      unsigned_tx_b64: Buffer.from(ataVtx.serialize()).toString('base64'),
      detail:
        'Create your token account in your wallet first (you pay rent). Sign, confirm, then try again.',
    };
  }

  const memoIx = input.memo_utf8
    ? ecosystemOtcMemoInstruction(input.memo_utf8.trim())
    : null;

  const tokenOutIx = createTransferCheckedInstruction(
    treasurySrcAta,
    mintPk,
    buyerDestAta,
    treasury.publicKey,
    amountRaw,
    decimals,
    [],
    tokenProgramId,
  );

  const ixs = [];
  if (memoIx) ixs.push(memoIx);

  // Payment to treasury only — no RootRecord platform-fee / referrer split (OTC is excluded by policy).
  if (input.pay_with === 'SOL') {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: buyer,
        toPubkey: treasury.publicKey,
        lamports: rounded.solLamports,
      }),
    );
  } else {
    const usdcMintPk = new PublicKey(ecosystemOtcUsdcMint());
    const usdcMintAcc = await connection.getAccountInfo(usdcMintPk);
    const usdcProgram = usdcMintAcc?.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;
    const usdcMintData = await getMint(connection, usdcMintPk, undefined, usdcProgram);
    const usdcDec = usdcMintData.decimals;

    const buyerUsdcAta = await getAssociatedTokenAddress(usdcMintPk, buyer, false, usdcProgram);
    const treasUsdcAta = await getAssociatedTokenAddress(
      usdcMintPk,
      treasury.publicKey,
      false,
      usdcProgram,
    );

    const buyerUsdcInfo = await connection.getAccountInfo(buyerUsdcAta);
    if (!buyerUsdcInfo) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstructionWithDerivation(
          buyer,
          buyer,
          usdcMintPk,
          false,
          usdcProgram,
        ),
      );
    }
    const treasUsdcInfo = await connection.getAccountInfo(treasUsdcAta);
    if (!treasUsdcInfo) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstructionWithDerivation(
          buyer,
          treasury.publicKey,
          usdcMintPk,
          false,
          usdcProgram,
        ),
      );
    }
    ixs.push(
      createTransferCheckedInstruction(
        buyerUsdcAta,
        usdcMintPk,
        treasUsdcAta,
        buyer,
        rounded.usdcMicro,
        usdcDec,
        [],
        usdcProgram,
      ),
    );
  }

  ixs.push(tokenOutIx);

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const msg = new TransactionMessage({
    payerKey: buyer,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  const vtx = new VersionedTransaction(msg);
  vtx.sign([treasury]);
  return { ok: true, checkout_tx_b64: Buffer.from(vtx.serialize()).toString('base64') };
}

/** After buyer broadcasts atomic checkout tx: D1 bookkeeping + optional LP (same as legacy fulfill tail). */
export async function finalizeOtcAtomicCheckout(
  input: FinalizeOtcCheckoutInput,
): Promise<FinalizeOtcCheckoutOk | FinalizeOtcCheckoutErr> {
  const sig = input.checkout_tx_signature.trim();
  if (sig.length < 80 || sig.length > 128) {
    return { ok: false, status: 400, detail: 'Invalid checkout transaction signature' };
  }

  const gate = await validateQuoteAndBuyer(input);
  if (!gate.ok) return gate;

  const { buyer, treasury, rounded } = gate;
  const connection = getConnection();
  const mintPk = new PublicKey(ECOSYSTEM_OTC_TOKEN_MINT);

  const mintAccount = await connection.getAccountInfo(mintPk);
  const tokenProgramId = mintAccount?.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  const mintData = await getMint(connection, mintPk, undefined, tokenProgramId);
  const decimals = mintData.decimals;
  const amountRaw = BigInt(rounded.tokensWhole) * 10n ** BigInt(decimals);

  const tx = await connection.getParsedTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });
  if (!tx) {
    return { ok: false, status: 400, detail: 'Checkout transaction not found (confirm then retry)' };
  }
  if (tx.meta?.err) {
    return { ok: false, status: 400, detail: 'Checkout transaction failed on-chain' };
  }

  const payCheck = verifyOtcPaymentTx({
    tx,
    buyer,
    treasury: treasury.publicKey,
    payWith: input.pay_with,
    minLamports: rounded.solLamports,
    minUsdcMicro: rounded.usdcMicro,
  });
  if (!payCheck.ok) {
    return { ok: false, status: 400, detail: payCheck.reason };
  }

  const mintStr = mintPk.toBase58();
  const gotTokens = buyerProjectTokenRawIncrease(tx, buyer, mintStr);
  if (gotTokens < amountRaw) {
    return {
      ok: false,
      status: 400,
      detail: `Token receipt mismatch: buyer gained ${gotTokens} raw units, expected at least ${amountRaw}.`,
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
  if (!reserve.ok && reserve.status !== 409) {
    return { ok: false, status: reserve.status, detail: reserve.detail };
  }

  try {
    await workerOtcComplete(sig, sig);
  } catch {
    /* D1 may be out of sync; on-chain settlement already done */
  }

  const receivedSol = payCheck.receivedSol;
  const receivedUsdc = payCheck.receivedUsdc;

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
      fulfill_tx: sig,
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
    liquidity_tx: liquidity_tx,
    quote_received_raw: quoteReceivedRaw,
  });

  return {
    ok: true,
    checkout_tx_signature: sig,
    liquidity_tx,
    liquidity_error,
    liquidity_notice,
  };
}
