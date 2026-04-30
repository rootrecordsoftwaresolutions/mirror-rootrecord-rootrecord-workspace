import BN from 'bn.js';
import {
  CREATE_CPMM_POOL_FEE_ACC,
  CREATE_CPMM_POOL_PROGRAM,
  DEVNET_PROGRAM_ID,
  Percent,
  Raydium,
  TxVersion,
  getCpmmPdaAmmConfigId,
  type ApiV3PoolInfoItem,
  type ApiV3PoolInfoStandardItemCpmm,
} from '@raydium-io/raydium-sdk-v2';
import { getMint, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';

import { decimalStringToRawAmount } from '@/lib/bulkSol';
import { appendReferralMemoIfEligible } from '@/lib/referralMemo';
import {
  getConnection,
  resolveMintAndProgram,
  SOLANA_NETWORK,
  explorerUrl,
  platformFeeTransferInstructions,
  sendSimpleTx,
  confirmSignatureSucceeded,
  ADD_LIQUIDITY_FEE_SOL,
  LAUNCH_FEE_SOL,
  REMOVE_LIQUIDITY_FEE_SOL,
} from '@/lib/solana';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** Mainnet USDC (legacy SPL). */
const MAINNET_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** Common devnet USDC mint when no deployment-specific USDC mint is set. */
const DEVNET_USDC_DEFAULT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEGERXfW9vpM8Xo';

export type CpmmMintPick = {
  address: string;
  decimals: number;
  programId: string;
};

export type LaunchQuoteKind = 'wsol' | 'usdc' | 'custom';

function toRaydiumCluster(): 'mainnet' | 'devnet' {
  return SOLANA_NETWORK === 'devnet' ? 'devnet' : 'mainnet';
}

const CPMM_PROGRAM_IDS = new Set([
  CREATE_CPMM_POOL_PROGRAM.toBase58(),
  DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM.toBase58(),
]);

export function isCpmmPoolItem(
  pool: ApiV3PoolInfoItem,
): pool is ApiV3PoolInfoStandardItemCpmm {
  return CPMM_PROGRAM_IDS.has(pool.programId);
}

function wrapSignAllTransactions(wallet: WalletContextState) {
  if (wallet.signAllTransactions) {
    return wallet.signAllTransactions.bind(wallet) as <
      T extends Transaction | VersionedTransaction,
    >(
      txs: T[],
    ) => Promise<T[]>;
  }
  if (!wallet.signTransaction) return undefined;
  return async <T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]> => {
    const out: T[] = [];
    for (const tx of txs) {
      out.push(
        (await wallet.signTransaction!(
          tx as Parameters<NonNullable<WalletContextState['signTransaction']>>[0],
        )) as T,
      );
    }
    return out;
  };
}

async function mintToCpmmPick(mintAddress: string): Promise<CpmmMintPick> {
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  const mintInfo = await getMint(
    getConnection(),
    mint,
    undefined,
    programId,
  );
  return {
    address: mint.toBase58(),
    decimals: mintInfo.decimals,
    programId: programId.toBase58(),
  };
}

function wsolPick(): CpmmMintPick {
  return {
    address: WSOL_MINT,
    decimals: 9,
    programId: TOKEN_PROGRAM_ID.toBase58(),
  };
}

function configuredUsdcMint(): string {
  const trimmed = (
    import.meta.env.VITE_LAUNCH_USDC_MINT as string | undefined
  )?.trim();
  if (trimmed) return trimmed;
  return SOLANA_NETWORK === 'devnet' ? DEVNET_USDC_DEFAULT : MAINNET_USDC;
}

async function quotePickForKind(
  kind: LaunchQuoteKind,
  customMint?: string,
): Promise<CpmmMintPick> {
  if (kind === 'wsol') return wsolPick();
  if (kind === 'usdc') return mintToCpmmPick(configuredUsdcMint());
  const m = customMint?.trim();
  if (!m) throw new Error('Enter the quote token mint for “Other token”');
  return mintToCpmmPick(m);
}

/** Raydium CPMM requires mint A < mint B lexicographically; amounts follow that order. */
function orderCpmmPair(
  mintX: CpmmMintPick,
  amountX: BN,
  mintY: CpmmMintPick,
  amountY: BN,
): [CpmmMintPick, CpmmMintPick, BN, BN] {
  const cmp = mintX.address.localeCompare(mintY.address);
  if (cmp < 0) return [mintX, mintY, amountX, amountY];
  if (cmp > 0) return [mintY, mintX, amountY, amountX];
  throw new Error('Cannot create a pool between a mint and itself');
}

async function sendPlatformFeeSol(
  wallet: WalletContextState,
  amountSol: number,
  referrer: string | null | undefined,
): Promise<string | null> {
  if (!wallet.publicKey || amountSol <= 0) return null;
  const ixs: TransactionInstruction[] = platformFeeTransferInstructions(
    wallet.publicKey,
    amountSol,
    referrer ?? null,
  );
  appendReferralMemoIfEligible(ixs, wallet.publicKey, referrer ?? null);
  if (!ixs.length) return null;
  return sendSimpleTx(wallet, ixs);
}

async function sendLaunchPlatformFee(
  wallet: WalletContextState,
  referrer: string | null | undefined,
): Promise<string | null> {
  return sendPlatformFeeSol(wallet, LAUNCH_FEE_SOL, referrer);
}

async function sendAddLiquidityPlatformFee(
  wallet: WalletContextState,
  referrer: string | null | undefined,
): Promise<string | null> {
  return sendPlatformFeeSol(wallet, ADD_LIQUIDITY_FEE_SOL, referrer);
}

async function sendRemoveLiquidityPlatformFee(
  wallet: WalletContextState,
  referrer: string | null | undefined,
): Promise<string | null> {
  return sendPlatformFeeSol(wallet, REMOVE_LIQUIDITY_FEE_SOL, referrer);
}

/**
 * Create a Raydium CPMM pool: your base mint vs SOL, USDC, or another SPL / Token-2022 mint.
 * Optionally sends a prior legacy tx for the RootRecord launch fee + referral memo.
 */
async function loadRaydiumForOwner(wallet: WalletContextState) {
  if (!wallet.publicKey) {
    throw new Error('Connect your wallet first');
  }
  const signAll = wrapSignAllTransactions(wallet);
  if (!signAll) {
    throw new Error('Wallet must support signing transactions');
  }
  const connection = getConnection();
  const cluster = toRaydiumCluster();
  const raydium = await Raydium.load({
    connection,
    cluster,
    owner: wallet.publicKey,
    signAllTransactions: signAll,
    disableLoadToken: true,
  });
  return { raydium, connection, cluster, signAll };
}

/** Raydium SDK with a local keypair (server-side treasury). */
export async function loadRaydiumForKeypair(owner: Keypair) {
  const connection = getConnection();
  const cluster = toRaydiumCluster();
  const signAllTransactions = async <T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]> => {
    for (const tx of txs) {
      if (tx instanceof VersionedTransaction) {
        tx.sign([owner]);
      } else {
        tx.partialSign(owner);
      }
    }
    return txs;
  };
  const raydium = await Raydium.load({
    connection,
    cluster,
    owner: owner.publicKey,
    signAllTransactions,
    disableLoadToken: true,
  });
  return { raydium, connection, cluster };
}

/**
 * Add CPMM liquidity signed by a keypair (no RootRecord add-liquidity platform fee — for treasury transfer auto-LP).
 */
export async function addCpmmLiquidityWithKeypair(
  owner: Keypair,
  params: {
    poolId: string;
    inputAmount: BN;
    baseIn: boolean;
    slippageBps?: number;
  },
): Promise<{ txId: string }> {
  const { raydium } = await loadRaydiumForKeypair(owner);
  const trimmed = params.poolId.trim();
  if (!trimmed) throw new Error('Enter a pool address');
  try {
    new PublicKey(trimmed);
  } catch {
    throw new Error('Invalid pool address');
  }
  const list = await raydium.api.fetchPoolById({ ids: trimmed });
  const poolInfo = list.find(isCpmmPoolItem);
  if (!poolInfo) {
    throw new Error(
      'Pool not found or not a Raydium CPMM pool on this cluster — check the address and network.',
    );
  }
  if (params.inputAmount.lte(new BN(0))) {
    throw new Error('Liquidity input amount must be positive');
  }
  const bps = params.slippageBps ?? 100;
  const slippage = new Percent(new BN(bps), new BN(10_000));

  const { execute } = await raydium.cpmm.addLiquidity({
    poolInfo,
    inputAmount: params.inputAmount,
    baseIn: params.baseIn,
    slippage,
    txVersion: TxVersion.V0,
  });
  const { txId } = await execute({ sendAndConfirm: true });
  if (!txId) throw new Error('Add-liquidity transaction was not submitted');
  await confirmSignatureSucceeded(txId, 'confirmed');
  return { txId };
}

/** Resolve a Raydium CPMM pool from the public API (pool id = pool state address). */
export async function fetchCpmmPoolById(
  wallet: WalletContextState,
  poolId: string,
): Promise<ApiV3PoolInfoStandardItemCpmm> {
  const { raydium } = await loadRaydiumForOwner(wallet);
  const trimmed = poolId.trim();
  if (!trimmed) throw new Error('Enter a pool address');
  try {
    new PublicKey(trimmed);
  } catch {
    throw new Error('Invalid pool address');
  }
  const list = await raydium.api.fetchPoolById({ ids: trimmed });
  const pool = list.find(isCpmmPoolItem);
  if (!pool) {
    throw new Error(
      'Pool not found or not a Raydium CPMM pool on this cluster — check the address and network.',
    );
  }
  return pool;
}

/** Add liquidity to an existing Raydium CPMM pool (same program as “create pool”). */
export async function addCpmmLiquidity(
  wallet: WalletContextState,
  params: {
    poolId: string;
    /** Human amount for the side indicated by baseIn */
    amountHuman: string;
    /** true = amount is mint A, false = mint B (Raydium lexicographic order) */
    baseIn: boolean;
    /** Slippage in basis points (default 50 = 0.5%) */
    slippageBps?: number;
    referrer?: string | null;
  },
): Promise<{ feeTxId: string | null; txId: string }> {
  const feeTxId = await sendAddLiquidityPlatformFee(wallet, params.referrer);

  const { raydium } = await loadRaydiumForOwner(wallet);
  const trimmed = params.poolId.trim();
  if (!trimmed) throw new Error('Enter a pool address');
  try {
    new PublicKey(trimmed);
  } catch {
    throw new Error('Invalid pool address');
  }
  const list = await raydium.api.fetchPoolById({ ids: trimmed });
  const poolInfo = list.find(isCpmmPoolItem);
  if (!poolInfo) {
    throw new Error(
      'Pool not found or not a Raydium CPMM pool on this cluster — check the address and network.',
    );
  }
  const dec = poolInfo[params.baseIn ? 'mintA' : 'mintB'].decimals;
  const raw = decimalStringToRawAmount(params.amountHuman.trim(), dec);
  const inputAmount = new BN(raw.toString());
  if (inputAmount.lte(new BN(0))) {
    throw new Error('Enter a positive amount');
  }
  const bps = params.slippageBps ?? 50;
  const slippage = new Percent(new BN(bps), new BN(10_000));

  const { execute } = await raydium.cpmm.addLiquidity({
    poolInfo,
    inputAmount,
    baseIn: params.baseIn,
    slippage,
    txVersion: TxVersion.V0,
  });
  const { txId } = await execute({ sendAndConfirm: true });
  if (!txId) throw new Error('Add-liquidity transaction was not submitted');
  await confirmSignatureSucceeded(txId, 'confirmed');
  return { feeTxId, txId };
}

/** Remove liquidity by burning LP from an existing Raydium CPMM pool. */
export async function removeCpmmLiquidity(
  wallet: WalletContextState,
  params: {
    poolId: string;
    /** Human amount of LP tokens to burn (pool LP mint decimals). */
    lpAmountHuman: string;
    slippageBps?: number;
    referrer?: string | null;
  },
): Promise<{ feeTxId: string | null; txId: string }> {
  const feeTxId = await sendRemoveLiquidityPlatformFee(wallet, params.referrer);

  const { raydium } = await loadRaydiumForOwner(wallet);
  const trimmed = params.poolId.trim();
  if (!trimmed) throw new Error('Enter a pool address');
  try {
    new PublicKey(trimmed);
  } catch {
    throw new Error('Invalid pool address');
  }
  const list = await raydium.api.fetchPoolById({ ids: trimmed });
  const poolInfo = list.find(isCpmmPoolItem);
  if (!poolInfo) {
    throw new Error(
      'Pool not found or not a Raydium CPMM pool on this cluster — check the address and network.',
    );
  }
  const dec = poolInfo.lpMint.decimals;
  const raw = decimalStringToRawAmount(params.lpAmountHuman.trim(), dec);
  const lpAmount = new BN(raw.toString());
  if (lpAmount.lte(new BN(0))) {
    throw new Error('Enter a positive LP amount');
  }
  const bps = params.slippageBps ?? 50;
  const slippage = new Percent(new BN(bps), new BN(10_000));

  const { execute } = await raydium.cpmm.withdrawLiquidity({
    poolInfo,
    lpAmount,
    slippage,
    txVersion: TxVersion.V0,
  });
  const { txId } = await execute({ sendAndConfirm: true });
  if (!txId) throw new Error('Remove-liquidity transaction was not submitted');
  await confirmSignatureSucceeded(txId, 'confirmed');
  return { feeTxId, txId };
}

export async function createCpmmPoolWithQuote(
  wallet: WalletContextState,
  params: {
    baseMint: string;
    tokenAmount: string;
    quoteKind: LaunchQuoteKind;
    /** Required when `quoteKind` is `custom`. */
    quoteMint?: string;
    /** Human amount for the quote side (quote mint decimals). */
    quoteAmount: string;
    referrer?: string | null;
  },
): Promise<{ feeTxId: string | null; poolTxId: string; poolId: string }> {
  const feeTxId = await sendLaunchPlatformFee(wallet, params.referrer);

  const { raydium, connection, cluster } = await loadRaydiumForOwner(wallet);

  const base = await mintToCpmmPick(params.baseMint.trim());
  const quote = await quotePickForKind(params.quoteKind, params.quoteMint);

  const rawBase = decimalStringToRawAmount(
    params.tokenAmount.trim(),
    base.decimals,
  );
  const rawQuote = decimalStringToRawAmount(
    params.quoteAmount.trim(),
    quote.decimals,
  );

  const bnBase = new BN(rawBase.toString());
  const bnQuote = new BN(rawQuote.toString());

  const [mintA, mintB, mintAAmount, mintBAmount] = orderCpmmPair(
    base,
    bnBase,
    quote,
    bnQuote,
  );

  const useSolBalance =
    mintA.address === WSOL_MINT || mintB.address === WSOL_MINT;

  let feeConfigs = await raydium.api.getCpmmConfigs();
  if (cluster === 'devnet') {
    feeConfigs = feeConfigs.map((config) => ({
      ...config,
      id: getCpmmPdaAmmConfigId(
        DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
        config.index,
      ).publicKey.toBase58(),
    }));
  }
  if (!feeConfigs.length) {
    throw new Error('No CPMM fee configs returned from Raydium API');
  }

  const programId =
    cluster === 'devnet'
      ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM
      : CREATE_CPMM_POOL_PROGRAM;
  const poolFeeAccount =
    cluster === 'devnet'
      ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC
      : CREATE_CPMM_POOL_FEE_ACC;

  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId,
    poolFeeAccount,
    mintA,
    mintB,
    mintAAmount,
    mintBAmount,
    startTime: new BN(0),
    feeConfig: feeConfigs[0],
    associatedOnly: false,
    ownerInfo: {
      useSOLBalance: useSolBalance,
    },
    txVersion: TxVersion.V0,
  });

  const { txId: poolTxId } = await execute({ sendAndConfirm: true });
  if (!poolTxId) {
    throw new Error('Pool transaction was not submitted');
  }
  // Raydium SDK V0 + wallet: `execute` sends but does not wait or surface errors.
  await confirmSignatureSucceeded(poolTxId, 'confirmed');

  return {
    feeTxId,
    poolTxId,
    poolId: extInfo.address.poolId.toBase58(),
  };
}

export { explorerUrl };
