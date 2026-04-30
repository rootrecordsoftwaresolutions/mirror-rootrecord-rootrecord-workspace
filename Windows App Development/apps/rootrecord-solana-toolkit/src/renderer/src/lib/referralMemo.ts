import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

/** SPL-associated memo program (UTF-8 payload, visible in tx instructions). */
export const REFERRAL_MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
);

/** Prefix for parsers / future payout jobs scanning fee-wallet transactions. */
export const REFERRAL_MEMO_PREFIX = 'RR_REF:v1:';

const MAX_MEMO_UTF8 = 566;

/**
 * Returns a valid referrer base58 address for memo tagging, or null.
 * Rejects invalid pubkeys and self-referrals.
 */
export function eligibleReferrerForPayer(
  referrerRaw: string | null | undefined,
  payer: PublicKey,
): string | null {
  const trimmed = (referrerRaw ?? '').trim();
  if (!trimmed) return null;
  let refPk: PublicKey;
  try {
    refPk = new PublicKey(trimmed);
  } catch {
    return null;
  }
  if (refPk.equals(payer)) return null;
  return trimmed;
}

export function referralMemoInstruction(
  payer: PublicKey,
  referrerB58: string,
): TransactionInstruction | null {
  const payload = `${REFERRAL_MEMO_PREFIX}${referrerB58}`;
  if (payload.length > MAX_MEMO_UTF8) return null;
  return new TransactionInstruction({
    programId: REFERRAL_MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(payload, 'utf8'),
  });
}

/** Append memo after platform-fee + optional referrer SOL transfers (same transaction). */
export function appendReferralMemoIfEligible(
  ixs: TransactionInstruction[],
  payer: PublicKey,
  referrerRaw: string | null | undefined,
): void {
  const ref = eligibleReferrerForPayer(referrerRaw, payer);
  if (!ref) return;
  const memoIx = referralMemoInstruction(payer, ref);
  if (memoIx) ixs.push(memoIx);
}

export function appendReferralMemoToTransaction(
  tx: Transaction,
  payer: PublicKey,
  referrerRaw: string | null | undefined,
): void {
  const ref = eligibleReferrerForPayer(referrerRaw, payer);
  if (!ref) return;
  const memoIx = referralMemoInstruction(payer, ref);
  if (memoIx) tx.add(memoIx);
}
