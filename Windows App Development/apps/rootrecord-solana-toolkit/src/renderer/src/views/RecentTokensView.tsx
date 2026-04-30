import { useEffect, useState } from "react";
import { explorerUrl } from "@/lib/solana";

const V = import.meta.env;

type Row = { mint: string; created_at: string; symbol?: string; name?: string };

export function RecentTokensView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const o = (V.VITE_WORKER_API_ORIGIN as string | undefined)?.replace(/\/$/, "");
    if (!o) {
      setErr("Set VITE_WORKER_API_ORIGIN in .env.local to load recent tokens.");
      return;
    }
    void (async () => {
      try {
        const r = await fetch(`${o}/api/solana-site/recent-tokens`, {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { items?: Row[] };
        setRows(j.items ?? []);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, []);

  if (err) {
    return (
      <div className="container py-14 text-muted-foreground max-w-2xl">{err}</div>
    );
  }
  if (!rows) {
    return <div className="container py-14">Loading…</div>;
  }
  return (
    <div className="container py-14 max-w-4xl">
      <h1 className="font-display text-3xl">New tokens</h1>
      <ul className="mt-6 space-y-2 font-mono text-sm">
        {rows.map((x) => (
          <li key={x.mint} className="flex flex-wrap gap-2">
            <a
              className="text-sol-green hover:underline"
              href={explorerUrl(x.mint, "address")}
              target="_blank"
              rel="noreferrer"
            >
              {x.symbol || x.name || x.mint.slice(0, 8) + "…"}
            </a>
            <span className="text-muted-foreground">{x.created_at}</span>
          </li>
        ))}
        {!rows.length && <li className="text-muted-foreground">No rows (or empty D1).</li>}
      </ul>
    </div>
  );
}
