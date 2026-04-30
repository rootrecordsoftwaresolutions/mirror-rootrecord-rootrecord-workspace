import { ExternalLink } from 'lucide-react';

import { explorerUrl } from '@/lib/solana';
import type { RecentMintTx } from '@/lib/tokenDashboard';

function fmtTime(blockTime: number | null): string {
  if (blockTime == null) return '—';
  try {
    return new Date(blockTime * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function RecentMintTransactions({ txs }: { txs: RecentMintTx[] }) {
  if (txs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No recent signatures for this mint.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 pr-3 font-medium">Signature</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {txs.map((tx) => (
            <tr key={tx.signature} className="border-b border-border/50">
              <td className="py-2.5 pr-3 text-muted-foreground whitespace-nowrap align-top">
                {fmtTime(tx.blockTime)}
              </td>
              <td className="py-2.5 pr-3 align-top">
                <a
                  href={explorerUrl(tx.signature, 'tx')}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-sol-green hover:underline inline-flex items-center gap-1 break-all"
                >
                  {tx.signature.slice(0, 12)}…{tx.signature.slice(-10)}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </td>
              <td className="py-2.5 align-top">
                {tx.err ? (
                  <span className="text-xs text-rose-400/90">Failed</span>
                ) : (
                  <span className="text-xs text-sol-green/90">Success</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
