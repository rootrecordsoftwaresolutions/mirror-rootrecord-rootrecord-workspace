import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Loader2, Layers, Info } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WalletMultiButton } from '@/components/wallet/WalletButton';

import {
  BULK_FEE_PER_100_SOL,
  MAX_BULK_RECIPIENTS,
  bulkPlatformFeeSol,
  bulkTokenFirstTxOverhead,
  bulkTokenNeedsCreatePerRow,
  deriveBulkDestAtas,
  estimateBulkTokenTxCount,
  estimateBulkTxCount,
  parseBulkTransferInput,
  resolveBulkMintContext,
  fetchBulkDestAtaExistence,
  sendBulkSolTransfers,
  sendBulkTokenTransfers,
  explorerUrl,
} from '@/lib/bulkSol';
import { getStoredReferrer, withReferrerMetadata } from '@/lib/referral';
import { getConnection, isFeeWalletConfigured } from '@/lib/solana';
import { logSolanaSiteAction, SiteAction } from '@/lib/actionLog';

type AssetMode = 'sol' | 'token';

const TYPICAL_TOKEN_ACCOUNT_RENT = 2_039_280;

export default function BulkView() {
  const wallet = useWallet();
  const [assetMode, setAssetMode] = useState<AssetMode>('sol');
  const [raw, setRaw] = useState('');
  const [defaultAmount, setDefaultAmount] = useState('0.001');
  const [mintInput, setMintInput] = useState('');
  const [mintBusy, setMintBusy] = useState(false);
  const [mintCtx, setMintCtx] = useState<{
    mint: PublicKey;
    programId: PublicKey;
    decimals: number;
  } | null>(null);
  const [mintErr, setMintErr] = useState<string | null>(null);
  const [ataExists, setAtaExists] = useState<boolean[] | null>(null);
  const [ataBusy, setAtaBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSigs, setLastSigs] = useState<string[]>([]);

  const amountDecimals = assetMode === 'sol' ? 9 : mintCtx ? mintCtx.decimals : -1;

  const parsed = useMemo(
    () => parseBulkTransferInput(raw, defaultAmount.trim() || null, amountDecimals),
    [raw, defaultAmount, amountDecimals],
  );

  const recipientsKey = useMemo(
    () => parsed.rows.map((r) => r.to.toBase58()).join('\n'),
    [parsed.rows],
  );

  useEffect(() => {
    if (assetMode !== 'token') {
      setMintCtx(null);
      setMintErr(null);
      setAtaExists(null);
      return;
    }
    const t = mintInput.trim();
    if (!t) {
      setMintCtx(null);
      setMintErr(null);
      setAtaExists(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      setMintBusy(true);
      setMintErr(null);
      resolveBulkMintContext(t)
        .then((ctx) => {
          if (!cancelled) {
            setMintCtx(ctx);
            setMintErr(null);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setMintCtx(null);
            setMintErr(e instanceof Error ? e.message : 'Invalid mint');
          }
        })
        .finally(() => {
          if (!cancelled) setMintBusy(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [assetMode, mintInput]);

  useEffect(() => {
    if (assetMode !== 'token' || !mintCtx || !parsed.rows.length) {
      setAtaExists(null);
      return;
    }
    let cancelled = false;
    setAtaBusy(true);
    fetchBulkDestAtaExistence(
      mintCtx.mint,
      mintCtx.programId,
      parsed.rows.map((r) => r.to),
    )
      .then((exists) => {
        if (!cancelled) setAtaExists(exists);
      })
      .catch(() => {
        if (!cancelled) setAtaExists(null);
      })
      .finally(() => {
        if (!cancelled) setAtaBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetMode, mintCtx, recipientsKey, parsed.rows]);

  const stats = useMemo(() => {
    const n = parsed.rows.length;
    const platform = bulkPlatformFeeSol(n);
    const payer = wallet.publicKey;
    const ref = getStoredReferrer();
    const firstOver = payer
      ? bulkTokenFirstTxOverhead(payer, platform, ref)
      : 2;

    let batches: number;
    let sendHuman = 0;
    let netEst: number;

    if (assetMode === 'sol') {
      batches = estimateBulkTxCount(n);
      let sendLamports = 0n;
      for (const r of parsed.rows) sendLamports += r.lamports;
      sendHuman = Number(sendLamports) / LAMPORTS_PER_SOL;
      netEst = batches * 5000;
    } else {
      const needsCreate =
        ataExists && ataExists.length === n && mintCtx
          ? bulkTokenNeedsCreatePerRow(
              deriveBulkDestAtas(
                mintCtx.mint,
                mintCtx.programId,
                parsed.rows.map((r) => r.to),
              ),
              ataExists,
            )
          : Array.from({ length: n }, () => true);
      batches = estimateBulkTokenTxCount(needsCreate, firstOver);
      if (mintCtx && n > 0) {
        let rawSum = 0n;
        for (const r of parsed.rows) rawSum += r.lamports;
        sendHuman = Number(rawSum) / 10 ** mintCtx.decimals;
      } else {
        sendHuman = 0;
      }
      netEst = batches * 8_000;
    }

    const needsCreateForRent =
      assetMode === 'token' && ataExists && ataExists.length === n && mintCtx
        ? bulkTokenNeedsCreatePerRow(
            deriveBulkDestAtas(
              mintCtx.mint,
              mintCtx.programId,
              parsed.rows.map((r) => r.to),
            ),
            ataExists,
          )
        : null;
    const newAtaCount =
      assetMode === 'token'
        ? needsCreateForRent
          ? needsCreateForRent.filter(Boolean).length
          : n
        : 0;
    const rentLamports = BigInt(newAtaCount) * BigInt(TYPICAL_TOKEN_ACCOUNT_RENT);

    return {
      n,
      platform,
      batches,
      sendHuman,
      netEst,
      newAtaCount,
      rentLamports,
    };
  }, [parsed.rows, assetMode, ataExists, mintCtx, wallet.publicKey]);

  const feeReady = isFeeWalletConfigured();

  const onSend = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      toast.error('Connect your wallet first');
      return;
    }
    if (!parsed.rows.length) {
      toast.error('Add at least one recipient line');
      return;
    }
    if (parsed.errors.length) {
      toast.error('Some lines have errors — fix or remove them first');
      return;
    }
    if (assetMode === 'token') {
      if (!mintInput.trim() || mintErr || !mintCtx) {
        toast.error('Enter a valid SPL mint address');
        return;
      }
    }

    const platformLamports = BigInt(
      Math.round(stats.platform * LAMPORTS_PER_SOL),
    );
    const reserve = BigInt(stats.batches * 15_000);

    setBusy(true);
    setLastSigs([]);
    try {
      if (assetMode === 'sol') {
        const totalOut = parsed.rows.reduce((a, r) => a + r.lamports, 0n);
        const need = totalOut + platformLamports + reserve;
        const bal = BigInt(
          await getConnection().getBalance(wallet.publicKey, 'confirmed'),
        );
        if (bal < need) {
          throw new Error(
            `Wallet needs roughly ${(Number(need) / LAMPORTS_PER_SOL).toFixed(4)} SOL (sends + ${stats.platform.toFixed(4)} platform + small network reserve). Balance ≈ ${(Number(bal) / LAMPORTS_PER_SOL).toFixed(4)} SOL.`,
          );
        }
        const { signatures } = await sendBulkSolTransfers(wallet, parsed.rows, {
          referrer: getStoredReferrer(),
        });
        setLastSigs(signatures);
        toast.success(
          `${signatures.length} transaction${signatures.length > 1 ? 's' : ''} confirmed`,
        );
        if (wallet.publicKey && signatures.length) {
          logSolanaSiteAction({
            wallet: wallet.publicKey.toBase58(),
            action: SiteAction.BULK_SOL_SEND,
            route: '/bulk',
            signature: signatures[0],
            metadata: withReferrerMetadata({
              txCount: signatures.length,
              recipientRows: parsed.rows.length,
            }),
          });
        }
      } else {
        const need =
          platformLamports + stats.rentLamports + reserve;
        const bal = BigInt(
          await getConnection().getBalance(wallet.publicKey, 'confirmed'),
        );
        if (bal < need) {
          throw new Error(
            `Wallet needs roughly ${(Number(need) / LAMPORTS_PER_SOL).toFixed(4)} SOL (RootRecord fee + recipient token account rent where needed + network reserve). Balance ≈ ${(Number(bal) / LAMPORTS_PER_SOL).toFixed(4)} SOL.`,
          );
        }
        const { signatures } = await sendBulkTokenTransfers(
          wallet,
          mintInput.trim(),
          parsed.rows,
          { referrer: getStoredReferrer() },
        );
        setLastSigs(signatures);
        toast.success(
          `${signatures.length} transaction${signatures.length > 1 ? 's' : ''} confirmed`,
        );
        if (wallet.publicKey && signatures.length) {
          logSolanaSiteAction({
            wallet: wallet.publicKey.toBase58(),
            action: SiteAction.BULK_TOKEN_SEND,
            route: '/bulk',
            signature: signatures[0],
            metadata: withReferrerMetadata({
              txCount: signatures.length,
              recipientRows: parsed.rows.length,
              mint: mintInput.trim(),
            }),
          });
        }
      }
    } catch (e) {
      toast.error('Bulk send failed', {
        description: e instanceof Error ? e.message : '',
      });
    } finally {
      setBusy(false);
    }
  };

  const sendLabel =
    assetMode === 'token' && !mintCtx && mintInput.trim()
      ? 'Resolve mint…'
      : `Sign ${stats.batches || 0} transaction${stats.batches === 1 ? '' : 's'}`;

  return (
    <div className="container py-14 md:py-20 max-w-3xl">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Bulk
      </div>
      <h1 className="font-display text-4xl md:text-5xl tracking-tight">
        Send {assetMode === 'sol' ? 'SOL' : 'tokens'} to{' '}
        <em className="italic text-sol-green">many wallets</em>
      </h1>
      <p className="mt-4 text-muted-foreground leading-relaxed">
        One line per recipient. Platform fee is{' '}
        <strong className="text-foreground">{BULK_FEE_PER_100_SOL} SOL</strong> per{' '}
        <strong className="text-foreground">100</strong> addresses (rounded up). You pay
        Solana network fees on each signed transaction — we batch transfers to stay within
        safe transaction size limits (up to {MAX_BULK_RECIPIENTS} lines per run). SPL sends
        may create recipient token accounts; you pay that rent from your SOL balance.
      </p>

      {!feeReady && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            Platform fee wallet is not configured on this deployment — bulk sends work,
            but the RootRecord fee line won&apos;t be collected yet.
          </div>
        </div>
      )}

      <Card className="mt-10">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-sol-green" />
                Recipient list
              </CardTitle>
              <CardDescription className="mt-2">
                <code className="text-xs bg-ink-700/60 px-1.5 py-0.5 rounded">PUBKEY</code>{' '}
                or{' '}
                <code className="text-xs bg-ink-700/60 px-1.5 py-0.5 rounded">
                  PUBKEY 0.01
                </code>{' '}
                (space or comma). Amounts use SOL decimals or the mint&apos;s decimals in
                token mode.
              </CardDescription>
            </div>
            <WalletMultiButton />
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={assetMode === 'sol' ? 'default' : 'outline'}
              onClick={() => setAssetMode('sol')}
            >
              SOL
            </Button>
            <Button
              type="button"
              size="sm"
              variant={assetMode === 'token' ? 'default' : 'outline'}
              onClick={() => setAssetMode('token')}
            >
              SPL token
            </Button>
          </div>

          {assetMode === 'token' && (
            <div className="grid gap-2">
              <Label htmlFor="bulk-mint">Mint address</Label>
              <Input
                id="bulk-mint"
                data-testid="bulk-mint"
                className="font-mono text-sm"
                placeholder="Token mint (base58)"
                value={mintInput}
                onChange={(e) => setMintInput(e.target.value)}
              />
              {mintBusy && (
                <span className="text-[11px] text-muted-foreground">Resolving mint…</span>
              )}
              {mintErr && (
                <span className="text-[11px] text-amber-200">{mintErr}</span>
              )}
              {mintCtx && !mintErr && (
                <span className="text-[11px] text-muted-foreground">
                  Decimals: {mintCtx.decimals} · standard SPL or Token-2022 detected from
                  chain
                </span>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="bulk-default-sol">
              {assetMode === 'sol' ? 'SOL per line (default)' : 'Amount per line (default)'}
            </Label>
            <Input
              id="bulk-default-sol"
              data-testid="bulk-default-sol"
              placeholder="0.001"
              value={defaultAmount}
              onChange={(e) => setDefaultAmount(e.target.value)}
            />
            <span className="text-[11px] text-muted-foreground">
              Used when a line has only a wallet address and no amount.
            </span>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bulk-raw">Addresses</Label>
            <Textarea
              id="bulk-raw"
              data-testid="bulk-raw"
              rows={12}
              className="font-mono text-sm"
              placeholder={
                assetMode === 'sol'
                  ? `So11111111111111111111111111111111111111112 0.0001\n7EcDhSYGxFZRSDAAz8UUSwytLvSNJnZD7Jg7vaoJ4UYFT 0.0002`
                  : `RecipientWallet1111111111111111111111111111 1.5\nRecipientWallet2222222222222222222222222222222 2`
              }
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </div>

          <div className="rounded-lg border border-border bg-ink-700/35 px-4 py-3 text-sm space-y-1.5">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Valid recipients</span>
              <span className="font-mono">{stats.n}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                {assetMode === 'sol' ? 'SOL to recipients (sum)' : 'Tokens to recipients (sum)'}
              </span>
              <span className="font-mono">
                {assetMode === 'sol'
                  ? stats.sendHuman.toFixed(6)
                  : mintCtx
                    ? stats.sendHuman.toLocaleString(undefined, {
                        maximumFractionDigits: Math.min(9, mintCtx.decimals + 2),
                      })
                    : '—'}
              </span>
            </div>
            {assetMode === 'token' && (
              <div className="flex justify-between gap-4 text-xs text-muted-foreground">
                <span>New recipient token accounts (est.)</span>
                <span className="font-mono">
                  {ataBusy
                    ? '…'
                    : ataExists && ataExists.length === stats.n
                      ? stats.newAtaCount
                      : `up to ${stats.n} (scanning…)`}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">RootRecord fee (this run)</span>
              <span className="font-mono">{stats.platform.toFixed(4)} SOL</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Signed transactions (est.)</span>
              <span className="font-mono">{stats.batches}</span>
            </div>
            <div className="flex justify-between gap-4 text-xs text-muted-foreground">
              <span>Network fees (you pay)</span>
              <span>
                ~{(stats.netEst / LAMPORTS_PER_SOL).toFixed(5)} SOL + priority (varies)
              </span>
            </div>
            {assetMode === 'token' && stats.newAtaCount > 0 && (
              <div className="flex justify-between gap-4 text-xs text-muted-foreground">
                <span>SOL for new ATAs (est.)</span>
                <span>
                  ~{(Number(stats.rentLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL rent
                </span>
              </div>
            )}
          </div>

          {parsed.errors.length > 0 && (
            <div
              data-testid="bulk-parse-errors"
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100 max-h-40 overflow-y-auto space-y-1"
            >
              {parsed.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="bulk-send"
              size="lg"
              disabled={
                busy ||
                !parsed.rows.length ||
                !!parsed.errors.length ||
                (assetMode === 'token' && (!mintCtx || !!mintErr || mintBusy))
              }
              onClick={onSend}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                sendLabel
              )}
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/tools">Tools</Link>
            </Button>
          </div>

          {lastSigs.length > 0 && (
            <div className="text-sm space-y-2 pt-2 border-t border-border">
              <div className="text-muted-foreground text-xs uppercase tracking-wider">
                Confirmed
              </div>
              {lastSigs.map((sig) => (
                <a
                  key={sig}
                  href={explorerUrl(sig, 'tx')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-mono text-xs text-sol-green hover:underline break-all"
                >
                  {sig}
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
