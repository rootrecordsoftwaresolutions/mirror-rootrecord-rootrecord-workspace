import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Adapter, WalletError } from "@solana/wallet-adapter-base";
import { WalletNotReadyError } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useStandardWalletAdapters } from "@solana/wallet-standard-wallet-adapter-react";
import { JupiterWalletAdapter, JupiterWalletName } from "@/lib/jupiterWalletAdapter";
import {
  LocalKeypairWalletAdapter,
  LocalKeypairWalletName,
} from "@/lib/localKeypairAdapter";
import { RPC_URL } from "@/lib/solana";

const LkContext = createContext<{
  importLocalKeypair: (raw: string) => void;
} | null>(null);

export function useLocalKeypairImport() {
  const c = useContext(LkContext);
  if (!c) {
    throw new Error("useLocalKeypairImport must be under SolanaProviders");
  }
  return c;
}

function walletErrorHandler(error: WalletError, adapter?: Adapter) {
  console.error("Wallet error", error, adapter?.name);
  if (
    error instanceof WalletNotReadyError &&
    adapter &&
    typeof window !== "undefined" &&
    adapter.name !== JupiterWalletName
  ) {
    window.open(adapter.url, "_blank");
  }
}

function LkInner({
  localAdapter,
  children,
}: {
  localAdapter: LocalKeypairWalletAdapter;
  children: React.ReactNode;
}) {
  const { select, connected, wallet, disconnect } = useWallet();
  const importLocalKeypair = useCallback(
    (raw: string) => {
      void (async () => {
        if (connected && wallet?.adapter.name !== LocalKeypairWalletName) {
          await disconnect();
        }
        await select(LocalKeypairWalletName);
        localAdapter.setKeypairFromSecretString(raw);
      })();
    },
    [connected, disconnect, localAdapter, select, wallet],
  );
  return (
    <LkContext.Provider value={{ importLocalKeypair }}>{children}</LkContext.Provider>
  );
}

function WalletShell({
  localAdapter,
  children,
}: {
  localAdapter: LocalKeypairWalletAdapter;
  children: React.ReactNode;
}) {
  return (
    <WalletModalProvider>
      <LkInner localAdapter={localAdapter}>{children}</LkInner>
    </WalletModalProvider>
  );
}

export function SolanaProviders({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => RPC_URL, []);
  const [localAdapter] = useState(() => new LocalKeypairWalletAdapter());
  const [legacy, setLegacy] = useState([
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new JupiterWalletAdapter(),
  ]);
  useEffect(() => {
    setLegacy([
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new JupiterWalletAdapter(),
    ]);
  }, []);

  const withStandard = useStandardWalletAdapters(legacy);
  const wallets = useMemo(
    () => [localAdapter, ...withStandard],
    [localAdapter, withStandard],
  );
  const onWalletError = useCallback(walletErrorHandler, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false} onError={onWalletError}>
        <WalletShell localAdapter={localAdapter}>{children}</WalletShell>
      </WalletProvider>
    </ConnectionProvider>
  );
}
