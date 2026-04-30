import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstructionWithDerivation,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token';

import { ecosystemOtcUsdcMint } from '@/lib/ecosystemOtcConstants';

/** Same on-chain memo program as referral tags (UTF-8 payload; visible in wallets / explorers). */
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const MEMO_MAX_UTF8_BYTES = 566;

/** UTF-8 memo visible in wallets (same program as referral memos). */
export function ecosystemOtcMemoInstruction(utf8: string): TransactionInstruction | null {
  const data = Buffer.from(utf8, 'utf8');
  if (data.length > MEMO_MAX_UTF8_BYTES) return null;
  return new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data });
}

export type OtcClientPaymentParams = {
  connection: Connection;
  buyer: PublicKey;
  treasury: PublicKey;
  payWith: 'SOL' | 'USDC';
  solLamports: bigint;
  usdcMicro: bigint;
  /** Shown in wallet as a memo instruction (incoming SPL is a separate server tx). */
  memoUtf8?: string;
};

export type OtcClientPaymentBuilt = {
  transaction: VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
};

/**
 * Unsigned v0 tx: buyer pays quoted SOL or USDC to the deposit treasury (same amounts the server verifies).
 *
 * **Referral policy:** never add `platformFeeTransferInstructions` or referrer splits
 * here — treasury transfers are excluded from the % referral bonus to prevent abuse on
 * large OTC payments.
 */
export async function buildOtcTreasuryPaymentTx(
  params: OtcClientPaymentParams,
): Promise<OtcClientPaymentBuilt> {
  const { connection, buyer, treasury, payWith, solLamports, usdcMicro, memoUtf8 } = params;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  if (payWith === 'SOL') {
    if (solLamports <= 0n) throw new Error('Invalid SOL amount');
    const ixs: TransactionInstruction[] = [];
    const memoIx = memoUtf8 ? ecosystemOtcMemoInstruction(memoUtf8.trim()) : null;
    if (memoIx) ixs.push(memoIx);
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: buyer,
        toPubkey: treasury,
        lamports: solLamports,
      }),
    );
    const msg = new TransactionMessage({
      payerKey: buyer,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message();
    return { transaction: new VersionedTransaction(msg), blockhash, lastValidBlockHeight };
  }

  if (usdcMicro <= 0n) throw new Error('Invalid USDC amount');

  const mintPk = new PublicKey(ecosystemOtcUsdcMint());
  const mintAcc = await connection.getAccountInfo(mintPk);
  const tokenProgramId = mintAcc?.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  const mintData = await getMint(connection, mintPk, undefined, tokenProgramId);
  const decimals = mintData.decimals;

  const sourceAta = await getAssociatedTokenAddress(mintPk, buyer, false, tokenProgramId);
  const destAta = await getAssociatedTokenAddress(mintPk, treasury, false, tokenProgramId);

  const ixs: TransactionInstruction[] = [];
  const memoIx = memoUtf8 ? ecosystemOtcMemoInstruction(memoUtf8.trim()) : null;
  if (memoIx) ixs.push(memoIx);

  const srcInfo = await connection.getAccountInfo(sourceAta);
  if (!srcInfo) {
    ixs.push(
      createAssociatedTokenAccountIdempotentInstructionWithDerivation(
        buyer,
        buyer,
        mintPk,
        false,
        tokenProgramId,
      ),
    );
  }

  const dstInfo = await connection.getAccountInfo(destAta);
  if (!dstInfo) {
    ixs.push(
      createAssociatedTokenAccountIdempotentInstructionWithDerivation(
        buyer,
        treasury,
        mintPk,
        false,
        tokenProgramId,
      ),
    );
  }

  ixs.push(
    createTransferCheckedInstruction(
      sourceAta,
      mintPk,
      destAta,
      buyer,
      usdcMicro,
      decimals,
      [],
      tokenProgramId,
    ),
  );

  const msg = new TransactionMessage({
    payerKey: buyer,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  return { transaction: new VersionedTransaction(msg), blockhash, lastValidBlockHeight };
}
