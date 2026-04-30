import {
  BaseMessageSignerWalletAdapter,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletSignTransactionError,
  WalletReadyState,
  isVersionedTransaction,
  type WalletName,
} from '@solana/wallet-adapter-base';
import {
  type Transaction,
  type VersionedTransaction,
  type TransactionVersion,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export const LocalKeypairWalletName = 'Local keypair (import)' as WalletName<'Local keypair (import)'>;

function decodeToSecretKey(raw: string): Uint8Array {
  const t = raw.trim();
  if (!t) throw new Error('Empty key');
  if (t.startsWith('[')) {
    const arr = JSON.parse(t) as number[];
    if (!Array.isArray(arr) || (arr.length !== 32 && arr.length !== 64)) {
      throw new Error('JSON key must be 32 or 64 numbers (seed or full secret key)');
    }
    if (arr.length > 64) {
      throw new Error('Key too long — if you see this, the JSON array is invalid');
    }
    return Uint8Array.from(arr);
  }
  if (/^[0-9a-fA-F]+$/.test(t) && t.length === 128) {
    const out = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      out[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  return bs58.decode(t);
}

/**
 * In-memory only; never written to disk. For desktop use when extension wallets
 * are unavailable in Electron.
 */
export class LocalKeypairWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = LocalKeypairWalletName;
  url = 'https://solana.com';
  icon = 'https://raw.githubusercontent.com/solana-foundation/brand/master/src/svg/logo-animated.svg';
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set<TransactionVersion>([
    'legacy',
    0,
  ]);

  private _kp: Keypair | null = null;
  private _connecting = false;

  get publicKey(): PublicKey | null {
    return this._kp?.publicKey ?? null;
  }
  get connecting() {
    return this._connecting;
  }
  get readyState() {
    return WalletReadyState.Loadable;
  }

  /** Set key and mark connected. */
  setKeypairFromSecretString(raw: string): void {
    const u8 = decodeToSecretKey(raw);
    this._kp =
      u8.length === 64 ? Keypair.fromSecretKey(u8) : Keypair.fromSeed(u8);
    this.emit('connect', this._kp!.publicKey);
  }

  async connect(): Promise<void> {
    if (this._connecting) return;
    this._connecting = true;
    try {
      if (this._kp) {
        this.emit('connect', this._kp.publicKey);
        return;
      }
      throw new WalletNotReadyError();
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._kp = null;
    this.emit('disconnect');
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this._kp) throw new WalletNotConnectedError();
    try {
      if (isVersionedTransaction(tx)) {
        const signed = tx;
        signed.sign([this._kp!]);
        return signed as T;
      }
      const leg = tx as Transaction;
      leg.partialSign(this._kp!);
      return leg as T;
    } catch (e) {
      throw new WalletSignTransactionError(e as Error);
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this._kp) throw new WalletNotConnectedError();
    return nacl.sign.detached(message, this._kp.secretKey);
  }
}

export function isLocalKeypairName(name: string | null) {
  return name === LocalKeypairWalletName;
}
