import { Link } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export function HomeView() {
  return (
    <div className="container py-16 md:py-24 bg-aurora">
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          RootRecord · Windows
        </p>
        <h1 className="font-display text-4xl md:text-6xl tracking-tight text-foreground">
          Full <em className="italic text-sol-green">Solana</em> tool suite
        </h1>
        <p className="mt-6 text-muted-foreground text-lg leading-relaxed">
          Same flows as solana.rootrecord.info: create SPL and Token-2022, Metaplex
          metadata, Raydium CPMM liquidity, bulk sends, Streamflow vesting, paper
          wallets, referrals, and more — packaged for desktop with a local keypair
          import when browser extensions are not available.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Button asChild size="lg" className="rounded-full">
            <Link to="/create">
              <Sparkles className="h-4 w-4 mr-2" />
              Create token
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full">
            <Link to="/start">
              Start here
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-20 grid gap-4 md:grid-cols-3 max-w-5xl mx-auto">
        {[
          { t: "Liquidity", d: "Raydium CPMM create / add / remove", p: "/liquidity" },
          { t: "Tools", d: "Authorities, mint, burn, metadata, T2022 fees", p: "/tools" },
          { t: "Bulk", d: "Batch SOL and SPL transfers", p: "/bulk" },
        ].map((x) => (
          <Link key={x.p} to={x.p} className="block text-inherit no-underline">
            <Card className="h-full hover:border-sol-green/30 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg">{x.t}</CardTitle>
                <CardDescription>{x.d}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sol-green text-sm font-medium">Open</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
