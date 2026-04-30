import { useParams, Link } from "react-router-dom";
import { explorerUrl } from "@/lib/solana";

export function TokenStatsView() {
  const { mint } = useParams<{ mint: string }>();
  if (!mint) {
    return (
      <div className="container py-14 text-muted-foreground">
        No mint in URL. Use <Link to="/">home</Link> to pick a tool.
      </div>
    );
  }
  return (
    <div className="container py-14 max-w-2xl">
      <h1 className="font-display text-3xl">Token</h1>
      <p className="font-mono text-sm break-all mt-4">{mint}</p>
      <p className="text-muted-foreground text-sm mt-4">
        Full holder charts and dashboard live on the site (server-side data). On
        desktop, use Solscan for a quick read.
      </p>
      <a
        className="inline-block mt-6 text-sol-green hover:underline"
        href={explorerUrl(mint, "address")}
        target="_blank"
        rel="noreferrer"
      >
        Open on Solscan
      </a>
    </div>
  );
}
