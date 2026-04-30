'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Copy,
  ExternalLink,
  CheckCircle2,
  ShieldOff,
  Coins,
  Flame,
  Twitter,
  X,
  Rocket,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { explorerUrl } from '@/lib/solana';
import { shortAddr } from '@/lib/utils';
import { toast } from 'sonner';
import { buildReferralUrl } from '@/lib/referral';

export interface SuccessPayload {
  mint: string;
  signature: string;
  name: string;
  symbol: string;
  /** Token-2022 path uses two sequential signed transactions. */
  usedToken2022?: boolean;
}

interface Props {
  payload: SuccessPayload | null;
  onClose: () => void;
  onRevokeMint: () => Promise<void>;
  onRevokeFreeze: () => Promise<void>;
  onMintMore: () => void;
  busy: 'mint' | 'freeze' | null;
  /** Connected creator wallet — used to build a `/create?ref=` share link. */
  affiliateWallet?: string | null;
}

export function SuccessDialog({
  payload,
  onClose,
  onRevokeMint,
  onRevokeFreeze,
  onMintMore,
  busy,
  affiliateWallet,
}: Props) {
  const [revokedMint, setRevokedMint] = useState(false);
  const [revokedFreeze, setRevokedFreeze] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  if (!payload) return null;

  const referralCreateUrl =
    affiliateWallet && origin
      ? buildReferralUrl(origin, '/create', affiliateWallet)
      : null;

  const tweet = encodeURIComponent(
    `Just launched $${payload.symbol} (${payload.name}) on Solana via @rootrecord — cheap, fast, no-BS token creation. Mint: ${payload.mint}`,
  );
  const share = `https://twitter.com/intent/tweet?text=${tweet}`;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const handleRevokeMint = async () => {
    await onRevokeMint();
    setRevokedMint(true);
  };
  const handleRevokeFreeze = async () => {
    await onRevokeFreeze();
    setRevokedFreeze(true);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="success-dialog"
        className="max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-sol-green mb-2">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-xs uppercase tracking-[0.16em]">
              Token launched
            </span>
          </div>
          <DialogTitle className="font-display text-3xl">
            ${payload.symbol} is live on Solana
          </DialogTitle>
          <DialogDescription>
            <em>{payload.name}</em> was created
            {payload.usedToken2022
              ? ' in two sequential signed transactions (mint setup, then supply + fee).'
              : ' in a single signed transaction.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-ink-700/40 p-4">
          <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Mint address
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span
              data-testid="success-mint-addr"
              className="font-mono text-sm break-all"
            >
              {payload.mint}
            </span>
            <button
              data-testid="copy-mint"
              onClick={() => copy(payload.mint, 'Mint')}
              className="text-muted-foreground hover:text-sol-green transition shrink-0"
              aria-label="Copy mint address"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Button
          asChild
          variant="default"
          size="lg"
          className="w-full"
          data-testid="bring-to-market-btn"
        >
          <Link
            href={`/liquidity?mint=${encodeURIComponent(payload.mint)}`}
            onClick={onClose}
          >
            <Rocket className="h-4 w-4" />
            Bring to market
          </Link>
        </Button>

        <Button asChild variant="outline" size="sm" data-testid="open-solscan" className="w-full">
          <a
            href={explorerUrl(payload.mint, 'address')}
            target="_blank"
            rel="noreferrer"
          >
            View on Solscan <ExternalLink className="h-3 w-3" />
          </a>
        </Button>

        <div className="space-y-3 pt-2">
          <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Recommended next steps
          </div>
          <div className="grid gap-2">
            <Button
              variant="outline"
              data-testid="revoke-mint-btn"
              onClick={handleRevokeMint}
              disabled={revokedMint || busy === 'mint'}
              className="justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <ShieldOff className="h-4 w-4" /> Revoke mint authority
              </span>
              <span className="text-xs text-muted-foreground">
                {revokedMint
                  ? 'Done'
                  : busy === 'mint'
                    ? 'Sending…'
                    : '0.01 SOL'}
              </span>
            </Button>
            <Button
              variant="outline"
              data-testid="revoke-freeze-btn"
              onClick={handleRevokeFreeze}
              disabled={revokedFreeze || busy === 'freeze'}
              className="justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <ShieldOff className="h-4 w-4" /> Revoke freeze authority
              </span>
              <span className="text-xs text-muted-foreground">
                {revokedFreeze
                  ? 'Done'
                  : busy === 'freeze'
                    ? 'Sending…'
                    : '0.01 SOL'}
              </span>
            </Button>
            <Button
              variant="ghost"
              data-testid="mint-more-btn"
              onClick={onMintMore}
              className="justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <Coins className="h-4 w-4" /> Mint additional tokens
              </span>
              <span className="text-xs text-muted-foreground">Open tool</span>
            </Button>
            <Button asChild variant="ghost" className="justify-between" data-testid="burn-tokens-link">
              <Link
                href={`/tools?action=burn&mint=${encodeURIComponent(payload.mint)}`}
                onClick={onClose}
              >
                <span className="inline-flex items-center gap-2">
                  <Flame className="h-4 w-4" /> Burn tokens
                </span>
                <span className="text-xs text-muted-foreground">Free · Tools</span>
              </Link>
            </Button>
          </div>
        </div>

        {referralCreateUrl && (
          <div className="rounded-xl border border-sol-purple/25 bg-sol-purple/5 px-4 py-3 space-y-2">
            <div className="text-xs uppercase tracking-[0.14em] text-sol-purple">
              Your referral link
            </div>
            <p className="text-xs text-muted-foreground">
              Share create with your wallet in <span className="font-mono">?ref=</span>.
              When someone pays a fee with your link saved, a share of that fee is sent to
              you in the same transaction (see Pricing / Referrals).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="font-mono text-[0.7rem] max-w-full truncate"
                onClick={() => {
                  void navigator.clipboard.writeText(referralCreateUrl);
                  toast.success('Referral link copied');
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Copy /create?ref=…
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/referrals" onClick={onClose}>
                  Referral hub
                </Link>
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between pt-3 gap-3">
          <div className="text-xs text-muted-foreground">
            Tx: <span className="font-mono">{shortAddr(payload.signature, 6)}</span>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="purple" size="sm" data-testid="share-x">
              <a href={share} target="_blank" rel="noreferrer">
                <Twitter className="h-3.5 w-3.5" /> Share on X
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              data-testid="close-success"
            >
              <X className="h-3.5 w-3.5" /> Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
