'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useWallet } from '@solana/wallet-adapter-react';
import { Loader2, Wallet, Sparkles, ShieldCheck, Info } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { FundingWarning } from '@/components/FundingWarning';
import { ImageDropzone } from '@/components/create/ImageDropzone';
import { SuccessDialog, type SuccessPayload } from '@/components/create/SuccessDialog';

import { tokenSchema, type TokenFormValues } from '@/lib/schema';
import { formatNumber, parseSupply } from '@/lib/utils';
import { uploadFileToPinata, uploadJsonToPinata, isPinataConfigured } from '@/lib/pinata';
import {
  createSplToken,
  revokeMintAuthority,
  revokeFreezeAuthority,
  CREATE_FEE_SOL,
  ACTION_FEE_SOL,
  REFERRAL_FEE_SHARE_BPS,
  isFeeWalletConfigured,
} from '@/lib/solana';
import { createToken2022 } from '@/lib/token2022';
import { getStoredReferrer, withReferrerMetadata } from '@/lib/referral';
import { defaultExtensions, type ExtensionState } from '@/lib/schema';
import { Token2022Section } from '@/components/create/Token2022Section';
import { WalletMultiButton } from '@/components/wallet/WalletButton';
import { logSolanaSiteAction, SiteAction } from '@/lib/actionLog';

export default function CreateTokenPage() {
  const wallet = useWallet();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<string>('');
  const [success, setSuccess] = useState<SuccessPayload | null>(null);
  const [postBusy, setPostBusy] = useState<'mint' | 'freeze' | null>(null);
  const [extensions, setExtensions] = useState<ExtensionState>(defaultExtensions);

  const form = useForm<TokenFormValues>({
    resolver: zodResolver(tokenSchema),
    defaultValues: {
      name: '',
      symbol: '',
      decimals: 9,
      supply: '',
      description: '',
      website: '',
      twitter: '',
      telegram: '',
      discord: '',
    },
  });

  const supplyValue = form.watch('supply');

  const onSupplyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (!raw) {
      form.setValue('supply', '', { shouldValidate: true });
      return;
    }
    form.setValue('supply', formatNumber(raw), { shouldValidate: true });
  };

  const feeWalletConfigured = isFeeWalletConfigured();

  const onSubmit = async (values: TokenFormValues) => {
    if (!wallet.connected || !wallet.publicKey) {
      toast.error('Connect your wallet first');
      return;
    }
    setSubmitting(true);
    try {
      // 1. upload logo
      let imageUri = '';
      const pinataReady = await isPinataConfigured();
      if (logoFile) {
        if (!pinataReady) {
          toast.warning(
            'IPFS logo upload isn’t available on this deployment — the token will be created without an image.',
          );
        } else {
          setStage('Uploading logo to IPFS…');
          const res = await uploadFileToPinata(logoFile);
          imageUri = res.gatewayUrl;
        }
      }

      // 2. upload metadata json
      let metadataUri = '';
      if (pinataReady) {
        setStage('Pinning metadata JSON…');
        const meta: Record<string, unknown> = {
          name: values.name,
          symbol: values.symbol,
          description: values.description || '',
          external_url: values.website || '',
          extensions: {
            website: values.website || undefined,
            twitter: values.twitter || undefined,
            telegram: values.telegram || undefined,
            discord: values.discord || undefined,
          },
        };
        // Empty `image` breaks explorers (e.g. "IMAGE FAILED"); omit unless we have a URL.
        if (imageUri) meta.image = imageUri;
        const res = await uploadJsonToPinata(meta, `${values.symbol}.json`);
        metadataUri = res.gatewayUrl;
      }

      // 3. create the token on-chain (legacy SPL or Token-2022 path)
      setStage('Building transaction…');
      const referrer = getStoredReferrer();
      let result: { signature: string; mint: string; ata: string };
      if (extensions.enabled) {
        // Validate Token-2022 conflicts
        if (
          extensions.nonTransferable &&
          (extensions.transferFee.on || extensions.transferHook.on)
        ) {
          throw new Error(
            'Non-transferable conflicts with Transfer fee / Transfer hook. Disable one.',
          );
        }
        const additional: [string, string][] = [];
        if (values.description) additional.push(['description', values.description]);
        if (values.website) additional.push(['website', values.website]);
        if (values.twitter) additional.push(['twitter', values.twitter]);
        if (values.telegram) additional.push(['telegram', values.telegram]);
        if (values.discord) additional.push(['discord', values.discord]);
        if (imageUri) additional.push(['image', imageUri]);

        result = await createToken2022(
          wallet,
          {
          name: values.name,
          symbol: values.symbol,
          decimals: values.decimals,
          supply: parseSupply(values.supply),
          uri: metadataUri,
          additionalMetadata: additional,
          extensions: {
            transferFee: extensions.transferFee.on
              ? {
                  feeBps: parseInt(extensions.transferFee.bps, 10) || 0,
                  maxFee: BigInt(extensions.transferFee.maxFee || '0'),
                }
              : undefined,
            transferHook: extensions.transferHook.on
              ? { programId: extensions.transferHook.programId }
              : undefined,
            nonTransferable: extensions.nonTransferable || undefined,
            mintCloseAuthority: extensions.mintCloseAuthority || undefined,
            permanentDelegate: extensions.permanentDelegate || undefined,
            interestBearing: extensions.interestBearing.on
              ? {
                  rateBps:
                    parseInt(extensions.interestBearing.rateBps, 10) || 0,
                }
              : undefined,
            defaultAccountState: extensions.defaultFrozen
              ? 'frozen'
              : undefined,
          },
        },
          { referrer },
        );
      } else {
        result = await createSplToken(
          wallet,
          {
          name: values.name,
          symbol: values.symbol,
          decimals: values.decimals,
          supply: parseSupply(values.supply),
          uri: metadataUri,
        },
          { referrer },
        );
      }

      setStage('');
      toast.success(`$${values.symbol} created successfully`);
      setSuccess({
        mint: result.mint,
        signature: result.signature,
        name: values.name,
        symbol: values.symbol,
        usedToken2022: extensions.enabled,
      });
      if (wallet.publicKey) {
        logSolanaSiteAction({
          wallet: wallet.publicKey.toBase58(),
          action: SiteAction.TOKEN_CREATE,
          route: '/create',
          signature: result.signature,
          metadata: withReferrerMetadata({
            mint: result.mint,
            symbol: values.symbol,
            name: values.name,
            token2022: extensions.enabled,
          }),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(err);
      toast.error('Token creation failed', { description: msg });
    } finally {
      setSubmitting(false);
      setStage('');
    }
  };

  const onRevokeMint = async () => {
    if (!success) return;
    setPostBusy('mint');
    try {
      const sig = await revokeMintAuthority(wallet, success.mint, getStoredReferrer());
      toast.success('Mint authority revoked');
      if (wallet.publicKey) {
        logSolanaSiteAction({
          wallet: wallet.publicKey.toBase58(),
          action: SiteAction.TOKEN_REVOKE_MINT,
          route: '/create',
          signature: sig,
          metadata: withReferrerMetadata({ mint: success.mint }),
        });
      }
    } catch (e) {
      toast.error('Revoke failed', {
        description: e instanceof Error ? e.message : '',
      });
    } finally {
      setPostBusy(null);
    }
  };
  const onRevokeFreeze = async () => {
    if (!success) return;
    setPostBusy('freeze');
    try {
      const sig = await revokeFreezeAuthority(wallet, success.mint, getStoredReferrer());
      toast.success('Freeze authority revoked');
      if (wallet.publicKey) {
        logSolanaSiteAction({
          wallet: wallet.publicKey.toBase58(),
          action: SiteAction.TOKEN_REVOKE_FREEZE,
          route: '/create',
          signature: sig,
          metadata: withReferrerMetadata({ mint: success.mint }),
        });
      }
    } catch (e) {
      toast.error('Revoke failed', {
        description: e instanceof Error ? e.message : '',
      });
    } finally {
      setPostBusy(null);
    }
  };

  return (
    <div className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          01 / Create Token
        </div>
        <h1 className="font-display text-4xl md:text-6xl tracking-tight">
          Launch your token in{' '}
          <em className="italic text-sol-green">60 seconds</em>.
        </h1>
        <p className="mt-5 text-muted-foreground max-w-2xl">
          One signed transaction creates the mint, mints the full supply to your
          wallet, and registers Metaplex metadata pinned to IPFS.
        </p>
      </div>

      {!feeWalletConfigured && (
        <div
          data-testid="fee-wallet-warning"
          className="mt-8 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"
        >
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Heads up:</strong> the platform fee destination isn&apos;t configured
            on this deployment yet. Token creation still works — it just won&apos;t collect a
            platform fee until that is enabled.
          </div>
        </div>
      )}

      <div className="mt-10 grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Token details</CardTitle>
              <CardDescription>
                These values are written on-chain and cannot be changed once the
                mint is finalized — except via{' '}
                <Link href="/tools" className="text-sol-green hover:underline">
                  Update Metadata
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                data-testid="create-form"
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid gap-6"
              >
                <div className="grid sm:grid-cols-2 gap-5">
                  <Field
                    label="Token name"
                    error={form.formState.errors.name?.message}
                  >
                    <Input
                      data-testid="input-name"
                      placeholder="Pixel Pup"
                      {...form.register('name')}
                    />
                  </Field>
                  <Field
                    label="Symbol"
                    hint="Max 10 chars, A–Z, 0–9"
                    error={form.formState.errors.symbol?.message}
                  >
                    <Input
                      data-testid="input-symbol"
                      placeholder="PIXEL"
                      maxLength={10}
                      {...form.register('symbol')}
                      onChange={(e) =>
                        form.setValue(
                          'symbol',
                          e.target.value.toUpperCase().slice(0, 10),
                          { shouldValidate: true },
                        )
                      }
                    />
                  </Field>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  <Field
                    label="Decimals"
                    hint="9 is standard for memecoins"
                    error={form.formState.errors.decimals?.message}
                  >
                    <Input
                      data-testid="input-decimals"
                      type="number"
                      min={0}
                      max={9}
                      {...form.register('decimals', { valueAsNumber: true })}
                    />
                  </Field>
                  <Field
                    label="Total supply"
                    error={form.formState.errors.supply?.message}
                  >
                    <Input
                      data-testid="input-supply"
                      placeholder="1,000,000,000"
                      value={supplyValue}
                      onChange={onSupplyChange}
                    />
                  </Field>
                </div>

                <Field
                  label="Description"
                  hint="Optional — shown on Solscan and metadata explorers"
                  error={form.formState.errors.description?.message}
                >
                  <Textarea
                    data-testid="input-description"
                    rows={3}
                    placeholder="A friendly memecoin powered by RootRecord."
                    {...form.register('description')}
                  />
                </Field>

                <div className="grid sm:grid-cols-2 gap-5">
                  <Field label="Logo">
                    <ImageDropzone file={logoFile} onChange={setLogoFile} />
                  </Field>
                  <div className="grid gap-5 content-start">
                    <Field
                      label="Website"
                      error={form.formState.errors.website?.message}
                    >
                      <Input
                        data-testid="input-website"
                        placeholder="https://"
                        {...form.register('website')}
                      />
                    </Field>
                    <Field label="Twitter / X">
                      <Input
                        data-testid="input-twitter"
                        placeholder="@handle"
                        {...form.register('twitter')}
                      />
                    </Field>
                    <Field label="Telegram">
                      <Input
                        data-testid="input-telegram"
                        placeholder="t.me/yourchannel"
                        {...form.register('telegram')}
                      />
                    </Field>
                    <Field label="Discord">
                      <Input
                        data-testid="input-discord"
                        placeholder="discord.gg/yourserver"
                        {...form.register('discord')}
                      />
                    </Field>
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <Token2022Section
                    state={extensions}
                    onChange={setExtensions}
                  />
                </div>

                <div className="border-t border-border pt-6 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm text-muted-foreground">
                    {wallet.connected ? (
                      <>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-sol-green" />
                          Wallet connected
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          Connect a wallet to continue
                        </span>
                      </>
                    )}
                  </div>
                  {wallet.connected ? (
                    <Button
                      type="submit"
                      size="lg"
                      data-testid="create-submit"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {stage || 'Creating…'}
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          {extensions.enabled
                            ? `Create Token-2022 · ${CREATE_FEE_SOL} SOL`
                            : `Create token · ${CREATE_FEE_SOL} SOL`}
                        </>
                      )}
                    </Button>
                  ) : (
                    <div data-testid="connect-wallet-prompt" className="rr-wallet-btn">
                      <WalletMultiButton />
                    </div>
                  )}
                </div>

                <FundingWarning />
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-sol-green" /> What you pay
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Platform fee" value={`${CREATE_FEE_SOL} SOL`} highlight />
              <Row label="On-chain rent + tx" value="≈ 0.01 SOL" />
              <Row
                label="Total estimate"
                value={`≈ ${(CREATE_FEE_SOL + 0.01).toFixed(3)} SOL`}
                bold
              />
              <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                Roughly half what most token creators charge. No subscription.
                No upsells. No surprise costs at signing.
                {REFERRAL_FEE_SHARE_BPS > 0 && (
                  <>
                    {' '}
                    If you arrived with a valid{' '}
                    <span className="font-mono">?ref=</span> link,{' '}
                    {(REFERRAL_FEE_SHARE_BPS / 100).toFixed(
                      REFERRAL_FEE_SHARE_BPS % 100 === 0 ? 0 : 2,
                    )}
                    % of this platform fee is sent to that wallet in the same
                    transaction.
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4 text-sol-purple" /> What happens
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2.5 text-sm">
                {[
                  'Logo uploaded to IPFS via Pinata',
                  'Metadata JSON pinned to IPFS',
                  'Mint created and initialized',
                  'Full supply minted to your wallet',
                  'Metaplex metadata registered',
                  `Platform fee (${CREATE_FEE_SOL} SOL) included`,
                ].map((s, i) => (
                  <li key={s} className="flex items-start gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sol-green/80 shrink-0" />
                    <span className="text-foreground/90">
                      <span className="font-mono text-muted-foreground mr-1">
                        {(i + 1).toString().padStart(2, '0')}
                      </span>
                      {s}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">After creation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Right after the mint confirms you can revoke authorities or mint
                more — each is a separate transaction billed at{' '}
                <strong className="text-foreground">{ACTION_FEE_SOL} SOL</strong>.
              </p>
              <Badge>Tip: revoke mint authority for trust</Badge>
            </CardContent>
          </Card>
        </div>
      </div>

      <SuccessDialog
        payload={success}
        onClose={() => setSuccess(null)}
        onRevokeMint={onRevokeMint}
        onRevokeFreeze={onRevokeFreeze}
        onMintMore={() => {
          if (!success) return;
          window.location.href = `/tools?action=mint&mint=${success.mint}`;
        }}
        busy={postBusy}
        affiliateWallet={wallet.publicKey?.toBase58() ?? null}
      />
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        {hint && (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
      {error && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
  bold,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          'font-mono ' +
          (highlight ? 'text-sol-green ' : '') +
          (bold ? 'font-semibold text-foreground' : '')
        }
      >
        {value}
      </span>
    </div>
  );
}
