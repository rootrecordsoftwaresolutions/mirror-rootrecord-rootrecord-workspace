
import { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from '@solana/spl-token';
import { toast } from 'sonner';
import { ExternalLink, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WalletMultiButton } from '@/components/wallet/WalletButton';
import { getStreamflowClient } from '@/lib/streamflowClient';
import { explorerUrl, getConnection } from '@/lib/solana';
import {
  DEFAULT_PERIOD_SECONDS,
  parseHumanAmountToRaw,
  splitLinearVesting,
} from '@/lib/vestingAmounts';

/** Detect SPL vs Token-2022 from the mint account owner. */
async function detectTokenProgram(mint: PublicKey) {
  const connection = getConnection();
  const info = await connection.getAccountInfo(mint);
  if (!info) {
    throw new Error('Mint not found on this cluster');
  }
  return info.owner;
}

export function LinearVestingClient() {
  const wallet = useWallet();
  const { publicKey, connected, signTransaction } = wallet;

  const [mintStr, setMintStr] = useState('');
  const [recipientStr, setRecipientStr] = useState('');
  const [amountHuman, setAmountHuman] = useState('');
  const [streamName, setStreamName] = useState('Team allocation');
  const [startLocal, setStartLocal] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [periodMonths, setPeriodMonths] = useState('12');
  const [decimals, setDecimals] = useState<number | null>(null);
  const [mintLabel, setMintLabel] = useState('');
  const [loadingMint, setLoadingMint] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadMint = useCallback(async () => {
    const t = mintStr.trim();
    if (!t) {
      setDecimals(null);
      setMintLabel('');
      return;
    }
    let pk: PublicKey;
    try {
      pk = new PublicKey(t);
    } catch {
      toast.error('Invalid mint address');
      setDecimals(null);
      return;
    }
    setLoadingMint(true);
    try {
      const programId = await detectTokenProgram(pk);
      const connection = getConnection();
      const m = await getMint(connection, pk, 'confirmed', programId);
      setDecimals(m.decimals);
      setMintLabel(
        `${m.decimals} decimals · ${programId.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL'}`,
      );
    } catch (e) {
      setDecimals(null);
      setMintLabel('');
      toast.error(e instanceof Error ? e.message : 'Could not load mint');
    } finally {
      setLoadingMint(false);
    }
  }, [mintStr]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !publicKey || !signTransaction) {
      toast.error('Connect a wallet first');
      return;
    }
    const months = Math.max(1, Math.min(120, parseInt(periodMonths, 10) || 0));
    if (months < 1) {
      toast.error('Enter a valid number of months (1–120)');
      return;
    }
    let mintPk: PublicKey;
    let recipientPk: PublicKey;
    try {
      mintPk = new PublicKey(mintStr.trim());
      recipientPk = new PublicKey(recipientStr.trim());
    } catch {
      toast.error('Check mint and recipient addresses');
      return;
    }
    if (decimals === null) {
      toast.error('Load the mint (tab out of the field) so decimals are known');
      return;
    }
    const { raw: totalRaw, error: parseErr } = parseHumanAmountToRaw(amountHuman, decimals);
    if (parseErr) {
      toast.error(parseErr);
      return;
    }
    const { amountPerPeriod, cliffAmount, error: splitErr } = splitLinearVesting(totalRaw, months);
    if (splitErr) {
      toast.error(splitErr);
      return;
    }

    const connection = getConnection();
    const programId = await detectTokenProgram(mintPk);
    const senderAta = await getAssociatedTokenAddress(mintPk, publicKey, false, programId);
    const acc = await getAccount(connection, senderAta, undefined, programId).catch(() => null);
    if (!acc) {
      toast.error('No token account for this mint—fund your wallet’s ATA first');
      return;
    }
    const have = BigInt(acc.amount.toString());
    const need = BigInt(totalRaw.toString());
    if (have < need) {
      toast.error(
        'Your wallet does not hold enough of this token in its associated token account for the amount you entered',
      );
      return;
    }

    const startSec = Math.floor(new Date(startLocal).getTime() / 1000);
    if (!Number.isFinite(startSec)) {
      toast.error('Invalid start time');
      return;
    }
    const cliffSec = startSec;

    setSubmitting(true);
    try {
      const client = getStreamflowClient();
      const { txId } = await client.create(
        {
          tokenId: mintPk.toBase58(),
          recipient: recipientPk.toBase58(),
          start: startSec,
          period: DEFAULT_PERIOD_SECONDS,
          cliff: cliffSec,
          cliffAmount,
          amountPerPeriod,
          amount: totalRaw,
          name: streamName.trim().slice(0, 64) || 'Vesting',
          cancelableBySender: true,
          cancelableByRecipient: false,
          transferableBySender: false,
          transferableByRecipient: true,
          canTopup: false,
          canPause: false,
          canUpdateRate: false,
          automaticWithdrawal: false,
          tokenProgramId: programId,
        },
        { sender: wallet as never, isNative: false },
      );
      toast.success('Vesting stream created');
      const url = explorerUrl(txId, 'tx');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
        Creates a{' '}
        <strong className="text-foreground">linear vesting stream</strong> through the{' '}
        <a
          href="https://streamflow.finance"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sol-green underline-offset-4 hover:underline"
        >
          Streamflow
        </a>{' '}
        program on Solana. You fund the stream from your token account; the recipient claims on
        Streamflow’s interface. A protocol fee may apply (see their docs). RootRecord does not add
        a platform fee to this flow.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <WalletMultiButton />
        {connected && publicKey ? (
          <span className="text-xs font-mono text-muted-foreground">
            {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
          </span>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="max-w-xl space-y-5">
        <div className="space-y-2">
          <Label htmlFor="mint">SPL mint</Label>
          <Input
            id="mint"
            value={mintStr}
            onChange={(e) => setMintStr(e.target.value)}
            onBlur={loadMint}
            placeholder="Token mint address"
            className="font-mono text-sm"
            autoComplete="off"
          />
          {loadingMint ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading mint…
            </p>
          ) : mintLabel ? (
            <p className="text-xs text-sol-green/90">{mintLabel}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipient">Recipient wallet</Label>
          <Input
            id="recipient"
            value={recipientStr}
            onChange={(e) => setRecipientStr(e.target.value)}
            placeholder="Address that will claim unlocked tokens"
            className="font-mono text-sm"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Total to vest (human amount)</Label>
          <Input
            id="amount"
            value={amountHuman}
            onChange={(e) => setAmountHuman(e.target.value)}
            placeholder="e.g. 1_000_000 or 1000000.5"
            inputMode="decimal"
            className="font-mono text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="start">Vesting start (local)</Label>
            <Input
              id="start"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="months">Number of equal periods</Label>
            <Input
              id="months"
              type="number"
              min={1}
              max={120}
              value={periodMonths}
              onChange={(e) => setPeriodMonths(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              {`Each period is ${DEFAULT_PERIOD_SECONDS / 86_400} days. Remainder from integer division is released at vesting start; the rest is split across periods.`}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Stream label (optional)</Label>
          <Input
            id="name"
            value={streamName}
            onChange={(e) => setStreamName(e.target.value)}
            maxLength={64}
          />
        </div>

        <Button
          type="submit"
          disabled={!connected || submitting || decimals === null}
          className="gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing…
            </>
          ) : (
            'Create vesting stream'
          )}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground max-w-2xl border-t border-border/60 pt-6">
        Manage and withdraw from existing streams in the official app:{' '}
        <a
          href="https://app.streamflow.finance/vesting"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sol-green inline-flex items-center gap-1 hover:underline"
        >
          app.streamflow.finance
          <ExternalLink className="h-3 w-3" />
        </a>
        .
      </p>
    </div>
  );
}
