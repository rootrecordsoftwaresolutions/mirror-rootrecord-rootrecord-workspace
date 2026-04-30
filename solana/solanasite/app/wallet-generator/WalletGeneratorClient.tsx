'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import QRCode from 'react-qr-code';
import {
  ChevronDown,
  Copy,
  Download,
  Droplets,
  FileText,
  LayoutTemplate,
  Leaf,
  Printer,
  RefreshCw,
  Scissors,
  ShieldAlert,
  Sparkles,
  Sunrise,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Mutually exclusive `document.documentElement` classes for print themes (economy = none). */
const PRINT_THEME_HTML_CLASSES = ['wallet-print--color', 'wallet-print--premium', 'wallet-print--sepia'] as const;

export type WalletPrintTheme = 'economy' | 'vivid' | 'premium' | 'sepia';

function clearPrintThemeClasses() {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  PRINT_THEME_HTML_CLASSES.forEach((c) => el.classList.remove(c));
}

function applyPrintTheme(theme: WalletPrintTheme) {
  clearPrintThemeClasses();
  if (theme === 'vivid') document.documentElement.classList.add('wallet-print--color');
  if (theme === 'premium') document.documentElement.classList.add('wallet-print--premium');
  if (theme === 'sepia') document.documentElement.classList.add('wallet-print--sepia');
}

const PRINT_MENU: {
  theme: WalletPrintTheme;
  label: string;
  hint: string;
  icon: typeof Printer;
}[] = [
  { theme: 'economy', label: 'Save ink', hint: 'Light panels, outline Solana mark', icon: Leaf },
  { theme: 'vivid', label: 'Vivid', hint: 'Brand gradients & dark panels', icon: Sparkles },
  { theme: 'premium', label: 'Premium dark', hint: 'Matte charcoal, high-contrast type', icon: Droplets },
  { theme: 'sepia', label: 'Warm paper', hint: 'Cream & sepia tones', icon: Sunrise },
];

function PrintStyleDropdown() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const runPrint = useCallback((theme: WalletPrintTheme) => {
    if (typeof window === 'undefined') return;
    applyPrintTheme(theme);
    setOpen(false);
    requestAnimationFrame(() => window.print());
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        variant="purple"
        className="min-w-[10.5rem] justify-between gap-2"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="inline-flex items-center gap-2">
          <Printer className="h-4 w-4 shrink-0" aria-hidden />
          Print…
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-80 transition-transform', open && 'rotate-180')} />
      </Button>
      {open ? (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,17.5rem)] overflow-hidden rounded-xl border border-border bg-ink-800 py-1 shadow-xl ring-1 ring-black/40"
        >
          {PRINT_MENU.map((item) => (
            <button
              key={item.theme}
              type="button"
              role="menuitem"
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-white/10"
              onClick={() => runPrint(item.theme)}
            >
              <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-sol-green" aria-hidden />
              <span className="min-w-0">
                <span className="block font-medium leading-tight">{item.label}</span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground leading-snug">
                  {item.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModeSegmented({
  mode,
  onMode,
}: {
  mode: 'paper' | 'text';
  onMode: (m: 'paper' | 'text') => void;
}) {
  return (
    <div
      className="inline-flex rounded-full border border-border bg-ink-900/60 p-0.5"
      role="group"
      aria-label="Output format"
    >
      <button
        type="button"
        onClick={() => onMode('paper')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors',
          mode === 'paper' ? 'bg-sol-green/20 text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
        Paper wallet
      </button>
      <button
        type="button"
        onClick={() => onMode('text')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors',
          mode === 'text' ? 'bg-sol-green/20 text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <FileText className="h-3.5 w-3.5" aria-hidden />
        Text list
      </button>
    </div>
  );
}

export type PaperWalletRow = {
  publicKey: string;
  privateKeyB58: string;
  fingerprintHex: string;
};

function generateOne(): PaperWalletRow {
  const kp = Keypair.generate();
  const publicKey = kp.publicKey.toBase58();
  const bytes = new PublicKey(publicKey).toBytes();
  const fingerprintHex = Array.from(bytes.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return {
    publicKey,
    privateKeyB58: bs58.encode(kp.secretKey),
    fingerprintHex,
  };
}

function generateMany(count: number): PaperWalletRow[] {
  const n = Math.min(100, Math.max(1, Math.floor(count)));
  return Array.from({ length: n }, () => generateOne());
}

function rowsToTsv(rows: PaperWalletRow[]): string {
  const header = '#\tpublic_key\tprivate_key_base58\tid_fingerprint_hex';
  const lines = rows.map(
    (r, i) =>
      `${i + 1}\t${r.publicKey}\t${r.privateKeyB58}\t${r.fingerprintHex}`,
  );
  return [header, ...lines].join('\n');
}

function SolanaMark({ className }: { className?: string }) {
  const gid = useId().replace(/:/g, '');
  const gradId = `sol-g-${gid}`;
  return (
    <svg
      viewBox="0 0 72 56"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#14F195" />
          <stop offset="100%" stopColor="#9945FF" />
        </linearGradient>
      </defs>
      {/* Screen + color print: filled gradient bars */}
      <g className="solana-mark-gradient print:hidden" transform="skewX(-8)">
        <rect x="6" y="8" width="56" height="9" rx="2" fill={`url(#${gradId})`} />
        <rect x="6" y="22" width="56" height="9" rx="2" fill={`url(#${gradId})`} opacity={0.85} />
        <rect x="6" y="36" width="56" height="9" rx="2" fill={`url(#${gradId})`} opacity={0.7} />
      </g>
      {/* Economy print: outline only */}
      <g
        className="solana-mark-outline hidden print:block"
        transform="skewX(-8)"
        fill="none"
        stroke="#525252"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <rect x="6" y="8" width="56" height="9" rx="2" />
        <rect x="6" y="22" width="56" height="9" rx="2" />
        <rect x="6" y="36" width="56" height="9" rx="2" />
      </g>
    </svg>
  );
}

function FoldRule({ label }: { label: string }) {
  return (
    <div
      className={cn(
        'wallet-fold-rule relative flex h-7 shrink-0 items-center justify-center gap-2 border-y border-dashed border-white/35',
        'bg-ink-900/90 print:h-6 print:border-neutral-400 print:bg-white',
      )}
      aria-hidden
    >
      <Scissors className="h-3.5 w-3.5 text-muted-foreground print:text-neutral-500" />
      <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground print:text-[8px] print:text-neutral-700">
        {label}
      </span>
      <Scissors className="h-3.5 w-3.5 text-muted-foreground print:text-neutral-500" />
    </div>
  );
}

/** Tent strip: top = public (rotated 180°), middle = private, bottom = branding — fold private behind branding, then fold public to ridge. */
function TentFoldWallet({ row }: { row: PaperWalletRow }) {
  return (
    <div
      className={cn(
        'wallet-tent-sheet mx-auto w-full max-w-[420px] overflow-hidden rounded-xl border border-border shadow-lg',
        'print:mx-0 print:w-full print:max-w-none print:rounded-none print:border-0 print:shadow-none',
        'print-economy-sheet',
      )}
    >
      {/* Screen-only: print is full paper width — no trim line */}
      <div className="wallet-cut-hint border-b border-border/60 bg-ink-900/80 px-3 py-1.5 text-center print:hidden">
        <p className="text-[8px] uppercase tracking-[0.18em] text-muted-foreground">
          Print tip: set margins to <span className="text-foreground">None</span> (or minimum) and turn off headers &amp; footers for a true edge-to-edge sheet.
        </p>
      </div>

      {/* —— Panel 1: Public (reads upright from opposite side of tent) —— */}
      <div
        className={cn(
          'wallet-panel-public relative bg-[#f4f6fa] text-ink-900 print:flex print:min-h-[92mm] print:flex-col print:justify-center print:bg-white',
        )}
        style={{ transform: 'rotate(180deg)' }}
      >
        <div className="wallet-panel-public-deco pointer-events-none absolute inset-0 opacity-[0.07] print:hidden">
          <div
            className="absolute -right-6 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, #9945FF 0%, transparent 70%)' }}
          />
        </div>
        <div className="relative px-4 pb-5 pt-4 print:px-6 print:pb-6 print:pt-5">
          <div className="mb-3 flex items-start justify-between gap-3 print:mb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-900/70 print:text-[11px]">
                Scan public address
              </p>
              <p className="mt-1 font-mono text-[9px] leading-snug text-ink-900/90 print:text-[9px]">
                {row.publicKey}
              </p>
            </div>
            <SolanaMark className="h-12 w-14 opacity-40 print:h-12 print:w-14" />
          </div>
          <div className="wallet-public-qr-wrap mx-auto flex w-fit rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5 print:p-4 print:shadow-none print:ring-1 print:ring-neutral-300">
            <QRCode value={row.publicKey} size={140} level="M" className="h-36 w-36 print:h-44 print:w-44" />
          </div>
          <p className="mt-3 text-center text-[9px] text-ink-900/55 print:mt-4 print:text-[10px]">
            Scan to receive SOL &amp; tokens
          </p>
        </div>
      </div>

      <FoldRule label="Fold 2 — tent ridge (meet with branding face)" />

      {/* —— Panel 2: Private (sandwiched inside when assembled) —— */}
      <div
        className={cn(
          'wallet-panel-private relative border-x border-sol-purple/30 bg-gradient-to-b from-ink-800 to-ink-900',
          'print:flex print:min-h-[68mm] print:flex-col print:justify-center print:border-x print:border-neutral-400 print:bg-neutral-50',
        )}
      >
        <div className="wallet-panel-private-shine pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(153,69,255,0.06),transparent)] print:hidden" />
        <div className="relative px-3 py-4 text-center print:px-5 print:py-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-sol-purple print:text-[10px] print:text-neutral-800">
            Concealed · private key
          </p>
          <p className="mx-auto mt-1 max-w-[18rem] text-[8px] leading-relaxed text-muted-foreground print:max-w-[38rem] print:text-[8px] print:text-neutral-600">
            Fold this section behind the branding panel first (Fold 1). It stays inside the tent.
          </p>
          <div className="wallet-private-qr-wrap mx-auto mt-3 flex w-fit rounded-lg bg-white p-2 ring-2 ring-sol-purple/40 print:mt-3 print:p-2.5 print:ring-1 print:ring-neutral-400">
            <QRCode value={row.privateKeyB58} size={100} level="M" className="h-[100px] w-[100px] print:h-32 print:w-32" />
          </div>
          <p className="mx-auto mt-2 max-w-[20rem] break-all font-mono text-[7px] leading-relaxed text-foreground/85 print:max-w-[38rem] print:text-[7px] print:text-neutral-800">
            {row.privateKeyB58}
          </p>
        </div>
      </div>

      <FoldRule label="Fold 1 — tuck private behind branding" />

      {/* —— Panel 3: Branding + amount (outward face of tent) —— */}
      <div className="wallet-panel-branding relative overflow-hidden bg-ink-800 print:flex print:min-h-[72mm] print:flex-col print:justify-center print:border-t print:border-neutral-200 print:bg-white">
        <div
          className="wallet-branding-gradient absolute inset-0 opacity-30 print:hidden"
          style={{
            background:
              'linear-gradient(135deg, rgba(20,241,149,0.2) 0%, transparent 42%), linear-gradient(315deg, rgba(153,69,255,0.18) 0%, transparent 45%)',
          }}
        />
        {/* Economy print: slim neutral accent */}
        <div
          className="wallet-branding-accent-bar pointer-events-none absolute inset-x-0 top-0 hidden h-0.5 print:block print:bg-neutral-700"
          aria-hidden
        />
        <div className="wallet-amount-rail absolute bottom-0 right-0 top-0 flex w-12 flex-col border-l border-white/10 bg-ink-900/50 py-3 print:w-11 print:border-neutral-300 print:bg-neutral-100 print:py-2">
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 text-[8px] font-semibold uppercase tracking-[0.18em] text-muted-foreground print:text-[7px] print:text-neutral-600"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            <span className="text-foreground/90 print:text-neutral-900">Amount</span>
            <span className="text-sol-green print:text-neutral-800">SOL</span>
          </div>
          <div
            className="mx-auto mb-2 h-20 w-px border-l border-dashed border-white/30 print:h-16 print:border-neutral-400"
            title="Hand-write balance"
          />
        </div>
        <div className="relative flex items-center gap-4 pr-14 pl-5 py-6 print:gap-4 print:pr-14 print:pl-6 print:py-6">
          <SolanaMark className="h-16 w-20 print:h-[4.5rem] print:w-[5.5rem]" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground print:text-[11px] print:text-neutral-600">
              RootRecord
            </p>
            <h2 className="font-display text-3xl tracking-tight text-foreground print:text-3xl print:text-neutral-900">
              <span className="text-sol-green print:text-neutral-900">Solana</span>{' '}
              <span className="text-lg font-sans font-normal text-muted-foreground print:text-base print:text-neutral-600">
                paper wallet
              </span>
            </h2>
            <p className="wallet-branding-id mt-1 font-mono text-[9px] text-muted-foreground print:text-[8px] print:text-neutral-500">
              ID {row.fingerprintHex}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TextBatchList({
  rows,
}: {
  rows: PaperWalletRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/60 bg-ink-900/40 px-4 py-8 text-center text-sm text-muted-foreground">
        Choose how many wallets (1–100) and click <span className="text-foreground">Generate list</span>.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[40rem] text-left text-xs font-mono">
        <thead>
          <tr className="border-b border-border bg-ink-900/80 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2.5 w-8">#</th>
            <th className="px-2 py-2.5">Public key</th>
            <th className="px-2 py-2.5">Private (base58)</th>
            <th className="px-2 py-2.5 w-32">ID (fingerprint)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.publicKey}-${i}`}
              className="border-b border-border/50 bg-ink-950/20 odd:bg-ink-950/40"
            >
              <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
              <td className="px-2 py-1.5 break-all text-sol-green/90">{r.publicKey}</td>
              <td className="px-2 py-1.5 break-all text-foreground/90">{r.privateKeyB58}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{r.fingerprintHex}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WalletGeneratorClient() {
  const [mode, setMode] = useState<'paper' | 'text'>('paper');
  const [wallet, setWallet] = useState<PaperWalletRow>(() => generateOne());
  const [batchCount, setBatchCount] = useState(10);
  const [batchRows, setBatchRows] = useState<PaperWalletRow[]>([]);

  const regenerate = useCallback(() => {
    setWallet(generateOne());
  }, []);

  const generateTextBatch = useCallback(() => {
    const n = Math.min(100, Math.max(1, Math.floor(batchCount) || 1));
    setBatchCount(n);
    setBatchRows(generateMany(n));
    toast.success(`Generated ${n} wallet${n === 1 ? '' : 's'}`);
  }, [batchCount]);

  const copyTsv = useCallback(async () => {
    if (batchRows.length === 0) return;
    try {
      await navigator.clipboard.writeText(rowsToTsv(batchRows));
      toast.success('Copied TSV to clipboard');
    } catch {
      toast.error('Could not copy—try Download instead');
    }
  }, [batchRows]);

  const downloadTsv = useCallback(() => {
    if (batchRows.length === 0) return;
    const blob = new Blob([rowsToTsv(batchRows)], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `solana-wallets-${batchRows.length}-${Date.now()}.tsv.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Download started');
  }, [batchRows]);

  const printTextList = useCallback(() => {
    if (typeof window === 'undefined' || batchRows.length === 0) return;
    requestAnimationFrame(() => window.print());
  }, [batchRows]);

  useEffect(() => {
    const onAfterPrint = () => clearPrintThemeClasses();
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  return (
    <div className="container relative py-10 md:py-14 print:m-0 print:max-w-none print:w-full print:min-w-0 print:p-0 print:py-0">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-50 bg-aurora" />
      <div className="pointer-events-none absolute inset-0 -z-10 grid-faint-bg opacity-40" />

      {mode === 'paper' ? (
        <div
          id="wallet-paper-print-root"
          className="wallet-paper-print-root mx-auto max-w-2xl print:max-w-none print-economy-sheet"
        >
          <div className="wallet-gen-no-print mb-6 flex flex-col items-stretch gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
              <ModeSegmented mode={mode} onMode={setMode} />
            </div>
            <div className="flex flex-col flex-wrap items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Button type="button" onClick={regenerate} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                New wallet
              </Button>
              <PrintStyleDropdown />
            </div>
          </div>

          <div className="wallet-gen-no-print mb-6 max-w-xl mx-auto rounded-lg border border-border bg-ink-800/60 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Assembly</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed">
              <li>
                In the print dialog, set <strong className="text-foreground">margins to None</strong> (or minimum) and
                disable browser headers/footers so the layout runs wall-to-wall—no trimming.
              </li>
              <li>
                Along <strong className="text-foreground">Fold 1</strong>, fold the{' '}
                <strong className="text-foreground">middle (private)</strong> section backward behind the{' '}
                <strong className="text-foreground">branding</strong> panel so the secret faces the back of that
                panel.
              </li>
              <li>
                Along <strong className="text-foreground">Fold 2</strong>, bring the{' '}
                <strong className="text-foreground">address</strong> panel down to meet the ridge so the tent stands:
                branding on one slope, public QR on the other. The private strip stays sandwiched inside.
              </li>
              <li>Optional: tape the open long edges. Hand-write your balance on the vertical Amount line.</li>
            </ol>
          </div>

          <div className="wallet-gen-no-print mb-6 max-w-2xl mx-auto rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <div className="flex gap-2 text-sm text-foreground/95">
              <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
              <p>
                Keys stay in this tab until you print. Treat the private band like cash—anyone with the QR or
                base58 string can spend everything in this address.
              </p>
            </div>
          </div>

          <div className="wallet-page-print-shell">
            <div className="flex w-full justify-center print:px-0">
              <TentFoldWallet row={wallet} />
            </div>
          </div>
        </div>
      ) : (
        <div
          id="wallet-text-list-root"
          className="wallet-text-list-root mx-auto max-w-4xl print:max-w-none"
        >
          <div className="wallet-gen-no-print mb-6 flex flex-col items-stretch gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
              <ModeSegmented mode={mode} onMode={setMode} />
            </div>

            <div className="flex max-w-md flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="batch-count" className="text-xs text-muted-foreground">
                  Number of wallets (1–100)
                </Label>
                <Input
                  id="batch-count"
                  type="number"
                  min={1}
                  max={100}
                  value={batchCount}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isNaN(v)) {
                      setBatchCount(1);
                      return;
                    }
                    setBatchCount(Math.min(100, Math.max(1, v)));
                  }}
                />
              </div>
              <Button type="button" onClick={generateTextBatch} className="gap-2 sm:shrink-0">
                <RefreshCw className="h-4 w-4" />
                Generate list
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={copyTsv}
                disabled={batchRows.length === 0}
              >
                <Copy className="h-4 w-4" />
                Copy TSV
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={downloadTsv}
                disabled={batchRows.length === 0}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              <Button
                type="button"
                variant="purple"
                className="gap-2"
                onClick={printTextList}
                disabled={batchRows.length === 0}
              >
                <Printer className="h-4 w-4" />
                Print list
              </Button>
            </div>
          </div>

          <div className="wallet-gen-no-print mb-6 max-w-2xl rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <div className="flex gap-2 text-sm text-foreground/95">
              <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
              <p>
                Each line is a full keypair. Anyone with a private key can move funds. Store exports offline; clear
                clipboard if you copy keys on a shared machine.
              </p>
            </div>
          </div>

          <p className="wallet-gen-no-print mb-3 text-center text-xs text-muted-foreground">
            TSV: tab-separated columns; paste into a spreadsheet. For print, only the table below is intended to
            appear on the page.
          </p>

          <div className="wallet-text-print-area wallet-text-page-print min-h-0 print:bg-white print:p-4">
            <TextBatchList rows={batchRows} />
          </div>
        </div>
      )}
    </div>
  );
}
