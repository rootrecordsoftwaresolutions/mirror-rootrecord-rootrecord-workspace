'use client';

import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import {
  revokeMintAuthority,
  revokeFreezeAuthority,
  mintMore,
  burnTokens,
  updateTokenMetadata,
  lockLegacyListingMetadata,
  ACTION_FEE_SOL,
  explorerUrl,
  getConnection,
} from '@/lib/solana';
import { isPinataConfigured, uploadFileToPinata, uploadJsonToPinata } from '@/lib/pinata';
import {
  mergeFullTokenListingJson,
  parseListingFieldsFromJson,
} from '@/lib/metadataOffchainSync';
import { ImageDropzone } from '@/components/create/ImageDropzone';
import {
  withdrawWithheldFromMint,
  harvestWithheldToMint,
  updateTransferFee,
  readMintInfo,
} from '@/lib/token2022';
import { cn, parseSupply } from '@/lib/utils';
import { getStoredReferrer, withReferrerMetadata } from '@/lib/referral';
import { logSolanaSiteAction, SiteAction } from '@/lib/actionLog';

function assertOptionalHttpUrl(raw: string) {
  const t = raw.trim();
  if (!t) return;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
  } catch {
    throw new Error('Website must be a valid http(s) URL or left blank');
  }
}

export type ToolKind =
  | 'revoke-mint'
  | 'revoke-freeze'
  | 'mint-more'
  | 'burn-tokens'
  | 'update-metadata'
  | 'lock-metadata'
  | 'withdraw-fees'
  | 'harvest-fees'
  | 'update-fee-config';

const META: Record<
  ToolKind,
  { title: string; desc: string; cta: string; t2022?: boolean; free?: boolean }
> = {
  'revoke-mint': {
    title: 'Revoke mint authority',
    desc: 'Sets the mint authority to null. Locks total supply forever — no one can mint more after this. Works on legacy SPL and Token-2022.',
    cta: `Revoke · ${ACTION_FEE_SOL} SOL`,
  },
  'revoke-freeze': {
    title: 'Revoke freeze authority',
    desc: 'Removes the ability for anyone to freeze token accounts. Important signal for buyers.',
    cta: `Revoke · ${ACTION_FEE_SOL} SOL`,
  },
  'mint-more': {
    title: 'Mint more tokens',
    desc: 'Mint additional supply to your wallet. Only works while the mint authority is still active.',
    cta: `Mint · ${ACTION_FEE_SOL} SOL`,
  },
  'burn-tokens': {
    title: 'Burn tokens',
    desc: 'Permanently destroy tokens from your wallet’s token account for this mint. Supply decreases. Works on legacy SPL and Token-2022.',
    cta: 'Burn tokens (free)',
    free: true,
  },
  'update-metadata': {
    title: 'Update metadata (legacy)',
    desc:
      'Edit the same listing details as the token creator: name, symbol, description, website, socials, optional new logo, and listing file link. Updates must still be allowed on-chain. When file hosting is enabled here, we rebuild the listing file so explorers match what you enter.',
    cta: `Update · ${ACTION_FEE_SOL} SOL`,
  },
  'lock-metadata': {
    title: 'Lock listing metadata (legacy)',
    desc:
      'Permanently turn off further edits to listing name, symbol, and listing file link on-chain (Metaplex “immutable”). Your connected wallet must be the listing update authority. Standard SPL only — not Token-2022.',
    cta: `Lock listing · ${ACTION_FEE_SOL} SOL`,
  },
  'withdraw-fees': {
    title: 'Withdraw transfer fees',
    desc: 'Pull all withheld transfer fees from the mint into a destination account you own. Token-2022 only.',
    cta: `Withdraw · ${ACTION_FEE_SOL} SOL`,
    t2022: true,
  },
  'harvest-fees': {
    title: 'Harvest fees from accounts → mint',
    desc: 'Sweep withheld fees from a list of token accounts back into the mint, where you can withdraw them. Token-2022 only.',
    cta: `Harvest · ${ACTION_FEE_SOL} SOL`,
    t2022: true,
  },
  'update-fee-config': {
    title: 'Update transfer fee config',
    desc: 'Change the transfer fee basis points and / or maximum fee. Takes effect after 2 epochs. Token-2022 only.',
    cta: `Update · ${ACTION_FEE_SOL} SOL`,
    t2022: true,
  },
};

interface Props {
  kind: ToolKind | null;
  initialMint?: string;
  onClose: () => void;
}

export function ToolDialog({ kind, initialMint, onClose }: Props) {
  const wallet = useWallet();
  const [mint, setMint] = useState(initialMint ?? '');
  const [amount, setAmount] = useState('');
  const [decimals, setDecimals] = useState('9');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [uri, setUri] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [twitter, setTwitter] = useState('');
  const [telegram, setTelegram] = useState('');
  const [discord, setDiscord] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [clearListingImage, setClearListingImage] = useState(false);
  const [currentListingImageUrl, setCurrentListingImageUrl] = useState('');
  const [listingHostReady, setListingHostReady] = useState<boolean | null>(null);
  const [destination, setDestination] = useState('');
  const [accountList, setAccountList] = useState('');
  const [feeBps, setFeeBps] = useState('500');
  const [maxFee, setMaxFee] = useState('1000000');
  const [busy, setBusy] = useState(false);
  const [mintPreview, setMintPreview] = useState<{
    loading: boolean;
    error?: string;
    programLabel?: string;
    decimals?: number;
    feeBps?: number;
    withheldRaw?: string;
  } | null>(null);

  const reset = useCallback(() => {
    setMint('');
    setAmount('');
    setDecimals('9');
    setName('');
    setSymbol('');
    setUri('');
    setDescription('');
    setWebsite('');
    setTwitter('');
    setTelegram('');
    setDiscord('');
    setLogoFile(null);
    setClearListingImage(false);
    setCurrentListingImageUrl('');
    setListingHostReady(null);
    setDestination('');
    setAccountList('');
    setFeeBps('500');
    setMaxFee('1000000');
    setMintPreview(null);
  }, []);

  useEffect(() => {
    if (!kind) return;
    reset();
    if (initialMint) setMint(initialMint);
  }, [kind, initialMint, reset]);

  useEffect(() => {
    if (!kind) {
      setMintPreview(null);
      return;
    }
    const m = META[kind];
    if (!m.t2022) {
      setMintPreview(null);
      return;
    }
    const trimmed = mint.trim();
    if (!trimmed) {
      setMintPreview(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        new PublicKey(trimmed);
      } catch {
        if (!cancelled) {
          setMintPreview({ loading: false, error: 'Invalid mint address' });
        }
        return;
      }
      if (!cancelled) setMintPreview({ loading: true });
      try {
        const info = await readMintInfo(getConnection(), trimmed);
        if (cancelled) return;
        if (!info.programId.equals(TOKEN_2022_PROGRAM_ID)) {
          setMintPreview({
            loading: false,
            error:
              'This mint is legacy SPL Token. These tools apply to Token-2022 mints only.',
            programLabel: info.programId.toBase58(),
            decimals: info.decimals,
          });
          return;
        }
        setMintPreview({
          loading: false,
          programLabel: 'Token-2022',
          decimals: info.decimals,
          feeBps: info.transferFee?.feeBps,
          withheldRaw: info.transferFee?.withheldAmount.toString(),
        });
      } catch (e) {
        if (!cancelled) {
          setMintPreview({
            loading: false,
            error: e instanceof Error ? e.message : 'Could not load mint',
          });
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kind, mint]);

  useEffect(() => {
    if (kind !== 'update-metadata') {
      setListingHostReady(null);
      return;
    }
    let cancelled = false;
    void isPinataConfigured().then((v) => {
      if (!cancelled) setListingHostReady(v);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    if (kind !== 'update-metadata') return;
    const trimmed = mint.trim();
    if (!trimmed) return;
    try {
      new PublicKey(trimmed);
    } catch {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/tools/metaplex-metadata?mint=${encodeURIComponent(trimmed)}`,
          { cache: 'no-store' },
        );
        const j = (await r.json()) as {
          ok?: boolean;
          name?: string;
          symbol?: string;
          uri?: string;
        };
        if (cancelled || !r.ok || !j.ok) return;
        setName(j.name ?? '');
        setSymbol((j.symbol ?? '').toUpperCase().slice(0, 10));
        setUri(j.uri ?? '');
        setLogoFile(null);
        setClearListingImage(false);
        const uriForJson = (j.uri ?? '').trim();
        if (!uriForJson) {
          setDescription('');
          setWebsite('');
          setTwitter('');
          setTelegram('');
          setDiscord('');
          setCurrentListingImageUrl('');
          return;
        }
        const jr = await fetch(
          `/api/tools/metadata-json?url=${encodeURIComponent(uriForJson)}`,
          { cache: 'no-store' },
        );
        const parsed: unknown = await jr.json().catch(() => null);
        if (
          cancelled ||
          !jr.ok ||
          parsed === null ||
          typeof parsed !== 'object' ||
          Array.isArray(parsed)
        ) {
          setDescription('');
          setWebsite('');
          setTwitter('');
          setTelegram('');
          setDiscord('');
          setCurrentListingImageUrl('');
          return;
        }
        const rec = parsed as Record<string, unknown>;
        const listing = parseListingFieldsFromJson(rec);
        setDescription(listing.description);
        setWebsite(listing.website);
        setTwitter(listing.twitter);
        setTelegram(listing.telegram);
        setDiscord(listing.discord);
        const img = typeof rec.image === 'string' ? rec.image.trim() : '';
        setCurrentListingImageUrl(img);
      } catch {
        /* ignore */
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kind, mint]);

  if (!kind) return null;
  const meta = META[kind];

  const handle = async () => {
    if (!wallet.connected) {
      toast.error('Connect a wallet first');
      return;
    }
    if (!mint) {
      toast.error('Mint address is required');
      return;
    }
    setBusy(true);
    let repinnedMetadataJson = false;
    try {
      const ref = getStoredReferrer();
      let sig = '';
      if (kind === 'revoke-mint') sig = await revokeMintAuthority(wallet, mint, ref);
      else if (kind === 'revoke-freeze') {
        sig = await revokeFreezeAuthority(wallet, mint, ref);
      } else if (kind === 'lock-metadata') {
        sig = await lockLegacyListingMetadata(wallet, mint, ref);
      } else if (kind === 'mint-more') {
        if (!amount) throw new Error('Amount is required');
        sig = await mintMore(
          wallet,
          mint,
          parseSupply(amount),
          parseInt(decimals, 10) || 9,
          ref,
        );
      } else if (kind === 'burn-tokens') {
        if (!amount) throw new Error('Amount is required');
        sig = await burnTokens(
          wallet,
          mint,
          parseSupply(amount),
          parseInt(decimals, 10) || 9,
        );
      } else if (kind === 'update-metadata') {
        if (!name.trim() || !symbol.trim())
          throw new Error('Name and symbol are required');
        if (!/^[A-Za-z0-9]+$/.test(symbol.trim())) {
          throw new Error('Symbol must be letters and numbers only');
        }
        let finalUri = uri.trim();
        const pinReady = await isPinataConfigured();
        if (pinReady) {
          const mr = await fetch(
            `/api/tools/metaplex-metadata?mint=${encodeURIComponent(mint.trim())}`,
            { cache: 'no-store' },
          );
          const mj = (await mr.json()) as { ok?: boolean; uri?: string; error?: string };
          if (!mr.ok || !mj.ok) {
            throw new Error(mj.error || 'Could not read listing metadata for this mint');
          }
          const sourceUri = finalUri || (typeof mj.uri === 'string' ? mj.uri : '');
          if (!sourceUri.trim()) {
            throw new Error(
              'No listing link is saved for this token yet. Paste the link to your token’s listing file, or add listing details to this mint first.',
            );
          }
          const jRes = await fetch(
            `/api/tools/metadata-json?url=${encodeURIComponent(sourceUri.trim())}`,
            { cache: 'no-store' },
          );
          const parsed: unknown = await jRes.json().catch(() => null);
          if (!jRes.ok || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            const err =
              parsed !== null &&
              typeof parsed === 'object' &&
              !Array.isArray(parsed) &&
              typeof (parsed as { error?: string }).error === 'string'
                ? (parsed as { error: string }).error
                : `Could not load the listing file from that link (HTTP ${jRes.status}). Check the URL or try again later.`;
            throw new Error(err);
          }
          assertOptionalHttpUrl(website);
          let uploadedLogoUrl: string | undefined;
          if (logoFile) {
            const imgRes = await uploadFileToPinata(logoFile);
            uploadedLogoUrl = imgRes.gatewayUrl;
          }
          const imageMerge =
            clearListingImage && !logoFile
              ? ({ mode: 'remove' } as const)
              : uploadedLogoUrl
                ? ({ mode: 'set', url: uploadedLogoUrl } as const)
                : ({ mode: 'keep' } as const);
          const merged = mergeFullTokenListingJson(
            parsed as Record<string, unknown>,
            name,
            symbol,
            { description, website, twitter, telegram, discord },
            imageMerge,
          );
          const up = await uploadJsonToPinata(merged, `metadata-${mint.trim().slice(0, 8)}.json`);
          finalUri = up.gatewayUrl;
          repinnedMetadataJson = true;
        } else if (!finalUri) {
          const mr = await fetch(
            `/api/tools/metaplex-metadata?mint=${encodeURIComponent(mint.trim())}`,
            { cache: 'no-store' },
          );
          const mj = (await mr.json()) as { ok?: boolean; uri?: string; error?: string };
          if (mr.ok && mj.ok && typeof mj.uri === 'string' && mj.uri.trim()) {
            finalUri = mj.uri.trim();
          }
          if (!finalUri) {
            throw new Error(
              'Paste the HTTPS link to your token’s listing file, or use a deployment where automatic listing-file sync is enabled.',
            );
          }
        }
        sig = await updateTokenMetadata(wallet, mint, { name, symbol, uri: finalUri }, ref);
      } else if (kind === 'withdraw-fees') {
        sig = await withdrawWithheldFromMint(
          wallet,
          mint,
          destination || undefined,
          ref,
        );
      } else if (kind === 'harvest-fees') {
        const list = accountList
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!list.length) throw new Error('Provide at least one token account');
        sig = await harvestWithheldToMint(wallet, mint, list, ref);
      } else if (kind === 'update-fee-config') {
        sig = await updateTransferFee(
          wallet,
          mint,
          parseInt(feeBps, 10) || 0,
          BigInt(maxFee || '0'),
          ref,
        );
      }
      toast.success('Transaction confirmed', {
        description:
          kind === 'update-metadata' && repinnedMetadataJson
            ? 'On-chain listing updated and the public detail file refreshed to match. View on Solscan'
            : kind === 'update-metadata'
              ? 'On-chain listing updated. View on Solscan'
              : 'View on Solscan',
        action: {
          label: 'Open',
          onClick: () => window.open(explorerUrl(sig), '_blank'),
        },
      });
      if (wallet.publicKey && sig) {
        logSolanaSiteAction({
          wallet: wallet.publicKey.toBase58(),
          action: `${SiteAction.TOOL_PREFIX}${kind}`,
          route: '/tools',
          signature: sig,
          metadata: withReferrerMetadata({ tool: kind, mint: mint.trim() }),
        });
      }
      reset();
      onClose();
    } catch (e) {
      toast.error('Transaction failed', {
        description: e instanceof Error ? e.message : '',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid={`tool-dialog-${kind}`}
        className={cn(
          'max-h-[90vh] overflow-y-auto',
          kind === 'update-metadata' ? 'max-w-lg' : 'max-w-md',
        )}
      >
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
          <DialogDescription>{meta.desc}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Mint address</Label>
            <Input
              data-testid="tool-mint-input"
              placeholder="Mint pubkey"
              value={mint}
              onChange={(e) => setMint(e.target.value.trim())}
            />
            {[
              'mint-more',
              'burn-tokens',
              'revoke-mint',
              'revoke-freeze',
              'update-metadata',
              'lock-metadata',
              'withdraw-fees',
              'harvest-fees',
              'update-fee-config',
            ].includes(kind) && (
              <p className="text-[11px] text-muted-foreground">
                Use the <strong className="text-foreground/90">mint</strong> address from
                Solscan or your launch dialog — not your wallet.
                {meta.t2022
                  ? ' Must be a Token-2022 mint.'
                  : kind === 'update-metadata' || kind === 'lock-metadata'
                    ? ' Standard SPL tokens with on-chain listing metadata only (not Token-2022).'
                    : ''}
              </p>
            )}
          </div>

          {kind === 'lock-metadata' ? (
            <p className="text-xs text-amber-200/95 border border-amber-500/30 rounded-lg px-3 py-2 leading-relaxed">
              This cannot be undone on-chain: after locking, listing name, symbol, and listing file
              link can no longer be edited with the update tool. Use only when you are finished with
              listing changes.
            </p>
          ) : null}

          {meta.t2022 && mintPreview && (
            <div
              data-testid="tool-mint-preview"
              className="rounded-lg border border-border bg-ink-700/40 px-3 py-2 text-xs space-y-1"
            >
              {mintPreview.loading ? (
                <span className="text-muted-foreground">Loading mint…</span>
              ) : mintPreview.error ? (
                <span className="text-amber-200">{mintPreview.error}</span>
              ) : (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Program</span>
                    <span className="font-mono text-right break-all">
                      {mintPreview.programLabel}
                    </span>
                  </div>
                  {mintPreview.decimals !== undefined && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Decimals</span>
                      <span>{mintPreview.decimals}</span>
                    </div>
                  )}
                  {mintPreview.feeBps !== undefined && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">
                        Transfer fee (newer epoch)
                      </span>
                      <span>{mintPreview.feeBps} bps</span>
                    </div>
                  )}
                  {mintPreview.withheldRaw !== undefined &&
                    mintPreview.withheldRaw !== '0' && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          Withheld on mint (raw)
                        </span>
                        <span className="font-mono">{mintPreview.withheldRaw}</span>
                      </div>
                    )}
                </>
              )}
            </div>
          )}

          {(kind === 'mint-more' || kind === 'burn-tokens') && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Amount</Label>
                <Input
                  data-testid="tool-amount-input"
                  placeholder="1,000,000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Decimals</Label>
                <Input
                  data-testid="tool-decimals-input"
                  type="number"
                  value={decimals}
                  onChange={(e) => setDecimals(e.target.value)}
                />
              </div>
            </div>
          )}

          {kind === 'burn-tokens' && (
            <p className="text-[11px] text-muted-foreground">
              Burns from <strong className="text-foreground/90">your</strong> associated
              token account for this mint. You still pay a tiny Solana network fee only —
              no RootRecord fee.
            </p>
          )}

          {kind === 'update-metadata' && (
            <>
              {listingHostReady === false ? (
                <p className="text-xs text-muted-foreground leading-relaxed rounded-md border border-border/80 bg-ink-800/40 px-3 py-2">
                  Listing file hosting is not enabled on this deployment. Only name, symbol, and
                  the listing file link below are saved on-chain; description, socials, and logo
                  changes need hosting or a manual file update.
                </p>
              ) : null}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Token name</Label>
                  <Input
                    data-testid="tool-name-input"
                    value={name}
                    maxLength={32}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Symbol</Label>
                  <Input
                    data-testid="tool-symbol-input"
                    value={symbol}
                    onChange={(e) =>
                      setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Textarea
                  data-testid="tool-description-input"
                  rows={3}
                  placeholder="Short description (optional)"
                  value={description}
                  maxLength={500}
                  disabled={listingHostReady === false}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Website</Label>
                <Input
                  data-testid="tool-website-input"
                  placeholder="https://…"
                  value={website}
                  disabled={listingHostReady === false}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Twitter / X</Label>
                  <Input
                    data-testid="tool-twitter-input"
                    placeholder="@handle or URL"
                    value={twitter}
                    disabled={listingHostReady === false}
                    onChange={(e) => setTwitter(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Telegram</Label>
                  <Input
                    data-testid="tool-telegram-input"
                    placeholder="@handle or URL"
                    value={telegram}
                    disabled={listingHostReady === false}
                    onChange={(e) => setTelegram(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Discord</Label>
                <Input
                  data-testid="tool-discord-input"
                  placeholder="discord.gg/yourserver or invite URL"
                  value={discord}
                  disabled={listingHostReady === false}
                  onChange={(e) => setDiscord(e.target.value)}
                />
              </div>
              <div className={cn('grid gap-2', listingHostReady === false && 'pointer-events-none opacity-50')}>
                <Label>Logo (optional)</Label>
                <ImageDropzone
                  key={`um-logo-${mint.trim() || 'none'}`}
                  file={logoFile}
                  onChange={(f) => {
                    setLogoFile(f);
                    if (f) setClearListingImage(false);
                  }}
                />
                {currentListingImageUrl && !logoFile ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clearListingImage}
                      onChange={(e) => setClearListingImage(e.target.checked)}
                      disabled={listingHostReady === false}
                      className="rounded border-border"
                    />
                    Remove current logo from the listing file
                  </label>
                ) : null}
                {currentListingImageUrl && !logoFile && !clearListingImage ? (
                  <p className="text-[11px] text-muted-foreground break-all">
                    Current logo URL:{' '}
                    <a
                      href={currentListingImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sol-green hover:underline"
                    >
                      {currentListingImageUrl.length > 72
                        ? `${currentListingImageUrl.slice(0, 72)}…`
                        : currentListingImageUrl}
                    </a>
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label>Starting listing file URL (optional)</Label>
                <Input
                  data-testid="tool-uri-input"
                  placeholder="Leave blank: load from the link already saved on-chain"
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                />
                {listingHostReady === true ? (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Each successful run uploads a new listing file and updates the mint’s saved
                    link to that new address. Use this field only to load starting JSON from a URL
                    other than the one already stored (leave blank to use the stored link).
                  </p>
                ) : listingHostReady === false ? (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Without file hosting, this URL is written on-chain as the listing link (blank =
                    keep the link already on the mint). This site does not upload a new listing file
                    in that mode.
                  </p>
                ) : null}
              </div>
            </>
          )}

          {kind === 'withdraw-fees' && (
            <div className="grid gap-2">
              <Label>Destination owner (optional)</Label>
              <Input
                data-testid="tool-dest-input"
                placeholder="Defaults to your wallet"
                value={destination}
                onChange={(e) => setDestination(e.target.value.trim())}
              />
              <span className="text-[11px] text-muted-foreground">
                We&apos;ll create the destination&apos;s associated token
                account if it doesn&apos;t exist yet.
              </span>
            </div>
          )}

          {kind === 'harvest-fees' && (
            <div className="grid gap-2">
              <Label>Token account addresses</Label>
              <Textarea
                data-testid="tool-accounts-input"
                rows={4}
                placeholder="Paste one or more associated token accounts, separated by commas, spaces, or newlines."
                value={accountList}
                onChange={(e) => setAccountList(e.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">
                Sweeps any withheld fees on these accounts back into the mint.
              </span>
            </div>
          )}

          {kind === 'update-fee-config' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>New fee (bps)</Label>
                <Input
                  data-testid="tool-bps-input"
                  type="number"
                  min={0}
                  max={10000}
                  value={feeBps}
                  onChange={(e) => setFeeBps(e.target.value)}
                />
                <span className="text-[11px] text-muted-foreground">
                  100 bps = 1%
                </span>
              </div>
              <div className="grid gap-2">
                <Label>New max fee</Label>
                <Input
                  data-testid="tool-maxfee-input"
                  type="number"
                  value={maxFee}
                  onChange={(e) => setMaxFee(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            data-testid="tool-submit"
            onClick={handle}
            disabled={busy}
            variant={
              kind.startsWith('revoke') ||
              kind === 'burn-tokens' ||
              kind === 'lock-metadata'
                ? 'destructive'
                : 'default'
            }
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              meta.cta
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
