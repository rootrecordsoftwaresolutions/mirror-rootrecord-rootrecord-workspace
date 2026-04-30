import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { NextResponse } from 'next/server';

import { ECOSYSTEM_OTC_TOKEN_MINT } from '@/lib/ecosystemOtcConstants';
import { loadTreasuryKeypair } from '@/lib/ecosystemOtcFulfill';
import { getConnection } from '@/lib/solana';

export const dynamic = 'force-dynamic';

/** Public: deposit treasury address + ecosystem token (RRTT) SPL balance on hand (no secret exposed). */
export async function GET() {
  try {
    const kp = loadTreasuryKeypair();
    const treasury = kp.publicKey.toBase58();
    let rootr_balance_ui: string | null = null;
    try {
      const connection = getConnection();
      const mintPk = new PublicKey(ECOSYSTEM_OTC_TOKEN_MINT);
      const mintAccount = await connection.getAccountInfo(mintPk);
      const tokenProgramId = mintAccount?.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const ata = await getAssociatedTokenAddress(mintPk, kp.publicKey, false, tokenProgramId);
      const bal = await connection.getTokenAccountBalance(ata);
      rootr_balance_ui = bal.value.uiAmountString ?? null;
    } catch {
      rootr_balance_ui = null;
    }
    return NextResponse.json({ ok: true, treasury, rootr_balance_ui });
  } catch {
    return NextResponse.json({ ok: false, configured: false }, { status: 200 });
  }
}
