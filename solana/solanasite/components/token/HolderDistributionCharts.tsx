import type { TokenHolderRow } from '@/lib/tokenDashboard';

const BAR_TONES = [
  'bg-sol-green/90',
  'bg-emerald-400/70',
  'bg-teal-400/60',
  'bg-cyan-500/55',
  'bg-sky-500/50',
  'bg-indigo-400/50',
  'bg-violet-400/50',
  'bg-fuchsia-400/45',
  'bg-rose-400/45',
  'bg-amber-400/50',
];

function pct(h: TokenHolderRow): number {
  const n = parseFloat(h.percentOfSupply);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

export function HolderDistributionCharts({ holders }: { holders: TokenHolderRow[] }) {
  if (holders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6">No holder data for charts.</p>
    );
  }

  const rows = holders.map((h, i) => ({ h, i, p: pct(h) }));
  const maxP = Math.max(...rows.map((r) => r.p), 0.0001);
  const sumTop = rows.reduce((s, r) => s + r.p, 0);
  const other = Math.max(0, 100 - sumTop);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Share of supply (top 10)</h3>
        <div className="flex h-4 w-full overflow-hidden rounded-full border border-border bg-ink-900/80">
          {rows.map((r, idx) =>
            r.p > 0 ? (
              <div
                key={r.h.tokenAccount}
                title={`#${idx + 1}: ${r.p.toFixed(2)}%`}
                className={`${BAR_TONES[idx % BAR_TONES.length]} h-full shrink-0`}
                style={{ width: `${r.p}%` }}
              />
            ) : null,
          )}
          {other > 0.05 ? (
            <div
              className="h-full bg-muted/40 shrink-0"
              style={{ width: `${other}%` }}
              title={`Other holders: ${other.toFixed(2)}%`}
            />
          ) : null}
        </div>
        <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
          {rows.slice(0, 5).map((r, idx) => (
            <li key={r.h.tokenAccount} className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full shrink-0 ${BAR_TONES[idx % BAR_TONES.length]}`}
              />
              <span className="tabular-nums">{r.p.toFixed(2)}%</span>
              <span className="font-mono truncate text-foreground/80">
                {r.h.tokenAccount.slice(0, 6)}…{r.h.tokenAccount.slice(-4)}
              </span>
            </li>
          ))}
          {rows.length > 5 ? (
            <li className="text-muted-foreground/80">+ {rows.length - 5} more in table</li>
          ) : null}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Balance by rank</h3>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.h.tokenAccount} className="flex items-center gap-2 text-xs">
              <span className="w-5 text-muted-foreground tabular-nums">{r.i + 1}</span>
              <div className="flex-1 h-6 rounded bg-ink-900/80 border border-border/60 overflow-hidden">
                <div
                  className={`h-full ${BAR_TONES[r.i % BAR_TONES.length]} rounded-sm transition-[width]`}
                  style={{ width: `${(r.p / maxP) * 100}%` }}
                />
              </div>
              <span className="w-14 text-right font-mono tabular-nums text-foreground/90">
                {r.p.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
