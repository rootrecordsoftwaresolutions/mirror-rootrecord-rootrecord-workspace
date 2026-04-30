import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
} from '@solana/spl-token';

import {
  getConnection,
  platformFeeTransferInstructions,
  explorerUrl,
  resolveMintAndProgram,
} from '@/lib/solana';
import {
  appendReferralMemoIfEligible,
  eligibleReferrerForPayer,
} from '@/lib/referralMemo';

/** Platform fee: SOL per 100 recipient addresses (rounded up). */
export function parseBulkFeePer100Sol(): number {
  const n = parseFloat(
    (import.meta.env.VITE_BULK_FEE_PER_100_SOL as string | undefined) ?? '',
  );
  return Number.isFinite(n) && n >= 0 ? n : 0.01;
}

export const BULK_FEE_PER_100_SOL = parseBulkFeePer100Sol();

export function bulkPlatformFeeSol(recipientCount: number): number {
  if (recipientCount <= 0) return 0;
  return Math.ceil(recipientCount / 100) * BULK_FEE_PER_100_SOL;
}

export type BulkTransferRow = { to: PublicKey; lamports: bigint };

/**
 * Legacy-transaction safe batch sizes: first tx also carries platform fee + memo.
 */
export const BULK_FIRST_TX_TRANSFERS = 3;
export const BULK_OTHER_TX_TRANSFERS = 8;

export function estimateBulkTxCount(recipientCount: number): number {
  if (recipientCount <= 0) return 0;
  if (recipientCount <= BULK_FIRST_TX_TRANSFERS) return 1;
  return (
    1 +
    Math.ceil((recipientCount - BULK_FIRST_TX_TRANSFERS) / BULK_OTHER_TX_TRANSFERS)
  );
}

export const MAX_BULK_RECIPIENTS = 200;

function chunkTransfers(rows: BulkTransferRow[]): BulkTransferRow[][] {
  if (!rows.length) return [];
  const chunks: BulkTransferRow[][] = [];
  let i = 0;
  const firstN = Math.min(BULK_FIRST_TX_TRANSFERS, rows.length);
  chunks.push(rows.slice(0, firstN));
  i = firstN;
  while (i < rows.length) {
    chunks.push(rows.slice(i, i + BULK_OTHER_TX_TRANSFERS));
    i += BULK_OTHER_TX_TRANSFERS;
  }
  return chunks;
}

/** Instruction budget per signed tx (token create+transfer / transfer only). */
const TOKEN_IX_LIMIT_FIRST = 10;
const TOKEN_IX_LIMIT_REST = 12;

export function bulkTokenFirstTxOverhead(
  payer: PublicKey,
  platformFeeSol: number,
  referrer: string | null | undefined,
): number {
  const feeIxs = platformFeeTransferInstructions(payer, platformFeeSol, referrer);
  let n = feeIxs.length;
  if (eligibleReferrerForPayer(referrer, payer)) n += 1;
  return n;
}

export function chunkRowsByTokenIxBudget(
  rows: BulkTransferRow[],
  needsCreate: boolean[],
  firstOverhead: number,
): BulkTransferRow[][] {
  if (rows.length !== needsCreate.length) {
    throw new Error('needsCreate length must match rows');
  }
  if (!rows.length) return [];
  const chunks: BulkTransferRow[][] = [];
  let idx = 0;
  while (idx < rows.length) {
    const chunk: BulkTransferRow[] = [];
    let ixUsed = chunks.length === 0 ? firstOverhead : 0;
    const limit = chunks.length === 0 ? TOKEN_IX_LIMIT_FIRST : TOKEN_IX_LIMIT_REST;
    while (idx < rows.length) {
      const cost = needsCreate[idx] ? 2 : 1;
      if (ixUsed + cost > limit) {
        if (!chunk.length) {
          throw new Error(
            'A single recipient exceeds the per-transaction instruction budget — try fewer extensions or split manually.',
          );
        }
        break;
      }
      chunk.push(rows[idx]);
      ixUsed += cost;
      idx++;
    }
    chunks.push(chunk);
  }
  return chunks;
}

/** Valid placeholder pubkey for sizing-only rows (estimateBulkTokenTxCount). */
const ESTIMATE_STUB_PK = new PublicKey(
  'So11111111111111111111111111111111111111112',
);

export function estimateBulkTokenTxCount(
  needsCreate: boolean[],
  firstOverhead: number,
): number {
  if (!needsCreate.length) return 0;
  const stubRows: BulkTransferRow[] = needsCreate.map(() => ({
    to: ESTIMATE_STUB_PK,
    lamports: 1n,
  }));
  return chunkRowsByTokenIxBudget(stubRows, needsCreate, firstOverhead).length;
}

/** Resolve mint address for bulk SPL sends (program id + decimals). */
export async function resolveBulkMintContext(mintAddress: string): Promise<{
  mint: PublicKey;
  programId: PublicKey;
  decimals: number;
}> {
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  const mintInfo = await getMint(getConnection(), mint, undefined, programId);
  return { mint, programId, decimals: mintInfo.decimals };
}

/**
 * Whether each recipient already has an ATA for this mint (same order as `recipients`).
 */
export async function fetchBulkDestAtaExistence(
  mint: PublicKey,
  programId: PublicKey,
  recipients: PublicKey[],
): Promise<boolean[]> {
  const connection = getConnection();
  const atas = recipients.map((w) =>
    getAssociatedTokenAddressSync(mint, w, false, programId),
  );
  const out: boolean[] = [];
  const CHUNK = 100;
  for (let i = 0; i < atas.length; i += CHUNK) {
    const slice = atas.slice(i, i + CHUNK);
    const infos = await connection.getMultipleAccountsInfo(slice);
    for (const info of infos) {
      out.push(!!info);
    }
  }
  return out;
}

/**
 * Per-row create-ATA flags: one `true` per distinct destination ATA that is missing on-chain
 * at the start of the run (later duplicate lines reuse the same ATA and skip a second create).
 */
export function bulkTokenNeedsCreatePerRow(
  destAtas: PublicKey[],
  existsOnChain: boolean[],
): boolean[] {
  if (destAtas.length !== existsOnChain.length) {
    throw new Error('destAtas and existsOnChain must match');
  }
  const out: boolean[] = [];
  const planned = new Set<string>();
  for (let i = 0; i < destAtas.length; i++) {
    const k = destAtas[i].toBase58();
    const need = !existsOnChain[i] && !planned.has(k);
    out.push(need);
    if (need) planned.add(k);
  }
  return out;
}

export function deriveBulkDestAtas(
  mint: PublicKey,
  programId: PublicKey,
  recipients: PublicKey[],
): PublicKey[] {
  return recipients.map((to) =>
    getAssociatedTokenAddressSync(mint, to, false, programId),
  );
}

/**
 * Parse a non-negative decimal amount into raw integer units (lamports, token base units, etc.).
 */
export function decimalStringToRawAmount(amount: string, decimals: number): bigint {
  if (decimals < 0 || decimals > 18) throw new Error('Invalid amount scale');
  const t = amount.trim().replace(/,/g, '');
  if (!t || t === '.') throw new Error('Invalid amount');
  if (t.startsWith('-')) throw new Error('Amount must be greater than zero');
  const [wholeRaw, fracRaw = ''] = t.split('.');
  const whole = wholeRaw.replace(/^0+/, '') || '0';
  if (!/^\d+$/.test(whole)) throw new Error('Invalid amount');
  const pad = '0'.repeat(decimals);
  const frac = (fracRaw + pad).slice(0, decimals);
  if (!/^\d+$/.test(frac)) throw new Error('Invalid amount');
  const scale = BigInt(10) ** BigInt(decimals);
  const raw = BigInt(whole) * scale + BigInt(frac);
  if (raw <= 0n) throw new Error('Amount must be greater than zero');
  return raw;
}

/** Parse decimal SOL string to lamports (up to 9 decimal places). */
export function solStringToLamports(sol: string): bigint {
  return decimalStringToRawAmount(sol, 9);
}

export interface ParseBulkInputResult {
  rows: BulkTransferRow[];
  errors: string[];
}

/**
 * Each non-empty line: `PUBKEY` or `PUBKEY AMOUNT` / `PUBKEY,AMOUNT`.
 * Lines with only a pubkey require `defaultAmountPerRecipient`.
 * @param amountDecimals use `9` for SOL; use mint `decimals` for SPL. Pass `-1` while mint metadata is still loading (token mode).
 */
export function parseBulkTransferInput(
  raw: string,
  defaultAmountPerRecipient: string | null,
  amountDecimals: number,
): ParseBulkInputResult {
  const rows: BulkTransferRow[] = [];
  const errors: string[] = [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (amountDecimals < 0) {
    if (lines.length) {
      errors.push('Loading mint metadata (decimals)…');
    }
    return { rows: [], errors };
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNo = idx + 1;
    try {
      const parts = line.split(/[\s,]+/).filter(Boolean);
      if (parts.length === 0) continue;
      let addrStr: string;
      let amountPart: string | null = null;
      if (parts.length === 1) {
        addrStr = parts[0];
        amountPart = defaultAmountPerRecipient?.trim() || null;
        if (!amountPart) {
          errors.push(
            `Line ${lineNo}: add an amount on the line or fill the default amount field.`,
          );
          continue;
        }
      } else {
        addrStr = parts[0];
        amountPart = parts[1];
      }
      const to = new PublicKey(addrStr);
      const lamports = decimalStringToRawAmount(amountPart!, amountDecimals);
      rows.push({ to, lamports });
    } catch (e) {
      errors.push(
        `Line ${lineNo}: ${e instanceof Error ? e.message : 'invalid line'}`,
      );
    }
  }

  if (rows.length > MAX_BULK_RECIPIENTS) {
    errors.push(`Maximum ${MAX_BULK_RECIPIENTS} recipients per run.`);
    return { rows: [], errors };
  }

  return { rows, errors };
}

export interface SendBulkSolResult {
  signatures: string[];
  batchCount: number;
  platformFeeSol: number;
}

/**
 * Sends native SOL to many recipients in sequential transactions (fresh blockhash each).
 * First transaction includes the platform fee (if configured) and optional referral memo.
 */
export async function sendBulkSolTransfers(
  wallet: WalletContextState,
  transfers: BulkTransferRow[],
  opts?: { referrer?: string | null },
): Promise<SendBulkSolResult> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }
  if (!transfers.length) throw new Error('No valid recipients');

  const payer = wallet.publicKey;
  const connection = getConnection();
  const platformFeeSol = bulkPlatformFeeSol(transfers.length);
  const feeIxs = platformFeeTransferInstructions(
    payer,
    platformFeeSol,
    opts?.referrer ?? null,
  );
  const chunks = chunkTransfers(transfers);
  const signatures: string[] = [];

  for (let c = 0; c < chunks.length; c++) {
    const ixs: TransactionInstruction[] = [];
    for (const { to, lamports } of chunks[c]) {
      if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Per-recipient amount too large for this tool');
      }
      ixs.push(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: to,
          lamports: Number(lamports),
        }),
      );
    }
    if (c === 0) {
      for (const ix of feeIxs) ixs.push(ix);
      appendReferralMemoIfEligible(ixs, payer, opts?.referrer ?? null);
    }

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction().add(...ixs);
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer;

    const signed = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    signatures.push(sig);
  }

  return {
    signatures,
    batchCount: chunks.length,
    platformFeeSol: feeIxs.length ? platformFeeSol : 0,
  };
}

export interface SendBulkTokenResult {
  signatures: string[];
  batchCount: number;
  platformFeeSol: number;
}

/**
 * SPL Token / Token-2022: create recipient ATAs when missing, then transfer checked from the
 * wallet's ATA. Sequential transactions with a fresh blockhash each. First tx adds platform
 * fee (if configured) and optional referral memo.
 */
export async function sendBulkTokenTransfers(
  wallet: WalletContextState,
  mintAddress: string,
  transfers: BulkTransferRow[],
  opts?: { referrer?: string | null },
): Promise<SendBulkTokenResult> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }
  if (!transfers.length) throw new Error('No valid recipients');

  const payer = wallet.publicKey;
  const connection = getConnection();
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  const mintInfo = await getMint(connection, mint, undefined, programId);
  const decimals = mintInfo.decimals;

  const sourceAta = await getAssociatedTokenAddress(
    mint,
    payer,
    false,
    programId,
  );
  const srcInfo = await connection.getAccountInfo(sourceAta);
  if (!srcInfo) {
    throw new Error(
      'Your wallet has no token account for this mint — receive or create that token first.',
    );
  }
  const srcAccount = await getAccount(
    connection,
    sourceAta,
    'confirmed',
    programId,
  );

  let totalOut = 0n;
  for (const r of transfers) totalOut += r.lamports;
  if (totalOut > srcAccount.amount) {
    throw new Error(
      `Insufficient token balance: need ${totalOut.toString()} raw units in your ATA, have ${srcAccount.amount.toString()}.`,
    );
  }

  const destAtas = deriveBulkDestAtas(
    mint,
    programId,
    transfers.map((r) => r.to),
  );
  const existsOnChain = await fetchBulkDestAtaExistence(
    mint,
    programId,
    transfers.map((r) => r.to),
  );
  const needsCreate = bulkTokenNeedsCreatePerRow(destAtas, existsOnChain);

  const platformFeeSol = bulkPlatformFeeSol(transfers.length);
  const firstOverhead = bulkTokenFirstTxOverhead(
    payer,
    platformFeeSol,
    opts?.referrer ?? null,
  );
  const feeIxs = platformFeeTransferInstructions(
    payer,
    platformFeeSol,
    opts?.referrer ?? null,
  );
  const chunks = chunkRowsByTokenIxBudget(transfers, needsCreate, firstOverhead);

  const rentPerAta = await connection.getMinimumBalanceForRentExemption(165);
  const creates = needsCreate.filter(Boolean).length;
  const rentLamports = BigInt(creates) * BigInt(rentPerAta);
  const platformLamports = BigInt(
    Math.round(platformFeeSol * LAMPORTS_PER_SOL),
  );
  const solBal = BigInt(await connection.getBalance(payer, 'confirmed'));
  const batchReserve = BigInt(chunks.length * 15_000);
  const needSol = platformLamports + rentLamports + batchReserve;
  if (solBal < needSol) {
    throw new Error(
      `Not enough SOL: need roughly ${(Number(needSol) / LAMPORTS_PER_SOL).toFixed(4)} SOL for platform fee${creates ? `, up to ${creates} new recipient token account(s) (~${(Number(rentLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL rent)` : ''}, and network fees. Balance ≈ ${(Number(solBal) / LAMPORTS_PER_SOL).toFixed(4)} SOL.`,
    );
  }

  const signatures: string[] = [];
  let globalIdx = 0;

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const ixs: TransactionInstruction[] = [];

    for (const row of chunk) {
      const destAta = destAtas[globalIdx];
      if (needsCreate[globalIdx]) {
        ixs.push(
          createAssociatedTokenAccountInstruction(
            payer,
            destAta,
            row.to,
            mint,
            programId,
          ),
        );
      }
      if (row.lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Per-recipient amount too large for this tool');
      }
      ixs.push(
        createTransferCheckedInstruction(
          sourceAta,
          mint,
          destAta,
          payer,
          row.lamports,
          decimals,
          [],
          programId,
        ),
      );
      globalIdx++;
    }

    if (c === 0) {
      for (const ix of feeIxs) ixs.push(ix);
      appendReferralMemoIfEligible(ixs, payer, opts?.referrer ?? null);
    }

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction().add(...ixs);
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer;

    const signed = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    signatures.push(sig);
  }

  return {
    signatures,
    batchCount: chunks.length,
    platformFeeSol: feeIxs.length ? platformFeeSol : 0,
  };
}

export { explorerUrl };
