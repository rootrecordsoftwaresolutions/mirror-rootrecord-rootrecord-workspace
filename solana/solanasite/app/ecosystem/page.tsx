'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { VersionedTransaction } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  ECOSYSTEM_OTC_TOKEN_MINT,
  ECOSYSTEM_LISTING_NAME,
  ECOSYSTEM_LISTING_SYMBOL,
  ECOSYSTEM_SOLSCAN_CPMM_POOL,
  ECOSYSTEM_SOLSCAN_DEVELOPER,
  ECOSYSTEM_SOLSCAN_TREASURY,
  OTC_USD_PER_TOKEN,
  ecosystemOtcQuoteRetainPercentLabel,
  ecosystemOtcUsdcAutoLpEnabled,
  ecosystemOtcUsdcLpResumeLabel,
  solscanAccount,
  solscanToken,
} from '@/lib/ecosystemOtcConstants';
import { getConnection } from '@/lib/solana';
import { WalletMultiButton } from '@/components/wallet/WalletButton';

const QUOTE_TTL_MS = 30_000;

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/** Row from D1 `ecosystem_otc_fulfillments` (public GET via Worker). */
type OtcD1Row = {
  payment_tx_signature: string;
  buyer: string;
  token_mint: string;
  amount_raw: string;
  pay_with: string;
  out_tx: string | null;
  liquidity_tx: string | null;
  quote_received_raw: string | null;
  tokens_whole: string | null;
  token_decimals: string | null;
  created_at: string;
};

const OTC_HISTORY_UNAVAILABLE =
  'Treasury transfer history is not available yet. Apply D1 migration 0013 on the Worker, deploy rootrecord-primary, and ensure SOLANA_SITE_LOG_URL points at that Worker.';

function shortAddr(a: string, head = 4, tail = 4): string {
  const s = (a || '').trim();
  if (s.length <= head + tail + 1) return s || '—';
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function formatTokenUi(amount_raw: string, decimalsStr: string | null): string {
  try {
    const dec = decimalsStr != null ? parseInt(decimalsStr, 10) : 9;
    const d = Number.isFinite(dec) && dec >= 0 && dec <= 18 ? dec : 9;
    const raw = BigInt(amount_raw || '0');
    const scale = 10n ** BigInt(d);
    const whole = raw / scale;
    const frac = raw % scale;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(d, '0').replace(/0+$/, '') || '0';
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return amount_raw || '—';
  }
}

/** Human line for quote credited to treasury (transfer history table). */
function formatTreasuryDepositLine(payWith: string, raw: string | null): string {
  if (!raw?.trim()) return 'treasury deposit —';
  const n = BigInt(raw);
  if (payWith.toUpperCase() === 'SOL') {
    return `${(Number(n) / 1e9).toFixed(9)} SOL deposited into Treasury`;
  }
  if (payWith.toUpperCase() === 'USDC') {
    return `${(Number(n) / 1e6).toFixed(6)} USDC deposited into Treasury`;
  }
  return `${raw} deposited into Treasury`;
}

function otcHistoryOneLine(row: OtcD1Row): string {
  const mintShort = shortAddr(row.token_mint, 6, 4);
  const buyerShort = shortAddr(row.buyer, 6, 4);
  const pay = (row.pay_with || '—').trim();
  const depositLine = formatTreasuryDepositLine(row.pay_with, row.quote_received_raw);
  const whole =
    row.tokens_whole != null && row.tokens_whole.trim()
      ? row.tokens_whole.trim()
      : formatTokenUi(row.amount_raw, row.token_decimals);
  const withdrawLine = `${whole} ${ECOSYSTEM_LISTING_SYMBOL} Withdrawn → ${buyerShort} · ${mintShort}`;
  return `${pay} · ${depositLine}\n${withdrawLine}`;
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type OtcCheckoutPayload = {
  buyer_wallet: string;
  pay_with: 'SOL' | 'USDC';
  tokens_whole: number;
  quoted_at_ms: number;
  quoted_sol_usd: number;
  memo_utf8?: string;
};

type OtcFinalizePayload = OtcCheckoutPayload & { checkout_tx_signature: string };

type OtcFinalizeJson = {
  ok?: boolean;
  detail?: string;
  /** Some hosts put errors here instead of `detail`. */
  message?: string;
  signature?: string;
  liquidity_tx?: string | null;
  liquidity_error?: string | null;
  liquidity_notice?: string | null;
};

function parseFinalizeJson(text: string): OtcFinalizeJson | null {
  const t = text.trim();
  if (!t) return {};
  try {
    return JSON.parse(t) as OtcFinalizeJson;
  } catch {
    return null;
  }
}

/** Worker returned 401 when Next called D1-backed treasury routes with a mismatched Bearer. */
function otcWorkerBearerMismatchHint(status: number, detail: string | undefined): string | null {
  const d = typeof detail === 'string' ? detail.trim() : '';
  if (status !== 401 || !/^unauthorized$/i.test(d)) return null;
  return (
    'Cloudflare Worker rejected the server Bearer token (401). In Vercel, set SOLANA_SITE_LOG_SECRET to the exact ' +
    'same value as on the rootrecord-primary Worker (`wrangler secret put` / credentials.env), set SOLANA_SITE_LOG_URL ' +
    'to https://rootrecord-primary.rootrecord.workers.dev/api/solana-site/log, redeploy the site, then try again.'
  );
}

function finalizeErrorUserMessage(status: number, finJson: OtcFinalizeJson): string {
  const raw =
    finJson.detail ??
    (typeof finJson.message === 'string' ? finJson.message : undefined);
  if (status === 404 || raw === 'Not Found') {
    return 'Treasury transfer finalize returned 404 (often Cloudflare rootrecord-primary in front of /api with no handler). Fix: redeploy Next so the route exists, or set SOLANA_TOOLS_API_FORWARD_URL on that Worker to your Vercel app origin (no trailing slash), redeploy the Worker, then Retry finalize.';
  }
  return (
    otcWorkerBearerMismatchHint(status, raw) ??
    raw?.trim() ??
    `Treasury transfer finalize failed (${status})`
  );
}

type PrepareCheckoutJson = {
  ok?: boolean;
  checkout_tx_b64?: string;
  code?: string;
  unsigned_tx_b64?: string;
  detail?: string;
};

export default function EcosystemPage() {
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const [treasuryAddr, setTreasuryAddr] = useState<string | null>(null);
  /** SPL UI string from server (same mint as treasury transfers). */
  const [treasuryRootrUi, setTreasuryRootrUi] = useState<string | null>(null);
  const [retryFinalizeBody, setRetryFinalizeBody] = useState<OtcFinalizePayload | null>(null);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const [fulfillLoading, setFulfillLoading] = useState(false);
  const [fulfillMsg, setFulfillMsg] = useState<string | null>(null);
  const [lastOutSig, setLastOutSig] = useState<string | null>(null);
  const [lastLiquidityTx, setLastLiquidityTx] = useState<string | null>(null);
  const [lastLiquidityErr, setLastLiquidityErr] = useState<string | null>(null);
  const [lastLiquidityNotice, setLastLiquidityNotice] = useState<string | null>(null);

  const [otcHistory, setOtcHistory] = useState<OtcD1Row[]>([]);
  const [otcHistoryErr, setOtcHistoryErr] = useState<string | null>(null);
  const [tokenAmount, setTokenAmount] = useState('1000');
  const [payWith, setPayWith] = useState<'SOL' | 'USDC'>('SOL');
  /** SOL/USD from Jupiter; USDC pay leg uses fixed $1 = 1 USDC (locked USD/token notional). */
  const [solUsd, setSolUsd] = useState<number | null>(null);
  const [priceFetchedAt, setPriceFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadOtcHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/solana-site/ecosystem-otc-history?limit=80');
      const text = await res.text();
      const parsed = parseJsonRecord(text);
      const j = (parsed ?? {}) as {
        ok?: boolean;
        rows?: OtcD1Row[];
        detail?: string;
        skipped?: boolean;
      };
      if (res.ok && j.ok && Array.isArray(j.rows)) {
        setOtcHistoryErr(null);
        setOtcHistory(j.rows);
        return;
      }
      const detailStr = typeof j.detail === 'string' ? j.detail.trim() : '';
      const bodySnippet = !parsed && text.trim() ? text.trim().slice(0, 200) : '';
      let msg =
        detailStr ||
        bodySnippet ||
        `Could not load treasury transfer history (HTTP ${res.status}).`;
      if (j.skipped === true || res.status === 404 || /^not found$/i.test(msg.trim())) {
        msg = OTC_HISTORY_UNAVAILABLE;
      }
      setOtcHistoryErr(msg);
      setOtcHistory([]);
    } catch {
      setOtcHistoryErr('Network error loading treasury transfer history');
      setOtcHistory([]);
    }
  }, []);

  const loadTreasuryInfo = useCallback(async () => {
    try {
      const r = await fetch('/api/ecosystem/otc-treasury');
      const j = (await r.json()) as {
        ok?: boolean;
        treasury?: string;
        rootr_balance_ui?: string | null;
      };
      if (j.ok && j.treasury) {
        setTreasuryAddr(j.treasury);
        setTreasuryRootrUi(
          typeof j.rootr_balance_ui === 'string' && j.rootr_balance_ui.trim()
            ? j.rootr_balance_ui.trim()
            : null,
        );
      } else {
        setTreasuryAddr(null);
        setTreasuryRootrUi(null);
      }
    } catch {
      setTreasuryAddr(null);
      setTreasuryRootrUi(null);
    }
  }, []);

  const refreshPrices = useCallback(async () => {
    try {
      const r = await fetch('/api/ecosystem/jup-prices');
      const j = (await r.json()) as {
        ok?: boolean;
        sol_usd?: number;
        detail?: string;
      };
      if (r.ok && j.ok && j.sol_usd) {
        setSolUsd(j.sol_usd);
        setPriceFetchedAt(Date.now());
      }
    } catch {
      /* ignore */
    }
    void loadTreasuryInfo();
  }, [loadTreasuryInfo]);

  useEffect(() => {
    void loadOtcHistory();
    const t = setInterval(() => void loadOtcHistory(), 45_000);
    return () => clearInterval(t);
  }, [loadOtcHistory]);

  useEffect(() => {
    void refreshPrices();
    const t = setInterval(() => void refreshPrices(), 12_000);
    return () => clearInterval(t);
  }, [refreshPrices]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void loadTreasuryInfo();
    const t = setInterval(() => void loadTreasuryInfo(), 25_000);
    return () => clearInterval(t);
  }, [loadTreasuryInfo]);

  const quoteDeadline = priceFetchedAt != null ? priceFetchedAt + QUOTE_TTL_MS : null;
  const secondsLeft =
    quoteDeadline != null ? Math.max(0, Math.ceil((quoteDeadline - now) / 1000)) : null;
  const quoteStale = secondsLeft === 0;

  const walletIsTreasury = useMemo(
    () =>
      Boolean(
        publicKey &&
          treasuryAddr &&
          publicKey.toBase58() === treasuryAddr.trim(),
      ),
    [publicKey, treasuryAddr],
  );

  const otc = useMemo(() => {
    const parsed = parseFloat(tokenAmount.replace(/,/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0 || !solUsd) {
      return {
        tokensWhole: null as number | null,
        usdTotal: null as number | null,
        solIdeal: null as number | null,
        usdcIdeal: null as number | null,
        solLamports: null as number | null,
        usdcMicro: null as number | null,
      };
    }
    const tokensWhole = Math.max(1, Math.ceil(parsed));
    const usdTotal = tokensWhole * OTC_USD_PER_TOKEN;
    const solIdeal = usdTotal / solUsd;
    const usdcIdeal = usdTotal;
    const solLamports = Math.max(1, Math.ceil(solIdeal * 1e9));
    const usdcMicro = Math.max(1, Math.ceil(usdcIdeal * 1e6));
    return { tokensWhole, usdTotal, solIdeal, usdcIdeal, solLamports, usdcMicro };
  }, [tokenAmount, solUsd]);

  const payAndClaim = useCallback(async () => {
    setFulfillMsg(null);
    setActionHint(null);
    setLastOutSig(null);
    setLastLiquidityTx(null);
    setLastLiquidityErr(null);
    setLastLiquidityNotice(null);
    setRetryFinalizeBody(null);
    if (otc.tokensWhole == null || quoteStale || priceFetchedAt == null) {
      setFulfillMsg('Refresh prices and stay within the quote window.');
      return;
    }
    if (!publicKey) {
      setFulfillMsg('Connect your wallet first; it pays fees and signs the treasury payment.');
      return;
    }
    if (!treasuryAddr) {
      setFulfillMsg('Treasury is not configured yet.');
      return;
    }
    if (publicKey.toBase58() === treasuryAddr.trim()) {
      setFulfillMsg(
        'Your connected wallet is the deposit treasury. Switch to a different wallet to pay and receive tokens.',
      );
      return;
    }
    if (!signTransaction && !sendTransaction) {
      setFulfillMsg('Your wallet cannot sign transactions from this page.');
      return;
    }
    if (otc.solLamports == null || otc.usdcMicro == null) {
      setFulfillMsg('Invalid amount.');
      return;
    }
    if (solUsd == null || !Number.isFinite(solUsd) || solUsd <= 0) {
      setFulfillMsg('SOL price not loaded; tap Refresh prices.');
      return;
    }

    const conn = getConnection();
    let finalizeBody: OtcFinalizePayload | undefined;

    setFulfillLoading(true);
    try {
      setActionHint('Preparing treasury transfer…');
      const mint = ECOSYSTEM_OTC_TOKEN_MINT;
      const mintShort =
        mint.length > 14 ? `${mint.slice(0, 6)}…${mint.slice(-4)}` : mint;
      const usdNotional =
        otc.usdTotal != null ? otc.usdTotal.toFixed(6) : String(otc.tokensWhole * OTC_USD_PER_TOKEN);
      const memoUtf8 = `RootRecord treasury transfer: receive ${otc.tokensWhole} tokens (${usdNotional} USD @ $${OTC_USD_PER_TOKEN}/token). Pay ${payWith}. Output mint ${mintShort}.`;

      const checkoutBase: OtcCheckoutPayload = {
        buyer_wallet: publicKey.toBase58(),
        pay_with: payWith,
        tokens_whole: otc.tokensWhole,
        quoted_at_ms: priceFetchedAt,
        quoted_sol_usd: solUsd,
        memo_utf8: memoUtf8,
      };

      const runPrepare = async () => {
        const pr = await fetch('/api/ecosystem/prepare-otc-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(checkoutBase),
        });
        return { pr, j: (await pr.json()) as PrepareCheckoutJson };
      };

      let { pr: prepRes, j: prepJson } = await runPrepare();
      if (prepRes.status === 428 && prepJson.code === 'needs_ata') {
        if (!signTransaction || !prepJson.unsigned_tx_b64) {
          setFulfillMsg(
            prepJson.detail ||
              'Connect a wallet that can sign transactions so you can pay the token account rent.',
          );
          return;
        }
        setActionHint('Create token account in your wallet…');
        const ataVtx = VersionedTransaction.deserialize(
          base64ToUint8Array(prepJson.unsigned_tx_b64),
        );
        const ataSigned = await signTransaction(ataVtx);
        const latestAta = await conn.getLatestBlockhash('confirmed');
        const ataSig = await conn.sendRawTransaction(ataSigned.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
        await conn.confirmTransaction({ signature: ataSig, ...latestAta }, 'confirmed');
        const again = await runPrepare();
        prepRes = again.pr;
        prepJson = again.j;
      }

      if (!prepRes.ok || !prepJson.ok || !prepJson.checkout_tx_b64) {
        setFulfillMsg(
          otcWorkerBearerMismatchHint(prepRes.status, prepJson.detail) ??
            prepJson.detail ??
            `Prepare failed (${prepRes.status})`,
        );
        return;
      }

      const checkoutVtx = VersionedTransaction.deserialize(
        base64ToUint8Array(prepJson.checkout_tx_b64),
      );

      setActionHint('Review treasury transfer in your wallet (payment + tokens in one transaction)…');
      let checkoutSig: string;
      if (sendTransaction) {
        checkoutSig = await sendTransaction(checkoutVtx, conn, {
          skipPreflight: false,
          maxRetries: 3,
        });
      } else if (signTransaction) {
        const signed = await signTransaction(checkoutVtx);
        checkoutSig = await conn.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
      } else {
        setFulfillMsg('Could not sign from this wallet.');
        return;
      }

      finalizeBody = { ...checkoutBase, checkout_tx_signature: checkoutSig };

      setActionHint('Confirming on-chain…');
      await conn.confirmTransaction(checkoutSig, 'confirmed');

      setActionHint('Finalizing…');
      const finRes = await fetch('/api/ecosystem/finalize-otc-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalizeBody),
      });
      const finText = await finRes.text();
      const finJson = parseFinalizeJson(finText);
      if (finJson === null) {
        setFulfillMsg(
          finRes.status === 404
            ? finalizeErrorUserMessage(404, {})
            : 'Invalid response from treasury transfer finalize endpoint.',
        );
        setRetryFinalizeBody(finalizeBody);
        return;
      }
      if (!finRes.ok || !finJson.ok) {
        setFulfillMsg(finalizeErrorUserMessage(finRes.status, finJson));
        setRetryFinalizeBody(finalizeBody);
        return;
      }
      setLastOutSig(finJson.signature ?? null);
      setLastLiquidityTx(finJson.liquidity_tx ?? null);
      setLastLiquidityErr(finJson.liquidity_error ?? null);
      setLastLiquidityNotice(finJson.liquidity_notice ?? null);
      setFulfillMsg(null);
      setRetryFinalizeBody(null);
      void loadOtcHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/user rejected|rejected the request|denied|declined/i.test(msg)) {
        setFulfillMsg('Treasury transfer was cancelled in the wallet.');
      } else {
        setFulfillMsg(msg || 'Something went wrong.');
      }
      if (finalizeBody) setRetryFinalizeBody(finalizeBody);
    } finally {
      setActionHint(null);
      setFulfillLoading(false);
    }
  }, [
    loadOtcHistory,
    otc.solLamports,
    otc.tokensWhole,
    otc.usdcMicro,
    payWith,
    priceFetchedAt,
    publicKey,
    solUsd,
    quoteStale,
    sendTransaction,
    signTransaction,
    treasuryAddr,
    walletIsTreasury,
  ]);

  const retryFinalizeOnly = useCallback(async () => {
    if (!retryFinalizeBody) return;
    if (
      publicKey &&
      treasuryAddr &&
      publicKey.toBase58() === treasuryAddr.trim()
    ) {
      setFulfillMsg(
        'Your connected wallet is the deposit treasury. Switch to a different wallet to retry.',
      );
      return;
    }
    setFulfillMsg(null);
    setFulfillLoading(true);
    try {
      const finRes = await fetch('/api/ecosystem/finalize-otc-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retryFinalizeBody),
      });
      const finText = await finRes.text();
      const finJson = parseFinalizeJson(finText);
      if (finJson === null) {
        setFulfillMsg(
          finRes.status === 404
            ? finalizeErrorUserMessage(404, {})
            : 'Invalid response from treasury transfer finalize endpoint.',
        );
        return;
      }
      if (!finRes.ok || !finJson.ok) {
        setFulfillMsg(finalizeErrorUserMessage(finRes.status, finJson));
        return;
      }
      setLastOutSig(finJson.signature ?? null);
      setLastLiquidityTx(finJson.liquidity_tx ?? null);
      setLastLiquidityErr(finJson.liquidity_error ?? null);
      setLastLiquidityNotice(finJson.liquidity_notice ?? null);
      setFulfillMsg(null);
      setRetryFinalizeBody(null);
      void loadOtcHistory();
    } catch {
      setFulfillMsg('Network error');
    } finally {
      setFulfillLoading(false);
    }
  }, [loadOtcHistory, publicKey, retryFinalizeBody, treasuryAddr]);

  return (
    <div className="container py-14 md:py-20 max-w-4xl space-y-10">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          Interactive whitepaper
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">Purpose</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          {ECOSYSTEM_LISTING_NAME} ({ECOSYSTEM_LISTING_SYMBOL}) on Solana: why the token exists, how
          fees and treasury liquidity fit together, and a live Treasury Transfer Tool on the same
          page—read first, then act on-chain.
        </p>
      </div>

      <Card id="tokenomics" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl">
            {ECOSYSTEM_LISTING_SYMBOL} — tokenomics &amp; mechanics
          </CardTitle>
          <CardDescription className="text-base leading-relaxed">
            From the developer: economics, wallets, pool, and treasury transfers. Descriptive only —{' '}
            <strong className="text-foreground">not financial advice</strong>. Do your own research.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-8 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              Why {ECOSYSTEM_LISTING_SYMBOL}
            </h2>
            <p>
              {ECOSYSTEM_LISTING_NAME} (ticker{' '}
              <strong className="text-foreground">{ECOSYSTEM_LISTING_SYMBOL}</strong>) is the
              treasury-aligned token for RootRecord&apos;s Solana tooling — built to support{' '}
              <strong className="text-foreground">utility</strong> and long-term operations on{' '}
              <a
                href="https://solana.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sol-green hover:underline"
              >
                Solana
              </a>
              , not a short-lived memecoin narrative.
            </p>
            <p>
              Whenever this site&apos;s Solana tooling is used, small fees are collected on each
              action. They are designed to stay cheap; over time they add up. The goal is a system
              where value accrues to the community and holders—not only to the developer.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Key terms</h2>
            <ul className="list-disc pl-5 space-y-2 marker:text-muted-foreground">
              <li>
                <a
                  href={solscanAccount(ECOSYSTEM_SOLSCAN_TREASURY)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sol-green hover:underline font-medium"
                >
                  Treasury wallet
                </a>{' '}
                <span className="font-mono text-xs text-foreground/80">({ECOSYSTEM_SOLSCAN_TREASURY})</span>
                {' — '}
                holds tokens and sale proceeds until deployed (transfers, LP adds, reserves). Live
                deposit address for the Treasury Transfer Tool is also shown{' '}
                <a href="#ecosystem-treasury" className="text-sol-green hover:underline">
                  below
                </a>
                .
              </li>
              <li>
                <a
                  href={solscanAccount(ECOSYSTEM_SOLSCAN_CPMM_POOL)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sol-green hover:underline font-medium"
                >
                  Liquidity pool (Raydium CPMM)
                </a>{' '}
                <span className="font-mono text-xs text-foreground/80">({ECOSYSTEM_SOLSCAN_CPMM_POOL})</span>
                {' — '}
                public pool where paired {ECOSYSTEM_LISTING_SYMBOL} + quote trade.
              </li>
              <li>
                <a
                  href={solscanAccount(ECOSYSTEM_SOLSCAN_DEVELOPER)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sol-green hover:underline font-medium"
                >
                  Developer / operations wallet
                </a>{' '}
                <span className="font-mono text-xs text-foreground/80">({ECOSYSTEM_SOLSCAN_DEVELOPER})</span>
                {' — '}
                used for stabilization-style flows (small, capped trades on the pool, often via
                Jupiter) so activity spreads over time instead of one huge print.
              </li>
              <li>
                <a
                  href={solscanToken(ECOSYSTEM_OTC_TOKEN_MINT)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sol-green hover:underline font-medium"
                >
                  {ECOSYSTEM_LISTING_SYMBOL} mint
                </a>{' '}
                <span className="font-mono text-xs text-foreground/80">({ECOSYSTEM_OTC_TOKEN_MINT})</span>
                {' — '}
                SPL mint for this program.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Fees → liquidity</h2>
            <p>
              Fees from on-site activity tied to {ECOSYSTEM_LISTING_SYMBOL} (liquidity adds, bulk
              transfers, and other paid
              flows) are routed into automation that prioritizes growing the Raydium LP—deposit
              project token + quote so TVL reflects real usage. Additional funds from other products
              can be transferred in when the operator chooses.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Treasury &amp; long-term plan</h2>
            <p>
              The treasury holds unused {ECOSYSTEM_LISTING_SYMBOL} and related reserves; it is the
              largest inventory
              account and funds fair, systemic growth. It can also hold LP positions—the keys to
              withdrawing liquidity when needed for infrastructure, servers, and longer-term goals
              (for example off-grid property work the team has described publicly).
            </p>
            <p>
              Long term, the aim is to <strong className="text-foreground">distribute tokens</strong>{' '}
              and grow the pool to a solid baseline. After treasury inventory is fully deployed into
              distribution / LP as planned, system emphasis can shift from “add to LP” toward{' '}
              <strong className="text-foreground">buybacks</strong> funded by ongoing usage—so
              continued tool use supports holders while others trade in the open pool.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Peg &amp; pool stabilization</h2>
            <p>
              While minted supply is still being distributed or placed into the LP, an in-house
              program targets a <strong className="text-foreground">flat treasury reference</strong> of{' '}
              <strong className="text-foreground">${OTC_USD_PER_TOKEN} USD per whole token</strong>{' '}
              on the Treasury Transfer Tool below. Directionally: when buys hit the LP, treasury-side
              flows can sell into strength; when sells hit the LP, flows can buy to support the
              reference—always subject to inventory, caps, and on-chain reality (not a guarantee of
              price).
            </p>
            <p>
              Small, capped mirror-style activity on the Raydium CPMM (often executed with Jupiter)
              is designed to follow real flow instead of moving the book in a single print. Mirror
              profits are treated like other treasury resources: limited sells, throttled buy-backs
              when inventory is already large, and batched trades so RPC and swap costs stay
              predictable.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Treasury Transfer Tool (below)</h2>
            <p>
              The in-house transfer tool offers {ECOSYSTEM_LISTING_SYMBOL} at a predictable USD rate
              for whole tokens.
              If the open market is far from that reference, arbitrageurs may appear—that can help
              realign pricing when automation alone cannot pin the pool.
            </p>
            <p>
              On each treasury transfer, received SOL/USDC is split for automation: about{' '}
              <strong className="text-foreground">{ecosystemOtcQuoteRetainPercentLabel()}</strong> of
              the quote can remain in treasury for fees, reserves, and stabilization; the rest
              follows the deployment&apos;s CPMM add-liquidity path (see site notices for USDC seed
              windows). Numbers are enforced on-chain and in worker logic—not a promise of a fixed
              APY.
            </p>
            <p className="text-xs text-muted-foreground/90 border-t border-border/60 pt-4">
              Mint (Solscan):{' '}
              <a
                href={solscanToken(ECOSYSTEM_OTC_TOKEN_MINT)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sol-green hover:underline break-all"
              >
                {ECOSYSTEM_OTC_TOKEN_MINT}
              </a>
            </p>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Treasury Transfer Tool</CardTitle>
          <CardDescription className="leading-relaxed">
            <span className="block">Purchase tokens directly from the treasury.</span>
            <span className="block mt-1.5">
              RootRecord matches your transfer into the liquidity pool automatically.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2" id="ecosystem-treasury">
            <h3 className="text-sm font-medium text-foreground">Treasury wallet</h3>
            {treasuryAddr ? (
              <>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <span className="font-mono text-xs sm:text-sm break-all text-foreground/90">
                    {treasuryAddr}
                  </span>{' '}
                  <a
                    href={`https://solscan.io/account/${treasuryAddr}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sol-green hover:underline whitespace-nowrap"
                  >
                    Solscan
                  </a>
                </p>
                {treasuryRootrUi != null ? (
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground font-medium">{ECOSYSTEM_LISTING_SYMBOL}</strong>{' '}
                    in treasury:{' '}
                    <span className="font-mono tabular-nums">{treasuryRootrUi}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {ECOSYSTEM_LISTING_SYMBOL} balance not loaded (no token account yet or RPC error).
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Deposit treasury wallet is not configured on the server yet.
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="eco-amt">Token amount (fractions round up to whole tokens)</Label>
            <Input
              id="eco-amt"
              value={tokenAmount}
              onChange={(e) => setTokenAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Label htmlFor="eco-pay-with" className="text-muted-foreground font-normal">
              Pay with
            </Label>
            <select
              id="eco-pay-with"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              value={payWith}
              onChange={(e) => setPayWith(e.target.value as 'SOL' | 'USDC')}
            >
              <option value="SOL">SOL</option>
              <option value="USDC">USDC</option>
            </select>
          </div>
          {payWith === 'USDC' && !ecosystemOtcUsdcAutoLpEnabled() ? (
            <p className="text-sm text-muted-foreground leading-relaxed rounded-md border border-border bg-ink-700/20 px-3 py-2">
              USDC pool-side deposits are paused until the USDC CPMM LP exists. Until{' '}
              <strong className="text-foreground">{ecosystemOtcUsdcLpResumeLabel()}</strong>, your
              USDC payment is held for the initial seed; token delivery still runs as usual.
            </p>
          ) : null}
          <div className="rounded-lg border border-border bg-ink-700/30 px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Tokens (rounded up)</span>
              <span className="font-mono">{otc.tokensWhole != null ? String(otc.tokensWhole) : '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Notional @ {OTC_USD_PER_TOKEN} USD / token</span>
              <span className="font-mono">
                {otc.usdTotal != null ? `≈ $${otc.usdTotal.toFixed(6)}` : '—'}
              </span>
            </div>
            {payWith === 'SOL' ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">SOL to send (rounded up)</span>
                <span className="font-mono">
                  {otc.solLamports != null
                    ? `${(otc.solLamports / 1e9).toFixed(9)} SOL`
                    : '—'}
                </span>
              </div>
            ) : (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">USDC to send (rounded up)</span>
                <span className="font-mono">
                  {otc.usdcMicro != null
                    ? `${(otc.usdcMicro / 1e6).toFixed(6)} USDC`
                    : '—'}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4 text-xs text-muted-foreground">
              <span>Quote window</span>
              <span>
                {secondsLeft != null
                  ? quoteStale
                    ? 'Expired — refresh'
                    : `${secondsLeft}s remaining`
                  : 'Loading prices…'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Wallet (pays &amp; receives)</span>
            <WalletMultiButton />
          </div>
          {!publicKey ? (
            <p className="text-sm text-muted-foreground">
              Connect the wallet that will sign the treasury payment and receive the tokens.
            </p>
          ) : null}
          {walletIsTreasury ? (
            <p className="text-sm text-destructive leading-relaxed">
              This wallet is the deposit treasury. The Treasury Transfer Tool needs a{' '}
              <strong className="text-foreground">different</strong>{' '}
              wallet to send SOL or USDC and receive the project tokens; paying from the treasury
              only pays the network fee and does not credit a purchase.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => void refreshPrices()}>
              Refresh prices
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                fulfillLoading ||
                !treasuryAddr ||
                !publicKey ||
                walletIsTreasury ||
                quoteStale ||
                otc.tokensWhole == null ||
                priceFetchedAt == null
              }
              onClick={() => void payAndClaim()}
            >
              {fulfillLoading ? 'Working…' : 'Sign treasury transfer (pay + receive tokens)'}
            </Button>
            {retryFinalizeBody ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={fulfillLoading || walletIsTreasury}
                onClick={() => void retryFinalizeOnly()}
              >
                Retry finalize (transfer already sent)
              </Button>
            ) : null}
          </div>
          {actionHint ? (
            <p className="text-sm text-muted-foreground">{actionHint}</p>
          ) : null}
          {fulfillMsg ? (
            <p className="text-sm text-destructive">{fulfillMsg}</p>
          ) : null}
          {lastOutSig ? (
            <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/40 px-4 py-3 text-sm space-y-2">
              <p className="font-medium text-emerald-100">Treasury transfer confirmed</p>
              <p className="text-muted-foreground leading-relaxed">
                Your payment and token receipt are in one on-chain transaction. Use the link below to
                open the transaction on Solscan and verify balance changes.
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Transaction</p>
              <a
                href={`https://solscan.io/tx/${lastOutSig}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block font-mono text-[11px] sm:text-xs text-sol-green hover:underline break-all"
              >
                {lastOutSig}
              </a>
            </div>
          ) : null}
          {lastLiquidityTx ? (
            <p className="text-sm text-muted-foreground">
              Pool deposit:{' '}
              <a
                href={`https://solscan.io/tx/${lastLiquidityTx}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-sol-green hover:underline"
              >
                {lastLiquidityTx.slice(0, 16)}…
              </a>
            </p>
          ) : null}
          {lastLiquidityErr ? (
            <p className="text-sm text-amber-600/90">Liquidity step: {lastLiquidityErr}</p>
          ) : null}
          {lastLiquidityNotice ? (
            <p className="text-sm text-muted-foreground leading-relaxed">{lastLiquidityNotice}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Treasury Transfer history</CardTitle>
            <CardDescription>A log of all direct transfers.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void loadOtcHistory()}>
            Refresh history
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {otcHistoryErr && otcHistoryErr !== OTC_HISTORY_UNAVAILABLE ? (
            <p className="text-sm text-destructive">{otcHistoryErr}</p>
          ) : null}
          {otcHistoryErr === OTC_HISTORY_UNAVAILABLE ? (
            <p className="text-sm text-muted-foreground leading-relaxed">{otcHistoryErr}</p>
          ) : null}
          {otcHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No treasury transfers recorded yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[1] border-b border-border bg-ink-900/95 backdrop-blur-sm">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium whitespace-nowrap w-[140px]">When</th>
                    <th className="px-3 py-2 font-medium">Transaction</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">Transfer · LP add</th>
                  </tr>
                </thead>
                <tbody>
                  {otcHistory.map((row) => {
                    const sigShort = (s: string) =>
                      s.length > 20 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
                    const checkout = row.payment_tx_signature?.trim();
                    const lp = row.liquidity_tx?.trim() || '';
                    const out = row.out_tx?.trim();
                    const showSeparateOut =
                      out && checkout && out !== checkout;
                    return (
                      <tr key={checkout} className="border-t border-border/70 align-top">
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {row.created_at}
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground/90 leading-snug whitespace-pre-line">
                          {otcHistoryOneLine(row)}
                        </td>
                        <td className="px-3 py-2 text-[11px] font-mono whitespace-nowrap">
                          <div className="flex flex-col gap-1 min-w-[200px]">
                            <span>
                              <span className="text-muted-foreground">Transfer </span>
                              <a
                                href={`https://solscan.io/tx/${checkout}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sol-green hover:underline"
                              >
                                {sigShort(checkout)}
                              </a>
                            </span>
                            <span>
                              <span className="text-muted-foreground">LP </span>
                              {lp ? (
                                <a
                                  href={`https://solscan.io/tx/${lp}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sol-green hover:underline"
                                >
                                  {sigShort(lp)}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </span>
                            {showSeparateOut ? (
                              <span>
                                <span className="text-muted-foreground">Token out </span>
                                <a
                                  href={`https://solscan.io/tx/${out}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sol-green hover:underline"
                                >
                                  {sigShort(out)}
                                </a>
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
