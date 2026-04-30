import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type TransactionSignature,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ExtensionType,
  AccountState,
  getMintLen,
  getMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createInitializeMint2Instruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializeTransferHookInstruction,
  createInitializeNonTransferableMintInstruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeInterestBearingMintInstruction,
  createInitializeDefaultAccountStateInstruction,
  createInitializeMetadataPointerInstruction,
  createWithdrawWithheldTokensFromMintInstruction,
  createWithdrawWithheldTokensFromAccountsInstruction,
  createHarvestWithheldTokensToMintInstruction,
  createSetTransferFeeInstruction,
  getTransferFeeConfig,
} from '@solana/spl-token';
import {
  createInitializeInstruction as createInitializeTokenMetadataInstruction,
  pack,
  type TokenMetadata,
} from '@solana/spl-token-metadata';
import type { WalletContextState } from '@solana/wallet-adapter-react';

import {
  getConnection,
  platformFeeTransferInstructions,
  CREATE_FEE_SOL,
  ACTION_FEE_SOL,
  resolveMintAndProgram,
} from '@/lib/solana';
import { appendReferralMemoIfEligible, appendReferralMemoToTransaction } from '@/lib/referralMemo';

/* ---------------- Types ---------------- */

export interface TransferFeeOptions {
  feeBps: number; // 0–10000
  maxFee: bigint; // raw token units (already factored decimals)
}

export interface TransferHookOptions {
  programId: string; // base58
}

export interface Token2022Extensions {
  transferFee?: TransferFeeOptions;
  transferHook?: TransferHookOptions;
  nonTransferable?: boolean;
  mintCloseAuthority?: boolean;
  permanentDelegate?: boolean;
  interestBearing?: { rateBps: number };
  defaultAccountState?: 'frozen';
}

export interface CreateToken2022Input {
  name: string;
  symbol: string;
  decimals: number;
  supply: bigint;
  uri: string;
  description?: string;
  additionalMetadata?: [string, string][]; // e.g. [['website', '...'], ['twitter', '@x']]
  extensions: Token2022Extensions;
}

export interface CreateToken2022Result {
  signature: TransactionSignature;
  mint: string;
  ata: string;
}

/* ---------------- Helpers ---------------- */

async function assertToken2022ToolMint(mintAddress: string): Promise<PublicKey> {
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  if (!programId.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(
      'This tool only works on Token-2022 mints. Use the legacy revoke / mint / metadata tools for standard SPL tokens.',
    );
  }
  return mint;
}

/** Detect which token program owns a given mint. */
export async function getMintProgramId(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint, 'confirmed');
  if (!info) throw new Error('Mint not found');
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw new Error(
    'That address is not an SPL or Token-2022 mint. Paste the mint from Solscan, not a wallet or random account.',
  );
}

function extensionList(ext: Token2022Extensions): ExtensionType[] {
  const out: ExtensionType[] = [];
  if (ext.transferFee) out.push(ExtensionType.TransferFeeConfig);
  if (ext.transferHook) out.push(ExtensionType.TransferHook);
  if (ext.nonTransferable) out.push(ExtensionType.NonTransferable);
  if (ext.mintCloseAuthority) out.push(ExtensionType.MintCloseAuthority);
  if (ext.permanentDelegate) out.push(ExtensionType.PermanentDelegate);
  if (ext.interestBearing) out.push(ExtensionType.InterestBearingConfig);
  if (ext.defaultAccountState) out.push(ExtensionType.DefaultAccountState);
  // MetadataPointer is always added when using Token-2022 path
  out.push(ExtensionType.MetadataPointer);
  return out;
}

/* ---------------- Create ---------------- */

export async function createToken2022(
  wallet: WalletContextState,
  input: CreateToken2022Input,
  opts?: { referrer?: string | null },
): Promise<CreateToken2022Result> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }
  const connection = getConnection();
  const payer = wallet.publicKey;

  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  // ---- Calculate space for mint + extensions + metadata
  const exts = extensionList(input.extensions);
  const mintLen = getMintLen(exts);

  const tokenMetadata: TokenMetadata = {
    mint,
    name: input.name.slice(0, 32),
    symbol: input.symbol.slice(0, 10),
    uri: input.uri.slice(0, 200),
    additionalMetadata: input.additionalMetadata ?? [],
  };
  // Each TLV stored extension on the mint adds 4 bytes header (TYPE 2 + LEN 2)
  const TYPE_SIZE = 2;
  const LENGTH_SIZE = 2;
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(tokenMetadata).length;

  const totalLamports = await connection.getMinimumBalanceForRentExemption(
    mintLen + metadataLen,
  );

  const ata = await getAssociatedTokenAddress(
    mint,
    payer,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  /* ----- Build TX 1: account + extension inits + InitializeMint + InitializeMetadata ----- */
  const tx1 = new Transaction();

  tx1.add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint,
      space: mintLen,
      lamports: totalLamports, // rent for mint + metadata extra space
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  );

  // ---- Extension initialization (must come before InitializeMint) ----
  if (input.extensions.transferFee) {
    tx1.add(
      createInitializeTransferFeeConfigInstruction(
        mint,
        payer, // transferFeeConfigAuthority
        payer, // withdrawWithheldAuthority
        input.extensions.transferFee.feeBps,
        input.extensions.transferFee.maxFee,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  if (input.extensions.transferHook) {
    let hookPid: PublicKey;
    try {
      hookPid = new PublicKey(input.extensions.transferHook.programId);
    } catch {
      throw new Error('Invalid transfer hook program ID');
    }
    tx1.add(
      createInitializeTransferHookInstruction(
        mint,
        payer, // hook authority
        hookPid,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  if (input.extensions.nonTransferable) {
    tx1.add(
      createInitializeNonTransferableMintInstruction(
        mint,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  if (input.extensions.mintCloseAuthority) {
    tx1.add(
      createInitializeMintCloseAuthorityInstruction(
        mint,
        payer,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  if (input.extensions.permanentDelegate) {
    tx1.add(
      createInitializePermanentDelegateInstruction(
        mint,
        payer,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  if (input.extensions.interestBearing) {
    tx1.add(
      createInitializeInterestBearingMintInstruction(
        mint,
        payer, // rate authority
        input.extensions.interestBearing.rateBps,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  if (input.extensions.defaultAccountState === 'frozen') {
    tx1.add(
      createInitializeDefaultAccountStateInstruction(
        mint,
        AccountState.Frozen,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  // MetadataPointer (always, points to self so the mint hosts its metadata)
  tx1.add(
    createInitializeMetadataPointerInstruction(
      mint,
      payer, // updateAuthority
      mint, // metadataAddress = self
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // InitializeMint2
  tx1.add(
    createInitializeMint2Instruction(
      mint,
      input.decimals,
      payer, // mint authority
      payer, // freeze authority (kept; user can revoke)
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // Initialize TokenMetadata extension data on the mint
  tx1.add(
    createInitializeTokenMetadataInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint,
      updateAuthority: payer,
      mint,
      mintAuthority: payer,
      name: tokenMetadata.name,
      symbol: tokenMetadata.symbol,
      uri: tokenMetadata.uri,
    }),
  );

  /* ----- Build TX 2: ATA + mintTo + fee transfer ----- */
  const tx2 = new Transaction();

  tx2.add(
    createAssociatedTokenAccountInstruction(
      payer,
      ata,
      payer,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // For default-frozen mints we must NOT mint to the ATA (it's frozen).
  // We mint to the ATA only if not default-frozen.
  if (input.extensions.defaultAccountState !== 'frozen') {
    const fullSupply =
      input.supply * BigInt(10) ** BigInt(input.decimals);
    tx2.add(
      createMintToInstruction(
        mint,
        ata,
        payer,
        fullSupply,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  for (const ix of platformFeeTransferInstructions(
    payer,
    CREATE_FEE_SOL,
    opts?.referrer ?? null,
  )) {
    tx2.add(ix);
  }
  appendReferralMemoToTransaction(tx2, payer, opts?.referrer ?? null);

  /* ---- Sign + send sequentially. The mint Keypair signs only TX1. ---- */
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');

  tx1.recentBlockhash = blockhash;
  tx1.feePayer = payer;
  tx1.partialSign(mintKeypair);
  tx2.recentBlockhash = blockhash;
  tx2.feePayer = payer;

  const signed = await wallet.signAllTransactions
    ? await wallet.signAllTransactions!([tx1, tx2])
    : [await wallet.signTransaction!(tx1), await wallet.signTransaction!(tx2)];

  const sig1 = await connection.sendRawTransaction(signed[0].serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });
  await connection.confirmTransaction(
    { signature: sig1, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  const sig2 = await connection.sendRawTransaction(signed[1].serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });
  await connection.confirmTransaction(
    { signature: sig2, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  return { signature: sig2, mint: mint.toBase58(), ata: ata.toBase58() };
}

/* ---------------- Tools (Token-2022 only) ---------------- */

export async function withdrawWithheldFromMint(
  wallet: WalletContextState,
  mintAddress: string,
  destinationOwnerAddress?: string,
  referrerWallet?: string | null,
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction)
    throw new Error('Wallet not connected');
  const connection = getConnection();
  const mint = await assertToken2022ToolMint(mintAddress);

  const destOwner = destinationOwnerAddress
    ? new PublicKey(destinationOwnerAddress)
    : wallet.publicKey;

  const destAta = await getAssociatedTokenAddress(
    mint,
    destOwner,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  const ixs: TransactionInstruction[] = [];
  const destInfo = await connection.getAccountInfo(destAta);
  if (!destInfo) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        destAta,
        destOwner,
        mint,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  ixs.push(
    createWithdrawWithheldTokensFromMintInstruction(
      mint,
      destAta,
      wallet.publicKey, // withdraw authority
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  ixs.push(
    ...platformFeeTransferInstructions(
      wallet.publicKey,
      ACTION_FEE_SOL,
      referrerWallet,
    ),
  );
  appendReferralMemoIfEligible(ixs, wallet.publicKey, referrerWallet);

  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );
  return sig;
}

export async function harvestWithheldToMint(
  wallet: WalletContextState,
  mintAddress: string,
  tokenAccountAddresses: string[],
  referrerWallet?: string | null,
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction)
    throw new Error('Wallet not connected');
  if (!tokenAccountAddresses.length)
    throw new Error('Provide at least one token account');

  const connection = getConnection();
  const mint = await assertToken2022ToolMint(mintAddress);
  const sources = tokenAccountAddresses.map((s) => new PublicKey(s.trim()));

  const ixs: TransactionInstruction[] = [
    createHarvestWithheldTokensToMintInstruction(
      mint,
      sources,
      TOKEN_2022_PROGRAM_ID,
    ),
  ];
  ixs.push(
    ...platformFeeTransferInstructions(
      wallet.publicKey,
      ACTION_FEE_SOL,
      referrerWallet,
    ),
  );
  appendReferralMemoIfEligible(ixs, wallet.publicKey, referrerWallet);

  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );
  return sig;
}

export async function updateTransferFee(
  wallet: WalletContextState,
  mintAddress: string,
  feeBps: number,
  maxFee: bigint,
  referrerWallet?: string | null,
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction)
    throw new Error('Wallet not connected');
  const connection = getConnection();
  const mint = await assertToken2022ToolMint(mintAddress);

  const ixs: TransactionInstruction[] = [
    createSetTransferFeeInstruction(
      mint,
      wallet.publicKey, // transferFeeConfig authority
      [],
      feeBps,
      maxFee,
      TOKEN_2022_PROGRAM_ID,
    ),
  ];
  ixs.push(
    ...platformFeeTransferInstructions(
      wallet.publicKey,
      ACTION_FEE_SOL,
      referrerWallet,
    ),
  );
  appendReferralMemoIfEligible(ixs, wallet.publicKey, referrerWallet);

  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );
  return sig;
}

/* ---------------- Read helpers ---------------- */

export interface MintInfo2022 {
  programId: PublicKey;
  decimals: number;
  transferFee?: { feeBps: number; maxFee: bigint; withheldAmount: bigint };
}

export async function readMintInfo(
  connection: Connection,
  mintAddress: string,
): Promise<MintInfo2022> {
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  const m = await getMint(connection, mint, 'confirmed', programId);
  let transferFee: MintInfo2022['transferFee'];
  if (programId.equals(TOKEN_2022_PROGRAM_ID)) {
    const cfg = getTransferFeeConfig(m);
    if (cfg) {
      transferFee = {
        feeBps: cfg.newerTransferFee.transferFeeBasisPoints,
        maxFee: cfg.newerTransferFee.maximumFee,
        withheldAmount: cfg.withheldAmount,
      };
    }
  }
  return { programId, decimals: m.decimals, transferFee };
}

// Re-export for convenience
export {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createWithdrawWithheldTokensFromAccountsInstruction,
};
