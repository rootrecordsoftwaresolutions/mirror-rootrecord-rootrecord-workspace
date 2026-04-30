'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Loader2, RefreshCw, Shield } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { WalletMultiButton } from '@/components/wallet/WalletButton';
import { explorerUrl } from '@/lib/solana';

type ActionRow = {
  /** `solana_site.id` or synthetic `otc:<payment_sig>`. */
  id: number | string;
  /** Present when row comes from `ecosystem_otc_fulfillments` (merged in Worker). */
  source?: 'site' | 'otc_purchase';
  created_at: string;
  wallet: string;
  action: string;
  network: string | null;
  route: string | null;
  signature: string | null;
  metadata: unknown;
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin);
}

function formatMeta(meta: unknown): string {
  if (meta == null) return '—';
  if (typeof meta === 'object') {
    try {
      return JSON.stringify(meta);
    } catch {
      return String(meta);
    }
  }
  return String(meta);
}

function actionDisplayLabel(row: ActionRow): string {
  if (row.source === 'otc_purchase' || row.action === 'otc_checkout') {
    return 'Treasury transfer';
  }
  return row.action;
}

function rowReactKey(row: ActionRow): string {
  return typeof row.id === 'number' ? `site-${row.id}` : String(row.id);
}

export default function MyActionsPage() {
  const { publicKey, signMessage, connected } = useWallet();
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ActionRow[] | null>(null);

  async function loadActions() {
    if (!connected || !publicKey) {
      toast.error('Connect your wallet first');
      return;
    }
    if (!signMessage) {
      toast.error('This wallet does not support sign message');
      return;
    }

    setBusy(true);
    setRows(null);
    try {
      const chRes = await fetch('/api/solana-site/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const chJson = (await chRes.json()) as { ok?: boolean; message?: string; detail?: string; skipped?: boolean };

      if (chRes.status === 503 || chJson.skipped) {
        throw new Error(
          chJson.detail ||
            'Action history is not configured on this deployment yet.',
        );
      }
      if (!chRes.ok || !chJson.message) {
        throw new Error(chJson.detail || 'Could not start wallet check');
      }

      const message = chJson.message;
      const encoded = new TextEncoder().encode(message);
      const sigBytes = await signMessage(encoded);
      const signature = bytesToBase64(sigBytes);

      const listRes = await fetch('/api/solana-site/my-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          message,
          signature,
          limit: 100,
        }),
      });
      const listJson = (await listRes.json()) as {
        ok?: boolean;
        actions?: ActionRow[];
        detail?: string;
        skipped?: boolean;
      };

      if (listRes.status === 503 || listJson.skipped) {
        throw new Error(
          listJson.detail ||
            'Action history is not configured on this deployment yet.',
        );
      }
      if (!listRes.ok || !listJson.ok) {
        throw new Error(listJson.detail || 'Could not load actions');
      }

      setRows(listJson.actions ?? []);
      toast.success('Loaded your recent actions');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container py-14 md:py-20 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Account
          </div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">My actions</h1>
          <p className="mt-4 text-muted-foreground max-w-xl leading-relaxed">
            We never see your private key. You sign a short text once per refresh to prove you
            control the wallet — then we show tool activity and{' '}
            <strong className="text-foreground">Treasury Transfer Tool purchases</strong> for that address.
          </p>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-3 shrink-0">
          <WalletMultiButton />
          <Button
            type="button"
            onClick={() => void loadActions()}
            disabled={busy || !connected || !signMessage}
            className="w-full sm:w-auto"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Working…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sign &amp; load
              </>
            )}
          </Button>
        </div>
      </div>

      <Card className="mt-10 border-border/80">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-sol-green" />
            <CardTitle className="text-lg">Signed read</CardTitle>
          </div>
          <CardDescription>
            Each load uses a fresh one-time challenge stored on our side. Your signature is
            checked with standard Ed25519 verification before any rows are returned.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows === null ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">
              Connect your wallet, then tap <strong className="text-foreground">Sign &amp; load</strong>.
            </p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">
              No logged activity for this wallet yet. Use create, tools, liquidity, bulk sends, or
              the Treasury Transfer Tool — then try again.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Tx</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={rowReactKey(r)} className="border-t border-border/70">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap align-top">
                        {r.created_at}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs align-top">{actionDisplayLabel(r)}</td>
                      <td className="px-4 py-3 text-xs align-top text-muted-foreground">
                        {r.route || '—'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {r.signature ? (
                          <a
                            href={explorerUrl(r.signature, 'tx')}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-sol-green hover:underline"
                          >
                            {r.signature.slice(0, 10)}…
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px] align-top break-all">
                        {formatMeta(r.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
