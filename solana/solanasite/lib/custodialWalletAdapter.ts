/**
 * Wallet adapter that signs via rootrecord-primary custodial key (server-side) after portal login.
 */
import type { SendTransactionOptions, WalletName } from '@solana/wallet-adapter-base';
import {
  BaseMessageSignerWalletAdapter,
  isVersionedTransaction,
  scopePollingDetectionStrategy,
  WalletConnectionError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletReadyState,
  WalletSignMessageError,
  WalletSignTransactionError,
} from '@solana/wallet-adapter-base';
import type { Connection, SendOptions, TransactionSignature, TransactionVersion } from '@solana/web3.js';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

import {
  emitCustodialNeedsAuth,
  fetchCustodialInfo,
  getPortalToken,
  getRootRecordApiBase,
} from '@/lib/rootrecordSession';

export const RootRecordWebWalletName = 'RootRecord (web)' as WalletName<'RootRecord (web)'>;

function u8ToB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function b64ToU8(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signTransactionWithCustodialServer<T extends Transaction | VersionedTransaction>(
  token: string,
  transaction: T,
): Promise<T> {
  const base = getRootRecordApiBase();
  if (!base) throw new Error('Account API is not configured');

  let wire: Uint8Array;
  if (isVersionedTransaction(transaction)) {
    // VersionedTransaction.serialize() has no options in @solana/web3.js 1.9x
    wire = transaction.serialize();
  } else {
    const w = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
    wire = w instanceof Uint8Array ? w : new Uint8Array(w);
  }

  const res = await fetch(`${base}/v1/me/custodial-sol-wallet/sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ transaction_b64: u8ToB64(wire) }),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const d = j.detail;
    throw new Error(typeof d === 'string' ? d : 'Could not sign transaction on server');
  }
  const outB64 = j.signed_transaction_b64;
  if (typeof outB64 !== 'string' || !outB64) throw new Error('No signed transaction from server');

  const bytes = b64ToU8(outB64);
  if (isVersionedTransaction(transaction)) {
    return VersionedTransaction.deserialize(bytes) as T;
  }
  return Transaction.from(bytes) as T;
}

export class CustodialWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = RootRecordWebWalletName;
  url = 'https://rootrecord.info/account.html';
  icon = 'https://rootrecord.info/favicon-180.png';
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(['legacy', 0]);

  private _connecting = false;
  private _publicKey: PublicKey | null = null;
  private _readyState: WalletReadyState = WalletReadyState.Unsupported;

  constructor() {
    super();
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this._readyState = WalletReadyState.Unsupported;
      return;
    }
    if (!getRootRecordApiBase()) {
      this._readyState = WalletReadyState.Unsupported;
      return;
    }
    this._readyState = WalletReadyState.Installed;
    scopePollingDetectionStrategy(() => {
      if (getRootRecordApiBase()) {
        this._readyState = WalletReadyState.Installed;
        this.emit('readyStateChange', this._readyState);
        return true;
      }
      return false;
    });
  }

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  get readyState() {
    return this._readyState;
  }

  async connect(): Promise<void> {
    if (this.connected || this._connecting) return;
    if (this._readyState === WalletReadyState.Unsupported) {
      throw new WalletNotReadyError();
    }
    this._connecting = true;
    try {
      const token = getPortalToken();
      if (!token) {
        emitCustodialNeedsAuth();
        throw new WalletConnectionError(
          'Sign in to your RootRecord account first (email/password from rootrecord.info).',
        );
      }
      const info = await fetchCustodialInfo(token);
      if (!info) {
        throw new WalletConnectionError('Session invalid or account API unreachable. Sign in again.');
      }
      if (!info.custodial_enabled) {
        throw new WalletConnectionError('Web wallet signing is not enabled on the server yet.');
      }
      if (!info.has_wallet || !info.public_key) {
        throw new WalletConnectionError(
          'No web wallet on file. Open rootrecord.info → Account → create a web wallet, then return here.',
        );
      }
      let pk: PublicKey;
      try {
        pk = new PublicKey(info.public_key);
      } catch {
        throw new WalletPublicKeyError('Invalid custodial public key from server');
      }
      this._publicKey = pk;
      this.emit('connect', pk);
    } catch (e: unknown) {
      const err = e as { message?: string; name?: string };
      if (e instanceof Error && /WalletConnectionError|WalletPublicKeyError|WalletNotReadyError/.test(e.name)) {
        throw e;
      }
      throw new WalletConnectionError(err?.message || 'Could not connect web wallet', e);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._publicKey = null;
    this.emit('disconnect');
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    const token = getPortalToken();
    if (!this.publicKey || !token) throw new WalletNotConnectedError();
    try {
      return await signTransactionWithCustodialServer(token, transaction);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign failed';
      throw new WalletSignTransactionError(msg, e);
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    const out: T[] = [];
    for (const tx of transactions) {
      out.push(await this.signTransaction(tx));
    }
    return out;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const token = getPortalToken();
    if (!this.publicKey || !token) throw new WalletNotConnectedError();
    const base = getRootRecordApiBase();
    if (!base) throw new WalletSignMessageError('Account API is not configured');
    let b64: string;
    try {
      b64 = u8ToB64(message);
    } catch (e) {
      throw new WalletSignMessageError('Could not encode message', e);
    }
    const res = await fetch(`${base}/v1/me/custodial-sol-wallet/sign-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message_b64: b64 }),
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const d = j.detail;
      throw new WalletSignMessageError(typeof d === 'string' ? d : 'Sign message failed', undefined);
    }
    const sigB64 = j.signature_b64;
    if (typeof sigB64 !== 'string' || !sigB64) {
      throw new WalletSignMessageError('No signature from server', undefined);
    }
    return b64ToU8(sigB64);
  }

  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options: SendTransactionOptions = {},
  ): Promise<TransactionSignature> {
    const { signers, ...sendOptions } = options;
    if (isVersionedTransaction(transaction)) {
      if (signers?.length) {
        signers.forEach((s) => {
          (transaction as VersionedTransaction).sign([s]);
        });
      }
    } else {
      if (signers?.length) (transaction as Transaction).partialSign(...signers);
    }
    const signed = await this.signTransaction(transaction);
    const raw = isVersionedTransaction(signed)
      ? signed.serialize()
      : signed.serialize();
    return connection.sendRawTransaction(raw, sendOptions as SendOptions);
  }
}
