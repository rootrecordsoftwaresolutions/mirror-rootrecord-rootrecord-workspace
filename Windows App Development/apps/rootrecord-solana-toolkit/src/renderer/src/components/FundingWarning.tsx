
import { AlertTriangle } from 'lucide-react';

/**
 * Shown under primary Create / Launch actions: SOL must cover the full flow;
 * confirmed fee txs are not refunded if a later step fails (e.g. insufficient SOL).
 */
export function FundingWarning() {
  return (
    <div
      data-testid="funding-warning"
      className="mt-4 flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.12] p-4 sm:p-5 text-amber-50"
    >
      <AlertTriangle
        className="h-6 w-6 shrink-0 text-amber-400 mt-0.5"
        aria-hidden
      />
      <div className="space-y-2 text-sm sm:text-base leading-relaxed">
        <p className="font-semibold text-amber-50">
          Ensure you have sufficient SOL before continuing
        </p>
        <p className="text-amber-100/95">
          Your wallet must cover platform fees, Solana network fees, and—when
          creating a pool—Raydium&apos;s on-chain charge plus the liquidity you
          deposit.
        </p>
        <p className="text-amber-100/95">
          If a transaction fails because you do not have enough SOL, any
          platform fee that has already been processed on-chain is still final
          and is not automatically refunded.
        </p>
      </div>
    </div>
  );
}
