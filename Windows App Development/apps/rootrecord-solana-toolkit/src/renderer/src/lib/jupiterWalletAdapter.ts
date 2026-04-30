/**
 * Legacy browser-injected adapter for Jupiter Wallet (Chrome extension).
 * Jupiter also registers via Wallet Standard when available; this adapter
 * ensures a clear "Jupiter" entry when the extension exposes the usual flags.
 */
import type { EventEmitter, SendTransactionOptions, WalletName } from '@solana/wallet-adapter-base';
import {
  BaseMessageSignerWalletAdapter,
  isVersionedTransaction,
  scopePollingDetectionStrategy,
  WalletAccountError,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletDisconnectionError,
  WalletError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletReadyState,
  WalletSendTransactionError,
  WalletSignMessageError,
  WalletSignTransactionError,
} from '@solana/wallet-adapter-base';
import type {
  Connection,
  SendOptions,
  Transaction,
  TransactionSignature,
  TransactionVersion,
  VersionedTransaction,
} from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';

interface JupiterWalletEvents {
  connect(...args: unknown[]): unknown;
  disconnect(...args: unknown[]): unknown;
  accountChanged(newPublicKey: PublicKey): unknown;
}

interface JupiterInjected extends EventEmitter<JupiterWalletEvents> {
  isJupiter?: boolean;
  publicKey?: { toBytes(): Uint8Array };
  isConnected: boolean;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
  signAndSendTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    options?: SendOptions,
  ): Promise<{ signature: TransactionSignature }>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey } | void>;
  disconnect(): Promise<void>;
}

interface JupiterWindow extends Window {
  /** Primary namespace used by several Solana wallets */
  jupiter?: JupiterInjected;
  solana?: JupiterInjected;
}

declare const window: JupiterWindow;

function getInjectedJupiterWallet(): JupiterInjected | null {
  if (typeof window === 'undefined') return null;
  if (window.jupiter?.isJupiter) return window.jupiter;
  if (window.solana?.isJupiter) return window.solana;
  return null;
}

export const JupiterWalletName = 'Jupiter' as WalletName<'Jupiter'>;

export class JupiterWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = JupiterWalletName;
  url = 'https://jup.ag/';
  icon = 'https://jup.ag/favicon.ico';
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(['legacy', 0]);

  private _connecting: boolean;
  private _wallet: JupiterInjected | null;
  private _publicKey: PublicKey | null;
  private _readyState: WalletReadyState =
    typeof window === 'undefined' || typeof document === 'undefined'
      ? WalletReadyState.Unsupported
      : WalletReadyState.NotDetected;

  constructor() {
    super();
    this._connecting = false;
    this._wallet = null;
    this._publicKey = null;

    if (this._readyState !== WalletReadyState.Unsupported) {
      scopePollingDetectionStrategy(() => {
        if (getInjectedJupiterWallet()) {
          this._readyState = WalletReadyState.Installed;
          this.emit('readyStateChange', this._readyState);
          return true;
        }
        return false;
      });
    }
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
    try {
      if (this.connected || this.connecting) return;
      if (this._readyState !== WalletReadyState.Installed) throw new WalletNotReadyError();

      this._connecting = true;

      const wallet = getInjectedJupiterWallet();
      if (!wallet) throw new WalletNotReadyError();

      if (!wallet.isConnected) {
        try {
          await wallet.connect();
        } catch (error: unknown) {
          const err = error as { message?: string };
          throw new WalletConnectionError(err?.message, error);
        }
      }

      if (!wallet.publicKey) throw new WalletAccountError();

      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(wallet.publicKey.toBytes());
      } catch (error: unknown) {
        const err = error as { message?: string };
        throw new WalletPublicKeyError(err?.message, error);
      }

      wallet.on('disconnect', this._disconnected);
      wallet.on('accountChanged', this._accountChanged);

      this._wallet = wallet;
      this._publicKey = publicKey;

      this.emit('connect', publicKey);
    } catch (error: unknown) {
      const err = error as WalletError;
      this.emit('error', err);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    const wallet = this._wallet;
    if (wallet) {
      wallet.off('disconnect', this._disconnected);
      wallet.off('accountChanged', this._accountChanged);

      this._wallet = null;
      this._publicKey = null;

      try {
        await wallet.disconnect();
      } catch (error: unknown) {
        const err = error as { message?: string };
        this.emit('error', new WalletDisconnectionError(err?.message, error));
      }
    }

    this.emit('disconnect');
  }

  async sendTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    connection: Connection,
    options: SendTransactionOptions = {},
  ): Promise<TransactionSignature> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();

      try {
        const { signers, ...sendOptions } = options;

        if (isVersionedTransaction(transaction)) {
          signers?.length && transaction.sign(signers);
        } else {
          transaction = (await this.prepareTransaction(
            transaction,
            connection,
            sendOptions,
          )) as T;
          signers?.length && (transaction as Transaction).partialSign(...signers);
        }

        sendOptions.preflightCommitment = sendOptions.preflightCommitment || connection.commitment;

        const { signature } = await wallet.signAndSendTransaction(transaction, sendOptions);
        return signature;
      } catch (error: unknown) {
        if (error instanceof WalletError) throw error;
        const err = error as { message?: string };
        throw new WalletSendTransactionError(err?.message, error);
      }
    } catch (error: unknown) {
      const err = error as WalletError;
      this.emit('error', err);
      throw error;
    }
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();

      try {
        return (await wallet.signTransaction(transaction)) || transaction;
      } catch (error: unknown) {
        const err = error as { message?: string };
        throw new WalletSignTransactionError(err?.message, error);
      }
    } catch (error: unknown) {
      const err = error as WalletError;
      this.emit('error', err);
      throw error;
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[],
  ): Promise<T[]> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();

      try {
        return (await wallet.signAllTransactions(transactions)) || transactions;
      } catch (error: unknown) {
        const err = error as { message?: string };
        throw new WalletSignTransactionError(err?.message, error);
      }
    } catch (error: unknown) {
      const err = error as WalletError;
      this.emit('error', err);
      throw error;
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();

      try {
        const { signature } = await wallet.signMessage(message);
        return signature;
      } catch (error: unknown) {
        const err = error as { message?: string };
        throw new WalletSignMessageError(err?.message, error);
      }
    } catch (error: unknown) {
      const err = error as WalletError;
      this.emit('error', err);
      throw error;
    }
  }

  private _disconnected = () => {
    const wallet = this._wallet;
    if (wallet) {
      wallet.off('disconnect', this._disconnected);
      wallet.off('accountChanged', this._accountChanged);

      this._wallet = null;
      this._publicKey = null;

      this.emit('error', new WalletDisconnectedError());
      this.emit('disconnect');
    }
  };

  private _accountChanged = (newPublicKey: PublicKey) => {
    const publicKey = this._publicKey;
    if (!publicKey) return;

    try {
      newPublicKey = new PublicKey(newPublicKey.toBytes());
    } catch (error: unknown) {
      const err = error as { message?: string };
      this.emit('error', new WalletPublicKeyError(err?.message, error));
      return;
    }

    if (publicKey.equals(newPublicKey)) return;

    this._publicKey = newPublicKey;
    this.emit('connect', newPublicKey);
  };
}
