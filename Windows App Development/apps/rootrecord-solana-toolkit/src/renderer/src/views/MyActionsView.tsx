import { useWallet } from "@solana/wallet-adapter-react";

const V = import.meta.env;

export function MyActionsView() {
  const { publicKey, connected } = useWallet();
  const o = (V.VITE_WORKER_API_ORIGIN as string | undefined)?.replace(/\/$/, "");
  const secret = (V.VITE_SOLANA_SITE_LOG_SECRET as string | undefined)?.trim();

  if (!connected || !publicKey) {
    return (
      <div className="container py-14 text-muted-foreground">
        Connect a wallet to use My actions (server-backed list).
      </div>
    );
  }
  if (!o) {
    return (
      <div className="container py-14 max-w-2xl text-muted-foreground">
        Set <code className="text-sol-purple">VITE_WORKER_API_ORIGIN</code> to load
        challenges and history from the same Worker as the website.
      </div>
    );
  }

  return (
    <div className="container py-14 max-w-2xl">
      <h1 className="font-display text-3xl">My actions</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Wallet: {publicKey.toBase58().slice(0, 4)}… — challenge-based auth matches
        the site implementation in{" "}
        <code className="text-xs">solana-site-read.ts</code>. Full UI port is
        optional; use the web app for the complete signed flow, or add Vite routes
        that POST to <code className="text-xs">/api/solana-site/challenge</code> and{" "}
        <code className="text-xs">/api/solana-site/my-actions</code> with the same
        message format.
      </p>
      <p className="mt-4 text-xs text-muted-foreground break-all">
        origin={o} secret_set={Boolean(secret)}
      </p>
    </div>
  );
}
